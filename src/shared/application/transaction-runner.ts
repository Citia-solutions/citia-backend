// Contexto transaccional opaco: la capa application no conoce TypeORM.
export type TransactionContext = unknown;

export abstract class TransactionRunner {
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
