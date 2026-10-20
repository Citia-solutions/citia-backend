import { rangoDelDiaEnZona } from '../../../shared/domain/timezone';

/**
 * Corte de la regla G1 (DT-11, US-07.01 H6): 2026-10-17 03:22 UTC, cuando
 * los recordatorios empezaron a llevar el enlace del paciente (Fase 3 en
 * producción). El job solo cierra citas con `inicio` POSTERIOR al corte y con
 * un recordatorio enviado DESDE el corte: antes, el paciente no tenía cómo
 * avisar desde el correo.
 */
export const CORTE_GHOSTING = new Date('2026-10-17T03:22:00.000Z');

/**
 * Condición 1 de G1, "el día de su inicio ya terminó en la zona de la
 * clínica" (ADR-07): las 00:00 de HOY en `tz`, como instante UTC. Una cita es
 * candidata si `inicio < limite`.
 *
 * Ejemplo: una cita del martes a las 10:00 de Chile entra desde el miércoles a
 * las 00:00 de Chile. El cálculo es el de `shared/domain/timezone.ts`, que
 * resuelve los días de 23 y de 25 horas; así la consulta compara una columna
 * indexada contra un parámetro, sin `AT TIME ZONE` en SQL.
 *
 * Función pura: el reloj y la zona los pone quien llama, una vez por tick.
 */
export function limiteCierreGhosting(ahora: Date, tz: string): Date {
  return rangoDelDiaEnZona(ahora, tz).desde;
}
