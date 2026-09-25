import { EstadoSolicitud } from './solicitud-cita.entity';

// Error de dominio: se intentó aceptar o rechazar una solicitud que ya estaba
// resuelta. El controller lo traduce a HTTP 409.
export class TransicionSolicitudInvalidaError extends Error {
  constructor(desde: EstadoSolicitud, evento: string) {
    super(
      `Transición inválida: no se puede aplicar "${evento}" a una solicitud "${desde}"`,
    );
    this.name = 'TransicionSolicitudInvalidaError';
  }
}
