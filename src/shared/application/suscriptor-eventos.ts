import { EventoDominio } from './publicador-eventos';
import { TransactionContext } from './transaction-runner';

/**
 * Un hecho tal como lo recibe un suscriptor: el `EventoDominio` publicado más
 * el `id` de su fila en `eventos_salida` (ADR-12 §1, §4). El `id` sirve para
 * deduplicar o para trazar en los logs.
 */
export type EventoEntregado = EventoDominio & { id: string };

/**
 * Suscriptor de hechos de dominio entregados por el outbox (ADR-12 §4).
 *
 * El despachador lo invoca DENTRO de la transacción que reclamó el hecho, con
 * ese mismo `tx`; al terminar todos los suscriptores, marca el hecho como
 * entregado en esa transacción. Cuatro reglas:
 *
 *  1. **Entrega al menos una vez.** El mismo hecho puede llegar dos veces:
 *     `manejar` debe ser idempotente.
 *  2. **Sin orden garantizado.** No aplicar deltas: releer el estado actual y
 *     reconciliar. El hecho dice QUÉ revisar, no QUÉ hacer.
 *  3. **Solo escribir en la base, con el `tx` recibido.** Así el trabajo y la
 *     marca de entregado son atómicos.
 *  4. **Nada de efectos externos** (correo, HTTP): dejar una fila de trabajo y
 *     que otro proceso la ejecute con sus propios reintentos.
 *
 * Si `manejar` lanza, se revierte TODO (también lo hecho por los demás
 * suscriptores del mismo hecho) y el hecho se reintenta más tarde con espera
 * creciente. El código de error que queda en `eventos_salida.ultimo_error` es
 * `<NombreDeLaClase>:<error.name>`: nunca el mensaje.
 *
 * Los módulos registran sus suscriptores en `RegistroSuscriptores` al iniciar
 * (`onModuleInit`).
 */
export abstract class SuscriptorEventos {
  /** Nombres de los hechos que escucha, p. ej. `['CitaCreada', 'CitaReagendada']`. */
  abstract readonly eventos: readonly string[];

  abstract manejar(
    evento: EventoEntregado,
    tx: TransactionContext,
  ): Promise<void>;
}
