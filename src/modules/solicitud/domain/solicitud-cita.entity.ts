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
  /**
   * La puso el SISTEMA, no una persona (Fase 3): la cita de origen de una
   * solicitud de reagendamiento terminó (cancelada, asistió, no asistió) y ya
   * no hay nada que mover. Terminal.
   */
  DESCARTADA = 'descartada',
}

/**
 * Qué pide la solicitud (Fase 3, R2):
 *  - `nueva`: una hora nueva, desde el formulario público de la organización.
 *  - `reagendamiento`: el paciente pidió otra hora desde el enlace de SU cita
 *    (`citaOrigenId`). Aceptarla MUEVE esa cita; no crea otra.
 */
export enum TipoSolicitud {
  NUEVA = 'nueva',
  REAGENDAMIENTO = 'reagendamiento',
}

const ESTADOS_TERMINALES: ReadonlySet<EstadoSolicitud> = new Set([
  EstadoSolicitud.ACEPTADA,
  EstadoSolicitud.RECHAZADA,
  EstadoSolicitud.DESCARTADA,
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

/**
 * "Pedir otra hora" desde el enlace del paciente (Fase 3, US-02.07). Los datos
 * del paciente se COPIAN de su ficha (no los escribe el paciente): `rut` y
 * `correo` pueden ser `null` (alta manual sin RUT, fichas antiguas sin correo).
 */
export interface PedirOtraHoraProps {
  tenantId: string;
  /** La cita que el paciente quiere mover. */
  citaOrigenId: string;
  /** El enlace con el que la pidió (`enlaces_cita.id`). */
  enlaceId: string;
  /** Dueño de la cita de origen: la solicitud nace asignada a él. */
  usuarioId: string;
  rut: string | null;
  nombrePaciente: string;
  telefono: string;
  correo: string | null;
  consentimiento: boolean;
  preferenciaHoraria: string;
  /** Opcional en el formulario; ausente se guarda como `''` (la columna es NOT NULL). */
  motivo?: string | null;
}

/** Fila ya persistida. Uso exclusivo del adaptador de persistencia. */
export interface ReconstituirSolicitudProps {
  id: string;
  tenantId: string;
  usuarioId: string | null;
  rut: string | null;
  nombrePaciente: string;
  telefono: string;
  correo: string | null;
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
  estado: EstadoSolicitud;
  citaId: string | null;
  recibidaEn: Date;
  resueltaEn: Date | null;
  /** Ausente = `nueva` (filas y dobles anteriores a la Fase 3). */
  tipo?: TipoSolicitud;
  citaOrigenId?: string | null;
  enlaceId?: string | null;
}

export class SolicitudCita {
  id: string;
  tenantId: string;
  /**
   * Profesional al que se le asigna. Nulo mientras una solicitud `nueva` está
   * en la bandeja: el enlace público es de la organización, y el dueño queda
   * definido cuando alguien la acepta. Una de `reagendamiento` nace con el
   * dueño de la cita de origen.
   */
  usuarioId: string | null;
  /** Canónico. Siempre presente en una `nueva`; puede faltar en una de reagendamiento. */
  rut: string | null;
  nombrePaciente: string;
  telefono: string;
  /** Siempre presente en una `nueva`; puede faltar en una de reagendamiento. */
  correo: string | null;
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
  /**
   * Cita generada (o movida) al aceptar. Nula mientras no se acepte. En una de
   * reagendamiento aceptada coincide con `citaOrigenId`.
   */
  citaId: string | null;
  recibidaEn: Date;
  /**
   * Cuándo salió de la bandeja (aceptada, rechazada o descartada). Nulo
   * mientras está `recibida`. Ordena la bandeja de resueltas y da la base para
   * retener por antigüedad las rechazadas (DT-26).
   */
  resueltaEn: Date | null;
  /** Ver `TipoSolicitud`. */
  tipo: TipoSolicitud;
  /** Solo en `reagendamiento`: la cita que se quiere mover. */
  citaOrigenId: string | null;
  /** Solo en `reagendamiento`: el enlace con el que se pidió. */
  enlaceId: string | null;

  private _estado: EstadoSolicitud;

  private constructor() {
    // Se construye vía recibir(), pedirOtraHora() o reconstituir().
  }

  /** Solicitud `nueva` desde el formulario público. Nace RECIBIDA. */
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
    solicitud.tipo = TipoSolicitud.NUEVA;
    solicitud.citaOrigenId = null;
    solicitud.enlaceId = null;
    solicitud._estado = EstadoSolicitud.RECIBIDA;
    return solicitud;
  }

  /**
   * Solicitud de `reagendamiento` (R2): el paciente pide otra hora para su
   * cita desde el enlace. Nace RECIBIDA y asignada al dueño de la cita. No
   * toca la cita de origen (R1).
   */
  static pedirOtraHora(props: PedirOtraHoraProps): SolicitudCita {
    const solicitud = new SolicitudCita();
    solicitud.tenantId = props.tenantId;
    solicitud.usuarioId = props.usuarioId;
    solicitud.rut = props.rut;
    solicitud.nombrePaciente = props.nombrePaciente;
    solicitud.telefono = props.telefono;
    solicitud.correo = props.correo;
    solicitud.motivo = props.motivo ?? '';
    solicitud.preferenciaHoraria = props.preferenciaHoraria;
    solicitud.consentimiento = props.consentimiento;
    solicitud.citaId = null;
    solicitud.resueltaEn = null;
    solicitud.tipo = TipoSolicitud.REAGENDAMIENTO;
    solicitud.citaOrigenId = props.citaOrigenId;
    solicitud.enlaceId = props.enlaceId;
    solicitud._estado = EstadoSolicitud.RECIBIDA;
    return solicitud;
  }

  /** Uso exclusivo del adaptador de persistencia. */
  static reconstituir(props: ReconstituirSolicitudProps): SolicitudCita {
    const solicitud = new SolicitudCita();
    solicitud.id = props.id;
    solicitud.tenantId = props.tenantId;
    solicitud.usuarioId = props.usuarioId;
    solicitud.rut = props.rut;
    solicitud.nombrePaciente = props.nombrePaciente;
    solicitud.telefono = props.telefono;
    solicitud.correo = props.correo;
    solicitud.motivo = props.motivo;
    solicitud.preferenciaHoraria = props.preferenciaHoraria;
    solicitud.consentimiento = props.consentimiento;
    solicitud._estado = props.estado;
    solicitud.citaId = props.citaId;
    solicitud.recibidaEn = props.recibidaEn;
    solicitud.resueltaEn = props.resueltaEn;
    solicitud.tipo = props.tipo ?? TipoSolicitud.NUEVA;
    solicitud.citaOrigenId = props.citaOrigenId ?? null;
    solicitud.enlaceId = props.enlaceId ?? null;
    return solicitud;
  }

  get estado(): EstadoSolicitud {
    return this._estado;
  }

  esTerminal(): boolean {
    return ESTADOS_TERMINALES.has(this._estado);
  }

  esReagendamiento(): boolean {
    return this.tipo === TipoSolicitud.REAGENDAMIENTO;
  }

  /**
   * recibida -> aceptada. Queda registrado quién la aceptó, con qué cita y
   * cuándo. De un terminal no se sale: aceptar dos veces generaría dos citas.
   * En una de reagendamiento, `citaId` es la cita de origen (movida).
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
   * recibida -> descartada, por el SISTEMA (Fase 3): la cita de origen terminó
   * y la solicitud de otra hora ya no tiene objeto. No cambia `usuarioId` ni
   * `citaId`. Lanza el 409 de dominio si ya no está `recibida`; la
   * idempotencia del suscriptor se resuelve buscando solo las `recibida`.
   */
  descartar(ahora: Date = new Date()): void {
    this.asegurarResolvible('descartar');
    this.resueltaEn = ahora;
    this._estado = EstadoSolicitud.DESCARTADA;
  }

  /**
   * Lanza el 409 de dominio si la solicitud ya no está `recibida`. Es público
   * para que la aplicación lo compruebe ANTES de crear nada al aceptar (ni
   * paciente, ni cita, ni evento); `aceptar`/`rechazar`/`descartar` lo vuelven
   * a exigir.
   */
  asegurarResolvible(evento: string): void {
    if (this._estado !== EstadoSolicitud.RECIBIDA) {
      throw new TransicionSolicitudInvalidaError(this._estado, evento);
    }
  }
}
