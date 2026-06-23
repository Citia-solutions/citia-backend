import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Usuario } from './usuario.entity';

export abstract class IUsuarioRepository {
  abstract findByEmailAndTenant(
    email: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Usuario | null>;
  abstract guardar(
    usuario: Partial<Usuario>,
    tx?: TransactionContext,
  ): Promise<Usuario>;
}
