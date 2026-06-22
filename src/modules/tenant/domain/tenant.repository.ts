import { Tenant } from './tenant.entity';

export abstract class ITenantRepository {
  abstract guardar(tenant: Partial<Tenant>): Promise<Tenant>;
  abstract findById(id: string): Promise<Tenant | null>;
}
