import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import {
  EnviarMensajesSoporteService,
  OpcionesEnvioSoporte,
  ResultadoEnvioSoporte,
} from '../../application/enviar-mensajes-soporte.service';
import {
  CRON_SOPORTE_ENVIO,
  HORARIO_SOPORTE_ENVIO,
  LOTE_SOPORTE_ENVIO,
  PlanificadorSoporte,
} from './planificador-soporte';

const VACIO: ResultadoEnvioSoporte = {
  procesados: 0,
  enviados: 0,
  reintentos: 0,
  pospuestos: 0,
  fallidos: [],
  erroresInternos: [],
  configuracion: null,
  cuota: null,
  interrumpido: false,
};

type ConfigPrueba = Pick<
  Entorno,
  'PLANIFICADOR_ACTIVO' | 'APP_TZ' | 'SOPORTE_CORREO_DESTINO'
>;

function configFalsa(
  valores: Partial<ConfigPrueba> = {},
): ConfigService<Entorno, true> {
  const todo: ConfigPrueba = {
    PLANIFICADOR_ACTIVO: true,
    APP_TZ: 'America/Santiago',
    SOPORTE_CORREO_DESTINO: 'soporte@citiahealth.cl',
    ...valores,
  };
  return {
    get: (clave: keyof ConfigPrueba) => todo[clave],
  } as unknown as ConfigService<Entorno, true>;
}

