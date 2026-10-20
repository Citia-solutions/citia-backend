import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import { TrabajoSinSolapamiento } from '../../../../shared/infrastructure/planificacion/trabajo-sin-solapamiento';
import { CierreGhostingService } from '../../application/cierre-ghosting.service';
import { CORTE_GHOSTING } from '../../domain/cierre-ghosting';

export const CRON_CIERRE_GHOSTING = 'citas.cierre_ghosting';
/**
 * Cada hora, al minuto 40, en `APP_TZ` (US-07.01). Un cron de reloj y no un
 * intervalo: el intervalo vuelve a contar desde cero en cada despliegue (la
 * lección del respaldo de recordatorios). El minuto 40 no choca con el
 * respaldo (:15), la tasa de fallo (:00/:15/:30/:45, segundo 30) ni la purga
 * (04:00). El primer tick después de medianoche (00:40) cierra el día
 * anterior; los demás recogen lo que quedó (un despliegue, una cita bloqueada).
 */
export const HORARIO_CIERRE_GHOSTING = '0 40 * * * *';
/**
 * Citas como mucho por tick (constante, no variable de entorno). Si el primer
 * tick en producción encuentra más, sigue en el próximo.
 */
export const LOTE_CIERRE_GHOSTING = 200;

/**
 * Job G1 (US-07.01, DT-11): cierra como `ghosting` las citas `pendiente` que
 * nadie marcó. Mismo patrón que `PlanificadorRecordatorios` (ADR-12 §5):
 *
 * - Con `PLANIFICADOR_ACTIVO=false` no registra NADA (e2e, o un proceso web
 *   separado del worker). Nada de `@Cron`, que `ScheduleModule` registraría
 *   sin mirar la bandera.
 * - Registro a mano en `SchedulerRegistry`; sin solapamiento dentro del
 *   proceso (`TrabajoSinSolapamiento`); apagado ordenado (deja de programar,
 *   corta el lote entre citas y espera el tick en curso antes de que se
 *   cierre la base).
 * - **`CIERRE_GHOSTING_ACTIVO` se lee en CADA tick** (apagado por defecto):
 *   apagado, el caso de uso solo cuenta y aquí se deja el log
 *   `citas.cierre_ghosting.simulado`, siempre (también con 0). Solo un `true`
 *   validado lo prende: cualquier otro valor cuenta como apagado.
 * - **Sin latido** de Better Stack (como el respaldo): los errores van al log.
 * - Logs solo con ids, conteos y fechas; nunca datos del paciente.
 * - `ejecutarCierre()` es público para las pruebas y la prueba manual.
 */
@Injectable()
export class PlanificadorCierreCitas
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PlanificadorCierreCitas.name);
  private readonly cierre = new TrabajoSinSolapamiento(
    CRON_CIERRE_GHOSTING,
    () => this.tickCierre(),
  );

  constructor(
    private readonly config: ConfigService<Entorno, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly cierreGhosting: CierreGhostingService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('PLANIFICADOR_ACTIVO', { infer: true })) {
      this.logger.log({
        evento: 'planificador.inactivo',
        msg: 'PLANIFICADOR_ACTIVO=false: no se programa el cierre de citas (G1)',
      });
      return;
    }

    const zona = this.config.get('APP_TZ', { infer: true });
    const job = CronJob.from({
      cronTime: HORARIO_CIERRE_GHOSTING,
      onTick: () => {
        void this.ejecutarCierre();
      },
      start: false,
      timeZone: zona,
    });
    this.scheduler.addCronJob(CRON_CIERRE_GHOSTING, job);
    job.start();

    const activo = this.cierreActivo();
    this.logger.log({
      evento: 'planificador.activo',
      jobs: [CRON_CIERRE_GHOSTING],
      modo: activo ? 'activo' : 'simulado',
      msg: activo
        ? `Cierre de citas (G1): cada hora, minuto 40 (${zona}); CIERRE_GHOSTING_ACTIVO=true: cierra como ghosting`
        : `Cierre de citas (G1): cada hora, minuto 40 (${zona}); CIERRE_GHOSTING_ACTIVO=false: solo cuenta, no escribe nada`,
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.scheduler.doesExist('cron', CRON_CIERRE_GHOSTING)) {
      this.scheduler.deleteCronJob(CRON_CIERRE_GHOSTING);
    }
    if (this.cierre.ocupado) {
      this.logger.log({
        evento: 'planificador.esperando',
        trabajos: [this.cierre.nombre],
        msg: 'Apagado: esperando a que termine el cierre de citas en curso',
      });
    }
    await this.cierre.detener();
  }

  /** Un tick del job G1; `null` si el anterior sigue en curso o se está apagando. */
  ejecutarCierre(): Promise<void> | null {
    return this.cierre.disparar();
  }

  // Solo un `true` (ya validado por `validarEntorno`) lo prende.
  private cierreActivo(): boolean {
    return this.config.get('CIERRE_GHOSTING_ACTIVO', { infer: true }) === true;
  }

  private async tickCierre(): Promise<void> {
    try {
      const resultado = await this.cierreGhosting.ejecutar({
        activo: this.cierreActivo(),
        lote: LOTE_CIERRE_GHOSTING,
        continuar: () => !this.cierre.detenido,
      });

      if (resultado.modo === 'simulado') {
        this.logger.log({
          evento: 'citas.cierre_ghosting.simulado',
          candidatas: resultado.candidatas,
          masAntigua: resultado.masAntigua,
          limite: resultado.limite,
          corte: CORTE_GHOSTING,
          msg: `CIERRE_GHOSTING_ACTIVO=false: no se escribió nada; el job G1 cerraría ${resultado.candidatas} citas`,
        });
        return;
      }

      for (const fallo of resultado.fallidas) {
        this.logger.error({
          evento: 'citas.cierre_ghosting.cita_fallida',
          citaId: fallo.citaId,
          tenantId: fallo.tenantId,
          codigo: fallo.error,
          msg: 'El cierre de una cita (G1) falló; se reintentará en el próximo tick',
        });
      }
      this.logger.log({
        evento: 'citas.cierre_ghosting',
        cerradas: resultado.cerradas,
        fallidas: resultado.fallidas.length,
        interrumpido: resultado.interrumpido,
        limite: resultado.limite,
      });
    } catch (error: unknown) {
      this.logger.error({
        evento: 'citas.cierre_ghosting.fallido',
        err: error,
        msg: 'El job G1 falló (infraestructura)',
      });
    }
  }
}
