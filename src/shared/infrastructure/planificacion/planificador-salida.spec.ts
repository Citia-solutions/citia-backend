import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Entorno } from '../config/entorno';
import {
  DespachadorEventosSalida,
  OpcionesDespacho,
  ResultadoDespacho,
} from '../salida/despachador-eventos-salida';
import { PurgaEventosSalida } from '../salida/purga-eventos-salida';
import {
  CRON_PURGA_SALIDA,
  INTERVALO_DESPACHADOR_SALIDA,
  PlanificadorSalida,
} from './planificador-salida';

const RESULTADO_VACIO: ResultadoDespacho = {
  procesados: 0,
  entregados: 0,
  reintentos: 0,
  cartasMuertas: 0,
  resueltosPorOtro: 0,
};

type ConfigPrueba = Pick<
  Entorno,
  | 'PLANIFICADOR_ACTIVO'
  | 'EVENTOS_SALIDA_INTERVALO_SEG'
  | 'EVENTOS_SALIDA_LOTE'
  | 'EVENTOS_SALIDA_MAX_INTENTOS'
  | 'EVENTOS_SALIDA_RETENCION_DIAS'
  | 'APP_TZ'
>;

function configFalsa(
  valores: Partial<ConfigPrueba> = {},
): ConfigService<Entorno, true> {
  const todo: ConfigPrueba = {
    PLANIFICADOR_ACTIVO: true,
    EVENTOS_SALIDA_INTERVALO_SEG: 5,
    EVENTOS_SALIDA_LOTE: 50,
    EVENTOS_SALIDA_MAX_INTENTOS: 7,
    EVENTOS_SALIDA_RETENCION_DIAS: 14,
    APP_TZ: 'America/Santiago',
    ...valores,
  };
  return {
    get: (clave: keyof ConfigPrueba) => todo[clave],
  } as unknown as ConfigService<Entorno, true>;
}

