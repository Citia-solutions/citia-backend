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

  // pendiente -> confirmada (paciente confirma)
  confirmar(): void {
    this.asegurarTransicion(EstadoCita.PENDIENTE, 'confirmar');
    this._estado = EstadoCita.CONFIRMADA;
  }

  // pendiente | confirmada -> cancelada (terminal)
  cancelar(): void {
    if (
      this._estado !== EstadoCita.PENDIENTE &&
      this._estado !== EstadoCita.CONFIRMADA
    ) {
      throw new TransicionEstadoInvalidaError(this._estado, 'cancelar');
    }
    this._estado = EstadoCita.CANCELADA;
  }

  // confirmada -> asistio (terminal): el profesional marca asistencia.
  marcarAsistencia(): void {
    this.asegurarTransicion(EstadoCita.CONFIRMADA, 'marcarAsistencia');
    this._estado = EstadoCita.ASISTIO;
  }

  // confirmada -> no_asistio (terminal): confirmó pero no llegó.
  marcarInasistencia(): void {
    this.asegurarTransicion(EstadoCita.CONFIRMADA, 'marcarInasistencia');
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
    if (
      this._estado !== EstadoCita.PENDIENTE &&
      this._estado !== EstadoCita.CONFIRMADA
    ) {
      throw new TransicionEstadoInvalidaError(this._estado, 'reagendar');
    }
    this.inicio = nuevoInicio;
    this._estado = EstadoCita.PENDIENTE;
  }

  /**
   * Corrige datos que no cambian el compromiso (duración, tipo de consulta).
   * A diferencia de reagendar, no avisa al paciente ni cuenta para su historial.
   * Prohibido sobre una cita terminal: ya no hay nada que corregir.
   */
  editar(props: { duracionMin?: number; tipoConsulta?: string }): void {
    if (this.esTerminal()) {
      throw new TransicionEstadoInvalidaError(this._estado, 'editar');
    }
    if (props.duracionMin !== undefined) this.duracionMin = props.duracionMin;
    if (props.tipoConsulta !== undefined)
      this.tipoConsulta = props.tipoConsulta;
  }

  // pendiente -> ghosting (terminal): llegó el día sin confirmar (vía job).
  marcarGhosting(): void {
    this.asegurarTransicion(EstadoCita.PENDIENTE, 'marcarGhosting');
    this._estado = EstadoCita.GHOSTING;
  }

  private asegurarTransicion(desde: EstadoCita, evento: string): void {
    if (this._estado !== desde) {
      throw new TransicionEstadoInvalidaError(this._estado, evento);
    }
  }
}
