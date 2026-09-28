import { EstadoSolicitud } from '../../domain/solicitud-cita.entity';

/**
 * Una solicitud tal como la ve la bandeja del profesional (US-02, cierre de
 * Fase 1 §c).
 *
 * NO incluye `tenantId` ni `usuarioId`. El `rut` va FORMATEADO para mostrar
 * (`formatearRut`); en BD sigue canónico y nunca viaja en la URL.
 * `resueltaEn` y `citaId` son `null` mientras está `recibida`.
 */
export class SolicitudBandejaDto {
  id: string;
  estado: EstadoSolicitud;
  rut: string;
  nombrePaciente: string;
  telefono: string;
  correo: string;
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
  recibidaEn: Date;
  resueltaEn: Date | null;
  citaId: string | null;

  constructor(partial: SolicitudBandejaDto) {
    Object.assign(this, partial);
  }
}
