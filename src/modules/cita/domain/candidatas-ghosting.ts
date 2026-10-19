import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Cita } from './cita.entity';

/**
 * Los dos instantes de la regla G1 (DT-11) para un tick del job. Los calcula
 * quien llama, una vez por tick: el adaptador no lee relojes ni zonas.
 */
export interface CriterioCierreGhosting {
  /**
   * 00:00 de HOY en la zona de la clínica (APP_TZ), como instante UTC
   * (condición 1): entran las citas con `inicio < limite`, es decir, las del
   * día que ya terminó.
   */
  limite: Date;
  /**
   * Corte de G1 (DT-11, 2026-10-17T03:22:00Z): entran solo las citas con
   * `inicio > corte`, y el recordatorio tuvo que salir desde el corte (desde
   * ahí lleva el enlace del paciente).
   */
  corte: Date;
}

/** Lo que mira el modo apagado del job: cuántas cerraría y la más antigua. */
export interface ConteoCandidatasGhosting {
  candidatas: number;
  /** El `inicio` más antiguo entre las candidatas, o `null` si no hay. */
  masAntigua: Date | null;
}

/**
 * Puerto de lectura y reclamo del job G1 (US-07.01, H6).
 *
 * Una cita es candidata si cumple las tres condiciones de G1 (DT-11) con la
 * precisión H10 del plan, en UNA consulta:
 *  1. está `pendiente` y el día de su `inicio` ya terminó en la zona de la
 *     clínica (`corte < inicio < limite`);
 *  2. tuvo un recordatorio `enviado` o `entregado` por un proveedor REAL (no
 *     `registro`, DT-40), enviado desde el corte y para su hora VIGENTE
 *     (`recordatorios.inicio_cita = citas.inicio`);
 *  3. no tiene una petición de otra hora `recibida` (una rechazada no la
 *     protege: es G1 tal como se aprobó).
 *
 * **Barrido GLOBAL** (ADR-12 §6): sin filtro de tenant; cada cita reclamada
 * trae el suyo. Solo lo usa el job, nunca una ruta autenticada.
 */
export abstract class CandidatasGhosting {
  /**
   * La candidata más antigua (por `inicio`, luego `id`) que no esté en
   * `excluir` (las que ya fallaron en este tick), BLOQUEADA en `tx` con
   * `FOR NO KEY UPDATE … SKIP LOCKED` (nunca `FOR UPDATE`, regla del
   * módulo), o `null` si no queda ninguna. Con varias réplicas, cada una
   * reclama citas distintas.
   *
   * `tx` es OBLIGATORIO: un bloqueo fuera de transacción no protege nada.
   */
  abstract reclamarSiguiente(
    criterio: CriterioCierreGhosting,
    excluir: readonly string[],
    tx: TransactionContext,
  ): Promise<Cita | null>;

  /**
   * Modo apagado: cuántas citas cerraría el job y el `inicio` más antiguo.
   * Misma regla que `reclamarSiguiente`, sin bloqueo ni escritura.
   */
  abstract contar(
    criterio: CriterioCierreGhosting,
    tx?: TransactionContext,
  ): Promise<ConteoCandidatasGhosting>;
}
