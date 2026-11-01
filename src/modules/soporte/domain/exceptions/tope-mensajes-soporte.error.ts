import { TOPE_MENSAJES_SOPORTE_24H } from '../limites-soporte';

/**
 * Error de dominio: la organización ya escribió `TOPE_MENSAJES_SOPORTE_24H`
 * mensajes a soporte en las últimas 24 horas (T11, ADR-15 §7). La ruta lo
 * traduce a 429 con este mismo texto, que ve el profesional.
 */
export class TopeMensajesSoporteError extends Error {
  constructor(readonly tope: number = TOPE_MENSAJES_SOPORTE_24H) {
    super(
      `Ya enviaste ${tope} mensajes a soporte en las últimas 24 horas. Vuelve a intentarlo más tarde.`,
    );
    this.name = 'TopeMensajesSoporteError';
  }
}
