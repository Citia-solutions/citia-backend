import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Paciente } from './paciente.entity';

export abstract class PacienteRepository {
  abstract guardar(
    paciente: Partial<Paciente>,
    tx?: TransactionContext,
  ): Promise<Paciente>;

  abstract buscarPorId(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente | null>;
}
