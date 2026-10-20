import { TransactionRunner } from '../../../shared/application/transaction-runner';
import {
  CandidatasGhosting,
  CriterioCierreGhosting,
} from '../domain/candidatas-ghosting';
import {
  CORTE_GHOSTING,
  limiteCierreGhosting,
} from '../domain/cierre-ghosting';
import { Cita } from '../domain/cita.entity';
import { CitasService } from './citas.service';

/** Cómo corre un tick del job G1. */
export interface OpcionesCierreGhosting {
  /**
   * `CIERRE_GHOSTING_ACTIVO`. Apagado (`false`), el tick solo cuenta; prendido,
   * cierra.
   */
  activo: boolean;
  /** Citas como mucho por tick (entero ≥ 1). */
  lote: number;
  /** Se consulta antes de cada cita: `false` corta el tick (apagado ordenado). */
  continuar?: () => boolean;
}

/** Una cita reclamada cuyo cierre falló (su transacción se revirtió). */
export interface FalloCierreGhosting {
  citaId: string;
  tenantId: string;
  /** `name[:code]` del error; nunca su mensaje ni datos del paciente. */
  error: string;
}

export type ResultadoCierreGhosting =
  | {
      modo: 'simulado';
      limite: Date;
      candidatas: number;
      masAntigua: Date | null;
    }
  | {
      modo: 'activo';
      limite: Date;
      cerradas: number;
      /** `true` si `continuar()` cortó el tick antes de agotar el lote. */
      interrumpido: boolean;
      fallidas: FalloCierreGhosting[];
    };

/**
 * Job G1 (US-07.01, H6; DT-11): cierra como `ghosting`, con actor `sistema`,
 * las citas `pendiente` cuyo día ya terminó en la zona de la clínica, que
 * tuvieron un recordatorio real para su hora vigente y sin una petición de
 * otra hora abierta (la regla completa, en `CandidatasGhosting`).
 *
 * - **Apagado** (`activo = false`, por defecto): UNA llamada a `contar`, sin
 *   transacción, sin bloqueo y sin llamar a `CitasService`. No escribe nada.
 * - **Prendido**: hasta `lote` citas, **una transacción por cita**:
 *   `reclamarSiguiente` (`FOR NO KEY UPDATE … SKIP LOCKED`) →
 *   `CitasService.cerrarPorGhostingEnTx` (bitácora + hecho `CitaNoAsistida` en
 *   el mismo `tx`, ADR-12 §2). Sin candidata, termina.
 * - **Una cita que falla** (ya reclamada) revierte solo su transacción, va a
 *   `fallidas` y a la lista de excluidas del tick, y el tick sigue: una cita
 *   que falla siempre no frena a las demás. Si falla el RECLAMO mismo
 *   (infraestructura), el error sube a quien llama.
 * - **Idempotente y seguro con varias réplicas:** una cita cerrada deja de ser
 *   `pendiente` y no vuelve a salir; `SKIP LOCKED` reparte las citas entre
 *   procesos y, si una lectura vieja llegara a reclamar una ya cerrada, el
 *   dominio la rechaza (de un terminal no se sale).
 *
 * `limite` se calcula UNA vez por tick, con el reloj y `APP_TZ`.
 *
 * Clase plana (ADR-02): la arma `CitaModule` con una fábrica. No registra
 * nada en el log: devuelve el resultado y el planificador lo registra (solo
 * ids, conteos y fechas).
 */
export class CierreGhostingService {
  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly candidatas: CandidatasGhosting,
    private readonly citas: CitasService,
    // Zona de la clínica (APP_TZ): el "fin del día" de la condición 1.
    private readonly tz: string,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  async ejecutar(
    opciones: OpcionesCierreGhosting,
  ): Promise<ResultadoCierreGhosting> {
    const limite = limiteCierreGhosting(this.reloj(), this.tz);
    const criterio: CriterioCierreGhosting = { limite, corte: CORTE_GHOSTING };

    if (!opciones.activo) {
      const conteo = await this.candidatas.contar(criterio);
      return { modo: 'simulado', limite, ...conteo };
    }

    if (!Number.isInteger(opciones.lote) || opciones.lote < 1) {
      throw new RangeError(
        `CierreGhostingService: el lote debe ser un entero ≥ 1 (llegó ${String(opciones.lote)})`,
      );
    }
    const continuar = opciones.continuar ?? (() => true);
    const resultado: ResultadoCierreGhosting = {
      modo: 'activo',
      limite,
      cerradas: 0,
      interrumpido: false,
      fallidas: [],
    };
    const excluidas: string[] = [];

    for (let i = 0; i < opciones.lote; i++) {
      if (!continuar()) {
        resultado.interrumpido = true;
        break;
      }
      const intento = await this.cerrarSiguiente(criterio, excluidas);
      if (intento.tipo === 'sin_candidata') break;
      if (intento.tipo === 'cerrada') {
        resultado.cerradas++;
        continue;
      }
      resultado.fallidas.push(intento.fallo);
      excluidas.push(intento.fallo.citaId);
    }
    return resultado;
  }

  /**
   * Reclama y cierra UNA cita en su propia transacción. Distingue el fallo
   * del reclamo (sube: infraestructura) del fallo de una cita ya reclamada
   * (se devuelve: el tick sigue sin ella).
   */
  private async cerrarSiguiente(
    criterio: CriterioCierreGhosting,
    excluidas: readonly string[],
  ): Promise<
    | { tipo: 'sin_candidata' }
    | { tipo: 'cerrada' }
    | { tipo: 'fallida'; fallo: FalloCierreGhosting }
  > {
    // Fuera del callback: si la transacción falla, hay que saber si alcanzó a
    // reclamar una cita (y cuál) para excluirla del resto del tick.
    const reclamo: { cita: Cita | null } = { cita: null };
    try {
      await this.transacciones.run(async (tx) => {
        reclamo.cita = await this.candidatas.reclamarSiguiente(
          criterio,
          excluidas,
          tx,
        );
        if (reclamo.cita) {
          await this.citas.cerrarPorGhostingEnTx(reclamo.cita, tx);
        }
      });
    } catch (error: unknown) {
      if (!reclamo.cita) throw error;
      return {
        tipo: 'fallida',
        fallo: {
          citaId: reclamo.cita.id,
          tenantId: reclamo.cita.tenantId,
          error: codigoDeError(error),
        },
      };
    }
    return reclamo.cita ? { tipo: 'cerrada' } : { tipo: 'sin_candidata' };
  }
}

/**
 * `name[:code]` del error, para el log. Nunca el mensaje (puede traer datos).
 * Mismo criterio que el de `recordatorio`, que `cita` no importa.
 */
function codigoDeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'Desconocido';
  const { name, code } = error as { name?: unknown; code?: unknown };
  const nombre =
    typeof name === 'string' && /^\w{1,64}$/.test(name) ? name : 'Error';
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(code)
    ? `${nombre}:${code}`
    : nombre;
}
