// Reintentos de un envío tras un error TRANSITORIO del proveedor (ADR-13 §8):
// 5xx, tiempo agotado, error de red, 429 por ritmo, 409 concurrente.
//
// Función pura: el reloj y los parámetros llegan por argumento. El caso de uso
// de envío la llama con lo que trae la fila reclamada.

/** Espera antes de cada reintento, en minutos (ADR-13 §8). */
export const CALENDARIO_REINTENTOS_MIN: readonly number[] = [1, 5, 15, 30, 60];

/**
 * El último reintento se acota a este margen ANTES de `venceEn`: a esa hora la
 * política de vencimiento todavía lo deja salir. Más cerca ya no vale la pena.
 */
export const MARGEN_ULTIMO_REINTENTO_MIN = 1;

const MINUTO_MS = 60_000;

export interface EntradaReintento {
  /**
   * Fallos transitorios ANTERIORES de este recordatorio. Es su columna
   * `intentos`: mientras sigue `programado`, cada llamada al proveedor que
   * sumó un intento fue un fallo transitorio (las demás lo sacan de la cola
   * o no suman: cuota y configuración).
   */
  intentosPrevios: number;
  /** Hora del fallo. */
  ahora: Date;
  venceEn: Date;
  /**
   * `RECORDATORIO_MAX_INTENTOS`: cuántos REINTENTOS admite tras errores
   * transitorios (ADR-13 §18: "reintentos por errores transitorios"). Con 5,
   * el calendario completo: 1, 5, 15, 30 y 60 min; el sexto fallo lo agota.
   */
  maxReintentos: number;
}

export type DecisionReintento =
  | { tipo: 'reintentar'; proximoIntentoEn: Date; numeroReintento: number }
  | { tipo: 'agotado'; causa: 'max_reintentos' | 'vencimiento' };

/**
 * Qué hacer tras un fallo transitorio (ADR-13 §8): reintentar según el
 * calendario, ACOTADO por `venceEn`, o darlo por agotado (`fallido` con
 * motivo `vencido`).
 *
 * - El reintento número n (n = fallos acumulados, contando este) espera
 *   `CALENDARIO_REINTENTOS_MIN[n − 1]`; más allá del calendario, la última
 *   espera.
 * - Si n supera `maxReintentos`, agotado.
 * - Si la espera cae a menos de `MARGEN_ULTIMO_REINTENTO_MIN` de `venceEn`,
 *   se adelanta a ese margen (una última oportunidad); si ni eso queda en el
 *   futuro, agotado.
 */
export function calcularReintento(
  entrada: EntradaReintento,
): DecisionReintento {
  const { intentosPrevios, ahora, venceEn, maxReintentos } = entrada;
  if (!Number.isInteger(intentosPrevios) || intentosPrevios < 0) {
    throw new RangeError('calcularReintento: intentosPrevios inválido');
  }
  if (!Number.isInteger(maxReintentos) || maxReintentos < 0) {
    throw new RangeError('calcularReintento: maxReintentos inválido');
  }

  const numeroReintento = intentosPrevios + 1;
  if (numeroReintento > maxReintentos) {
    return { tipo: 'agotado', causa: 'max_reintentos' };
  }

  const indice =
    Math.min(numeroReintento, CALENDARIO_REINTENTOS_MIN.length) - 1;
  const segun = ahora.getTime() + CALENDARIO_REINTENTOS_MIN[indice] * MINUTO_MS;
  const tope = venceEn.getTime() - MARGEN_ULTIMO_REINTENTO_MIN * MINUTO_MS;
  const proximo = Math.min(segun, tope);
  if (proximo <= ahora.getTime()) {
    return { tipo: 'agotado', causa: 'vencimiento' };
  }
  return {
    tipo: 'reintentar',
    proximoIntentoEn: new Date(proximo),
    numeroReintento,
  };
}
