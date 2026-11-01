/**
 * Error de dominio: la contraseña nueva es la actual (US-10, ADR-15 §4,
 * paso 5), comprobado contra el hash y no comparando textos. El controller lo
 * traduce a 400.
 */
export class ContrasenaRepetidaError extends Error {
  constructor() {
    super('La nueva contraseña debe ser distinta de la actual');
    this.name = 'ContrasenaRepetidaError';
  }
}
