import { TransicionEstadoInvalidaError } from './exceptions/transicion-estado-invalida.error';

export enum EstadoCita {
  PENDIENTE = 'pendiente',
  CONFIRMADA = 'confirmada',
  CANCELADA = 'cancelada',
  ASISTIO = 'asistio',
  NO_ASISTIO = 'no_asistio',
  GHOSTING = 'ghosting',
}

// Estados terminales: de ellos no sale ninguna transición.
const ESTADOS_TERMINALES: ReadonlySet<EstadoCita> = new Set([
  EstadoCita.CANCELADA,
  EstadoCita.ASISTIO,
  EstadoCita.NO_ASISTIO,
  EstadoCita.GHOSTING,
]);

/**
 * Acciones que una PERSONA puede disparar sobre una cita (US-02.08).
 *
 * El vocabulario coincide con las rutas HTTP (`PATCH /citas/:id/<accion>`, y
 * `editar` = `PATCH /citas/:id`) para que el frontend no tenga que traducir.
 * `ghosting` no esta: lo materializa el job de cierre, nunca una persona.
 */
export type AccionCita =
  | 'confirmar'
  | 'cancelar'
  | 'reagendar'
  | 'asistencia'
  | 'inasistencia'
  | 'editar';

// Datos necesarios para crear una cita nueva (estado inicial siempre pendiente).
export interface CrearCitaProps {
  inicio: Date;
  duracionMin: number;
  tipoConsulta: string;
  tenantId: string;
  pacienteId: string;
  usuarioId: string;
}

// Datos completos para reconstituir una cita desde persistencia, incluido el
// estado ya materializado. Solo lo usa el adaptador de persistencia.
export interface ReconstituirCitaProps {
  id: string;
  inicio: Date;
  duracionMin: number;
  tipoConsulta: string;
  estado: EstadoCita;
  tenantId: string;
  pacienteId: string;
  usuarioId: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

export class Cita {
  id: string;
  inicio: Date;
  duracionMin: number;
  tipoConsulta: string;
  tenantId: string;
  pacienteId: string;
  usuarioId: string;
  creadoEn: Date;
  actualizadoEn: Date;

  // El estado es privado: solo se mueve por métodos de transición que validan
  // el grafo cerrado. Nadie lo asigna a mano desde fuera del dominio.
  private _estado: EstadoCita;

  private constructor() {
    // Se construye vía crear() o reconstituir() para garantizar invariantes.
  }

  // Fábrica para una cita nueva. Nace siempre en PENDIENTE.
  static crear(props: CrearCitaProps): Cita {
    const cita = new Cita();
    cita.inicio = props.inicio;
    cita.duracionMin = props.duracionMin;
    cita.tipoConsulta = props.tipoConsulta;
    cita.tenantId = props.tenantId;
    cita.pacienteId = props.pacienteId;
    cita.usuarioId = props.usuarioId;
    cita._estado = EstadoCita.PENDIENTE;
    return cita;
  }

  // Reconstitución desde persistencia: repuebla el estado ya materializado sin
  // pasar por las validaciones de transición. Uso exclusivo del repositorio.
  static reconstituir(props: ReconstituirCitaProps): Cita {
    const cita = new Cita();
    cita.id = props.id;
    cita.inicio = props.inicio;
    cita.duracionMin = props.duracionMin;
    cita.tipoConsulta = props.tipoConsulta;
    cita._estado = props.estado;
    cita.tenantId = props.tenantId;
    cita.pacienteId = props.pacienteId;
    cita.usuarioId = props.usuarioId;
    cita.creadoEn = props.creadoEn;
    cita.actualizadoEn = props.actualizadoEn;
    return cita;
  }

  get estado(): EstadoCita {
    return this._estado;
  }

  esTerminal(): boolean {
    return ESTADOS_TERMINALES.has(this._estado);
  }

  /**
   * Que acciones son legales en el estado actual (US-02.08).
   *
   * Se responde con las MISMAS guardas que usan las transiciones (los
   * predicados `puede*` de abajo), no con una tabla aparte: si el grafo cambia,
   * la pregunta y la transicion cambian juntas. Es una pista para la interfaz,
   * no una autorizacion: la transicion sigue siendo el guardian real (409).
   *
   * El orden es estable (el de la lista) para que el cliente pueda comparar.
   */
  accionesPermitidas(): AccionCita[] {
    const guardas: ReadonlyArray<readonly [AccionCita, () => boolean]> = [
      ['confirmar', () => this.puedeConfirmar()],
      ['cancelar', () => this.puedeCancelar()],
      ['reagendar', () => this.puedeReagendar()],
      ['asistencia', () => this.puedeMarcarAsistencia()],
      ['inasistencia', () => this.puedeMarcarInasistencia()],
      ['editar', () => this.puedeEditar()],
    ];
    return guardas.filter(([, puede]) => puede()).map(([accion]) => accion);
  }

