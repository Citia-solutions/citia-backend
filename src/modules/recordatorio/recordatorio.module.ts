import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PublicadorEventos } from '../../shared/application/publicador-eventos';
import { TransactionRunner } from '../../shared/application/transaction-runner';
import type { Entorno } from '../../shared/infrastructure/config/entorno';
import { RegistroSuscriptores } from '../../shared/infrastructure/salida/registro-suscriptores';
import { SharedModule } from '../../shared/shared.module';
import { BitacoraRecordatorios } from './application/bitacora-recordatorios';
import { ConfiguracionRecordatoriosService } from './application/configuracion-recordatorios.service';
import { ConsultarRecordatoriosService } from './application/consultar-recordatorios.service';
import { EnviarRecordatoriosService } from './application/enviar-recordatorios.service';
import { ProcesarWebhookEntregaService } from './application/procesar-webhook-entrega.service';
import { ReconciliacionRespaldoService } from './application/reconciliacion-respaldo.service';
import { ReconciliarRecordatoriosService } from './application/reconciliar-recordatorios.service';
import { SuscriptorRecordatorios } from './application/suscriptor-recordatorios';
import { TasaFalloRecordatoriosService } from './application/tasa-fallo-recordatorios.service';
import { CanalMensajeria } from './domain/canal-mensajeria';
import { ConfiguracionRecordatorioRepository } from './domain/configuracion-recordatorio.repository';
import { LectorCitas } from './domain/lector-citas';
import { RecordatorioRepository } from './domain/recordatorio.repository';
import { SupresionCorreoRepository } from './domain/supresion-correo.repository';
import {
  leerOpcionesEnvio,
  leerOpcionesRecordatorios,
  leerOpcionesTasaFallo,
} from './infrastructure/config/opciones-recordatorios';
import { crearCanalMensajeria } from './infrastructure/mensajeria/crear-canal-mensajeria';
import { VerificadorWebhookResend } from './infrastructure/mensajeria/verificador-webhook-resend';
import { BitacoraRecordatoriosLogger } from './infrastructure/observabilidad/bitacora-recordatorios-logger';
import { ConfiguracionRecordatorioOrmEntity } from './infrastructure/persistence/configuracion-recordatorio.orm-entity';
import { RecordatorioOrmEntity } from './infrastructure/persistence/recordatorio.orm-entity';
import { SqlLectorCitas } from './infrastructure/persistence/sql-lector-citas';
import { SupresionCorreoOrmEntity } from './infrastructure/persistence/supresion-correo.orm-entity';
import { TypeOrmConfiguracionRecordatorioRepository } from './infrastructure/persistence/typeorm-configuracion-recordatorio.repository';
import { TypeOrmRecordatorioRepository } from './infrastructure/persistence/typeorm-recordatorio.repository';
import { TypeOrmSupresionCorreoRepository } from './infrastructure/persistence/typeorm-supresion-correo.repository';
import { ConfiguracionRecordatoriosController } from './presentation/configuracion-recordatorios.controller';
import { RecordatoriosCitaController } from './presentation/recordatorios-cita.controller';
import { WebhooksResendController } from './presentation/webhooks-resend.controller';

