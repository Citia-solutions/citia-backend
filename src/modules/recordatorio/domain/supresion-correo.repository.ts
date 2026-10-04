import { TransactionContext } from '../../../shared/application/transaction-runner';

/** Por qué no se vuelve a escribir a una dirección (ADR-13 §2, §10). */
export enum MotivoSupresion {
  REBOTE = 'rebote',
  QUEJA = 'queja',
}

export interface NuevaSupresion {
  /** `calcularHashCorreo(correo)` de `hash-correo.ts`: 64 hex en minúsculas. */
  correoHash: string;
  motivo: MotivoSupresion;
  /** El recordatorio cuyo webhook la originó, si se conoce. */
  origenRecordatorioId: string | null;
}

/**
 * Puerto de `supresiones_correo` (ADR-13 §2).
 *
 * GLOBAL POR DISEÑO, no por tenant: el remitente es uno solo (Citia) y la
 * reputación ante los proveedores es de toda la plataforma. No es un barrido:
 * se consulta por clave.
 *
 * Trabaja con el HASH, nunca con la dirección: lo calcula quien llama con
 * `calcularHashCorreo` (función pura del dominio, ADR-13 §2: SHA-256 del
 * correo normalizado). El adaptador rechaza cualquier valor que no tenga la
 * forma de un SHA-256 hex, para que una dirección en claro no termine
 * guardada por error.
 *
 * `tx` obligatorio, como el resto de puertos del módulo.
 */
export abstract class SupresionCorreoRepository {
  /** Política 6 de ADR-13 §7 ("No suprimido"). */
  abstract existe(correoHash: string, tx: TransactionContext): Promise<boolean>;

  /**
   * Idempotente: si el hash ya estaba suprimido no cambia nada (gana el primer
   * motivo) y devuelve `false`; `true` si se agregó.
   */
  abstract agregar(
    supresion: NuevaSupresion,
    tx: TransactionContext,
  ): Promise<boolean>;
}
