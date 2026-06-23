import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Tenant } from './tenant.entity';

export abstract class ITenantRepository {
  abstract guardar(
    tenant: Partial<Tenant>,
    tx?: TransactionContext,
  ): Promise<Tenant>;
  abstract findById(
    id: string,
    tx?: TransactionContext,
  ): Promise<Tenant | null>;
  abstract findBySlug(
    slug: string,
    tx?: TransactionContext,
  ): Promise<Tenant | null>;
}