/**
 * Recordatorios al paciente (ADR-13). Contexto local: `CLAUDE.md` de esta
 * carpeta.
 *
 * - Persistencia (paso 7): las tres tablas y los puertos con sus adaptadores.
 * - Reconciliación (paso 9): `SuscriptorRecordatorios` se registra en el
 *   outbox al iniciar (`onModuleInit`, antes de que el planificador arranque).
 * - Envío (paso 10): `EnviarRecordatoriosService` + `CanalMensajeria`
 *   (`registro` o `resend` según `MENSAJERIA_ADAPTADOR`).
 * - Webhook (paso 11) y rutas de configuración y estado (paso 12).
 * - Los JOBS no están aquí sino en `RecordatorioPlanificacionModule`, que
 *   solo importa `AppModule`: así este módulo se puede cargar en una e2e sin
 *   `ScheduleModule` ni `Latidos`. Necesita `ConfigModule` (global) y la
 *   `DataSource` de TypeORM.
 *
 * Reglas de dependencia (ADR-13 §1): ningún módulo de negocio importa este;
 * solo `AppModule` y su hermano de planificación. Lee `citas`, `pacientes`,
 * `usuarios` y `tenants` por `LectorCitas` (SQL de solo lectura), sin
 * importar sus módulos. Exporta solo lo que usan los jobs.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecordatorioOrmEntity,
      ConfiguracionRecordatorioOrmEntity,
      SupresionCorreoOrmEntity,
    ]),
    // TransactionRunner, PublicadorEventos y RegistroSuscriptores (ADR-12).
    SharedModule,
  ],
  controllers: [
    ConfiguracionRecordatoriosController,
    RecordatoriosCitaController,
    WebhooksResendController,
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
      provide: BitacoraRecordatorios,
      useFactory: () => new BitacoraRecordatoriosLogger(),
    },
    {
      // `MENSAJERIA_ADAPTADOR` (ADR-13 §13): `registro` (no envía) o `resend`.
      provide: CanalMensajeria,
      useFactory: (config: ConfigService<Entorno, true>) =>
        crearCanalMensajeria({
          adaptador: config.get('MENSAJERIA_ADAPTADOR', { infer: true }),
          apiKey: config.get('RESEND_API_KEY', { infer: true }),
          remitente: config.get('CORREO_REMITENTE', { infer: true }),
          produccion: config.get('NODE_ENV', { infer: true }) === 'production',
        }),
      inject: [ConfigService],
    },
    {
      provide: VerificadorWebhookResend,
      useFactory: (config: ConfigService<Entorno, true>) =>
        new VerificadorWebhookResend(
          config.get('RESEND_WEBHOOK_SECRET', { infer: true }),
        ),
      inject: [ConfigService],
    },
    {
      // Casos de uso sin Nest (ADR-02): se arman con fábrica.
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
    {
      // BARRIDO GLOBAL (ADR-12 §6): solo lo invoca el planificador.
      provide: EnviarRecordatoriosService,
      useFactory: (
        transacciones: TransactionRunner,
        recordatorios: RecordatorioRepository,
        configuraciones: ConfiguracionRecordatorioRepository,
        supresiones: SupresionCorreoRepository,
        lector: LectorCitas,
        canal: CanalMensajeria,
        bitacora: BitacoraRecordatorios,
        config: ConfigService<Entorno, true>,
      ) =>
        new EnviarRecordatoriosService(
          {
            transacciones,
            recordatorios,
            configuraciones,
            supresiones,
            lector,
            canal,
            bitacora,
          },
          leerOpcionesEnvio(config),
        ),
      inject: [
        TransactionRunner,
        RecordatorioRepository,
        ConfiguracionRecordatorioRepository,
        SupresionCorreoRepository,
        LectorCitas,
        CanalMensajeria,
        BitacoraRecordatorios,
        ConfigService,
      ],
    },
    {
      // BARRIDO GLOBAL (ADR-12 §6): solo lo invoca el planificador.
      provide: TasaFalloRecordatoriosService,
      useFactory: (
        transacciones: TransactionRunner,
        recordatorios: RecordatorioRepository,
        bitacora: BitacoraRecordatorios,
        config: ConfigService<Entorno, true>,
      ) =>
        new TasaFalloRecordatoriosService(
          transacciones,
          recordatorios,
          bitacora,
          leerOpcionesTasaFallo(config),
        ),
      inject: [
        TransactionRunner,
        RecordatorioRepository,
        BitacoraRecordatorios,
        ConfigService,
      ],
    },
    {
      // Sin filtro de tenant (ADR-12 §6): el tenant sale de la fila.
      provide: ProcesarWebhookEntregaService,
      useFactory: (
        transacciones: TransactionRunner,
        recordatorios: RecordatorioRepository,
        supresiones: SupresionCorreoRepository,
        bitacora: BitacoraRecordatorios,
      ) =>
        new ProcesarWebhookEntregaService(
          transacciones,
          recordatorios,
          supresiones,
          bitacora,
        ),
      inject: [
        TransactionRunner,
        RecordatorioRepository,
        SupresionCorreoRepository,
        BitacoraRecordatorios,
      ],
    },
    {
      provide: ConfiguracionRecordatoriosService,
      useFactory: (
        transacciones: TransactionRunner,
        configuraciones: ConfiguracionRecordatorioRepository,
        eventos: PublicadorEventos,
        config: ConfigService<Entorno, true>,
      ) =>
        new ConfiguracionRecordatoriosService(
          transacciones,
          configuraciones,
          eventos,
          leerOpcionesRecordatorios(config).antelacionesPredeterminadasMin,
        ),
      inject: [
        TransactionRunner,
        ConfiguracionRecordatorioRepository,
        PublicadorEventos,
        ConfigService,
      ],
    },
    {
      provide: ConsultarRecordatoriosService,
      useFactory: (
        transacciones: TransactionRunner,
        lector: LectorCitas,
        recordatorios: RecordatorioRepository,
      ) =>
        new ConsultarRecordatoriosService(transacciones, lector, recordatorios),
      inject: [TransactionRunner, LectorCitas, RecordatorioRepository],
    },
  ],
  // Para `RecordatorioPlanificacionModule`; nadie más los necesita.
  exports: [
    ReconciliacionRespaldoService,
    EnviarRecordatoriosService,
    TasaFalloRecordatoriosService,
  ],
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