describe('PlanificadorSalida', () => {
  let scheduler: SchedulerRegistry;
  let despachar: jest.Mock<Promise<ResultadoDespacho>, [OpcionesDespacho]>;
  let purgar: jest.Mock;
  let latir: jest.Mock;
  let informarFallo: jest.Mock;
  let error: jest.SpyInstance;
  let planificador: PlanificadorSalida;

  function crear(config = configFalsa()): PlanificadorSalida {
    return new PlanificadorSalida(
      config,
      scheduler,
      { despachar } as unknown as DespachadorEventosSalida,
      { purgar } as unknown as PurgaEventosSalida,
      { latir, informarFallo },
    );
  }

  beforeEach(() => {
    scheduler = new SchedulerRegistry();
    despachar = jest
      .fn<Promise<ResultadoDespacho>, [OpcionesDespacho]>()
      .mockResolvedValue(RESULTADO_VACIO);
    purgar = jest.fn().mockResolvedValue({ ejecutada: true, borrados: 0 });
    latir = jest.fn().mockResolvedValue(undefined);
    informarFallo = jest.fn().mockResolvedValue(undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    planificador = crear();
  });

  afterEach(async () => {
    await planificador.beforeApplicationShutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('registro de jobs', () => {
    it('con PLANIFICADOR_ACTIVO=false no registra ningún intervalo ni cron', () => {
      const addInterval = jest.spyOn(scheduler, 'addInterval');
      const addCronJob = jest.spyOn(scheduler, 'addCronJob');
      planificador = crear(configFalsa({ PLANIFICADOR_ACTIVO: false }));

      planificador.onApplicationBootstrap();

      expect(addInterval).not.toHaveBeenCalled();
      expect(addCronJob).not.toHaveBeenCalled();
      expect(scheduler.getIntervals()).toEqual([]);
      expect(scheduler.getCronJobs().size).toBe(0);
    });

    it('con PLANIFICADOR_ACTIVO=true registra el despachador y la purga diaria en APP_TZ', () => {
      planificador.onApplicationBootstrap();

      expect(
        scheduler.doesExist('interval', INTERVALO_DESPACHADOR_SALIDA),
      ).toBe(true);
      expect(scheduler.doesExist('cron', CRON_PURGA_SALIDA)).toBe(true);
      const cron = scheduler.getCronJob(CRON_PURGA_SALIDA);
      expect(cron.isActive).toBe(true);
      // Próxima ejecución: 04:00 hora de Santiago.
      const proxima = cron.nextDate();
      expect(proxima.setZone('America/Santiago').toFormat('HH:mm:ss')).toBe(
        '04:00:00',
      );
    });

    it('dispara el despachador cada EVENTOS_SALIDA_INTERVALO_SEG con lote y política del entorno', async () => {
      jest.useFakeTimers();
      planificador = crear(configFalsa({ EVENTOS_SALIDA_INTERVALO_SEG: 3 }));
      planificador.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(2_999);
      expect(despachar).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(despachar).toHaveBeenCalledTimes(1);

      const opciones = despachar.mock.calls[0][0];
      expect(opciones.lote).toBe(50);
      expect(opciones.politica.maxIntentos).toBe(7);
      expect(opciones.continuar?.()).toBe(true);
    });

    it('la política inválida hace fallar el arranque', () => {
      planificador = crear(configFalsa({ EVENTOS_SALIDA_MAX_INTENTOS: 0 }));
      expect(() => planificador.onApplicationBootstrap()).toThrow(
        /maxIntentos/,
      );
    });
  });

  describe('latidos', () => {
    it('tick sin errores → latir("salida")', async () => {
      await planificador.ejecutarDespacho();

      expect(latir).toHaveBeenCalledWith('salida');
      expect(informarFallo).not.toHaveBeenCalled();
    });

    it('también late si hubo fallos de suscriptores (ya registrados)', async () => {
      despachar.mockResolvedValueOnce({
        ...RESULTADO_VACIO,
        procesados: 2,
        reintentos: 1,
        cartasMuertas: 1,
      });
      await planificador.ejecutarDespacho();
      expect(latir).toHaveBeenCalledWith('salida');
    });

    it('tick con error de infraestructura → informarFallo("salida") y log de error', async () => {
      despachar.mockRejectedValueOnce(new Error('connection refused'));

      await planificador.ejecutarDespacho();

      expect(informarFallo).toHaveBeenCalledWith('salida');
      expect(latir).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'eventos_salida.tick_fallido' }),
      );
    });
  });

  describe('sin solapamiento y apagado', () => {
    it('no arranca un tick mientras el anterior sigue en curso', async () => {
      let terminar: (r: ResultadoDespacho) => void = () => undefined;
      despachar.mockImplementationOnce(
        () => new Promise<ResultadoDespacho>((r) => (terminar = r)),
      );

      const primero = planificador.ejecutarDespacho();
      await Promise.resolve();
      const segundo = planificador.ejecutarDespacho();

      expect(segundo).toBeNull();
      expect(despachar).toHaveBeenCalledTimes(1);

      terminar(RESULTADO_VACIO);
      await primero;
      await planificador.ejecutarDespacho();
      expect(despachar).toHaveBeenCalledTimes(2);
    });

    it('al apagar: desprograma, pide no reclamar más y espera al tick en curso', async () => {
      planificador.onApplicationBootstrap();
      let terminar: (r: ResultadoDespacho) => void = () => undefined;
      despachar.mockImplementationOnce(
        () => new Promise<ResultadoDespacho>((r) => (terminar = r)),
      );
      const tick = planificador.ejecutarDespacho();
      await Promise.resolve();
      const opciones = despachar.mock.calls[0][0];

      let apagado = false;
      const apagando = planificador.beforeApplicationShutdown().then(() => {
        apagado = true;
      });
      await Promise.resolve();

      expect(
        scheduler.doesExist('interval', INTERVALO_DESPACHADOR_SALIDA),
      ).toBe(false);
      expect(scheduler.doesExist('cron', CRON_PURGA_SALIDA)).toBe(false);
      expect(opciones.continuar?.()).toBe(false);
      expect(apagado).toBe(false);

      terminar(RESULTADO_VACIO);
      await tick;
      await apagando;
      expect(apagado).toBe(true);
      expect(planificador.ejecutarDespacho()).toBeNull();
    });
  });

  describe('purga', () => {
    it('purga con EVENTOS_SALIDA_RETENCION_DIAS', async () => {
      await planificador.ejecutarPurga();
      expect(purgar).toHaveBeenCalledWith(14);
    });

    it('un fallo de la purga se registra y no lanza', async () => {
      purgar.mockRejectedValueOnce(new Error('base caída'));

      await expect(planificador.ejecutarPurga()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'eventos_salida.purga_fallida' }),
      );
    });
  });
});
