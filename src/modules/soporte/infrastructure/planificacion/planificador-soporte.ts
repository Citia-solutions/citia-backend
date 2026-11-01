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
import { EnviarMensajesSoporteService } from '../../application/enviar-mensajes-soporte.service';

export const CRON_SOPORTE_ENVIO = 'soporte.envio';
/**
 * Cada minuto, en el segundo 20, en `APP_TZ` (US-10, ADR-15 §7). Un cron de
 * reloj: no choca con la tasa de fallo (segundo 30) ni con los crones de
 * minuto fijo (respaldo :15, G1 :40, purga 04:00, segundo 0).
 */
export const HORARIO_SOPORTE_ENVIO = '20 * * * * *';
/**
 * Mensajes como mucho por tick (constante, no variable de entorno). Con el
 * tope de 5 por organización en 24 h, alcanza de sobra.
 */
export const LOTE_SOPORTE_ENVIO = 20;

/**
 * Job `soporte.envio` (US-10, ADR-15 §7): envía a la casilla de soporte los
 * mensajes `pendiente`. Mismo patrón que `PlanificadorCierreCitas` (ADR-12 §5):
 *
 * - Con `PLANIFICADOR_ACTIVO=false` no registra NADA (e2e, o un proceso web
 *   separado del worker). Nada de `@Cron`, que `ScheduleModule` registraría
 *   sin mirar la bandera.
 * - **Sin `SOPORTE_CORREO_DESTINO`** (opcional a propósito, T10) tampoco se
 *   registra: deja `soporte.sin_destino` (`warn`) al arrancar y los mensajes
 *   esperan en `pendiente`. Al cargar la variable (Railway redespliega), el
 *   primer tick los envía.
 * - Registro a mano en `SchedulerRegistry`; sin solapamiento dentro del
 *   proceso (`TrabajoSinSolapamiento`); apagado ordenado (deja de programar,
 *   corta el lote entre mensajes y espera el tick en curso antes de que se
 *   cierre la base).
 * - **Sin latido** de Better Stack: los errores van al log, con `alerta`.
 * - Logs solo con ids, conteos, estados y códigos; NUNCA el texto (ni bajo la
 *   clave `mensaje`, que además se redacta entera).
 * - `ejecutarEnvio()` es público para las pruebas y la prueba manual.
 */
@Injectable()
export class PlanificadorSoporte
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PlanificadorSoporte.name);
  private readonly envio = new TrabajoSinSolapamiento(CRON_SOPORTE_ENVIO, () =>
    this.tickEnvio(),
  );

  constructor(
    private readonly config: ConfigService<Entorno, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly envioSoporte: EnviarMensajesSoporteService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('PLANIFICADOR_ACTIVO', { infer: true })) {
      this.logger.log({
        evento: 'planificador.inactivo',
        msg: 'PLANIFICADOR_ACTIVO=false: no se programa el envío a soporte',
      });
      return;
    }

    const destino = this.config.get('SOPORTE_CORREO_DESTINO', { infer: true });
    if (!destino?.trim()) {
      this.logger.warn({
        evento: 'soporte.sin_destino',
        msg: 'SOPORTE_CORREO_DESTINO vacía: los mensajes a soporte se guardan y no se envían',
      });
      return;
    }

    const zona = this.config.get('APP_TZ', { infer: true });
    const job = CronJob.from({
      cronTime: HORARIO_SOPORTE_ENVIO,
      onTick: () => {
        void this.ejecutarEnvio();
      },
      start: false,
      timeZone: zona,
    });
    this.scheduler.addCronJob(CRON_SOPORTE_ENVIO, job);
    job.start();

    this.logger.log({
      evento: 'planificador.activo',
      jobs: [CRON_SOPORTE_ENVIO],
      msg: `Envío a soporte: cada minuto (${zona})`,
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.scheduler.doesExist('cron', CRON_SOPORTE_ENVIO)) {
      this.scheduler.deleteCronJob(CRON_SOPORTE_ENVIO);
    }
    if (this.envio.ocupado) {
      this.logger.log({
        evento: 'planificador.esperando',
        trabajos: [this.envio.nombre],
        msg: 'Apagado: esperando a que termine el envío a soporte en curso',
      });
    }
    await this.envio.detener();
  }

  /** Un tick del envío; `null` si el anterior sigue en curso o se está apagando. */
  ejecutarEnvio(): Promise<void> | null {
    return this.envio.disparar();
  }

  private async tickEnvio(): Promise<void> {
    try {
      const resultado = await this.envioSoporte.ejecutar({
        lote: LOTE_SOPORTE_ENVIO,
        continuar: () => !this.envio.detenido,
      });

      for (const fallo of resultado.erroresInternos) {
        this.logger.warn({
          evento: 'soporte.envio_error_interno',
          mensajeId: fallo.mensajeId,
          tenantId: fallo.tenantId,
          codigo: fallo.codigo,
          msg: 'Un error propio frenó el envío de un mensaje a soporte; se registró como fallo',
        });
      }
      for (const fallo of resultado.fallidos) {
        this.logger.error({
          evento: 'soporte.envio_fallido',
          alerta: 'soporte.envio_fallido',
          mensajeId: fallo.mensajeId,
          tenantId: fallo.tenantId,
          codigo: fallo.codigo,
          msg: 'Un mensaje a soporte quedó fallido: no se reintenta (se reenvía volviéndolo a pendiente)',
        });
      }
      if (resultado.cuota !== null) {
        this.logger.warn({
          evento: 'soporte.envio_cuota',
          codigo: resultado.cuota,
          msg: 'Cuota de correo agotada: el mensaje a soporte se reintenta en 1 hora',
        });
      }
      if (resultado.configuracion !== null) {
        this.logger.error({
          evento: 'soporte.envio_configuracion',
          alerta: 'soporte.envio_configuracion',
          codigo: resultado.configuracion,
          msg: 'El envío a soporte se detuvo por configuración (clave, remitente, dominio o destino): no sale nada hasta corregirla',
        });
      }
      if (resultado.procesados > 0) {
        this.logger.log({
          evento: 'soporte.envio',
          enviados: resultado.enviados,
          reintentos: resultado.reintentos,
          pospuestos: resultado.pospuestos,
          fallidos: resultado.fallidos.length,
          interrumpido: resultado.interrumpido,
        });
      }
    } catch (error: unknown) {
      this.logger.error({
        evento: 'soporte.envio.fallido',
        err: error,
        msg: 'El envío a soporte falló (infraestructura)',
      });
    }
  }
}
