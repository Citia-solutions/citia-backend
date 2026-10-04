import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import {
  EnviarRecordatoriosService,
  OpcionesLote,
  ResultadoLoteEnvio,
} from '../../application/enviar-recordatorios.service';
import {
  ReconciliacionRespaldoService,
  ResultadoRespaldo,
} from '../../application/reconciliacion-respaldo.service';
import {
  ResultadoTasaFallo,
  TasaFalloRecordatoriosService,
} from '../../application/tasa-fallo-recordatorios.service';
import {
  CRON_RESPALDO_RECORDATORIOS,
  CRON_TASA_FALLO_RECORDATORIOS,
  INTERVALO_ENVIO_RECORDATORIOS,
  PlanificadorRecordatorios,
} from './planificador-recordatorios';

const RESPALDO_VACIO: ResultadoRespaldo = {
  paginas: 1,
  revisadas: 0,
  conCambios: 0,
  fallidas: [],
  interrumpido: false,
};

const LOTE_VACIO: ResultadoLoteEnvio = {
  procesados: 0,
  enviados: 0,
  reintentos: 0,
  pospuestos: 0,
  omitidos: 0,
  cancelados: 0,
  fallidos: 0,
  sinCambios: 0,
  erroresInternos: 0,
  corte: null,
  interrumpido: false,
};

const TASA: ResultadoTasaFallo = {
  desde: new Date(0),
  hasta: new Date(1),
  entregados: 0,
  fallidos: 0,
  muestra: 0,
  tasa: 0,
  alerta: false,
};

type ConfigPrueba = Pick<
  Entorno,
  | 'PLANIFICADOR_ACTIVO'
  | 'APP_TZ'
  | 'RECORDATORIO_LOTE'
  | 'RECORDATORIO_INTERVALO_SEG'
>;

