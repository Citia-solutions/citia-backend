/**
 * Error de dominio: la contraseña actual no coincide (US-10, ADR-15 §4,
 * paso 3). El controller lo traduce a **400, nunca a 401**: el frontend
 * cierra la sesión con cualquier 401, y un error de tipeo no debe sacar al
 * usuario.
 */
export class ContrasenaActualIncorrectaError extends Error {
  constructor() {
    super('La contraseña actual no es correcta');
    this.name = 'ContrasenaActualIncorrectaError';
  }
}
