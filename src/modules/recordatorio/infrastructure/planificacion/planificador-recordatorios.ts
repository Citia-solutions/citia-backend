import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { Latidos } from '../../../../shared/application/latidos';
import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import { TrabajoSinSolapamiento } from '../../../../shared/infrastructure/planificacion/trabajo-sin-solapamiento';
import { ReconciliacionRespaldoService } from '../../application/reconciliacion-respaldo.service';

export const CRON_RESPALDO_RECORDATORIOS = 'recordatorios.respaldo';
/**
 * Cada hora, al minuto 15 (ADR-13 §6, ADR-12 §5). Un cron de reloj y no un
 * intervalo de 1 h: el intervalo vuelve a contar desde cero en cada
 * despliegue, y con despliegues más seguidos que una hora el respaldo no
 * correría nunca.
 */
export const HORARIO_RESPALDO_RECORDATORIOS = '0 15 * * * *';

/**
 * Jobs de recordatorios (ADR-12 §5, ADR-13 §6–§7). Mismo patrón que
 * `PlanificadorSalida`:
 *
 * | Job                       | Cadencia                 | Latido          |
 * |---------------------------|--------------------------|-----------------|
 * | Reconciliación de respaldo | cada hora (minuto 15, `APP_TZ`) | `recordatorios` |
 * | *(paso 10)* Envío          | `RECORDATORIO_INTERVALO_SEG` (60) | `recordatorios` |
 *
 * - Con `PLANIFICADOR_ACTIVO=false` no registra NADA (e2e, o un proceso web
 *   separado del worker). La e2e del planificador lo comprueba con la app
 *   completa: por eso nada de `@Interval` / `@Cron`, que `ScheduleModule`
 *   registraría sin mirar la bandera.
 * - Registro a mano en `SchedulerRegistry`; sin solapamiento dentro del
 *   proceso (`TrabajoSinSolapamiento`); apagado ordenado (deja de programar y
 *   espera al tick en curso antes de que se cierre la base).
 * - Latido `recordatorios` tras un tick sin errores de infraestructura (los
 *   fallos de citas sueltas se registran y no cuentan); si falla la lectura,
 *   `informarFallo('recordatorios')`.
 * - `ejecutarRespaldo()` es público para invocarlo a mano (e2e del paso 14).
 *
 * El paso 10 agrega aquí el job de envío: otro `TrabajoSinSolapamiento`, su
 * `setInterval` en `onApplicationBootstrap` y su `detener()` en el apagado.
 */
@Injectable()
export class PlanificadorRecordatorios
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PlanificadorRecordatorios.name);
  private readonly respaldo = new TrabajoSinSolapamiento(
    CRON_RESPALDO_RECORDATORIOS,
    () => this.tickRespaldo(),
  );

  constructor(
    private readonly config: ConfigService<Entorno, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly reconciliacionRespaldo: ReconciliacionRespaldoService,
    private readonly latidos: Latidos,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('PLANIFICADOR_ACTIVO', { infer: true })) {
      this.logger.log({
        evento: 'planificador.inactivo',
        msg: 'PLANIFICADOR_ACTIVO=false: no se programan los jobs de recordatorios',
      });
      return;
    }

    const zona = this.config.get('APP_TZ', { infer: true });
    const respaldo = CronJob.from({
      cronTime: HORARIO_RESPALDO_RECORDATORIOS,
      onTick: () => {
        void this.ejecutarRespaldo();
      },
      start: false,
      timeZone: zona,
    });
    this.scheduler.addCronJob(CRON_RESPALDO_RECORDATORIOS, respaldo);
    respaldo.start();

    this.logger.log({
      evento: 'planificador.activo',
      jobs: [CRON_RESPALDO_RECORDATORIOS],
      msg: `Recordatorios: reconciliación de respaldo cada hora (minuto 15, ${zona})`,
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.desprogramar();
    if (this.respaldo.ocupado) {
      this.logger.log({
        evento: 'planificador.esperando',
        trabajos: [this.respaldo.nombre],
        msg: 'Apagado: esperando a que termine la reconciliación de respaldo',
      });
    }
    await this.respaldo.detener();
  }

  /** Un barrido de respaldo; `null` si el anterior sigue en curso o se está apagando. */
  ejecutarRespaldo(): Promise<void> | null {
    return this.respaldo.disparar();
  }

  private async tickRespaldo(): Promise<void> {
    try {
      const resultado = await this.reconciliacionRespaldo.ejecutar({
        continuar: () => !this.respaldo.detenido,
      });
      for (const fallo of resultado.fallidas) {
        this.logger.error({
          evento: 'recordatorios.respaldo_cita_fallida',
          citaId: fallo.citaId,
          tenantId: fallo.tenantId,
          codigo: fallo.error,
          msg: 'La reconciliación de respaldo de una cita falló; se reintentará en el próximo barrido',
        });
      }
      this.logger.log({
        evento: 'recordatorios.respaldo',
        paginas: resultado.paginas,
        revisadas: resultado.revisadas,
        conCambios: resultado.conCambios,
        fallidas: resultado.fallidas.length,
        interrumpido: resultado.interrumpido,
      });
    } catch (error: unknown) {
      this.logger.error({
        evento: 'recordatorios.respaldo_fallido',
        err: error,
        msg: 'La reconciliación de respaldo falló (infraestructura)',
      });
      await this.latidos.informarFallo('recordatorios');
      return;
    }
    await this.latidos.latir('recordatorios');
  }

  private desprogramar(): void {
    if (this.scheduler.doesExist('cron', CRON_RESPALDO_RECORDATORIOS)) {
      this.scheduler.deleteCronJob(CRON_RESPALDO_RECORDATORIOS);
    }
  }
}
