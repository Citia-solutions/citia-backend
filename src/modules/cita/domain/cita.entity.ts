import { CitaAunNoComienzaError } from './exceptions/cita-aun-no-comienza.error';
import { TransicionEstadoInvalidaError } from './exceptions/transicion-estado-invalida.error';

export enum EstadoCita {
  PENDIENTE = 'pendiente',
  CONFIRMADA = 'confirmada',
  CANCELADA = 'cancelada',
  ASISTIO = 'asistio',
  NO_ASISTIO = 'no_asistio',
  GHOSTING = 'ghosting',
}

/**
 * De dónde salió la cita (US-07.01, H4). Se fija al crearla y no cambia:
 * reagendar mueve la MISMA cita (ADR-09 §5) y aceptar una petición de otra
 * hora también (ADR-10 R2), así que "reagendamiento" no es un origen.
 *
 * Solo se guarda para medir y calibrar (US-07.02): no se expone en el
 * detalle ni en el dashboard.
 */
export enum OrigenCita {
  /** El profesional la creó a mano (`POST /api/citas`). */
  MANUAL = 'manual',
  /** Nació al aceptar en la bandeja una solicitud pública `nueva`. */
  SOLICITUD_PUBLICA = 'solicitud_publica',
}

// Estados terminales: de ellos no sale ninguna transición.
const ESTADOS_TERMINALES: ReadonlySet<EstadoCita> = new Set([
  EstadoCita.CANCELADA,
  EstadoCita.ASISTIO,
  EstadoCita.NO_ASISTIO,
  EstadoCita.GHOSTING,
]);

/**
 * Estados vigentes: la cita sigue siendo un compromiso abierto y OCUPA la
 * agenda (ADR-04, ADR-11 §1). Se exporta como arreglo para que el repositorio
 * pueda pre-filtrar con `IN (...)` sin redefinir la lista por su cuenta.
 */
export const ESTADOS_VIGENTES: readonly EstadoCita[] = [
  EstadoCita.PENDIENTE,
  EstadoCita.CONFIRMADA,
];

/**
 * Duración máxima de una cita, en minutos: un día (ADR-11 §2). Da la cota
 * inferior de la consulta de solapamientos (`inicio - DURACION_MAXIMA_MIN`) y
 * la aplican los DTO de entrada con `@Max`.
 */
export const DURACION_MAXIMA_MIN = 1440;

