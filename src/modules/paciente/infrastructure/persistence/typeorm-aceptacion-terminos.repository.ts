import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  AceptacionTerminos,
  CANALES_DEL_TITULAR,
} from '../../domain/aceptacion-terminos.entity';
import { AceptacionTerminosRepository } from '../../domain/aceptacion-terminos.repository';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `'formulario_publico', 'enlace_cita'`: valores del dominio, no del cliente. */
const CANALES_DEL_TITULAR_SQL = CANALES_DEL_TITULAR.map(
  (canal) => `'${canal}'`,
).join(', ');

/**
 * Adaptador TypeORM de `aceptaciones_terminos` (US-11, ADR-16 §3). Esquema:
 * migración 1750000021000.
 *
 * SQL explícito sobre el `EntityManager` de la transacción. **Solo
 * inserción**: no hay `UPDATE` ni `DELETE`.
 *
 * - `insertarSiNoExiste`: `INSERT … SELECT … FROM "pacientes"` filtrado por
 *   id Y tenant (un paciente de otra organización no escribe nada) con
 *   `ON CONFLICT ("paciente_id", "version", "canal") DO NOTHING` (D11: gana el
 *   primer acto, también en una carrera) y `RETURNING`. Exige `tx`.
 * - `existeDelTitular`: lectura sin bloqueo, por el prefijo del índice único.
 *   Sin `tx`, usa el `EntityManager` por defecto.
 * - **Guardas de UUID** (ADR-15, nota 2): un id que no es UUID responde
 *   `false` sin consultar, en vez de un 22P02 de Postgres (un 500).
 */
@Injectable()
export class TypeOrmAceptacionTerminosRepository extends AceptacionTerminosRepository {
  constructor(private readonly porDefecto: EntityManager) {
    super();
  }

  async insertarSiNoExiste(
    aceptacion: AceptacionTerminos,
    tx: TransactionContext,
  ): Promise<boolean> {
    const manager = exigirTransaccion(tx, 'insertarSiNoExiste');
    if (aceptacion.id !== undefined) {
      throw new Error(
        'AceptacionTerminosRepository.insertarSiNoExiste: solo se insertan aceptaciones recién registradas (sin id)',
      );
    }
    if (
      !sonUuid(aceptacion.pacienteId, aceptacion.tenantId) ||
      !sonUuidONulos(
        aceptacion.usuarioId,
        aceptacion.solicitudId,
        aceptacion.enlaceId,
      )
    ) {
      return false;
    }
    // Los casts explícitos fijan el tipo de cada parámetro de la lista del
    // SELECT. `id` y `registrada_en` los pone la base.
    const filas = filasDe<{ id: string }>(
      await manager.query(
        `INSERT INTO "aceptaciones_terminos"
           ("tenant_id", "paciente_id", "version", "canal", "aceptada_en",
            "usuario_id", "solicitud_id", "enlace_id")
         SELECT p."tenant_id", p."id", $3::varchar, $4::varchar,
                $5::timestamptz, $6::uuid, $7::uuid, $8::uuid
           FROM "pacientes" p
          WHERE p."id" = $1
            AND p."tenant_id" = $2
         ON CONFLICT ("paciente_id", "version", "canal") DO NOTHING
         RETURNING "id"`,
        [
          aceptacion.pacienteId,
          aceptacion.tenantId,
          aceptacion.version,
          aceptacion.canal,
          aceptacion.aceptadaEn,
          aceptacion.usuarioId,
          aceptacion.solicitudId,
          aceptacion.enlaceId,
        ],
      ),
    );
    return filas.length > 0;
  }

  async existeDelTitular(
    pacienteId: string,
    tenantId: string,
    versiones: readonly string[],
    tx?: TransactionContext,
  ): Promise<boolean> {
    // Sin versiones no hay nada que buscar; ANY('{}') daría lo mismo.
    if (versiones.length === 0 || !sonUuid(pacienteId, tenantId)) {
      return false;
    }
    const manager = tx ? (tx as EntityManager) : this.porDefecto;
    const filas = filasDe<{ existe: number }>(
      await manager.query(
        `SELECT 1 AS "existe"
           FROM "aceptaciones_terminos"
          WHERE "paciente_id" = $1
            AND "tenant_id" = $2
            AND "canal" IN (${CANALES_DEL_TITULAR_SQL})
            AND "version" = ANY($3::varchar[])
          LIMIT 1`,
        [pacienteId, tenantId, [...versiones]],
      ),
    );
    return filas.length > 0;
  }
}

function sonUuid(...valores: string[]): boolean {
  return valores.every(
    (valor) => typeof valor === 'string' && FORMATO_UUID.test(valor),
  );
}

function sonUuidONulos(...valores: (string | null)[]): boolean {
  return valores.every(
    (valor) =>
      valor === null || (typeof valor === 'string' && FORMATO_UUID.test(valor)),
  );
}

/**
 * El `EntityManager` de la transacción, o un error claro. `TransactionContext`
 * es `unknown` y admite `undefined`: sin este chequeo la prueba se escribiría
 * fuera de la transacción del caso de uso.
 */
function exigirTransaccion(
  tx: TransactionContext,
  operacion: string,
): EntityManager {
  if (!tx) {
    throw new Error(
      `AceptacionTerminosRepository.${operacion} requiere una transacción (ADR-16 §3)`,
    );
  }
  return tx as EntityManager;
}

/**
 * Filas de un `EntityManager.query`. Con Postgres, TypeORM devuelve las filas
 * tal cual para SELECT e INSERT, pero `[filas, cantidad]` para UPDATE y DELETE.
 */
function filasDe<T>(resultado: unknown): T[] {
  if (
    Array.isArray(resultado) &&
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  ) {
    return resultado[0] as T[];
  }
  return Array.isArray(resultado) ? (resultado as T[]) : [];
}
