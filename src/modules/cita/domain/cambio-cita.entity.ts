import { EstadoCita } from './cita.entity';

/**
 * Bitacora inmutable de cambios de una cita (ADR-09 §6).
 *
 * Append-only: nunca se actualiza ni se borra. Se escribe en la MISMA
 * transaccion que la mutacion de la cita, de modo que si el cambio no queda
 * registrado, el cambio no ocurre.
 *
 * Es lo que permite responder "cuantas veces se movio esta cita y quien la
 * movio", que es la materia prima de RF-08.
 */
export enum TipoCambio {
  CREADA = 'creada',
  EDITADA = 'editada',
  REAGENDADA = 'reagendada',
  CONFIRMADA = 'confirmada',
  CANCELADA = 'cancelada',
  ASISTIO = 'asistio',
  NO_ASISTIO = 'no_asistio',
  GHOSTING = 'ghosting',
}

// Quien provoco el cambio. Hoy solo existe la via del profesional autenticado;
// `paciente` llegara con la via publica y `sistema` con el job de cierre.
export enum ActorCambio {
  PROFESIONAL = 'profesional',
  PACIENTE = 'paciente',
  SISTEMA = 'sistema',
}

export interface CrearCambioCitaProps {
  citaId: string;
  tenantId: string;
  tipo: TipoCambio;
  estadoAnterior?: EstadoCita | null;
  estadoNuevo?: EstadoCita | null;
  inicioAnterior?: Date | null;
  inicioNuevo?: Date | null;
  motivo?: string | null;
  actorTipo: ActorCambio;
  actorId?: string | null;
}

export class CambioCita {
  id: string;
  citaId: string;
  tenantId: string;
  tipo: TipoCambio;
  estadoAnterior: EstadoCita | null;
  estadoNuevo: EstadoCita | null;
  inicioAnterior: Date | null;
  inicioNuevo: Date | null;
  motivo: string | null;
  actorTipo: ActorCambio;
  actorId: string | null;
  ocurridoEn: Date;

  private constructor() {
    // Se construye via registrar(): un cambio nunca se arma a mano.
  }

  static registrar(props: CrearCambioCitaProps): CambioCita {
    const cambio = new CambioCita();
    cambio.citaId = props.citaId;
    cambio.tenantId = props.tenantId;
    cambio.tipo = props.tipo;
    cambio.estadoAnterior = props.estadoAnterior ?? null;
    cambio.estadoNuevo = props.estadoNuevo ?? null;
    cambio.inicioAnterior = props.inicioAnterior ?? null;
    cambio.inicioNuevo = props.inicioNuevo ?? null;
    cambio.motivo = props.motivo ?? null;
    cambio.actorTipo = props.actorTipo;
    cambio.actorId = props.actorId ?? null;
    return cambio;
  }
}
