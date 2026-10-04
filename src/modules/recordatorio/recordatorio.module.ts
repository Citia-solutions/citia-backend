import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import type { Entorno } from '../../shared/infrastructure/config/entorno';
import { RegistroSuscriptores } from '../../shared/infrastructure/salida/registro-suscriptores';
import { SharedModule } from '../../shared/shared.module';
import { ReconciliacionRespaldoService } from './application/reconciliacion-respaldo.service';
import { ReconciliarRecordatoriosService } from './application/reconciliar-recordatorios.service';
import { SuscriptorRecordatorios } from './application/suscriptor-recordatorios';
import { ConfiguracionRecordatorioRepository } from './domain/configuracion-recordatorio.repository';
import { LectorCitas } from './domain/lector-citas';
import { RecordatorioRepository } from './domain/recordatorio.repository';
import { SupresionCorreoRepository } from './domain/supresion-correo.repository';
import { leerOpcionesRecordatorios } from './infrastructure/config/opciones-recordatorios';
import { ConfiguracionRecordatorioOrmEntity } from './infrastructure/persistence/configuracion-recordatorio.orm-entity';
import { RecordatorioOrmEntity } from './infrastructure/persistence/recordatorio.orm-entity';
import { SqlLectorCitas } from './infrastructure/persistence/sql-lector-citas';
import { SupresionCorreoOrmEntity } from './infrastructure/persistence/supresion-correo.orm-entity';
import { TypeOrmConfiguracionRecordatorioRepository } from './infrastructure/persistence/typeorm-configuracion-recordatorio.repository';
import { TypeOrmRecordatorioRepository } from './infrastructure/persistence/typeorm-recordatorio.repository';
import { TypeOrmSupresionCorreoRepository } from './infrastructure/persistence/typeorm-supresion-correo.repository';

/**
 * Recordatorios al paciente (ADR-13).
 *
 * - Persistencia (paso 7): las tres tablas y los puertos con sus adaptadores.
 * - Reconciliación (paso 9): `SuscriptorRecordatorios` se registra en el
 *   outbox al iniciar (`onModuleInit`, antes de que el planificador arranque)
 *   y reconcilia cada cita contra su estado actual.
 * - Los JOBS no están aquí sino en `RecordatorioPlanificacionModule`, que
 *   solo importa `AppModule`: así este módulo se puede cargar en una e2e sin
 *   `ScheduleModule` ni `Latidos`. Necesita `ConfigModule` (global) y la
 *   `DataSource` de TypeORM.
 *
 * Reglas de dependencia (ADR-13 §1): ningún módulo de negocio importa este;
 * solo `AppModule` y su hermano de planificación. Lee `citas`, `pacientes`,
 * `usuarios` y `tenants` por `LectorCitas` (SQL de solo lectura), sin
 * importar sus módulos. Exporta solo lo que usa el job de respaldo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecordatorioOrmEntity,
      ConfiguracionRecordatorioOrmEntity,
      SupresionCorreoOrmEntity,
    ]),
    // TransactionRunner y RegistroSuscriptores (ADR-12 §4).
    SharedModule,
  ],
  providers: [
    {
      // Incluye los métodos de BARRIDO GLOBAL (ADR-12 §6): solo para los
      // jobs y el webhook, nunca para una ruta autenticada por tenant.
      provide: RecordatorioRepository,
      useClass: TypeOrmRecordatorioRepository,
    },
    {
      provide: ConfiguracionRecordatorioRepository,
      useClass: TypeOrmConfiguracionRecordatorioRepository,
    },
    {
      provide: SupresionCorreoRepository,
      useClass: TypeOrmSupresionCorreoRepository,
    },
    {
      provide: LectorCitas,
      useClass: SqlLectorCitas,
    },
    {
      // Caso de uso sin Nest (ADR-02): se arma con fábrica.
      provide: ReconciliarRecordatoriosService,
      useFactory: (
        recordatorios: RecordatorioRepository,
        configuraciones: ConfiguracionRecordatorioRepository,
        lector: LectorCitas,
        config: ConfigService<Entorno, true>,
      ) =>
        new ReconciliarRecordatoriosService(
          recordatorios,
          configuraciones,
          lector,
          leerOpcionesRecordatorios(config),
        ),
      inject: [
        RecordatorioRepository,
        ConfiguracionRecordatorioRepository,
        LectorCitas,
        ConfigService,
      ],
    },
    {
      provide: SuscriptorRecordatorios,
      useFactory: (reconciliacion: ReconciliarRecordatoriosService) =>
        new SuscriptorRecordatorios(reconciliacion),
      inject: [ReconciliarRecordatoriosService],
    },
    {
      // BARRIDO GLOBAL (ADR-12 §6): solo lo invoca el planificador.
      provide: ReconciliacionRespaldoService,
      useFactory: (
        transacciones: TransactionRunner,
        lector: LectorCitas,
        reconciliacion: ReconciliarRecordatoriosService,
        config: ConfigService<Entorno, true>,
      ) =>
        new ReconciliacionRespaldoService(
          transacciones,
          lector,
          reconciliacion,
          {
            margenMinimoMin:
              leerOpcionesRecordatorios(config).parametros.margenMinimoMin,
          },
        ),
      inject: [
        TransactionRunner,
        LectorCitas,
        ReconciliarRecordatoriosService,
        ConfigService,
      ],
    },
  ],
  // Para `RecordatorioPlanificacionModule`; nadie más lo necesita.
  exports: [ReconciliacionRespaldoService],
})
export class RecordatorioModule implements OnModuleInit {
  constructor(
    private readonly registro: RegistroSuscriptores,
    private readonly suscriptor: SuscriptorRecordatorios,
  ) {}

  /** Antes de `onApplicationBootstrap`: el primer tick del despachador ya lo ve. */
  onModuleInit(): void {
    this.registro.registrar(this.suscriptor);
  }
}
