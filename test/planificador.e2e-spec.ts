// PRIMERO: fija el entorno antes de que se importe AppModule (ver el archivo).
import './support/entorno-app-e2e';

import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { ReconciliacionRespaldoService } from '../src/modules/recordatorio/application/reconciliacion-respaldo.service';
import { SuscriptorRecordatorios } from '../src/modules/recordatorio/application/suscriptor-recordatorios';
import { PlanificadorRecordatorios } from '../src/modules/recordatorio/infrastructure/planificacion/planificador-recordatorios';
import { validarEntorno } from '../src/shared/infrastructure/config/entorno';
import {
  CRON_PURGA_SALIDA,
  INTERVALO_DESPACHADOR_SALIDA,
  PlanificadorSalida,
} from '../src/shared/infrastructure/planificacion/planificador-salida';
import { DespachadorEventosSalida } from '../src/shared/infrastructure/salida/despachador-eventos-salida';
import { PurgaEventosSalida } from '../src/shared/infrastructure/salida/purga-eventos-salida';
import { RegistroSuscriptores } from '../src/shared/infrastructure/salida/registro-suscriptores';
import { ObservabilidadModule } from '../src/shared/observabilidad.module';
import { PlanificacionModule } from '../src/shared/planificacion.module';
import { typeOrmTestConfig } from './typeorm-test.config';

/**
 * Planificador en proceso (ADR-12 §5) con la app real.
 *
 * El unit test de `PlanificadorSalida` ya cubre la bandera con una
 * configuración falsa. Aquí se mira la app COMPLETA (`AppModule`): con
 * `PLANIFICADOR_ACTIVO=false` el `SchedulerRegistry` queda vacío. Esto también
 * atrapa un job futuro declarado con `@Interval`/`@Cron`/`@Timeout` en
 * cualquier módulo, que `ScheduleModule` registraría sin mirar la bandera.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*): AppModule se conecta a la base
 * de test (sin synchronize ni dropSchema: solo conecta).
 */
describe('Planificador (e2e)', () => {
  describe('AppModule completo con PLANIFICADOR_ACTIVO=false', () => {
    let app: INestApplication;
    let despachar: jest.SpyInstance;
    let purgar: jest.SpyInstance;
    let respaldo: jest.SpyInstance;

    beforeAll(async () => {
      despachar = jest.spyOn(DespachadorEventosSalida.prototype, 'despachar');
      purgar = jest.spyOn(PurgaEventosSalida.prototype, 'purgar');
      respaldo = jest.spyOn(
        ReconciliacionRespaldoService.prototype,
        'ejecutar',
      );

      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      jest.restoreAllMocks();
    });

    it('no debería registrar ningún intervalo, cron ni timeout al arrancar', () => {
      const scheduler = app.get(SchedulerRegistry);

      expect(scheduler.getIntervals()).toEqual([]);
      expect([...scheduler.getCronJobs().keys()]).toEqual([]);
      expect(scheduler.getTimeouts()).toEqual([]);
    });

    it('debería conectarse a la base de test, no a la de desarrollo', () => {
      expect(app.get(DataSource).options.database).toBe(
        process.env.TEST_DB_NAME ?? 'citia_test',
      );
    });

    it('debería tener el planificador cargado sin despachar ni purgar', () => {
      expect(app.get(PlanificadorSalida)).toBeInstanceOf(PlanificadorSalida);
      expect(despachar).not.toHaveBeenCalled();
      expect(purgar).not.toHaveBeenCalled();
    });

    it('debería tener el job de recordatorios cargado sin ejecutar el respaldo (ADR-13 §6)', () => {
      expect(app.get(PlanificadorRecordatorios)).toBeInstanceOf(
        PlanificadorRecordatorios,
      );
      expect(respaldo).not.toHaveBeenCalled();
    });

    it('debería registrar SuscriptorRecordatorios en el outbox al iniciar', () => {
      const registro = app.get(RegistroSuscriptores);

      expect(registro.suscriptoresDe('CitaCreada')).toEqual([
        app.get(SuscriptorRecordatorios),
      ]);
    });
  });

  describe('PlanificacionModule con PLANIFICADOR_ACTIVO=true (control)', () => {
    const anterior = {
      PLANIFICADOR_ACTIVO: process.env.PLANIFICADOR_ACTIVO,
      EVENTOS_SALIDA_INTERVALO_SEG: process.env.EVENTOS_SALIDA_INTERVALO_SEG,
    };

    afterAll(() => {
      process.env.PLANIFICADOR_ACTIVO = anterior.PLANIFICADOR_ACTIVO;
      process.env.EVENTOS_SALIDA_INTERVALO_SEG =
        anterior.EVENTOS_SALIDA_INTERVALO_SEG;
    });

    it('debería registrar el despachador y la purga al iniciar la app y quitarlos al cerrarla', async () => {
      // Arrange: el mismo registro que el caso anterior SÍ ve los jobs.
      // Intervalo de 1 h: ningún tick llega a correr durante el test.
      process.env.PLANIFICADOR_ACTIVO = 'true';
      process.env.EVENTOS_SALIDA_INTERVALO_SEG = '3600';
      const moduleFixture = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
          TypeOrmModule.forRoot({
            ...typeOrmTestConfig,
            synchronize: false,
            dropSchema: false,
          }),
          ObservabilidadModule,
          PlanificacionModule,
        ],
      }).compile();
      const app = moduleFixture.createNestApplication();
      const scheduler = app.get(SchedulerRegistry);

      // Act: init → onApplicationBootstrap
      await app.init();

      // Assert
      expect(scheduler.getIntervals()).toEqual([INTERVALO_DESPACHADOR_SALIDA]);
      expect([...scheduler.getCronJobs().keys()]).toEqual([CRON_PURGA_SALIDA]);

      // Act: close → beforeApplicationShutdown (apagado ordenado)
      await app.close();

      // Assert
      expect(scheduler.getIntervals()).toEqual([]);
      expect(scheduler.getCronJobs().size).toBe(0);
    });
  });
});
