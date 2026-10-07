import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `true` si el valor es un UUID con forma válida. Los ids que llegan de fuera
 * (ruta HTTP, etiqueta del webhook) se filtran antes de llegar a una columna
 * `uuid`: Postgres rechazaría la consulta entera con un error de sintaxis.
 */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/**
 * El `EntityManager` de la transacción, o un error claro. `TransactionContext`
 * es `unknown` y admite `undefined`: sin este chequeo una escritura caería en
 * silencio a una conexión sin transacción, o un `FOR UPDATE` / candado de
 * transacción se soltaría al instante.
 */
export function exigirTransaccion(
  tx: TransactionContext,
  puerto: string,
  operacion: string,
): EntityManager {
  if (!tx) {
    throw new Error(
      `${puerto}.${operacion} requiere una transacción (ADR-12, ADR-13)`,
    );
  }
  return tx as EntityManager;
}

/**
 * Filas de un `EntityManager.query`. Con Postgres, TypeORM devuelve las filas
 * tal cual para SELECT e INSERT, pero `[filas, cantidad]` para UPDATE y
 * DELETE.
 */
export function filasDe<T>(resultado: unknown): T[] {
  if (esResultadoDeEscritura(resultado)) return resultado[0] as T[];
  return Array.isArray(resultado) ? (resultado as T[]) : [];
}

/** Filas afectadas de un UPDATE / DELETE hecho con `EntityManager.query`. */
export function afectadasDe(resultado: unknown): number {
  if (esResultadoDeEscritura(resultado)) return resultado[1];
  return Array.isArray(resultado) ? resultado.length : 0;
}

function esResultadoDeEscritura(
  resultado: unknown,
): resultado is [unknown[], number] {
  return (
    Array.isArray(resultado) &&
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  );
}

/** Rechaza un periodo vacío, invertido o con fechas inválidas. */
export function validarPeriodo(
  desde: Date,
  hasta: Date,
  operacion: string,
): void {
  if (
    Number.isNaN(desde.getTime()) ||
    Number.isNaN(hasta.getTime()) ||
    desde.getTime() >= hasta.getTime()
  ) {
    throw new RangeError(
      `${operacion}: periodo inválido [${String(desde)}, ${String(hasta)})`,
    );
  }
}
