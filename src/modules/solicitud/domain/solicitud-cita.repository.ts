import { TransactionContext } from '../../../shared/application/transaction-runner';
import { EstadoSolicitud, SolicitudCita } from './solicitud-cita.entity';

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

  /**
   * Carga una solicitud de la organización. El filtro por `tenantId` es
   * requisito de seguridad: una solicitud de otro tenant es invisible (null),
   * indistinguible de una inexistente.
   */
  abstract buscarPorId(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<SolicitudCita | null>;

  /**
   * Igual que `buscarPorId`, pero bloquea la fila (`SELECT … FOR UPDATE`)
   * hasta que termine la transacción. Serializa aceptar/rechazar concurrentes:
   * el segundo espera, relee el estado ya resuelto y el dominio lo rechaza.
   *
   * `tx` es OBLIGATORIO: un bloqueo fuera de transacción no protege nada.
   */
  abstract buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null>;

  /**
   * Bandeja de la organización filtrada por estado, con un tope de `limite`
   * filas. Orden:
   *  - `recibida`: `recibidaEn ASC` (la que más espera, primero).
   *  - `aceptada` / `rechazada`: `resueltaEn DESC` (la resuelta más reciente,
   *    primero).
   * No aplica la ventana anti-spam: las solicitudes viejas no se ocultan.
   */
  abstract listarPorEstado(
    tenantId: string,
    estado: EstadoSolicitud,
    limite: number,
    tx?: TransactionContext,
  ): Promise<SolicitudCita[]>;
}
