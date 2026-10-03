/**
 * Error de dominio: un cambio de contacto (`PATCH /pacientes/:id`) sin ningun
 * campo. No es un "no-op" silencioso: casi siempre es un error del cliente
 * (campo mal escrito, que el ValidationPipe descarta por `whitelist`). El
 * controller lo traduce a 400.
 */
export class CambioContactoVacioError extends Error {
  constructor() {
    super('Envía al menos uno de estos campos: telefono, correo');
    this.name = 'CambioContactoVacioError';
  }
}
