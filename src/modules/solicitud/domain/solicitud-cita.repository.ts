import { TransactionContext } from '../../../shared/application/transaction-runner';
import { SolicitudCita } from './solicitud-cita.entity';

export abstract class SolicitudCitaRepository {
  abstract guardar(
    solicitud: SolicitudCita,
    tx?: TransactionContext,
  ): Promise<SolicitudCita>;

  /**
   * Busca una solicitud sin resolver de ese RUT en la organización, recibida
   * DESPUÉS de `desde`.
   *
   * La ventana de tiempo es deliberada (ADR-09 §8 regla 3): la regla
   * anti-spam es "una solicitud abierta a la vez", no "una para siempre". Al
   * acotarla, una bandeja desatendida deja de bloquear al paciente por sí sola,
   * sin necesitar un proceso de caducidad.
   *
   * El `rut` debe llegar YA normalizado.
   */
  abstract buscarAbiertaPorRut(
    rut: string,
    tenantId: string,
    desde: Date,
    tx?: TransactionContext,
  ): Promise<SolicitudCita | null>;
}
