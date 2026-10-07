/**
 * Espera creciente entre intentos de entrega de un hecho del outbox
 * (ADR-12 §3):
 *
 *   espera = min(base × 2^intentosPrevios, máxima), con variación aleatoria
 *
 * y paso a `fallido` (carta muerta) al llegar a `maxIntentos` fallos.
 *
 * Funciones puras: sin reloj, sin base y sin variables de entorno. Quien arma
 * la política (el despachador) lee `EVENTOS_SALIDA_MAX_INTENTOS` y la pasa
 * como parámetro.
 */
export interface PoliticaReintentoSalida {
  /**
   * `EVENTOS_SALIDA_MAX_INTENTOS`. Al llegar a este número de fallos el hecho
   * pasa a `fallido` y ya no se reintenta. Entero >= 1.
   */
  maxIntentos: number;
  /** Espera tras el primer fallo, en milisegundos (ADR-12: 10 s). */
  esperaBaseMs: number;
  /** Tope de la espera, en milisegundos (ADR-12: 1 h). */
  esperaMaximaMs: number;
  /**
   * Fracción de variación aleatoria, en [0, 0.5]. La espera se acorta al azar
   * hasta esa fracción (nunca se alarga ni pasa del tope), para que varios
   * hechos que fallaron juntos no reintenten todos en el mismo instante.
   * Acotada a 0.5 para que, por debajo del tope, ninguna espera quede más
   * corta que la nominal del intento anterior. 0 = determinista.
   */
  variacion: number;
}

export const POLITICA_REINTENTO_SALIDA_POR_DEFECTO: Readonly<PoliticaReintentoSalida> =
  Object.freeze({
    maxIntentos: 10,
    esperaBaseMs: 10_000,
    esperaMaximaMs: 3_600_000,
    variacion: 0.2,
  });

/**
 * Lanza si la política no es utilizable (p. ej. un `NaN` venido de una
 * variable de entorno mal escrita). Conviene llamarla al arrancar; el
 * adaptador la vuelve a llamar antes de registrar un fallo.
 */
export function validarPoliticaReintentoSalida(
  politica: PoliticaReintentoSalida,
): void {
  const { maxIntentos, esperaBaseMs, esperaMaximaMs, variacion } = politica;
  if (!Number.isInteger(maxIntentos) || maxIntentos < 1) {
    throw new Error(
      `Política de reintento inválida: maxIntentos debe ser un entero >= 1 (recibido ${maxIntentos})`,
    );
  }
  if (!Number.isFinite(esperaBaseMs) || esperaBaseMs <= 0) {
    throw new Error(
      `Política de reintento inválida: esperaBaseMs debe ser > 0 (recibido ${esperaBaseMs})`,
    );
  }
  if (!Number.isFinite(esperaMaximaMs) || esperaMaximaMs < esperaBaseMs) {
    throw new Error(
      `Política de reintento inválida: esperaMaximaMs debe ser >= esperaBaseMs (recibido ${esperaMaximaMs})`,
    );
  }
  if (!Number.isFinite(variacion) || variacion < 0 || variacion > 0.5) {
    throw new Error(
      `Política de reintento inválida: variacion debe estar en [0, 0.5] (recibido ${variacion})`,
    );
  }
}

/**
 * Milisegundos hasta el próximo intento.
 *
 * `intentosPrevios` es el contador ANTES de sumar el fallo que se está
 * registrando (como el `intentos` del lado derecho de un
 * `UPDATE ... SET intentos = intentos + 1`). Así el primer fallo espera
 * exactamente la base: 10 s, 20 s, 40 s, … hasta el tope de 1 h.
 *
 * `aleatorio` devuelve un número en [0, 1); se inyecta para los tests.
 */
export function calcularEsperaReintentoMs(
  intentosPrevios: number,
  politica: PoliticaReintentoSalida,
  aleatorio: () => number = Math.random,
): number {
  // `2 ** n` crece a Infinity con n grande; `Math.min` lo acota igual.
  const nominal = Math.min(
    politica.esperaBaseMs * 2 ** Math.max(0, intentosPrevios),
    politica.esperaMaximaMs,
  );
  const factor = 1 - politica.variacion * aleatorio();
  return Math.round(nominal * factor);
}

/**
 * `true` si, con `intentosTrasFallo` fallos ya contados, el hecho debe pasar a
 * `fallido`. ADR-12 §3: "al llegar a EVENTOS_SALIDA_MAX_INTENTOS".
 */
export function agotoIntentos(
  intentosTrasFallo: number,
  politica: PoliticaReintentoSalida,
): boolean {
  return intentosTrasFallo >= politica.maxIntentos;
}
