import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import {
  ReconciliacionRespaldoService,
  ResultadoRespaldo,
} from '../../application/reconciliacion-respaldo.service';
import {
  CRON_RESPALDO_RECORDATORIOS,
  PlanificadorRecordatorios,
} from './planificador-recordatorios';

const RESULTADO_VACIO: ResultadoRespaldo = {
  paginas: 1,
  revisadas: 0,
  conCambios: 0,
  fallidas: [],
  interrumpido: false,
};

type ConfigPrueba = Pick<Entorno, 'PLANIFICADOR_ACTIVO' | 'APP_TZ'>;

function configFalsa(
  valores: Partial<ConfigPrueba> = {},
): ConfigService<Entorno, true> {
  const todo: ConfigPrueba = {
    PLANIFICADOR_ACTIVO: true,
    APP_TZ: 'America/Santiago',
    ...valores,
  };
  return {
    get: (clave: keyof ConfigPrueba) => todo[clave],
  } as unknown as ConfigService<Entorno, true>;
}

type OpcionesEjecutar = Parameters<
  ReconciliacionRespaldoService['ejecutar']
>[0];

describe('PlanificadorRecordatorios', () => {
  let scheduler: SchedulerRegistry;
  let ejecutar: jest.Mock<Promise<ResultadoRespaldo>, [OpcionesEjecutar]>;
  let latir: jest.Mock;
  let informarFallo: jest.Mock;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  let planificador: PlanificadorRecordatorios;

  function crear(config = configFalsa()): PlanificadorRecordatorios {
    return new PlanificadorRecordatorios(
      config,
      scheduler,
      { ejecutar } as unknown as ReconciliacionRespaldoService,
      { latir, informarFallo },
    );
  }

  beforeEach(() => {
    scheduler = new SchedulerRegistry();
    ejecutar = jest
      .fn<Promise<ResultadoRespaldo>, [OpcionesEjecutar]>()
      .mockResolvedValue(RESULTADO_VACIO);
    latir = jest.fn().mockResolvedValue(undefined);
    informarFallo = jest.fn().mockResolvedValue(undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    planificador = crear();
  });

  afterEach(async () => {
    await planificador.beforeApplicationShutdown();
    jest.restoreAllMocks();
  });

  describe('registro', () => {
    it('con PLANIFICADOR_ACTIVO=false no registra ningún job ni ejecuta el respaldo', () => {
      // Arrange
      const addCronJob = jest.spyOn(scheduler, 'addCronJob');
      const addInterval = jest.spyOn(scheduler, 'addInterval');
      planificador = crear(configFalsa({ PLANIFICADOR_ACTIVO: false }));

      // Act
      planificador.onApplicationBootstrap();

      // Assert
      expect(addCronJob).not.toHaveBeenCalled();
      expect(addInterval).not.toHaveBeenCalled();
      expect(scheduler.getCronJobs().size).toBe(0);
      expect(scheduler.getIntervals()).toEqual([]);
      expect(ejecutar).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'planificador.inactivo' }),
      );
    });

    it('con PLANIFICADOR_ACTIVO=true registra el respaldo cada hora, al minuto 15, en APP_TZ', () => {
      // Act
      planificador.onApplicationBootstrap();

      // Assert
      expect(scheduler.doesExist('cron', CRON_RESPALDO_RECORDATORIOS)).toBe(
        true,
      );
      const cron = scheduler.getCronJob(CRON_RESPALDO_RECORDATORIOS);
      expect(cron.isActive).toBe(true);
      const [primera, segunda] = cron.nextDates(2);
      expect(primera.setZone('America/Santiago').toFormat('mm:ss')).toBe(
        '15:00',
      );
      expect(segunda.diff(primera, 'hours').hours).toBe(1);
    });

    it('al apagar quita el cron', async () => {
      // Arrange
      planificador.onApplicationBootstrap();

      // Act
      await planificador.beforeApplicationShutdown();

      // Assert
      expect(scheduler.doesExist('cron', CRON_RESPALDO_RECORDATORIOS)).toBe(
        false,
      );
    });
  });

  describe('tick', () => {
    it('sin errores → latir("recordatorios")', async () => {
      // Act
      await planificador.ejecutarRespaldo();

      // Assert
      expect(ejecutar).toHaveBeenCalledTimes(1);
      expect(latir).toHaveBeenCalledWith('recordatorios');
      expect(informarFallo).not.toHaveBeenCalled();
    });

    it('citas sueltas fallidas: se registran (sin datos personales) y se late igual', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...RESULTADO_VACIO,
        revisadas: 2,
        fallidas: [
          { citaId: 'c-1', tenantId: 't-1', error: 'QueryFailedError:40001' },
        ],
      });

      // Act
      await planificador.ejecutarRespaldo();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'recordatorios.respaldo_cita_fallida',
          citaId: 'c-1',
          codigo: 'QueryFailedError:40001',
        }),
      );
      expect(latir).toHaveBeenCalledWith('recordatorios');
    });

    it('fallo de infraestructura → informarFallo("recordatorios") y log de error', async () => {
      // Arrange
      ejecutar.mockRejectedValueOnce(new Error('connection refused'));

      // Act
      await planificador.ejecutarRespaldo();

      // Assert
      expect(informarFallo).toHaveBeenCalledWith('recordatorios');
      expect(latir).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'recordatorios.respaldo_fallido' }),
      );
    });

    it('no arranca un barrido mientras el anterior sigue en curso', async () => {
      // Arrange
      let terminar: (r: ResultadoRespaldo) => void = () => undefined;
      ejecutar.mockImplementationOnce(
        () => new Promise<ResultadoRespaldo>((r) => (terminar = r)),
      );

      // Act
      const primero = planificador.ejecutarRespaldo();
      await Promise.resolve();
      const segundo = planificador.ejecutarRespaldo();

      // Assert
      expect(segundo).toBeNull();
      terminar(RESULTADO_VACIO);
      await primero;
      expect(ejecutar).toHaveBeenCalledTimes(1);
    });

    it('al apagar: pide cortar el barrido en curso, lo espera y no acepta otro', async () => {
      // Arrange
      planificador.onApplicationBootstrap();
      let terminar: (r: ResultadoRespaldo) => void = () => undefined;
      ejecutar.mockImplementationOnce(
        () => new Promise<ResultadoRespaldo>((r) => (terminar = r)),
      );
      const tick = planificador.ejecutarRespaldo();
      await Promise.resolve();
      const opciones = ejecutar.mock.calls[0][0];
      expect(opciones?.continuar?.()).toBe(true);

      // Act
      let apagado = false;
      const apagando = planificador.beforeApplicationShutdown().then(() => {
        apagado = true;
      });
      await Promise.resolve();

      // Assert
      expect(opciones?.continuar?.()).toBe(false);
      expect(apagado).toBe(false);
      terminar(RESULTADO_VACIO);
      await tick;
      await apagando;
      expect(apagado).toBe(true);
      expect(planificador.ejecutarRespaldo()).toBeNull();
    });
  });
});
