/**
 * Error de dominio: la contraseña nueva no cumple la política (US-10, ADR-15
 * §4, paso 4): menos de 8 caracteres o más de 72 bytes en UTF-8. Lo lanza
 * `validarContrasenaNueva`; el controller lo traduce a 400.
 */
export class ContrasenaNoValidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ContrasenaNoValidaError';
  }
}
