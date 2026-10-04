/**
 * Error de dominio para credenciales de login invalidas.
 *
 * Es deliberadamente generico: NO distingue si fallo el tenant, el email o la
 * contrasena, para no filtrar informacion. El controller la mapea a 401.
 */
export class CredencialesInvalidasError extends Error {
  constructor() {
    super('Credenciales inválidas');
    this.name = 'CredencialesInvalidasError';
  }
}