/**
 * Acciones que una PERSONA puede disparar sobre una cita (US-02.08).
 *
 * El vocabulario coincide con las rutas HTTP (`PATCH /citas/:id/<accion>`, y
 * `editar` = `PATCH /citas/:id`) para que el frontend no tenga que traducir.
 *
 * `ghosting` no es una acción propia (US-07.01, ADR-14 §9): lo produce
 * `inasistencia` sobre una `pendiente` (el profesional; el dominio decide el
 * destino según el estado de origen) o el job G1 (el sistema, con
 * `marcarGhosting`).
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
  // Obligatorio a propósito (US-07.01): el compilador impide crear una cita
  // sin decir de dónde salió.
  origen: OrigenCita;
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
  origen: OrigenCita;
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

  private constructor(
    // De dónde salió (US-07.01). Solo lectura: se fija al crear y no cambia.
    readonly origen: OrigenCita,
  ) {
    // Se construye vía crear() o reconstituir() para garantizar invariantes.
  }

  // Fábrica para una cita nueva. Nace siempre en PENDIENTE.
  static crear(props: CrearCitaProps): Cita {
    const cita = new Cita(props.origen);
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
    const cita = new Cita(props.origen);
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

  // Fin de la cita: inicio + duracionMin. Extremo abierto del intervalo
  // [inicio, fin): a las `fin` la agenda ya está libre.
  get fin(): Date {
    return new Date(this.inicio.getTime() + this.duracionMin * 60_000);
  }

  /**
   * ¿Esta cita se cruza con `otra` en la agenda de su profesional? (ADR-11 §1)
   *
   * UNICA fuente de la regla: el repositorio solo pre-filtra candidatas; la
   * decisión fina se toma aquí. Se cruzan si y solo si:
   *  - son citas distintas (misma instancia o mismo id => no);
   *  - son del mismo tenant y del mismo profesional DUEÑO (`usuarioId`), no de
   *    quien hace la petición;
   *  - ambas están vigentes: una terminal no ocupa la agenda;
   *  - los intervalos semiabiertos [inicio, fin) se intersectan. Por eso las
   *    citas pegadas (10:00–10:50 y 10:50–11:40) NO se cruzan.
   */
  chocaCon(otra: Cita): boolean {
    if (this === otra) return false;
    if (this.id !== undefined && this.id === otra.id) return false;
    if (this.tenantId !== otra.tenantId) return false;
    if (this.usuarioId !== otra.usuarioId) return false;
    if (!this.estaVigente() || !otra.estaVigente()) return false;
    return (
      this.inicio.getTime() < otra.fin.getTime() &&
      otra.inicio.getTime() < this.fin.getTime()
    );
  }

  /**
   * Que acciones son legales en el estado actual y en `ahora` (US-02.08,
   * US-07.01).
   *
   * Se responde con las MISMAS guardas que usan las transiciones (los
   * predicados `puede*` de abajo), no con una tabla aparte: si el grafo cambia,
   * la pregunta y la transicion cambian juntas. Es una pista para la interfaz,
   * no una autorizacion: la transicion sigue siendo el guardian real (409).
   *
   * `ahora` es OBLIGATORIO (sin valor por defecto, para que nadie lo olvide):
   * `asistencia` e `inasistencia` solo se anuncian desde la hora de inicio
   * (`yaComenzo`). Lo demás no depende del reloj.
   *
   * El orden es estable (el de la lista) para que el cliente pueda comparar.
   */
  accionesPermitidas(ahora: Date): AccionCita[] {
    const guardas: ReadonlyArray<readonly [AccionCita, () => boolean]> = [
      ['confirmar', () => this.puedeConfirmar()],
      ['cancelar', () => this.puedeCancelar()],
      ['reagendar', () => this.puedeReagendar()],
      ['asistencia', () => this.puedeMarcarAsistencia(ahora)],
      ['inasistencia', () => this.puedeMarcarInasistencia(ahora)],
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

  /**
   * pendiente | confirmada -> asistio (terminal): el profesional marca que el
   * paciente llegó (US-07.01, ADR-14 §9). Desde `pendiente` es directo: no se
   * inventa una confirmación que no hubo.
   *
   * @throws TransicionEstadoInvalidaError si la cita no está vigente (primero
   *   el estado: una terminal responde lo de siempre, aunque sea antes de su hora).
   * @throws CitaAunNoComienzaError si `ahora` es anterior al `inicio`.
   */
  marcarAsistencia(ahora: Date): void {
    this.exigirMarca(this.estadoAdmiteMarca(), ahora, 'marcarAsistencia');
    this._estado = EstadoCita.ASISTIO;
  }

  /**
   * El profesional marca que el paciente NO llegó (US-07.01, ADR-14 §9). El
   * destino lo decide el dominio según el estado de origen, con la semántica
   * de ADR-04 §2:
   *  - `confirmada -> no_asistio`: confirmó y no llegó;
   *  - `pendiente -> ghosting`: nunca confirmó y no llegó (el actor de la
   *    bitácora, `profesional`, lo distingue del cierre del job G1).
   *
   * Devuelve el estado de destino. Mismos errores y mismo orden que
   * `marcarAsistencia`.
   */
  marcarInasistencia(ahora: Date): EstadoCita {
    this.exigirMarca(this.estadoAdmiteMarca(), ahora, 'marcarInasistencia');
    this._estado =
      this._estado === EstadoCita.PENDIENTE
        ? EstadoCita.GHOSTING
        : EstadoCita.NO_ASISTIO;
    return this._estado;
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

  /**
   * pendiente -> ghosting (terminal) por el SISTEMA: lo usa solo el job G1
   * (US-07.01, DT-11), que cierra las citas `pendiente` cuyo día ya terminó y
   * que nadie marcó. El profesional llega a `ghosting` por `marcarInasistencia`.
   *
   * También exige la hora (`yaComenzo`), aunque el job solo reclame citas de
   * días ya terminados: la regla vive aquí, no en la consulta.
   *
   * @throws TransicionEstadoInvalidaError si la cita no está `pendiente`
   *   (primero el estado: de un terminal no se sale).
   * @throws CitaAunNoComienzaError si `ahora` es anterior al `inicio`.
   */
  marcarGhosting(ahora: Date): void {
    this.exigirMarca(
      this._estado === EstadoCita.PENDIENTE,
      ahora,
      'marcarGhosting',
    );
    this._estado = EstadoCita.GHOSTING;
  }

  // -------------------------------------------------------------------
  // Guardas del grafo de estados (ADR-04 §1). UNICA fuente de la regla:
  // las usan las transiciones (para lanzar el 409) y `accionesPermitidas`
  // (para contestar que se puede hacer). No duplicar en otro sitio.
  //
  // Las tres marcas (asistencia, inasistencia, ghosting) combinan una
  // condición de ESTADO y la de la HORA (`yaComenzo`, US-07.01 H2). Las
  // transiciones las comprueban por separado y en ese orden (`exigirMarca`)
  // para lanzar el error que corresponde; `accionesPermitidas` usa la
  // conjunción (`puedeMarcar*`).
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

  // Asistencia e inasistencia: desde cualquier estado vigente y desde la hora.
  private puedeMarcarAsistencia(ahora: Date): boolean {
    return this.estadoAdmiteMarca() && this.yaComenzo(ahora);
  }

  private puedeMarcarInasistencia(ahora: Date): boolean {
    return this.estadoAdmiteMarca() && this.yaComenzo(ahora);
  }

  private puedeEditar(): boolean {
    return !this.esTerminal();
  }

  // Condición de estado de la asistencia y la inasistencia (US-07.01, H1):
  // `pendiente` o `confirmada`. El destino de la inasistencia lo decide
  // `marcarInasistencia` según el estado de origen.
  private estadoAdmiteMarca(): boolean {
    return this.estaVigente();
  }

  /**
   * ¿Ya llegó la hora de inicio? (US-07.01, H2). A la hora EXACTA de inicio ya
   * se puede marcar: es el complemento exacto de la validez del enlace del
   * paciente (`ahora < inicio`), así que no queda ningún instante en que se
   * puedan las dos cosas ni ninguno en que no se pueda ninguna.
   *
   * Una fecha inválida (`NaN`) responde `false`: ante la duda, no se marca.
   */
  private yaComenzo(ahora: Date): boolean {
    return ahora.getTime() >= this.inicio.getTime();
  }

  // pendiente | confirmada: la cita sigue siendo un compromiso abierto.
  private estaVigente(): boolean {
    return ESTADOS_VIGENTES.includes(this._estado);
  }

  // Lanza el error de dominio si la guarda no se cumple. `evento` conserva el
  // nombre del metodo (no el de la ruta) para no cambiar los mensajes de error.
  private exigir(permitido: boolean, evento: string): void {
    if (!permitido) {
      throw new TransicionEstadoInvalidaError(this._estado, evento);
    }
  }

  /**
   * Guarda de las tres marcas, en este orden: primero el ESTADO (si no lo
   * admite → `TransicionEstadoInvalidaError`, como siempre: una terminal
   * responde lo mismo aunque sea antes de su hora) y después la HORA (si
   * todavía no comienza → `CitaAunNoComienzaError`).
   */
  private exigirMarca(
    estadoAdmite: boolean,
    ahora: Date,
    evento: string,
  ): void {
    this.exigir(estadoAdmite, evento);
    if (!this.yaComenzo(ahora)) {
      throw new CitaAunNoComienzaError();
    }
  }
}
