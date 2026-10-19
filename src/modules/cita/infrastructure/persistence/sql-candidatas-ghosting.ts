import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  CandidatasGhosting,
  ConteoCandidatasGhosting,
  CriterioCierreGhosting,
} from '../../domain/candidatas-ghosting';
import { Cita, EstadoCita } from '../../domain/cita.entity';
import {
  citaDesdeFila,
  columnasCita,
  FilaCita,
} from './typeorm-cita.repository';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La regla G1 (DT-11) con la precisión H10, sobre `citas AS c`. `$1` =
 * `limite`, `$2` = `corte`. La comparten `reclamarSiguiente` y `contar`, para
 * que el conteo del modo apagado sea exactamente lo que cerraría el prendido.
 *
 * - `c."estado" = 'pendiente'` SIN cast: es el predicado del índice parcial
 *   `idx_cita_pendiente_inicio` (migración 1750000018000) y tiene que
 *   escribirse igual para que el planificador lo use. Ningún literal se
 *   castea al tipo enum por nombre (difiere entre la migración y
 *   `synchronize`).
 * - **Dependencia de esquema, sin imports** (como `LectorCitas` en
 *   `recordatorio`, ADR-13 §1): lee `recordatorios` (`estado`, `proveedor`,
 *   `enviado_en`, `inicio_cita`) y `solicitudes_cita` (`tipo`, `estado`,
 *   `cita_origen_id`). Los literales de esos módulos van escritos aquí porque
 *   `cita` no los importa. Si cambian esas columnas o valores, este archivo
 *   cambia con ellos.
 * - Los `tenant_id` de las subconsultas son defensa en profundidad: el
 *   barrido es global (ADR-12 §6).
 */
const CONDICIONES_G1 = `
      c."estado" = '${EstadoCita.PENDIENTE}'
  AND c."inicio" < $1
  AND c."inicio" > $2
  AND EXISTS (
        SELECT 1
          FROM "recordatorios" AS r
         WHERE r."cita_id"     = c."id"
           AND r."tenant_id"   = c."tenant_id"
           AND r."estado"      IN ('enviado', 'entregado')
           AND r."proveedor"   <> 'registro'
           AND r."enviado_en"  >= $2
           AND r."inicio_cita" = c."inicio"
      )
  AND NOT EXISTS (
        SELECT 1
          FROM "solicitudes_cita" AS s
         WHERE s."cita_origen_id" = c."id"
           AND s."tenant_id"      = c."tenant_id"
           AND s."tipo"           = 'reagendamiento'
           AND s."estado"         = 'recibida'
      )`;

/**
 * Adaptador SQL del job G1 (US-07.01, H6): reclama de a una las citas
 * `pendiente` que la regla cierra como `ghosting`, y las cuenta para el modo
 * apagado.
 *
 * - **Barrido GLOBAL** (ADR-12 §6): sin filtro de tenant. Solo lo usa el job.
 * - Bloqueo **`FOR NO KEY UPDATE OF c SKIP LOCKED`**, nunca `FOR UPDATE`
 *   (regla del módulo): no choca con el `FOR KEY SHARE` del `INSERT` en
 *   `enlaces_cita` y reparte las citas entre réplicas. `OF c`: solo se bloquea
 *   la cita, no las filas de las subconsultas.
 * - Devuelve la `Cita` de dominio con el mismo mapeo que
 *   `TypeOrmCitaRepository` (`citaDesdeFila`), sin duplicarlo.
 */
@Injectable()
export class SqlCandidatasGhosting extends CandidatasGhosting {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async reclamarSiguiente(
    criterio: CriterioCierreGhosting,
    excluir: readonly string[],
    tx: TransactionContext,
  ): Promise<Cita | null> {
    // `TransactionContext` es `unknown` y admite undefined: sin este chequeo
    // el bloqueo se soltaría al terminar la sentencia y no protegería nada.
    if (!tx) {
      throw new Error(
        'CandidatasGhosting.reclamarSiguiente requiere una transacción (FOR NO KEY UPDATE … SKIP LOCKED)',
      );
    }
    validarCriterio(criterio, 'reclamarSiguiente');
    // Un id con otra forma no puede ser de una cita (y rompería el `::uuid[]`).
    const excluidas = excluir.filter((id) => FORMATO_UUID.test(id));

    const filas = await (tx as EntityManager).query<FilaCita[]>(
      `SELECT ${columnasCita('c')}
         FROM "citas" AS c
        WHERE ${CONDICIONES_G1}
          AND c."id" <> ALL($3::uuid[])
        ORDER BY c."inicio", c."id"
        LIMIT 1
          FOR NO KEY UPDATE OF c SKIP LOCKED`,
      [criterio.limite, criterio.corte, excluidas],
    );
    const [fila] = Array.isArray(filas) ? filas : [];
    return fila ? citaDesdeFila(fila) : null;
  }

  async contar(
    criterio: CriterioCierreGhosting,
    tx?: TransactionContext,
  ): Promise<ConteoCandidatasGhosting> {
    validarCriterio(criterio, 'contar');
    // Solo lectura, sin bloqueo: sin `tx`, la conexión de siempre.
    const manager = tx ? (tx as EntityManager) : this.dataSource.manager;

    const filas = await manager.query<
      { candidatas: number; masAntigua: Date | null }[]
    >(
      `SELECT count(*)::int    AS "candidatas",
              min(c."inicio")  AS "masAntigua"
         FROM "citas" AS c
        WHERE ${CONDICIONES_G1}`,
      [criterio.limite, criterio.corte],
    );
    const [fila] = Array.isArray(filas) ? filas : [];
    return {
      candidatas: fila?.candidatas ?? 0,
      masAntigua: fila?.masAntigua ?? null,
    };
  }
}

/** Rechaza un criterio con fechas inválidas antes de llegar a la base. */
function validarCriterio(
  criterio: CriterioCierreGhosting,
  operacion: string,
): void {
  if (
    !(criterio.limite instanceof Date) ||
    !(criterio.corte instanceof Date) ||
    Number.isNaN(criterio.limite.getTime()) ||
    Number.isNaN(criterio.corte.getTime())
  ) {
    throw new RangeError(
      `CandidatasGhosting.${operacion}: el criterio necesita dos fechas válidas (limite y corte)`,
    );
  }
}
