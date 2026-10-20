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

// Quien provoco el cambio (ver `actor.ts`). Existen los tres: `profesional`
// (ruta autenticada y bandeja), `paciente` (su enlace, Fase 3) y `sistema`
// (el job G1 que cierra como `ghosting` las citas que nadie marco, US-07.01).
export enum ActorCambio {
  PROFESIONAL = 'profesional',
  PACIENTE = 'paciente',
  SISTEMA = 'sistema',
}

/**
 * Quién PIDIÓ una cancelación o un reagendamiento (US-07.01, H3). No siempre
 * es quien lo hizo (`actorTipo`): si el paciente llama y el profesional
 * cancela por él, el actor es el profesional y lo pidió el paciente.
 *
 * `null` = sin dato (las filas anteriores a US-07.01, o la API sin el campo):
 * cuenta como del profesional, a favor del paciente. La bitácora no se
 * rellena hacia atrás (H12).
 */
export enum PedidoPor {
  PACIENTE = 'paciente',
  PROFESIONAL = 'profesional',
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
  pedidoPor?: PedidoPor | null;
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
  pedidoPor: PedidoPor | null;
  ocurridoEn: Date;

  private constructor() {
    // Se construye via registrar(): un cambio nunca se arma a mano.
  }

  /**
   * Arma un cambio de la bitácora. Invariante de "quién lo pidió" (US-07.01,
   * espejo de los CHECK de la migración 1750000016000):
   *  - `pedidoPor` solo en una cancelación o un reagendamiento
   *    (`CHK_cambios_cita_pedido_por`);
   *  - el paciente, por su enlace, nunca actúa "por decisión del profesional"
   *    (`CHK_cambios_cita_pedido_por_paciente`): con `actorTipo = paciente`,
   *    `pedidoPor` es vacío o `paciente`.
   *
   * **Solo rechaza; nunca completa.** El adaptador reconstruye las filas
   * guardadas con este mismo método: si completara un vacío, el historial
   * mostraría un dato que la base no tiene. Quien anota `paciente` es el
   * servicio, de forma explícita (`cancelarComoPaciente`, la bandeja).
   *
   * @throws RangeError si se rompe la invariante (un error de programación:
   *   la API no puede producirlo).
   */
  static registrar(props: CrearCambioCitaProps): CambioCita {
    CambioCita.exigirPedidoPorValido(props);
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
    cambio.pedidoPor = props.pedidoPor ?? null;
    return cambio;
  }

  private static exigirPedidoPorValido(props: CrearCambioCitaProps): void {
    const pedidoPor = props.pedidoPor ?? null;
    if (pedidoPor === null) return;

    if (!VALORES_PEDIDO_POR.includes(pedidoPor)) {
      throw new RangeError(
        'CambioCita: pedidoPor debe ser "paciente" o "profesional"',
      );
    }
    if (!TIPOS_CON_PEDIDO_POR.includes(props.tipo)) {
      throw new RangeError(
        `CambioCita: pedidoPor solo aplica a una cancelación o un reagendamiento (llegó tipo "${props.tipo}")`,
      );
    }
    if (
      props.actorTipo === ActorCambio.PACIENTE &&
      pedidoPor !== PedidoPor.PACIENTE
    ) {
      throw new RangeError(
        'CambioCita: un cambio hecho por el paciente no puede estar pedido por el profesional',
      );
    }
  }
}

/** Los tipos de cambio que admiten "quién lo pidió" (US-07.01, H3). */
const TIPOS_CON_PEDIDO_POR: readonly TipoCambio[] = [
  TipoCambio.CANCELADA,
  TipoCambio.REAGENDADA,
];

const VALORES_PEDIDO_POR: readonly PedidoPor[] = Object.values(PedidoPor);
