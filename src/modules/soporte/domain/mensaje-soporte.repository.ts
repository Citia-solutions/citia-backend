import { TransactionContext } from '../../../shared/application/transaction-runner';
import { MensajeSoporte } from './mensaje-soporte.entity';

/**
 * Puerto de `mensajes_soporte` (US-10, ADR-15 §7).
 *
 * **`tx` obligatorio en todo**: el registro corre en la transacción de la
 * petición (tope + inserción) y el envío en una transacción por mensaje, con
 * la fila bloqueada mientras se llama al proveedor. Sin `tx` el adaptador
 * lanza (un `FOR UPDATE` fuera de una transacción se soltaría al instante).
 */
export abstract class MensajeSoporteRepository {
  /**
   * Inserta un mensaje recién creado (`MensajeSoporte.crear`, `pendiente`) y
   * lo devuelve como quedó en la base: con `id`, `creadoEn` y
   * `proximoIntentoEn` (`now()` de la transacción).
   */
  abstract insertar(
    mensaje: MensajeSoporte,
    tx: TransactionContext,
  ): Promise<MensajeSoporte>;

  /** Mensajes de la organización con `creado_en >= desde` (el tope de 24 h). */
  abstract contarCreadosDesde(
    tenantId: string,
    desde: Date,
    tx: TransactionContext,
  ): Promise<number>;

  /**
   * BARRIDO GLOBAL (ADR-12 §6): el `pendiente` más antiguo por próximo intento
   * con `proximo_intento_en <= ahora`, bloqueado (`FOR UPDATE SKIP LOCKED`), o
   * `null`. Lo que siga usa el `tenantId` de la fila tomada.
   */
  abstract reclamarSiguientePendiente(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<MensajeSoporte | null>;

  /**
   * BARRIDO GLOBAL (ADR-12 §6): bloquea una fila por id (`FOR UPDATE`, sin
   * SKIP LOCKED: si otro proceso la tiene, espera), para registrar un fallo
   * tras revertir. Devuelve la fila en el estado que tenga (el caso de uso
   * mira `estaPendiente()`), o `null` si no existe.
   */
  abstract bloquearPorId(
    id: string,
    tx: TransactionContext,
  ): Promise<MensajeSoporte | null>;

  /**
   * Persiste `estado_envio`, `intentos`, `proximo_intento_en`, `ultimo_error`
   * (truncado a 100), `proveedor`, `proveedor_mensaje_id` y `enviado_en` de un
   * mensaje TOMADO (reclamado o bloqueado en la misma `tx`). Solo escribe si
   * la fila sigue `pendiente` en la base; si no (o no existe), lanza: es un
   * error de programación, nunca se pisa un `enviado` ni un `fallido`.
   */
  abstract guardarEnvio(
    mensaje: MensajeSoporte,
    tx: TransactionContext,
  ): Promise<void>;
}
