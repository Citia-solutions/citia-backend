import { TransactionContext } from '../../../shared/application/transaction-runner';
import { CambioCita } from './cambio-cita.entity';

export abstract class CambioCitaRepository {
  // Append-only: solo se agrega. No hay actualizar ni borrar a proposito.
  abstract registrar(
    cambio: CambioCita,
    tx?: TransactionContext,
  ): Promise<CambioCita>;

  // Historial completo de una cita, del mas antiguo al mas reciente.
  abstract historialDeCita(
    citaId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<CambioCita[]>;
}
