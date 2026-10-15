import { EstadoCita } from '../../../cita/domain/cita.entity';
import {
  EstadoSolicitud,
  TipoSolicitud,
} from '../../domain/solicitud-cita.entity';

/**
 * La cita que una solicitud de reagendamiento quiere mover, como la muestra
 * la bandeja (Fase 3: "Pide otra hora" con la hora original). Sin paciente ni
 * tipo de consulta: eso ya está en la propia solicitud o en el voucher.
 */
export class CitaOrigenDto {
  inicio: Date;
  duracionMin: number;
  estado: EstadoCita;

  constructor(partial: CitaOrigenDto) {
    Object.assign(this, partial);
  }
}

/**
 * Una solicitud tal como la ve la bandeja del profesional (US-02, cierre de
 * Fase 1 §c; ampliada en la Fase 3).
 *
 * NO incluye `tenantId`, `usuarioId` ni `enlaceId`. El `rut` va FORMATEADO
 * para mostrar (`formatearRut`); en BD sigue canónico y nunca viaja en la URL.
 * `resueltaEn` y `citaId` son `null` mientras está `recibida`.
 */
export class SolicitudBandejaDto {
  id: string;
  estado: EstadoSolicitud;
  // `null` solo en una solicitud de reagendamiento cuyo paciente no tiene RUT
  // (o correo) en su ficha (Fase 3).
  rut: string | null;
  nombrePaciente: string;
  telefono: string;
  correo: string | null;
  // Puede ser `''` en una de reagendamiento (el motivo es opcional en el
  // portal del paciente).
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
  recibidaEn: Date;
  resueltaEn: Date | null;
  citaId: string | null;
  /** `nueva` (formulario público) o `reagendamiento` (pedir otra hora). */
  tipo: TipoSolicitud;
  /** Solo en `reagendamiento`: la cita que se quiere mover. */
  citaOrigenId: string | null;
  /**
   * Solo en `reagendamiento`: la cita de origen TAL COMO ESTÁ AHORA (tras
   * aceptar, ya movida). `null` en una `nueva`.
   */
  citaOrigen: CitaOrigenDto | null;

  constructor(partial: SolicitudBandejaDto) {
    Object.assign(this, partial);
  }
}
