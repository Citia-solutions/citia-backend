import { TransicionSolicitudInvalidaError } from './transicion-solicitud-invalida.error';

/**
 * Petición de hora enviada por un paciente desde el enlace público (ADR-09 §1).
 *
 * NO es una cita. Nada existe en la agenda hasta que el profesional la acepta;
 * ese acto es el que crea la Cita. Mantenerlas separadas evita que el ruido
 * —spam, peticiones falsas, rechazos— contamine el historial de reputación del
 * paciente, que es el diferenciador del producto.
 *
 * Vocabulario deliberadamente distinto al de EstadoCita: aquí `recibida`
 * significa "todavía no existe nada", mientras en Cita `pendiente` significa
 * "existe y espera confirmación del paciente".
 */
export enum EstadoSolicitud {
  RECIBIDA = 'recibida',
  ACEPTADA = 'aceptada',
  RECHAZADA = 'rechazada',
}

const ESTADOS_TERMINALES: ReadonlySet<EstadoSolicitud> = new Set([
  EstadoSolicitud.ACEPTADA,
  EstadoSolicitud.RECHAZADA,
]);

/**
 * Datos que llegan del formulario público.
 *
 * PROVISIONAL: los campos son los de ADR-09 §10. El formulario del frontend
 * todavía no está definido; cuando lo esté, este contrato se ajusta. Lo que NO
 * cambia es la forma: datos crudos del paciente, sin crear todavía su ficha.
 */
export interface RecibirSolicitudProps {
  tenantId: string;
  rut: string;
  nombrePaciente: string;
  telefono: string;
  correo: string;
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
}

export class SolicitudCita {
  id: string;
  tenantId: string;
  /**
   * Profesional al que se le asigna. Nulo mientras la solicitud está en la
   * bandeja: el enlace público es de la organización, y el dueño queda
   * definido cuando alguien la acepta.
   */
  usuarioId: string | null;
  rut: string;
  nombrePaciente: string;
  telefono: string;
  correo: string;
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
  /** Cita generada al aceptar. Nula mientras no se acepte. */
  citaId: string | null;
  recibidaEn: Date;

  private _estado: EstadoSolicitud;

  private constructor() {
    // Se construye vía recibir() o reconstituir().
  }

  /** Toda solicitud nace RECIBIDA. */
  static recibir(props: RecibirSolicitudProps): SolicitudCita {
    const solicitud = new SolicitudCita();
    solicitud.tenantId = props.tenantId;
    solicitud.usuarioId = null;
    solicitud.rut = props.rut;
    solicitud.nombrePaciente = props.nombrePaciente;
    solicitud.telefono = props.telefono;
    solicitud.correo = props.correo;
    solicitud.motivo = props.motivo;
    solicitud.preferenciaHoraria = props.preferenciaHoraria;
    solicitud.consentimiento = props.consentimiento;
    solicitud.citaId = null;
    solicitud._estado = EstadoSolicitud.RECIBIDA;
    return solicitud;
  }

  /** Uso exclusivo del adaptador de persistencia. */
  static reconstituir(
    props: RecibirSolicitudProps & {
      id: string;
      usuarioId: string | null;
      estado: EstadoSolicitud;
      citaId: string | null;
      recibidaEn: Date;
    },
  ): SolicitudCita {
    const solicitud = SolicitudCita.recibir(props);
    solicitud.id = props.id;
    solicitud.usuarioId = props.usuarioId;
    solicitud._estado = props.estado;
    solicitud.citaId = props.citaId;
    solicitud.recibidaEn = props.recibidaEn;
    return solicitud;
  }

  get estado(): EstadoSolicitud {
    return this._estado;
  }

  esTerminal(): boolean {
    return ESTADOS_TERMINALES.has(this._estado);
  }

  /**
   * recibida -> aceptada. Queda registrado quién la aceptó y con qué cita.
   * De un terminal no se sale: aceptar dos veces generaría dos citas.
   */
  aceptar(usuarioId: string, citaId: string): void {
    this.asegurarRecibida('aceptar');
    this.usuarioId = usuarioId;
    this.citaId = citaId;
    this._estado = EstadoSolicitud.ACEPTADA;
  }

  /** recibida -> rechazada. NO genera cita ni deja rastro en el historial. */
  rechazar(usuarioId: string): void {
    this.asegurarRecibida('rechazar');
    this.usuarioId = usuarioId;
    this._estado = EstadoSolicitud.RECHAZADA;
  }

  private asegurarRecibida(evento: string): void {
    if (this._estado !== EstadoSolicitud.RECIBIDA) {
      throw new TransicionSolicitudInvalidaError(this._estado, evento);
    }
  }
}
