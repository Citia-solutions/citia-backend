import { TransactionContext } from '../../../shared/application/transaction-runner';
import { EnlaceCita } from './enlace-cita.entity';

/**
 * Puerto de persistencia de `enlaces_cita` (Fase 3, contrato §2.1).
 *
 * TODOS los métodos exigen `tx` (el adaptador lanza sin él): el enlace se
 * emite dentro de la transacción del envío del recordatorio y se resuelve o
 * invalida dentro de la transacción de la acción.
 *
 * Orden de bloqueos recomendado (evita leer un enlace ya revocado y los
 * interbloqueos): primero la CITA (`CitaRepository.buscarPorIdParaActualizar`)
 * y después, ya con la cita bloqueada, leer o modificar su enlace. Ver las
 * notas de cada método.
 */
export abstract class EnlaceCitaRepository {
  /**
   * El enlace sin revocar de la cita, o `null`. Como mucho hay uno (índice
   * único parcial). Sin bloqueo de fila: para invalidar, bloquea antes la cita.
   */
  abstract buscarActivoPorCita(
    citaId: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null>;

  /**
   * El enlace con ese `token_hash` (activo O revocado), o `null`. El `hash`
   * debe ser el SHA-256 hex del token: si no tiene ese formato devuelve `null`
   * sin consultar. Sin bloqueo: tras bloquear la cita, vuelve a leerlo para
   * evaluar la validez sobre datos confirmados.
   */
  abstract buscarPorTokenHash(
    hash: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null>;

  /**
   * `INSERT … ON CONFLICT DO NOTHING`. Devuelve `true` si insertó y `false`
   * si chocó con cualquiera de las claves únicas (mismo hash, misma
   * (cita, versión) o ya hay un activo para la cita): en ese caso, relee con
   * `buscarActivoPorCita`. No modifica `enlace` (no le asigna `id`).
   */
  abstract insertarSiNoExiste(
    enlace: EnlaceCita,
    tx: TransactionContext,
  ): Promise<boolean>;

  /** Mayor versión de la cita (activa o revocada), o `null` si nunca tuvo enlace. */
  abstract maxVersion(
    citaId: string,
    tx: TransactionContext,
  ): Promise<number | null>;

  /**
   * Persiste la REVOCACIÓN de un enlace ya existente (`revocado_en`,
   * `motivo_revocacion`, `revocado_por`). La versión y el hash son inmutables:
   * para emitir uno nuevo se usa `insertarSiNoExiste`. Lanza si el enlace no
   * tiene `id` o no existe.
   */
  abstract guardar(
    enlace: EnlaceCita,
    tx: TransactionContext,
  ): Promise<EnlaceCita>;
}