function configFalsa(
  valores: Partial<ConfigPrueba> = {},
): ConfigService<Entorno, true> {
  const todo: ConfigPrueba = {
    PLANIFICADOR_ACTIVO: true,
    APP_TZ: 'America/Santiago',
    RECORDATORIO_LOTE: 7,
    RECORDATORIO_INTERVALO_SEG: 60,
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
  let enviarLote: jest.Mock<Promise<ResultadoLoteEnvio>, [OpcionesLote]>;
  let medir: jest.Mock<Promise<ResultadoTasaFallo>, []>;
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
      { enviarLote } as unknown as EnviarRecordatoriosService,
      { medir } as unknown as TasaFalloRecordatoriosService,
      { latir, informarFallo },
    );
  }

  beforeEach(() => {
    scheduler = new SchedulerRegistry();
    ejecutar = jest
      .fn<Promise<ResultadoRespaldo>, [OpcionesEjecutar]>()
      .mockResolvedValue(RESPALDO_VACIO);
    enviarLote = jest
      .fn<Promise<ResultadoLoteEnvio>, [OpcionesLote]>()
      .mockResolvedValue(LOTE_VACIO);
    medir = jest.fn<Promise<ResultadoTasaFallo>, []>().mockResolvedValue(TASA);
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
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('registro', () => {
    it('con PLANIFICADOR_ACTIVO=false no registra ningún job ni ejecuta nada', () => {
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
      expect(enviarLote).not.toHaveBeenCalled();
      expect(medir).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'planificador.inactivo' }),
      );
    });

    it('con PLANIFICADOR_ACTIVO=true registra el envío (intervalo), el respaldo y la tasa de fallo (crons)', () => {
      // Act
      planificador.onApplicationBootstrap();

      // Assert
      expect(scheduler.getIntervals()).toEqual([INTERVALO_ENVIO_RECORDATORIOS]);
      expect([...scheduler.getCronJobs().keys()].sort()).toEqual(
        [CRON_RESPALDO_RECORDATORIOS, CRON_TASA_FALLO_RECORDATORIOS].sort(),
      );
    });

    it('el respaldo corre cada hora al minuto 15, en APP_TZ', () => {
      // Act
      planificador.onApplicationBootstrap();

      // Assert
      const cron = scheduler.getCronJob(CRON_RESPALDO_RECORDATORIOS);
      expect(cron.isActive).toBe(true);
      const [primera, segunda] = cron.nextDates(2);
      expect(primera.setZone('America/Santiago').toFormat('mm:ss')).toBe(
        '15:00',
      );
      expect(segunda.diff(primera, 'hours').hours).toBe(1);
    });

    it('la tasa de fallo corre cada 15 minutos', () => {
      // Act
      planificador.onApplicationBootstrap();

      // Assert
      const [a, b] = scheduler
        .getCronJob(CRON_TASA_FALLO_RECORDATORIOS)
        .nextDates(2);
      expect(b.diff(a, 'minutes').minutes).toBe(15);
    });

    it('el envío corre cada RECORDATORIO_INTERVALO_SEG con lote RECORDATORIO_LOTE', async () => {
      // Arrange
      jest.useFakeTimers();
      planificador = crear(configFalsa({ RECORDATORIO_INTERVALO_SEG: 30 }));
      planificador.onApplicationBootstrap();

      // Act
      await jest.advanceTimersByTimeAsync(29_000);
      const antes = enviarLote.mock.calls.length;
      await jest.advanceTimersByTimeAsync(1_000);

      // Assert
      expect(antes).toBe(0);
      expect(enviarLote).toHaveBeenCalledTimes(1);
      expect(enviarLote.mock.calls[0][0].lote).toBe(7);
    });

    it('al apagar quita el intervalo y los crons', async () => {
      // Arrange
      planificador.onApplicationBootstrap();

      // Act
      await planificador.beforeApplicationShutdown();

      // Assert
      expect(scheduler.getIntervals()).toEqual([]);
      expect(scheduler.getCronJobs().size).toBe(0);
    });
  });

  describe('envío', () => {
    it('tick sano → latir("recordatorios")', async () => {
      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(latir).toHaveBeenCalledWith('recordatorios');
      expect(informarFallo).not.toHaveBeenCalled();
    });

    it('cuota agotada sigue siendo un tick sano (alerta por log)', async () => {
      // Arrange
      enviarLote.mockResolvedValueOnce({
        ...LOTE_VACIO,
        procesados: 1,
        corte: 'cuota_agotada',
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(latir).toHaveBeenCalledWith('recordatorios');
    });

    it('corte por configuración del proveedor → informarFallo, sin latir', async () => {
      // Arrange
      enviarLote.mockResolvedValueOnce({
        ...LOTE_VACIO,
        procesados: 1,
        sinCambios: 1,
        corte: 'configuracion',
      });

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(informarFallo).toHaveBeenCalledWith('recordatorios');
      expect(latir).not.toHaveBeenCalled();
    });

    it('fallo de infraestructura → informarFallo y log de error', async () => {
      // Arrange
      enviarLote.mockRejectedValueOnce(new Error('connection refused'));

      // Act
      await planificador.ejecutarEnvio();

      // Assert
      expect(informarFallo).toHaveBeenCalledWith('recordatorios');
      expect(latir).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'recordatorios.envio_fallido' }),
      );
    });

    it('no arranca un tick mientras el anterior sigue en curso', async () => {
      // Arrange
      let terminar: (r: ResultadoLoteEnvio) => void = () => undefined;
      enviarLote.mockImplementationOnce(
        () => new Promise<ResultadoLoteEnvio>((r) => (terminar = r)),
      );

      // Act
      const primero = planificador.ejecutarEnvio();
      await Promise.resolve();
      const segundo = planificador.ejecutarEnvio();

      // Assert
      expect(segundo).toBeNull();
      terminar(LOTE_VACIO);
      await primero;
      expect(enviarLote).toHaveBeenCalledTimes(1);
    });

    it('al apagar: corta el lote en curso entre recordatorios, lo espera y no acepta otro', async () => {
      // Arrange
      planificador.onApplicationBootstrap();
      let terminar: (r: ResultadoLoteEnvio) => void = () => undefined;
      enviarLote.mockImplementationOnce(
        () => new Promise<ResultadoLoteEnvio>((r) => (terminar = r)),
      );
      const tick = planificador.ejecutarEnvio();
      await Promise.resolve();
      const opciones = enviarLote.mock.calls[0][0];
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
      terminar(LOTE_VACIO);
      await tick;
      await apagando;
      expect(apagado).toBe(true);
      expect(planificador.ejecutarEnvio()).toBeNull();
    });
  });

  describe('respaldo', () => {
    it('sin errores NO late: el latido es del envío (no lo contradice)', async () => {
      // Act
      await planificador.ejecutarRespaldo();

      // Assert
      expect(ejecutar).toHaveBeenCalledTimes(1);
      expect(latir).not.toHaveBeenCalled();
      expect(informarFallo).not.toHaveBeenCalled();
    });

    it('citas sueltas fallidas: se registran (sin datos personales), sin informar fallo', async () => {
      // Arrange
      ejecutar.mockResolvedValueOnce({
        ...RESPALDO_VACIO,
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
      expect(informarFallo).not.toHaveBeenCalled();
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
      terminar(RESPALDO_VACIO);
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
      const apagando = planificador.beforeApplicationShutdown();
      await Promise.resolve();

      // Assert
      expect(opciones?.continuar?.()).toBe(false);
      terminar(RESPALDO_VACIO);
      await tick;
      await apagando;
      expect(planificador.ejecutarRespaldo()).toBeNull();
    });
  });

  describe('tasa de fallo', () => {
    it('mide (la alerta la registra el servicio) y no toca el latido', async () => {
      // Act
      await planificador.ejecutarTasaFallo();

      // Assert
      expect(medir).toHaveBeenCalledTimes(1);
      expect(latir).not.toHaveBeenCalled();
    });

    it('si la medición falla, solo un log de error', async () => {
      // Arrange
      medir.mockRejectedValueOnce(new Error('connection refused'));

      // Act
      await planificador.ejecutarTasaFallo();

      // Assert
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'recordatorios.tasa_fallo_fallida' }),
      );
      expect(informarFallo).not.toHaveBeenCalled();
    });
  });
});
