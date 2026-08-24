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

  // Resuelve la identidad del paciente dentro del tenant (ADR-09 §3).
  // El `rut` debe llegar YA normalizado: la comparacion es exacta.
  abstract buscarPorRut(
    rut: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente | null>;
}
