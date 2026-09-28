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
  /**
   * Cuándo salió de la bandeja (aceptada o rechazada). Nulo mientras está
   * `recibida`. Ordena la bandeja de resueltas y da la base para retener por
   * antigüedad las rechazadas (DT-26).
   */
  resueltaEn: Date | null;

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
    solicitud.resueltaEn = null;
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
      resueltaEn: Date | null;
    },
  ): SolicitudCita {
    const solicitud = SolicitudCita.recibir(props);
    solicitud.id = props.id;
    solicitud.usuarioId = props.usuarioId;
    solicitud._estado = props.estado;
    solicitud.citaId = props.citaId;
    solicitud.recibidaEn = props.recibidaEn;
    solicitud.resueltaEn = props.resueltaEn;
    return solicitud;
  }

  get estado(): EstadoSolicitud {
    return this._estado;
  }

  esTerminal(): boolean {
    return ESTADOS_TERMINALES.has(this._estado);
  }

  /**
   * recibida -> aceptada. Queda registrado quién la aceptó, con qué cita y
   * cuándo. De un terminal no se sale: aceptar dos veces generaría dos citas.
   * `ahora` se puede inyectar para los tests; por defecto, el reloj del sistema.
   */
  aceptar(usuarioId: string, citaId: string, ahora: Date = new Date()): void {
    this.asegurarResolvible('aceptar');
    this.usuarioId = usuarioId;
    this.citaId = citaId;
    this.resueltaEn = ahora;
    this._estado = EstadoSolicitud.ACEPTADA;
  }

  /** recibida -> rechazada. NO genera cita ni deja rastro en el historial. */
  rechazar(usuarioId: string, ahora: Date = new Date()): void {
    this.asegurarResolvible('rechazar');
    this.usuarioId = usuarioId;
    this.resueltaEn = ahora;
    this._estado = EstadoSolicitud.RECHAZADA;
  }

  /**
   * Lanza el 409 de dominio si la solicitud ya no está `recibida`. Es público
   * para que la aplicación lo compruebe ANTES de crear nada al aceptar (ni
   * paciente, ni cita, ni evento); `aceptar`/`rechazar` lo vuelven a exigir.
   */
  asegurarResolvible(evento: string): void {
    if (this._estado !== EstadoSolicitud.RECIBIDA) {
      throw new TransicionSolicitudInvalidaError(this._estado, evento);
    }
  }
}
