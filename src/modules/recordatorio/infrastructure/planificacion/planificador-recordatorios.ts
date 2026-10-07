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
import { EnviarRecordatoriosService } from '../../application/enviar-recordatorios.service';
import { ReconciliacionRespaldoService } from '../../application/reconciliacion-respaldo.service';
import { TasaFalloRecordatoriosService } from '../../application/tasa-fallo-recordatorios.service';
import { leerCadenciaEnvio } from '../config/opciones-recordatorios';

export const CRON_RESPALDO_RECORDATORIOS = 'recordatorios.respaldo';
/**
 * Cada hora, al minuto 15 (ADR-13 §6, ADR-12 §5). Un cron de reloj y no un
 * intervalo de 1 h: el intervalo vuelve a contar desde cero en cada
 * despliegue, y con despliegues más seguidos que una hora el respaldo no
 * correría nunca.
 */
export const HORARIO_RESPALDO_RECORDATORIOS = '0 15 * * * *';

/** Envío (ADR-13 §7): intervalo de `RECORDATORIO_INTERVALO_SEG`. */
export const INTERVALO_ENVIO_RECORDATORIOS = 'recordatorios.envio';

export const CRON_TASA_FALLO_RECORDATORIOS = 'recordatorios.tasa_fallo';
/** Cada 15 minutos (ADR-13 §16), en el segundo 30 para no chocar con el respaldo. */
export const HORARIO_TASA_FALLO_RECORDATORIOS = '30 */15 * * * *';

