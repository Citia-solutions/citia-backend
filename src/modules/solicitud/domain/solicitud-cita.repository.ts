import { TransactionContext } from '../../../shared/application/transaction-runner';
import { EstadoSolicitud, SolicitudCita } from './solicitud-cita.entity';

/** Filtros opcionales de la bandeja, además del estado. */
export interface FiltrosListadoSolicitudes {
  /** Solo las solicitudes de reagendamiento de esa cita (voucher, R4). */
  citaOrigenId?: string;
}

export abstract class SolicitudCitaRepository {
  abstract guardar(
    solicitud: SolicitudCita,
    tx?: TransactionContext,
  ): Promise<SolicitudCita>;

  /**
   * Busca una solicitud `nueva` sin resolver de ese RUT en la organización,
   * recibida DESPUÉS de `desde`.
   *
   * La ventana de tiempo es deliberada (ADR-09 §8 regla 3): la regla
   * anti-spam es "una solicitud abierta a la vez", no "una para siempre". Al
   * acotarla, una bandeja desatendida deja de bloquear al paciente por sí sola,
   * sin necesitar un proceso de caducidad.
   *
   * Solo cuenta `tipo = 'nueva'` (Fase 3, R5): pedir otra hora para una cita
   * existente no bloquea pedir una hora nueva por el formulario público.
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
   * La solicitud de reagendamiento `recibida` de esa cita de origen, o `null`
   * (Fase 3, R5/R6). Como mucho hay una (índice único parcial). Sin bloqueo:
   * para LEER (portal del paciente, con la cita ya bloqueada).
   */
  abstract buscarReagendamientoAbierto(
    citaOrigenId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<SolicitudCita | null>;

  /**
   * Igual que `buscarReagendamientoAbierto`, pero con `SELECT … FOR UPDATE`:
   * para MODIFICARLA (descartarla desde el suscriptor del outbox). Si otra
   * transacción la resolvió mientras se esperaba el bloqueo, ya no cumple
   * `estado = 'recibida'` y devuelve `null`.
   *
   * `tx` es OBLIGATORIO.
   */
  abstract buscarReagendamientoAbiertoParaActualizar(
    citaOrigenId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null>;

  /**
   * Bandeja de la organización filtrada por estado (y opcionalmente por cita
   * de origen), con un tope de `limite` filas. Orden:
   *  - `recibida`: `recibidaEn ASC` (la que más espera, primero).
   *  - `aceptada` / `rechazada` / `descartada`: `resueltaEn DESC` (la resuelta
   *    más reciente, primero).
   * No aplica la ventana anti-spam: las solicitudes viejas no se ocultan.
   */
  abstract listarPorEstado(
    tenantId: string,
    estado: EstadoSolicitud,
    limite: number,
    filtros?: FiltrosListadoSolicitudes,
    tx?: TransactionContext,
  ): Promise<SolicitudCita[]>;
}
