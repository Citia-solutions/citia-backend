import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { Latidos } from '../../application/latidos';
import {
  POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
  PoliticaReintentoSalida,
  validarPoliticaReintentoSalida,
} from '../../application/politica-reintento-salida';
import type { Entorno } from '../config/entorno';
import { DespachadorEventosSalida } from '../salida/despachador-eventos-salida';
import { PurgaEventosSalida } from '../salida/purga-eventos-salida';
import { TrabajoSinSolapamiento } from './trabajo-sin-solapamiento';

export const INTERVALO_DESPACHADOR_SALIDA = 'eventos_salida.despachador';
export const CRON_PURGA_SALIDA = 'eventos_salida.purga';
/** Todos los días a las 04:00, hora de la clínica (`APP_TZ`), ADR-12 §5. */
export const HORARIO_PURGA_SALIDA = '0 0 4 * * *';

/**
 * Jobs del outbox (ADR-12 §5):
 *
 * | Job                  | Cadencia                           | Latido    |
 * |----------------------|------------------------------------|-----------|
 * | Despachador          | `EVENTOS_SALIDA_INTERVALO_SEG` (5) | `salida`  |
 * | Purga de entregados  | diaria, 04:00 en `APP_TZ`          | —         |
 *
 * - Con `PLANIFICADOR_ACTIVO=false` no registra NADA (los tests e2e, o un
 *   proceso web separado del worker).
 * - Se registran a mano en `SchedulerRegistry` porque la cadencia viene del
 *   entorno (los decoradores `@Interval`/`@Cron` necesitan constantes).
 * - Sin solapamiento dentro del proceso (`TrabajoSinSolapamiento`).
 * - Apagado ordenado: al recibir la señal (`enableShutdownHooks`) deja de
 *   programar, el despachador no reclama más hechos y se espera al tick en
 *   curso ANTES de que se cierre la conexión a la base.
 * - Latido `salida` tras cada tick sin errores de infraestructura; si el tick
 *   falla, `informarFallo('salida')`. Los latidos nunca lanzan y van como
 *   mucho uno por minuto.
 */
@Injectable()
export class PlanificadorSalida
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PlanificadorSalida.name);
  private readonly despacho = new TrabajoSinSolapamiento(
    INTERVALO_DESPACHADOR_SALIDA,
    () => this.tickDespachador(),
  );
  private readonly purga = new TrabajoSinSolapamiento(CRON_PURGA_SALIDA, () =>
    this.tickPurga(),
  );
  private readonly politica: PoliticaReintentoSalida;

  constructor(
    private readonly config: ConfigService<Entorno, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly despachador: DespachadorEventosSalida,
    private readonly purgaSalida: PurgaEventosSalida,
    private readonly latidos: Latidos,
  ) {
    this.politica = {
      ...POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
      maxIntentos: this.config.get('EVENTOS_SALIDA_MAX_INTENTOS', {
        infer: true,
      }),
    };
  }

  onApplicationBootstrap(): void {
    if (!this.config.get('PLANIFICADOR_ACTIVO', { infer: true })) {
      this.logger.log({
        evento: 'planificador.inactivo',
        msg: 'PLANIFICADOR_ACTIVO=false: no se programa ningún job',
      });
      return;
    }
    // Falla el arranque si la política no sirve (mejor que en el primer fallo).
    validarPoliticaReintentoSalida(this.politica);

    const intervaloSeg = this.config.get('EVENTOS_SALIDA_INTERVALO_SEG', {
      infer: true,
    });
    this.scheduler.addInterval(
      INTERVALO_DESPACHADOR_SALIDA,
      setInterval(() => {
        void this.ejecutarDespacho();
      }, intervaloSeg * 1000),
    );

    const zona = this.config.get('APP_TZ', { infer: true });
    const purga = CronJob.from({
      cronTime: HORARIO_PURGA_SALIDA,
      onTick: () => {
        void this.ejecutarPurga();
      },
      start: false,
      timeZone: zona,
    });
    this.scheduler.addCronJob(CRON_PURGA_SALIDA, purga);
    purga.start();

    this.logger.log({
      evento: 'planificador.activo',
      jobs: [INTERVALO_DESPACHADOR_SALIDA, CRON_PURGA_SALIDA],
      intervaloSeg,
      msg: `Planificador activo: despachador cada ${intervaloSeg} s, purga diaria 04:00 (${zona})`,
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.desprogramar();
    const ocupados = [this.despacho, this.purga].filter((t) => t.ocupado);
    if (ocupados.length > 0) {
      this.logger.log({
        evento: 'planificador.esperando',
        trabajos: ocupados.map((t) => t.nombre),
        msg: 'Apagado: esperando a que termine el tick en curso',
      });
    }
    await Promise.all([this.despacho.detener(), this.purga.detener()]);
  }

  /** Un tick del despachador; `null` si el anterior sigue en curso. */
  ejecutarDespacho(): Promise<void> | null {
    return this.despacho.disparar();
  }

  /** Una purga; `null` si la anterior sigue en curso. */
  ejecutarPurga(): Promise<void> | null {
    return this.purga.disparar();
  }

  private async tickDespachador(): Promise<void> {
    try {
      const resultado = await this.despachador.despachar({
        lote: this.config.get('EVENTOS_SALIDA_LOTE', { infer: true }),
        politica: this.politica,
        continuar: () => !this.despacho.detenido,
      });
      if (resultado.procesados > 0) {
        this.logger.debug({ evento: 'eventos_salida.tick', ...resultado });
      }
    } catch (error: unknown) {
      this.logger.error({
        evento: 'eventos_salida.tick_fallido',
        err: error,
        msg: 'El despachador de eventos_salida falló (infraestructura)',
      });
      await this.latidos.informarFallo('salida');
      return;
    }
    await this.latidos.latir('salida');
  }

  private async tickPurga(): Promise<void> {
    try {
      await this.purgaSalida.purgar(
        this.config.get('EVENTOS_SALIDA_RETENCION_DIAS', { infer: true }),
      );
    } catch (error: unknown) {
      this.logger.error({
        evento: 'eventos_salida.purga_fallida',
        err: error,
        msg: 'La purga de eventos_salida falló',
      });
    }
  }

  private desprogramar(): void {
    if (this.scheduler.doesExist('interval', INTERVALO_DESPACHADOR_SALIDA)) {
      this.scheduler.deleteInterval(INTERVALO_DESPACHADOR_SALIDA);
    }
    if (this.scheduler.doesExist('cron', CRON_PURGA_SALIDA)) {
      this.scheduler.deleteCronJob(CRON_PURGA_SALIDA);
    }
  }
}
