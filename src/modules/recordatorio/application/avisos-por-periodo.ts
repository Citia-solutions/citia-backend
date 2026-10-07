import type { Periodo } from '../domain/periodos-conteo';

/**
 * Recuerda qué avisos ya se emitieron en cada periodo, para emitir cada uno
 * UNA VEZ POR PERIODO Y PROCESO (ADR-13 §11: "aviso al 80 %, una vez por
 * periodo y proceso"). Estado en memoria: un reinicio puede repetir el aviso
 * una vez, lo que se acepta.
 *
 * La clave combina el aviso y su alcance (p. ej. `cuota_80:dia`); el periodo se
 * identifica por su inicio.
 */
export class AvisosPorPeriodo {
  private readonly emitidos = new Map<string, number>();

  /** `true` la primera vez que se pide `clave` dentro de `periodo`. */
  primeraVez(clave: string, periodo: Periodo): boolean {
    const inicio = periodo.desde.getTime();
    if (this.emitidos.get(clave) === inicio) {
      return false;
    }
    this.emitidos.set(clave, inicio);
    return true;
  }
}

/**
 * `true` si `usados` alcanzó la fracción `umbral` de `cuota` (p. ej. 80 de
 * 100 con 0,8). Tolerante al redondeo binario de `umbral × cuota`.
 */
export function alcanzaUmbral(
  usados: number,
  cuota: number,
  umbral: number,
): boolean {
  return usados >= Math.ceil(umbral * cuota - 1e-9);
}
