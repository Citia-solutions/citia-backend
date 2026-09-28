/**
 * La solicitud no existe, o pertenece a otra organización. No se distinguen
 * los dos casos: revelar "existe pero no es tuya" filtraría información de
 * otro tenant. El controller lo traduce a 404.
 */
export class SolicitudNoEncontradaError extends Error {
  constructor(id: string) {
    super(`Solicitud "${id}" no encontrada`);
    this.name = 'SolicitudNoEncontradaError';
  }
}
