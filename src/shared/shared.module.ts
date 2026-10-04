import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventosSalidaRepository } from './application/eventos-salida.repository';
import { PublicadorEventos } from './application/publicador-eventos';
import { TransactionRunner } from './application/transaction-runner';
import { DespachadorEventosSalida } from './infrastructure/salida/despachador-eventos-salida';
import { EventoSalidaOrmEntity } from './infrastructure/salida/evento-salida.orm-entity';
import { PublicadorEventosEnSalida } from './infrastructure/salida/publicador-eventos-en-salida';
import { PurgaEventosSalida } from './infrastructure/salida/purga-eventos-salida';
import { RegistroSuscriptores } from './infrastructure/salida/registro-suscriptores';
import { TypeOrmEventosSalidaRepository } from './infrastructure/salida/typeorm-eventos-salida.repository';
import { TypeOrmTransactionRunner } from './infrastructure/typeorm-transaction-runner';

@Module({
  // Registra `eventos_salida` para `autoLoadEntities` (ADR-12 §1).
  imports: [TypeOrmModule.forFeature([EventoSalidaOrmEntity])],
  providers: [
    {
      provide: TransactionRunner,
      useClass: TypeOrmTransactionRunner,
    },
    {
      // Outbox (ADR-12 §2): el hecho se escribe en `eventos_salida` con la
      // transacción del caso de uso.
      provide: PublicadorEventos,
      useClass: PublicadorEventosEnSalida,
    },
    {
      // Outbox (ADR-12). NO se exporta: sus métodos de BARRIDO GLOBAL solo
      // los usan el publicador, el despachador y la purga (ADR-12 §6), no los
      // módulos de negocio.
      provide: EventosSalidaRepository,
      useClass: TypeOrmEventosSalidaRepository,
    },
    {
      // Donde los módulos de negocio registran sus suscriptores (ADR-12 §4).
      // Una sola instancia por aplicación.
      provide: RegistroSuscriptores,
      useFactory: () => new RegistroSuscriptores(),
    },
    {
      // Los usa SOLO el planificador (`PlanificacionModule`). Sin
      // configuración propia: lote, política y retención llegan por
      // parámetro, así este módulo sigue funcionando en las e2e parciales.
      provide: DespachadorEventosSalida,
      useFactory: (
        tx: TransactionRunner,
        salida: EventosSalidaRepository,
        registro: RegistroSuscriptores,
      ) => new DespachadorEventosSalida(tx, salida, registro),
      inject: [
        TransactionRunner,
        EventosSalidaRepository,
        RegistroSuscriptores,
      ],
    },
    {
      provide: PurgaEventosSalida,
      useFactory: (tx: TransactionRunner, salida: EventosSalidaRepository) =>
        new PurgaEventosSalida(tx, salida),
      inject: [TransactionRunner, EventosSalidaRepository],
    },
  ],
  exports: [
    TransactionRunner,
    PublicadorEventos,
    RegistroSuscriptores,
    // Para `PlanificacionModule`; los módulos de negocio no los necesitan.
    DespachadorEventosSalida,
    PurgaEventosSalida,
  ],
})
export class SharedModule {}
