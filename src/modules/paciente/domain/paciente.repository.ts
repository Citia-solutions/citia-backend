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

  // Carga en lote los pacientes del tenant cuyos ids estan en `ids` (p. ej.
  // para poner nombre a las citas de la agenda sin N+1). Los ids de otro
  // tenant o inexistentes simplemente no vuelven: quien llama no debe asumir
  // ni orden ni que haya uno por id. Con `ids` vacio devuelve [] sin consultar.
  abstract buscarPorIds(
    ids: readonly string[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente[]>;
}
