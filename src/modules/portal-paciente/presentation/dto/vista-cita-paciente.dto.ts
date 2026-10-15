import { EstadoCita } from '../../../cita/domain/cita.entity';
import { AccionPaciente } from '../../domain/acciones-paciente';

/** La petición de otra hora abierta, como la ve el paciente. */
export interface SolicitudOtraHoraVistaDto {
  preferencia: string;
  /** ISO UTC. */
  solicitadaEn: string;
}

/**
 * Lo que ve el paciente de SU cita (contrato de la Fase 3 §3.4, decisión S2).
 *
 * Lo mínimo para decidir: hora, duración, estado, quién y dónde, qué puede
 * hacer y si ya pidió otra hora. **Nunca**: nombre del paciente, RUT,
 * contacto, `tipoConsulta`, ids internos (de la cita, el enlace, el tenant,
 * el profesional o la solicitud) ni el token. Si se agrega un campo aquí,
 * revisar esa lista.
 */
export class VistaCitaPacienteDto {
  /** ISO UTC. */
  inicio: string;
  /** `APP_TZ` de la clínica, p. ej. `America/Santiago`. */
  zonaHoraria: string;
  duracionMin: number;
  estado: EstadoCita;
  /** Nombre completo del profesional DUEÑO de la cita. */
  profesional: string;
  /** Nombre de la organización. */
  organizacion: string;
  accionesPermitidas: AccionPaciente[];
  solicitudOtraHora: SolicitudOtraHoraVistaDto | null;

  constructor(partial: VistaCitaPacienteDto) {
    Object.assign(this, partial);
  }
}
