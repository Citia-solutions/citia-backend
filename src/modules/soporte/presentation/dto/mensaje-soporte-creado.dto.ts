import { MensajeSoporte } from '../../domain/mensaje-soporte.entity';

/**
 * Respuesta 201 de `POST /api/soporte/mensajes` (US-10, ADR-15 §7). Solo el
 * id y cuándo quedó guardado: ni el texto, ni el estado del envío (el correo
 * sale después, por el job `soporte.envio`).
 */
export class MensajeSoporteCreadoDto {
  id: string;
  creadoEn: Date;

  constructor(partial: MensajeSoporteCreadoDto) {
    Object.assign(this, partial);
  }

  static desde(mensaje: MensajeSoporte): MensajeSoporteCreadoDto {
    return new MensajeSoporteCreadoDto({
      id: mensaje.id,
      creadoEn: mensaje.creadoEn,
    });
  }
}
