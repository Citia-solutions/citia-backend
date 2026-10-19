import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  EnlaceCita,
  FORMATO_HASH_TOKEN_ENLACE,
  MotivoRevocacionEnlace,
} from '../../domain/enlace-cita.entity';
import { EnlaceCitaRepository } from '../../domain/enlace-cita.repository';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columnas de lectura, ya con el nombre de la propiedad de dominio. */
const COLUMNAS = `"id",
       "cita_id"             AS "citaId",
       "tenant_id"           AS "tenantId",
       "version",
       "token_hash"          AS "tokenHash",
       "emitido_en"          AS "emitidoEn",
       "revocado_en"         AS "revocadoEn",
       "motivo_revocacion"   AS "motivoRevocacion",
       "revocado_por"        AS "revocadoPor",
       "primera_apertura_en" AS "primeraAperturaEn"`;

interface FilaEnlace {
  id: string;
  citaId: string;
  tenantId: string;
  version: number;
  tokenHash: string;
  emitidoEn: Date;
  revocadoEn: Date | null;
  motivoRevocacion: MotivoRevocacionEnlace | null;
  revocadoPor: string | null;
  primeraAperturaEn: Date | null;
}

/**
 * Adaptador TypeORM de `enlaces_cita` (Fase 3, contrato §2.1).
 *
 * SQL explícito sobre el `EntityManager` de la transacción: `ON CONFLICT DO
 * NOTHING` (sin destino: cubre las tres claves únicas, incluida la PARCIAL de
 * "un activo por cita") y `RETURNING`. Todos los métodos lanzan sin `tx`.
 *
 * Nunca recibe ni registra el token: solo su hash. Los mensajes de error no
 * repiten valores recibidos.
 */
@Injectable()
export class TypeOrmEnlaceCitaRepository extends EnlaceCitaRepository {
  async buscarActivoPorCita(
    citaId: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null> {
    const manager = exigirTransaccion(tx, 'buscarActivoPorCita');
    if (!FORMATO_UUID.test(citaId)) return null;
    const [fila] = filasDe<FilaEnlace>(
      await manager.query(
        `SELECT ${COLUMNAS}
           FROM "enlaces_cita"
          WHERE "cita_id" = $1
            AND "revocado_en" IS NULL`,
        [citaId],
      ),
    );
    return fila ? aDominio(fila) : null;
  }

  async buscarPorTokenHash(
    hash: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null> {
    const manager = exigirTransaccion(tx, 'buscarPorTokenHash');
    // Un valor con otro formato no puede estar en la tabla (CHECK): se
    // responde sin tocar la base.
    if (!FORMATO_HASH_TOKEN_ENLACE.test(hash)) return null;
    const [fila] = filasDe<FilaEnlace>(
      await manager.query(
        `SELECT ${COLUMNAS}
           FROM "enlaces_cita"
          WHERE "token_hash" = $1`,
        [hash],
      ),
    );
    return fila ? aDominio(fila) : null;
  }

  async insertarSiNoExiste(
    enlace: EnlaceCita,
    tx: TransactionContext,
  ): Promise<boolean> {
    const manager = exigirTransaccion(tx, 'insertarSiNoExiste');
    if (enlace.id !== undefined || !enlace.estaActivo()) {
      throw new Error(
        'EnlaceCitaRepository.insertarSiNoExiste: solo se insertan enlaces recién emitidos (sin id y sin revocar)',
      );
    }
    const filas = filasDe<{ id: string }>(
      await manager.query(
        `INSERT INTO "enlaces_cita" ("cita_id", "tenant_id", "version", "token_hash")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING "id"`,
        [enlace.citaId, enlace.tenantId, enlace.version, enlace.tokenHash],
      ),
    );
    return filas.length > 0;
  }

  async maxVersion(
    citaId: string,
    tx: TransactionContext,
  ): Promise<number | null> {
    const manager = exigirTransaccion(tx, 'maxVersion');
    if (!FORMATO_UUID.test(citaId)) return null;
    const [fila] = filasDe<{ max: number | null }>(
      await manager.query(
        `SELECT max("version") AS "max"
           FROM "enlaces_cita"
          WHERE "cita_id" = $1`,
        [citaId],
      ),
    );
    return fila?.max ?? null;
  }

  async guardar(
    enlace: EnlaceCita,
    tx: TransactionContext,
  ): Promise<EnlaceCita> {
    const manager = exigirTransaccion(tx, 'guardar');
    if (enlace.id === undefined) {
      throw new Error(
        'EnlaceCitaRepository.guardar: el enlace no está persistido (para emitir, insertarSiNoExiste)',
      );
    }
    if (enlace.estaActivo()) {
      throw new Error(
        'EnlaceCitaRepository.guardar: solo persiste la revocación y el enlace no está revocado',
      );
    }
    // Solo revoca uno ACTIVO: si otra transacción ya lo revocó, gana la
    // primera revocación (nunca se "des-revoca" ni se pisa el motivo).
    const [actualizada] = filasDe<FilaEnlace>(
      await manager.query(
        `UPDATE "enlaces_cita"
            SET "revocado_en"       = $2,
                "motivo_revocacion" = $3,
                "revocado_por"      = $4
          WHERE "id" = $1
            AND "revocado_en" IS NULL
         RETURNING ${COLUMNAS}`,
        [
          enlace.id,
          enlace.revocadoEn,
          enlace.motivoRevocacion,
          enlace.revocadoPor,
        ],
      ),
    );
    if (actualizada) return aDominio(actualizada);

    const [existente] = filasDe<FilaEnlace>(
      await manager.query(
        `SELECT ${COLUMNAS}
           FROM "enlaces_cita"
          WHERE "id" = $1`,
        [enlace.id],
      ),
    );
    if (!existente) {
      throw new Error('EnlaceCitaRepository.guardar: el enlace no existe');
    }
    return aDominio(existente);
  }

  async registrarPrimeraApertura(
    enlaceId: string,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    const manager = exigirTransaccion(tx, 'registrarPrimeraApertura');
    // Un id con otra forma no puede estar en la tabla: no se consulta.
    if (!FORMATO_UUID.test(enlaceId)) return false;
    // Solo la primera vez: con una apertura ya anotada no cambia nada. Toma
    // la fila del enlace DESPUÉS de la cita que ya bloqueó `resolver`.
    const filas = filasDe<{ id: string }>(
      await manager.query(
        `UPDATE "enlaces_cita"
            SET "primera_apertura_en" = $2
          WHERE "id" = $1
            AND "primera_apertura_en" IS NULL
         RETURNING "id"`,
        [enlaceId, ahora],
      ),
    );
    return filas.length > 0;
  }
}

function aDominio(fila: FilaEnlace): EnlaceCita {
  return EnlaceCita.reconstituir({
    id: fila.id,
    citaId: fila.citaId,
    tenantId: fila.tenantId,
    version: Number(fila.version),
    tokenHash: fila.tokenHash,
    emitidoEn: fila.emitidoEn,
    revocadoEn: fila.revocadoEn,
    motivoRevocacion: fila.motivoRevocacion,
    revocadoPor: fila.revocadoPor,
    primeraAperturaEn: fila.primeraAperturaEn,
  });
}

/**
 * El `EntityManager` de la transacción, o un error claro. `TransactionContext`
 * es `unknown` y admite `undefined`: sin este chequeo una escritura caería en
 * silencio fuera de la transacción del caso de uso.
 */
function exigirTransaccion(
  tx: TransactionContext,
  operacion: string,
): EntityManager {
  if (!tx) {
    throw new Error(
      `EnlaceCitaRepository.${operacion} requiere una transacción`,
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
