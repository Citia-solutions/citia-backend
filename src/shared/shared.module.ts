import { Module } from '@nestjs/common';

import { PublicadorEventos } from './application/publicador-eventos';
import { TransactionRunner } from './application/transaction-runner';
import { PublicadorEventosEnProceso } from './infrastructure/publicador-eventos-en-proceso';
import { TypeOrmTransactionRunner } from './infrastructure/typeorm-transaction-runner';

@Module({
  providers: [
    {
      provide: TransactionRunner,
      useClass: TypeOrmTransactionRunner,
    },
    {
      // Fase 1: sin suscriptores. El adaptador se cambia por uno sobre cola
      // cuando entren recordatorios (RF-06), sin tocar `application`.
      provide: PublicadorEventos,
      useClass: PublicadorEventosEnProceso,
    },
  ],
  exports: [TransactionRunner, PublicadorEventos],
})
export class SharedModule {}
