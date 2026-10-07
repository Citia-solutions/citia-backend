import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../../domain/recordatorio.entity';
import { DatosRecordatorio } from '../../domain/recordatorio.repository';

/**
 * Un recordatorio de una cita, tal como lo ve el profesional
 * (`GET /api/citas/:citaId/recordatorios`, ADR-13 §17).
 *
 * NO incluye el destinatario (no se guarda), el id ni el nombre del
 * proveedor, `ultimoError`, `intentos`, `tenantId` ni `citaId`.
 */
export class RecordatorioCitaDto {
  id: string;
  canal: CanalRecordatorio;
  /** El "tipo": 1440 = 24 h antes, 120 = 2 h antes. */
  antelacionMin: number;
  estado: EstadoRecordatorio;
  /** Código cuando no salió (`cancelado`, `omitido`, `fallido`); si no, `null`. */
  motivo: MotivoRecordatorio | null;
  /** Hora PLANIFICADA (inicio − antelación, ajustada por las horas sin envío). */
  programadoPara: Date;
  /**
   * Cuándo se intentará de verdad, solo mientras está `programado` (difiere de
   * `programadoPara` en un tardío, un reintento o una espera por silencio o
   * cuota). `null` en cualquier otro estado.
   */
  proximoIntentoEn: Date | null;
  enviadoEn: Date | null;
  entregadoEn: Date | null;

  constructor(partial: RecordatorioCitaDto) {
    Object.assign(this, partial);
  }

  static desde(datos: DatosRecordatorio): RecordatorioCitaDto {
    return new RecordatorioCitaDto({
      id: datos.id,
      canal: datos.canal,
      antelacionMin: datos.antelacionMin,
      estado: datos.estado,
      motivo: datos.motivo,
      programadoPara: datos.programadoPara,
      proximoIntentoEn:
        datos.estado === EstadoRecordatorio.PROGRAMADO
          ? datos.proximoIntentoEn
          : null,
      enviadoEn: datos.enviadoEn,
      entregadoEn: datos.entregadoEn,
    });
  }
}