describe('PlanificadorSoporte (job soporte.envio, US-10)', () => {
  let scheduler: SchedulerRegistry;
  let ejecutar: jest.Mock<
    Promise<ResultadoEnvioSoporte>,
    [OpcionesEnvioSoporte]
  >;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let planificador: PlanificadorSoporte;

  const crear = (config = configFalsa()): PlanificadorSoporte =>
    new PlanificadorSoporte(config, scheduler, {
      ejecutar,
    } as unknown as EnviarMensajesSoporteService);

  /** Todo lo registrado en el log, serializado. */
  const todoElLog = (): string =>
    JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls]);

  beforeEach(() => {
    scheduler = new SchedulerRegistry();
    ejecutar = jest
      .fn<Promise<ResultadoEnvioSoporte>, [OpcionesEnvioSoporte]>()
      .mockResolvedValue(VACIO);
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    planificador = crear();
  });

  afterEach(async () => {
    await planificador.beforeApplicationShutdown();
    jest.restoreAllMocks();
  });

  describe('registro', () => {
    it('con PLANIFICADOR_ACTIVO=false no registra nada ni ejecuta', () => {
      // Arrange
      const addCronJob = jest.spyOn(scheduler, 'addCronJob');
      planificador = crear(configFalsa({ PLANIFICADOR_ACTIVO: false }));

      // Act
      planificador.onApplicationBootstrap();

      // Assert
      expect(addCronJob).not.toHaveBeenCalled();
      expect(scheduler.getCronJobs().size).toBe(0);
      expect(ejecutar).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'planificador.inactivo' }),
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it.each([undefined, ''])(
      'sin SOPORTE_CORREO_DESTINO (%p): warn soporte.sin_destino y no registra',
      (destino) => {
        // Arrange
        planificador = crear(configFalsa({ SOPORTE_CORREO_DESTINO: destino }));

        // Act
        planificador.onApplicationBootstrap();

        // Assert
        expect(scheduler.getCronJobs().size).toBe(0);
        expect(warn).toHaveBeenCalledWith({
          evento: 'soporte.sin_destino',
          msg: 'SOPORTE_CORREO_DESTINO vacía: los mensajes a soporte se guardan y no se envían',
        });
        expect(log).not.toHaveBeenCalledWith(
          expect.objectContaining({ evento: 'planificador.activo' }),
        );
      },
    );

    it('con destino registra soporte.envio a 20 * * * * * en APP_TZ (cada minuto, segundo 20)', () => {
      // Act
      planificador.onApplicationBootstrap();

      // Assert
      expect(HORARIO_SOPORTE_ENVIO).toBe('20 * * * * *');
      expect([...scheduler.getCronJobs().keys()]).toEqual([CRON_SOPORTE_ENVIO]);
      expect(CRON_SOPORTE_ENVIO).toBe('soporte.envio');
      const cron = scheduler.getCronJob(CRON_SOPORTE_ENVIO);
      expect(cron.isActive).toBe(true);
      const [primera, segunda] = cron.nextDates(2);
      expect(primera.setZone('America/Santiago').toFormat('ss')).toBe('20');
      expect(segunda.diff(primera, 'minutes').minutes).toBe(1);
      expect(log).toHaveBeenCalledWith({
        evento: 'planificador.activo',
        jobs: ['soporte.envio'],
        msg: 'Envío a soporte: cada minuto (America/Santiago)',
      });
    });

    it('al apagar quita el cron', async () => {
      // Arrange
      planificador.onApplicationBootstrap();

      // Act
      await planificador.beforeApplicationShutdown();

      // Assert
      expect(scheduler.getCronJobs().size).toBe(0);
    });
  });

  describe('tick', () => {
    it('ejecuta con lote 20 y sin trabajo no deja log', async () => {
      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(ejecutar).toHaveBeenCalledTimes(1);
      expect(ejecutar.mock.calls[0][0]).toMatchObject({ lote: 20 });
      expect(LOTE_SOPORTE_ENVIO).toBe(20);
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('con trabajo: el resumen soporte.envio', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...VACIO,
        procesados: 3,
        enviados: 2,
        reintentos: 1,
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(log).toHaveBeenCalledWith({
        evento: 'soporte.envio',
        enviados: 2,
        reintentos: 1,
        pospuestos: 0,
        fallidos: 0,
        interrumpido: false,
      });
    });

    it('un mensaje fallido → error con la alerta soporte.envio_fallido (solo ids y código)', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...VACIO,
        procesados: 1,
        fallidos: [
          { mensajeId: 'm1', tenantId: 't1', codigo: 'validation_error:to' },
        ],
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'soporte.envio_fallido',
          alerta: 'soporte.envio_fallido',
          mensajeId: 'm1',
          tenantId: 't1',
          codigo: 'validation_error:to',
        }),
      );
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'soporte.envio', fallidos: 1 }),
      );
    });

    it('configuración → error con la alerta soporte.envio_configuracion', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...VACIO,
        procesados: 1,
        configuracion: 'invalid_api_key',
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'soporte.envio_configuracion',
          alerta: 'soporte.envio_configuracion',
          codigo: 'invalid_api_key',
        }),
      );
    });

    it('cuota agotada → warn soporte.envio_cuota', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...VACIO,
        procesados: 1,
        pospuestos: 1,
        cuota: 'daily_quota_exceeded',
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'soporte.envio_cuota',
          codigo: 'daily_quota_exceeded',
        }),
      );
    });

    it('error propio → warn soporte.envio_error_interno (ids y código)', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...VACIO,
        procesados: 1,
        reintentos: 1,
        erroresInternos: [
          { mensajeId: 'm2', tenantId: 't2', codigo: 'TypeError' },
        ],
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'soporte.envio_error_interno',
          mensajeId: 'm2',
          tenantId: 't2',
          codigo: 'TypeError',
        }),
      );
    });

    it('un fallo de infraestructura queda en el log y no rompe el planificador', async () => {
      // Arrange
      ejecutar.mockRejectedValueOnce(new Error('connection refused'));

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'soporte.envio.fallido',
          msg: 'El envío a soporte falló (infraestructura)',
        }),
      );
      // El siguiente tick corre igual
      await planificador.ejecutarEnvio();
      expect(ejecutar).toHaveBeenCalledTimes(2);
    });

    it('nunca registra nada bajo la clave `mensaje`', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...VACIO,
        procesados: 2,
        fallidos: [{ mensajeId: 'm1', tenantId: 't1', codigo: 'x' }],
        erroresInternos: [{ mensajeId: 'm2', tenantId: 't2', codigo: 'y' }],
        configuracion: 'z',
        cuota: 'w',
      });

      // Act
      planificador.onApplicationBootstrap();
      await planificador.ejecutarEnvio();

      // Assert
      expect(todoElLog()).not.toMatch(/"mensaje"\s*:/);
    });

    it('un tick no se solapa con el anterior', async () => {
      // Arrange
      let terminar: (r: ResultadoEnvioSoporte) => void = () => undefined;
      ejecutar.mockImplementationOnce(
        () => new Promise<ResultadoEnvioSoporte>((r) => (terminar = r)),
      );

      // Act
      const primero = planificador.ejecutarEnvio();
      const segundo = planificador.ejecutarEnvio();

      // Assert
      expect(primero).not.toBeNull();
      expect(segundo).toBeNull();
      await Promise.resolve();
      terminar(VACIO);
      await primero;
    });

    it('al apagar: corta el lote en curso, ESPERA el tick y no acepta otro', async () => {
      // Arrange
      planificador.onApplicationBootstrap();
      let terminar: (r: ResultadoEnvioSoporte) => void = () => undefined;
      ejecutar.mockImplementationOnce(
        () => new Promise<ResultadoEnvioSoporte>((r) => (terminar = r)),
      );
      const tick = planificador.ejecutarEnvio();
      await Promise.resolve();
      const opciones = ejecutar.mock.calls[0][0];
      expect(opciones.continuar?.()).toBe(true);

      // Act
      let apagado = false;
      const apagando = planificador.beforeApplicationShutdown().then(() => {
        apagado = true;
      });
      await Promise.resolve();

      // Assert
      expect(opciones.continuar?.()).toBe(false);
      expect(apagado).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'planificador.esperando',
          trabajos: ['soporte.envio'],
        }),
      );
      terminar(VACIO);
      await tick;
      await apagando;
      expect(apagado).toBe(true);
      expect(scheduler.getCronJobs().size).toBe(0);
      expect(planificador.ejecutarEnvio()).toBeNull();
    });
  });
});