/**
 * Jobs de recordatorios (ADR-12 §5, ADR-13 §6, §7, §16). Mismo patrón que
 * `PlanificadorSalida`:
 *
 * | Job                        | Cadencia                              | Latido `recordatorios`        |
 * |----------------------------|---------------------------------------|-------------------------------|
 * | Envío                      | `RECORDATORIO_INTERVALO_SEG` (60 s)   | `latir` tras cada tick sano; `informarFallo` si falla |
 * | Reconciliación de respaldo | cada hora (minuto 15, `APP_TZ`)       | solo `informarFallo` si falla |
 * | Tasa de fallo              | cada 15 min                           | —                             |
 *
 * **Un solo latido, sin contradicciones.** El heartbeat `recordatorios` de
 * Better Stack espera un aviso por minuto (gracia de 5): lo da el envío, que
 * es el que corre cada minuto. El respaldo NO late al terminar bien: un latido
 * por hora no prueba nada y, si el envío estuviera fallando, lo "resolvería"
 * en falso cada hora. Si el respaldo falla, `informarFallo` abre el incidente
 * de inmediato (ADR-13 §16); el siguiente latido sano del envío lo cierra, y el
 * log de error queda.
 *
 * Tick SANO del envío: sin error de infraestructura y sin un rechazo de
 * `configuracion` del proveedor (con la clave o el dominio rotos no sale
 * nada: es una caída, no un estado de negocio). La cuota agotada sí es sana:
 * se alerta por log (`recordatorios.cuota_agotada`).
 *
 * - Con `PLANIFICADOR_ACTIVO=false` no registra NADA (e2e, o un proceso web
 *   separado del worker). Nada de `@Interval` / `@Cron`, que `ScheduleModule`
 *   registraría sin mirar la bandera.
 * - Registro a mano en `SchedulerRegistry`; sin solapamiento dentro del
 *   proceso (`TrabajoSinSolapamiento`); apagado ordenado (deja de programar,
 *   corta el lote en curso entre recordatorios y lo espera antes de que se
 *   cierre la base).
 * - `ejecutarEnvio()`, `ejecutarRespaldo()` y `ejecutarTasaFallo()` son
 *   públicos para invocarlos a mano (e2e del paso 14, prueba manual).
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
  private readonly envio = new TrabajoSinSolapamiento(
    INTERVALO_ENVIO_RECORDATORIOS,
    () => this.tickEnvio(),
  );
  private readonly tasaFallo = new TrabajoSinSolapamiento(
    CRON_TASA_FALLO_RECORDATORIOS,
    () => this.tickTasaFallo(),
  );

  constructor(
    private readonly config: ConfigService<Entorno, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly reconciliacionRespaldo: ReconciliacionRespaldoService,
    private readonly envioRecordatorios: EnviarRecordatoriosService,
    private readonly tasaFalloRecordatorios: TasaFalloRecordatoriosService,
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

    const { intervaloSeg } = leerCadenciaEnvio(this.config);
    this.scheduler.addInterval(
      INTERVALO_ENVIO_RECORDATORIOS,
      setInterval(() => {
        void this.ejecutarEnvio();
      }, intervaloSeg * 1000),
    );

    const zona = this.config.get('APP_TZ', { infer: true });
    this.programarCron(
      CRON_RESPALDO_RECORDATORIOS,
      HORARIO_RESPALDO_RECORDATORIOS,
      zona,
      () => void this.ejecutarRespaldo(),
    );
    this.programarCron(
      CRON_TASA_FALLO_RECORDATORIOS,
      HORARIO_TASA_FALLO_RECORDATORIOS,
      zona,
      () => void this.ejecutarTasaFallo(),
    );

    this.logger.log({
      evento: 'planificador.activo',
      jobs: [
        INTERVALO_ENVIO_RECORDATORIOS,
        CRON_RESPALDO_RECORDATORIOS,
        CRON_TASA_FALLO_RECORDATORIOS,
      ],
      intervaloSeg,
      msg: `Recordatorios: envío cada ${intervaloSeg} s, respaldo cada hora (minuto 15) y tasa de fallo cada 15 min (${zona})`,
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.desprogramar();
    const trabajos = [this.envio, this.respaldo, this.tasaFallo];
    const ocupados = trabajos.filter((t) => t.ocupado);
    if (ocupados.length > 0) {
      this.logger.log({
        evento: 'planificador.esperando',
        trabajos: ocupados.map((t) => t.nombre),
        msg: 'Apagado: esperando a que terminen los jobs de recordatorios en curso',
      });
    }
    await Promise.all(trabajos.map((t) => t.detener()));
  }

  /** Un tick de envío; `null` si el anterior sigue en curso o se está apagando. */
  ejecutarEnvio(): Promise<void> | null {
    return this.envio.disparar();
  }

  /** Un barrido de respaldo; `null` si el anterior sigue en curso o se está apagando. */
  ejecutarRespaldo(): Promise<void> | null {
    return this.respaldo.disparar();
  }

  /** Una medición de la tasa de fallo; `null` si la anterior sigue en curso. */
  ejecutarTasaFallo(): Promise<void> | null {
    return this.tasaFallo.disparar();
  }

  private async tickEnvio(): Promise<void> {
    try {
      const resultado = await this.envioRecordatorios.enviarLote({
        lote: leerCadenciaEnvio(this.config).lote,
        continuar: () => !this.envio.detenido,
      });
      if (resultado.procesados > 0) {
        this.logger.log({ evento: 'recordatorios.envio_tick', ...resultado });
      }
      if (resultado.corte === 'configuracion') {
        // La alerta `recordatorios.configuracion` ya salió en el log; el
        // latido avisa aunque no haya alertas por consulta de logs.
        await this.latidos.informarFallo('recordatorios');
        return;
      }
    } catch (error: unknown) {
      this.logger.error({
        evento: 'recordatorios.envio_fallido',
        err: error,
        msg: 'El job de envío de recordatorios falló (infraestructura)',
      });
      await this.latidos.informarFallo('recordatorios');
      return;
    }
    await this.latidos.latir('recordatorios');
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
    }
    // Sin `latir` al terminar bien: el latido lo da el envío (ver la clase).
  }

  private async tickTasaFallo(): Promise<void> {
    try {
      // La medición y la alerta las registra el propio servicio.
      await this.tasaFalloRecordatorios.medir();
    } catch (error: unknown) {
      this.logger.error({
        evento: 'recordatorios.tasa_fallo_fallida',
        err: error,
        msg: 'No se pudo medir la tasa de fallo de los recordatorios',
      });
    }
  }

  private programarCron(
    nombre: string,
    horario: string,
    zona: string,
    onTick: () => void,
  ): void {
    const job = CronJob.from({
      cronTime: horario,
      onTick,
      start: false,
      timeZone: zona,
    });
    this.scheduler.addCronJob(nombre, job);
    job.start();
  }

  private desprogramar(): void {
    if (this.scheduler.doesExist('interval', INTERVALO_ENVIO_RECORDATORIOS)) {
      this.scheduler.deleteInterval(INTERVALO_ENVIO_RECORDATORIOS);
    }
    for (const nombre of [
      CRON_RESPALDO_RECORDATORIOS,
      CRON_TASA_FALLO_RECORDATORIOS,
    ]) {
      if (this.scheduler.doesExist('cron', nombre)) {
        this.scheduler.deleteCronJob(nombre);
      }
    }
  }
}
