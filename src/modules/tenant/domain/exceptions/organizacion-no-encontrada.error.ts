/**
 * Error de dominio: la organización del token no existe (US-10). Tras la
 * estrategia JWT, que ya rechaza a un usuario inexistente en su organización
 * (ADR-15 §5), es inalcanzable salvo una carrera. El controller lo traduce a
 * 401: la sesión apunta a nadie.
 */
export class OrganizacionNoEncontradaError extends Error {
  constructor() {
    super('La organización de la sesión no existe');
    this.name = 'OrganizacionNoEncontradaError';
  }
}
