import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { CitaLeida, LectorCitas } from '../domain/lector-citas';
import { ReconciliarRecordatoriosService } from './reconciliar-recordatorios.service';

/** ADR-13 §6: las citas vigentes de los próximos 8 días. */
export const HORIZONTE_RESPALDO_DIAS = 8;
/** Citas por consulta del barrido. */
export const TAMANO_PAGINA_RESPALDO = 100;

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

export interface OpcionesRespaldo {
  /** `RECORDATORIO_MARGEN_MINIMO_MIN`: más cerca que esto ya no se planifica. */
  margenMinimoMin: number;
  horizonteDias?: number;
  tamanoPagina?: number;
}

export interface FalloRespaldo {
  citaId: string;
  tenantId: string;
  /** `name` (y código, si hay) del error; nunca el mensaje. */
  error: string;
}

export interface ResultadoRespaldo {
  /** Consultas hechas al lector. */
  paginas: number;
  /** Citas sin recordatorio encontradas (y reconciliadas o fallidas). */
  revisadas: number;
  /** Reconciliadas que anularon o insertaron algo. */
  conCambios: number;
  /** Las que fallaron; cada una se revirtió sola y el barrido siguió. */
  fallidas: FalloRespaldo[];
  /** `true` si se cortó por el apagado antes de terminar. */
  interrumpido: boolean;
}

/**
 * Reconciliación de respaldo (ADR-13 §6), cada hora desde el planificador.
 * Cubre sin código propio las citas que ya existían el día del despliegue, un
 * hecho que terminó en `fallido` en el outbox y cualquier error que haya
 * dejado una cita sin planificar.
 *
 * BARRIDO GLOBAL (ADR-12 §6): pide a `LectorCitas` las citas vigentes de
 * TODOS los tenants con inicio en `[ahora + margen, ahora + 8 días)` sin
 * ningún recordatorio para su inicio actual, de a páginas con cursor
 * `(inicio, id)`. Cada cita se reconcilia en SU PROPIA transacción y con SU
 * `tenantId`: un fallo revierte solo esa cita y el barrido sigue.
 *
 * Dos procesos a la vez (solapamiento de despliegues) no se pisan: el
 * candado consultivo por cita los serializa y la reconciliación es
 * idempotente. Por eso no hay un candado consultivo GLOBAL del barrido
 * (ADR-12 §5 lo dibujaba): a este volumen, repetir el trabajo es más barato
 * que coordinarlo, y el candado por cita ya evita que se crucen.
 */
export class ReconciliacionRespaldoService {
  private readonly horizonteDias: number;
  private readonly tamanoPagina: number;

  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly lector: LectorCitas,
    private readonly reconciliacion: ReconciliarRecordatoriosService,
    private readonly opciones: OpcionesRespaldo,
    private readonly reloj: () => Date = () => new Date(),
  ) {
    this.horizonteDias = opciones.horizonteDias ?? HORIZONTE_RESPALDO_DIAS;
    this.tamanoPagina = opciones.tamanoPagina ?? TAMANO_PAGINA_RESPALDO;
  }

  /**
   * Un barrido completo. Lanza solo si falla la LECTURA de una página
   * (infraestructura); los fallos por cita se devuelven en `fallidas`.
   * `continuar` se consulta antes de cada página y de cada cita (apagado
   * ordenado).
   */
  async ejecutar(
    opciones: { continuar?: () => boolean } = {},
  ): Promise<ResultadoRespaldo> {
    const continuar = opciones.continuar ?? (() => true);
    const ahora = this.reloj().getTime();
    const desde = new Date(ahora + this.opciones.margenMinimoMin * MINUTO_MS);
    const hasta = new Date(ahora + this.horizonteDias * DIA_MS);
    const resultado: ResultadoRespaldo = {
      paginas: 0,
      revisadas: 0,
      conCambios: 0,
      fallidas: [],
      interrumpido: false,
    };

    let despuesDe: { inicio: Date; id: string } | null = null;
    for (;;) {
      if (!continuar()) {
        resultado.interrumpido = true;
        break;
      }
      const cursor = despuesDe;
      const pagina: CitaLeida[] = await this.transacciones.run((tx) =>
        this.lector.listarVigentesSinRecordatorio(
          { desde, hasta, limite: this.tamanoPagina, despuesDe: cursor },
          tx,
        ),
      );
      resultado.paginas++;

      for (const cita of pagina) {
        if (!continuar()) {
          resultado.interrumpido = true;
          return resultado;
        }
        resultado.revisadas++;
        await this.reconciliarUna(cita, resultado);
      }

      if (pagina.length < this.tamanoPagina) break;
      const ultima = pagina[pagina.length - 1];
      despuesDe = { inicio: ultima.inicio, id: ultima.id };
    }
    return resultado;
  }

  private async reconciliarUna(
    cita: CitaLeida,
    resultado: ResultadoRespaldo,
  ): Promise<void> {
    try {
      const r = await this.transacciones.run((tx) =>
        this.reconciliacion.reconciliarCita(cita.id, cita.tenantId, tx),
      );
      if (r.anulados.length > 0 || r.insertados.length > 0) {
        resultado.conCambios++;
      }
    } catch (error: unknown) {
      resultado.fallidas.push({
        citaId: cita.id,
        tenantId: cita.tenantId,
        error: codigoDeError(error),
      });
    }
  }
}

/** `name[:code]` del error, para el log. Nunca el mensaje (puede traer datos). */
export function codigoDeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'Desconocido';
  const { name, code } = error as { name?: unknown; code?: unknown };
  const nombre =
    typeof name === 'string' && /^\w{1,64}$/.test(name) ? name : 'Error';
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(code)
    ? `${nombre}:${code}`
    : nombre;
}
