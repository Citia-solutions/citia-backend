import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import {
  CierreGhostingService,
  OpcionesCierreGhosting,
  ResultadoCierreGhosting,
} from '../../application/cierre-ghosting.service';
import { CORTE_GHOSTING } from '../../domain/cierre-ghosting';
import {
  CRON_CIERRE_GHOSTING,
  LOTE_CIERRE_GHOSTING,
  PlanificadorCierreCitas,
} from './planificador-cierre-citas';

const LIMITE = new Date('2026-10-20T03:00:00.000Z');

const SIMULADO: ResultadoCierreGhosting = {
  modo: 'simulado',
  limite: LIMITE,
  candidatas: 0,
  masAntigua: null,
};

const ACTIVO: ResultadoCierreGhosting = {
  modo: 'activo',
  limite: LIMITE,
  cerradas: 2,
  interrumpido: false,
  fallidas: [],
};

type ConfigPrueba = Pick<
  Entorno,
  'PLANIFICADOR_ACTIVO' | 'APP_TZ' | 'CIERRE_GHOSTING_ACTIVO'
>;

function configFalsa(
  valores: Partial<ConfigPrueba> = {},
): ConfigService<Entorno, true> {
  const todo: ConfigPrueba = {
    PLANIFICADOR_ACTIVO: true,
    APP_TZ: 'America/Santiago',
    CIERRE_GHOSTING_ACTIVO: false,
    ...valores,
  };
  return {
    get: (clave: keyof ConfigPrueba) => todo[clave],
  } as unknown as ConfigService<Entorno, true>;
}

describe('PlanificadorCierreCitas (job G1, US-07.01)', () => {
  let scheduler: SchedulerRegistry;
  let ejecutar: jest.Mock<
    Promise<ResultadoCierreGhosting>,
    [OpcionesCierreGhosting]
  >;
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  let planificador: PlanificadorCierreCitas;

  const crear = (config = configFalsa()): PlanificadorCierreCitas =>
    new PlanificadorCierreCitas(config, scheduler, {
      ejecutar,
    } as unknown as CierreGhostingService);

  beforeEach(() => {
    scheduler = new SchedulerRegistry();
    ejecutar = jest
      .fn<Promise<ResultadoCierreGhosting>, [OpcionesCierreGhosting]>()
      .mockResolvedValue(SIMULADO);
    log = jest
      .spyOn(Logger.prototype, 'log')
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
    });

    it('con PLANIFICADOR_ACTIVO=true registra citas.cierre_ghosting cada hora al minuto 40 en APP_TZ', () => {
      // Act
      planificador.onApplicationBootstrap();

      // Assert
      expect([...scheduler.getCronJobs().keys()]).toEqual([
        CRON_CIERRE_GHOSTING,
      ]);
      const cron = scheduler.getCronJob(CRON_CIERRE_GHOSTING);
      expect(cron.isActive).toBe(true);
      const [primera, segunda] = cron.nextDates(2);
      expect(primera.setZone('America/Santiago').toFormat('mm:ss')).toBe(
        '40:00',
      );
      expect(segunda.diff(primera, 'hours').hours).toBe(1);
    });

    it.each<[boolean, string]>([
      [false, 'simulado'],
      [true, 'activo'],
    ])(
      'con CIERRE_GHOSTING_ACTIVO=%s registra el modo %s al arrancar',
      (activo, modo) => {
        // Arrange
        planificador = crear(configFalsa({ CIERRE_GHOSTING_ACTIVO: activo }));

        // Act
        planificador.onApplicationBootstrap();

        // Assert
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({
            evento: 'planificador.activo',
            jobs: [CRON_CIERRE_GHOSTING],
            modo,
          }),
        );
      },
    );

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
    it.each<[boolean | string | undefined, boolean]>([
      [false, false],
      [true, true],
      // Solo un `true` validado lo prende.
      ['true', false],
      [undefined, false],
    ])(
      'CIERRE_GHOSTING_ACTIVO=%s → ejecutar({ activo: %s, lote: 200 })',
      async (valor, activo) => {
        // Arrange
        planificador = crear(
          configFalsa({
            CIERRE_GHOSTING_ACTIVO: valor as boolean,
          }),
        );

        // Act
        await planificador.ejecutarCierre();

        // Assert
        expect(ejecutar).toHaveBeenCalledTimes(1);
        expect(ejecutar.mock.calls[0][0]).toMatchObject({
          activo,
          lote: LOTE_CIERRE_GHOSTING,
        });
        expect(LOTE_CIERRE_GHOSTING).toBe(200);
      },
    );

    it('apagado deja SIEMPRE el log simulado, también con 0 candidatas', async () => {
      // Act
      await planificador.ejecutarCierre();

      // Assert
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'citas.cierre_ghosting.simulado',
          candidatas: 0,
          masAntigua: null,
          limite: LIMITE,
          corte: CORTE_GHOSTING,
        }),
      );
    });

    it('prendido deja el resumen y un error por cita fallida (solo ids y código)', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...ACTIVO,
        fallidas: [{ citaId: 'c1', tenantId: 't1', error: 'ErrorDePrueba' }],
      });

      // Act
      await planificador.ejecutarCierre();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'citas.cierre_ghosting.cita_fallida',
          citaId: 'c1',
          tenantId: 't1',
          codigo: 'ErrorDePrueba',
        }),
      );
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'citas.cierre_ghosting',
          cerradas: 2,
          fallidas: 1,
          interrumpido: false,
          limite: LIMITE,
        }),
      );
    });

    it('un fallo de infraestructura queda en el log y no rompe el planificador', async () => {
      // Arrange
      ejecutar.mockRejectedValueOnce(new Error('connection refused'));

      // Act
      await planificador.ejecutarCierre();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'citas.cierre_ghosting.fallido' }),
      );
    });

    it('al apagar: corta el lote en curso, lo espera y no acepta otro tick', async () => {
      // Arrange
      planificador.onApplicationBootstrap();
      let terminar: (r: ResultadoCierreGhosting) => void = () => undefined;
      ejecutar.mockImplementationOnce(
        () => new Promise<ResultadoCierreGhosting>((r) => (terminar = r)),
      );
      const tick = planificador.ejecutarCierre();
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
      terminar(ACTIVO);
      await tick;
      await apagando;
      expect(apagado).toBe(true);
      expect(planificador.ejecutarCierre()).toBeNull();
    });
  });
});
