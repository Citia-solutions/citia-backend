import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Cita } from './cita.entity';

export abstract class CitaRepository {
  abstract guardar(cita: Cita, tx?: TransactionContext): Promise<Cita>;

  // Devuelve las citas del profesional (usuarioId) en el tenant, cuyo `inicio`
  // cae dentro del día `dia`, en orden cronológico ascendente por `inicio`.
  // El filtrado por tenantId + usuarioId es requisito de seguridad (aislamiento
  // multi-tenant y por profesional). `dia` se interpreta como la fecha del día
  // a consultar; el repositorio calcula el rango [00:00, día+1 00:00).
  abstract buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
    tx?: TransactionContext,
  ): Promise<Cita[]>;
}
