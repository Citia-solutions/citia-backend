import { Module } from '@nestjs/common';

import { TransactionRunner } from './application/transaction-runner';
import { TypeOrmTransactionRunner } from './infrastructure/typeorm-transaction-runner';

@Module({
  providers: [
    {
      provide: TransactionRunner,
      useClass: TypeOrmTransactionRunner,
    },
  ],
  exports: [TransactionRunner],
})
export class SharedModule {}
