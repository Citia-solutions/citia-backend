import { TransactionContext } from '../../../shared/application/transaction-runner';
import { CambioContactoPaciente, Paciente } from './paciente.entity';

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

  // Escribe SOLO los campos de `cambio` (ya preparados por el dominio) y
  // filtra por tenant en la propia escritura. `false` si no hay fila: el
  // paciente no existe o es de otro tenant (no se distinguen).
  abstract actualizarContacto(
    id: string,
    tenantId: string,
    cambio: CambioContactoPaciente,
    tx?: TransactionContext,
  ): Promise<boolean>;

  // Completa el correo SOLO si el guardado esta vacio (NULL o en blanco), con
  // la condicion en la misma escritura: dos vinculaciones concurrentes por el
  // mismo RUT no se pisan y un correo ya guardado nunca se reemplaza
  // (ADR-13 §14). `true` si escribio.
  abstract completarCorreoSiVacio(
    id: string,
    tenantId: string,
    correo: string,
    tx?: TransactionContext,
  ): Promise<boolean>;
}
