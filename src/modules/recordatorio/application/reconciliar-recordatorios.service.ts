import { TransactionContext } from '../../../shared/application/transaction-runner';
import { ConfiguracionRecordatorio } from '../domain/configuracion-recordatorio.entity';
import { ConfiguracionRecordatorioRepository } from '../domain/configuracion-recordatorio.repository';
import { LectorCitas } from '../domain/lector-citas';
import { ParametrosPlanificacion } from '../domain/planificacion';
import { reconciliar } from '../domain/reconciliacion';
import { MotivoCancelacion } from '../domain/recordatorio.entity';
import {
  DatosRecordatorio,
  RecordatorioRepository,
} from '../domain/recordatorio.repository';
import { TransaccionRequeridaError } from './transaccion-requerida.error';

/** Parámetros del entorno que necesita la reconciliación. */
export interface OpcionesReconciliacion {
  parametros: ParametrosPlanificacion;
  /** `RECORDATORIO_ANTELACIONES_MIN`: la configuración de quien no guardó ninguna. */
  antelacionesPredeterminadasMin: readonly number[];
}

export interface ResultadoReconciliacion {
  citaId: string;
  /** `false` si la cita no existe en ese tenant. */
  citaEncontrada: boolean;
  /** Ids que pasaron de `programado` a `cancelado`. */
  anulados: string[];
  /** Motivo de los anulados; `null` si no se anuló ninguno. */
  motivoAnulacion: MotivoCancelacion | null;
  /** Filas insertadas (no las que ya existían). */
  insertados: DatosRecordatorio[];
}

/**
 * Reconcilia los recordatorios de una cita contra su estado ACTUAL
 * (ADR-13 §6, ADR-12 §4 regla 2). Lo usan el suscriptor de hechos y la
 * reconciliación de respaldo.
 *
 * Siempre en este orden y SOLO con el `tx` recibido:
 *  1. candado consultivo por cita (serializa dos reconciliaciones);
 *  2. releer la cita con el `tenantId` del hecho;
 *  3. configuración de `cita.usuarioId` —el DUEÑO, no quien hizo la
 *     petición— o la predeterminada;
 *  4. recordatorios existentes (todos menos los cancelados);
 *  5. planificar y comparar (`reconciliar`, puro);
 *  6. anular lo que sobra, con su motivo;
 *  7. insertar lo que falta (`ON CONFLICT DO NOTHING`).
 *
 * Idempotente: una segunda vuelta con el mismo estado no anula ni inserta.
 */
export class ReconciliarRecordatoriosService {
  constructor(
    private readonly recordatorios: RecordatorioRepository,
    private readonly configuraciones: ConfiguracionRecordatorioRepository,
    private readonly lector: LectorCitas,
    private readonly opciones: OpcionesReconciliacion,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  async reconciliarCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<ResultadoReconciliacion> {
    exigirTransaccion(tx, 'reconciliarCita');

    await this.recordatorios.bloquearCitaParaReconciliar(citaId, tx);
    // Después del candado: si otra reconciliación nos hizo esperar, `ahora`
    // es el momento en que de verdad se decide.
    const ahora = this.reloj();
    const cita = await this.lector.obtenerCita(citaId, tenantId, tx);
    const configuracion = cita
      ? await this.configuracionDe(tenantId, cita.usuarioId, tx)
      : null;
    const existentes = await this.recordatorios.listarVigentesDeCita(
      citaId,
      tenantId,
      tx,
    );

    const decision = reconciliar({
      cita,
      configuracion,
      existentes,
      ahora,
      parametros: this.opciones.parametros,
    });

    const anulados =
      decision.anular.length > 0
        ? await this.recordatorios.anular(
            decision.anular,
            tenantId,
            decision.motivoAnulacion,
            tx,
          )
        : [];
    const insertados =
      decision.insertar.length > 0
        ? await this.recordatorios.insertarSiNoExisten(decision.insertar, tx)
        : [];

    return {
      citaId,
      citaEncontrada: cita !== null,
      anulados,
      motivoAnulacion: anulados.length > 0 ? decision.motivoAnulacion : null,
      insertados,
    };
  }

  /**
   * `ConfiguracionRecordatorioActualizada` (ADR-13 §3, §6): reconcilia, una a
   * una y en el mismo `tx`, las citas vigentes del profesional que empiezan
   * desde ahora. Encender, apagar o cambiar los momentos se aplica también a
   * lo ya agendado.
   */
  async reconciliarFuturasDeProfesional(
    tenantId: string,
    usuarioId: string,
    tx: TransactionContext,
  ): Promise<ResultadoReconciliacion[]> {
    exigirTransaccion(tx, 'reconciliarFuturasDeProfesional');
    const citas = await this.lector.listarVigentesDeProfesionalDesde(
      tenantId,
      usuarioId,
      this.reloj(),
      tx,
    );
    const resultados: ResultadoReconciliacion[] = [];
    for (const cita of citas) {
      resultados.push(await this.reconciliarCita(cita.id, tenantId, tx));
    }
    return resultados;
  }

  private async configuracionDe(
    tenantId: string,
    usuarioId: string,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorio> {
    const guardada = await this.configuraciones.obtener(
      tenantId,
      usuarioId,
      tx,
    );
    return guardada
      ? ConfiguracionRecordatorio.reconstituir(guardada)
      : ConfiguracionRecordatorio.predeterminada(
          tenantId,
          usuarioId,
          this.opciones.antelacionesPredeterminadasMin,
        );
  }
}

function exigirTransaccion(tx: TransactionContext, operacion: string): void {
  if (tx === undefined || tx === null) {
    throw new TransaccionRequeridaError(operacion);
  }
}
