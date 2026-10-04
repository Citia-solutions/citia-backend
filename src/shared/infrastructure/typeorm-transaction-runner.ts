import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { TransactionRunner } from '../application/transaction-runner';

@Injectable()
export class TypeOrmTransactionRunner extends TransactionRunner {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async run<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => work(manager));
  }
}