  // pendiente -> confirmada (paciente confirma)
  confirmar(): void {
    this.exigir(this.puedeConfirmar(), 'confirmar');
    this._estado = EstadoCita.CONFIRMADA;
  }

  // pendiente | confirmada -> cancelada (terminal)
  cancelar(): void {
    this.exigir(this.puedeCancelar(), 'cancelar');
    this._estado = EstadoCita.CANCELADA;
  }

  // confirmada -> asistio (terminal): el profesional marca asistencia.
  marcarAsistencia(): void {
    this.exigir(this.puedeMarcarAsistencia(), 'marcarAsistencia');
    this._estado = EstadoCita.ASISTIO;
  }

  // confirmada -> no_asistio (terminal): confirmó pero no llegó.
  marcarInasistencia(): void {
    this.exigir(this.puedeMarcarInasistencia(), 'marcarInasistencia');
    this._estado = EstadoCita.NO_ASISTIO;
  }

  /**
   * pendiente | confirmada -> pendiente, con nuevo `inicio` (ADR-09 §5).
   *
   * Reagendar MUEVE la cita: conserva su id y su identidad. No se cancela para
   * crear otra, porque entonces una cita movida N veces serían N+1 filas sin
   * vínculo entre sí, imposibles de interpretar para RF-08.
   *
   * Vuelve a `pendiente` a propósito: si el paciente había confirmado, confirmó
   * OTRA hora. Esa confirmación ya no vale y hay que volver a pedirla.
   */
  reagendar(nuevoInicio: Date): void {
    this.exigir(this.puedeReagendar(), 'reagendar');
    this.inicio = nuevoInicio;
    this._estado = EstadoCita.PENDIENTE;
  }

  /**
   * Corrige datos que no cambian el compromiso (duración, tipo de consulta).
   * A diferencia de reagendar, no avisa al paciente ni cuenta para su historial.
   * Prohibido sobre una cita terminal: ya no hay nada que corregir.
   */
  editar(props: { duracionMin?: number; tipoConsulta?: string }): void {
    this.exigir(this.puedeEditar(), 'editar');
    if (props.duracionMin !== undefined) this.duracionMin = props.duracionMin;
    if (props.tipoConsulta !== undefined)
      this.tipoConsulta = props.tipoConsulta;
  }

  // pendiente -> ghosting (terminal): llegó el día sin confirmar (vía job).
  marcarGhosting(): void {
    this.exigir(this.puedeMarcarGhosting(), 'marcarGhosting');
    this._estado = EstadoCita.GHOSTING;
  }

  // -------------------------------------------------------------------
  // Guardas del grafo de estados (ADR-04 §1). UNICA fuente de la regla:
  // las usan las transiciones (para lanzar el 409) y `accionesPermitidas`
  // (para contestar que se puede hacer). No duplicar en otro sitio.
  // -------------------------------------------------------------------

  private puedeConfirmar(): boolean {
    return this._estado === EstadoCita.PENDIENTE;
  }

  private puedeCancelar(): boolean {
    return this.estaVigente();
  }

  private puedeReagendar(): boolean {
    return this.estaVigente();
  }

  private puedeMarcarAsistencia(): boolean {
    return this._estado === EstadoCita.CONFIRMADA;
  }

  private puedeMarcarInasistencia(): boolean {
    return this._estado === EstadoCita.CONFIRMADA;
  }

  private puedeEditar(): boolean {
    return !this.esTerminal();
  }

  private puedeMarcarGhosting(): boolean {
    return this._estado === EstadoCita.PENDIENTE;
  }

  // pendiente | confirmada: la cita sigue siendo un compromiso abierto.
  private estaVigente(): boolean {
    return (
      this._estado === EstadoCita.PENDIENTE ||
      this._estado === EstadoCita.CONFIRMADA
    );
  }

  // Lanza el error de dominio si la guarda no se cumple. `evento` conserva el
  // nombre del metodo (no el de la ruta) para no cambiar los mensajes de error.
  private exigir(permitido: boolean, evento: string): void {
    if (!permitido) {
      throw new TransicionEstadoInvalidaError(this._estado, evento);
    }
  }
}
