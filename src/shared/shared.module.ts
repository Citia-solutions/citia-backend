import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventosSalidaRepository } from './application/eventos-salida.repository';
import { PublicadorEventos } from './application/publicador-eventos';
import { TransactionRunner } from './application/transaction-runner';
import { PublicadorEventosEnProceso } from './infrastructure/publicador-eventos-en-proceso';
import { EventoSalidaOrmEntity } from './infrastructure/salida/evento-salida.orm-entity';
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
      // Transitorio: solo log. Se cambia por `PublicadorEventosEnSalida`
      // (outbox, ADR-12 §2) sin tocar `application`.
      provide: PublicadorEventos,
      useClass: PublicadorEventosEnProceso,
    },
    {
      // Outbox (ADR-12). NO se exporta: sus métodos de BARRIDO GLOBAL solo
      // los usan el publicador, el despachador y la purga (ADR-12 §6), no los
      // módulos de negocio.
      provide: EventosSalidaRepository,
      useClass: TypeOrmEventosSalidaRepository,
    },
  ],
  exports: [TransactionRunner, PublicadorEventos],
})
export class SharedModule {}
