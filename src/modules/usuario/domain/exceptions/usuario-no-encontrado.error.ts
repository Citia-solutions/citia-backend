/**
 * Error de dominio: el usuario de la sesión no existe en su organización
 * (US-10). Tras la estrategia JWT, que ya rechaza a un usuario inexistente
 * (ADR-15 §5), solo se ve en una carrera (la fila desapareció entre la
 * estrategia y el caso de uso). El controller lo traduce a 401: la sesión
 * apunta a nadie.
 */
export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super('El usuario de la sesión no existe en su organización');
    this.name = 'UsuarioNoEncontradoError';
  }
}
