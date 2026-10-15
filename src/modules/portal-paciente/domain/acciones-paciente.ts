import { Cita } from '../../cita/domain/cita.entity';

/**
 * Lo que el PACIENTE puede hacer desde el enlace de su cita (contrato de la
 * Fase 3 §3.4). Vocabulario propio del portal, distinto del de
 * `Cita.accionesPermitidas()` (que es el del profesional).
 */
export type AccionPaciente = 'confirmar' | 'cancelar' | 'pedirOtraHora';

/** Orden estable de la respuesta (el cliente puede comparar). */
export const ACCIONES_PACIENTE: readonly AccionPaciente[] = [
  'confirmar',
  'cancelar',
  'pedirOtraHora',
];

/**
 * Acciones permitidas al paciente sobre `cita` en `ahora`. Función pura: el
 * portal la evalúa DENTRO de la transacción de cada acción, con la cita ya
 * bloqueada, y responde 409 si la acción pedida no está.
 *
 *  - Nada si `ahora` ya no es anterior al `inicio` vigente (si se reagendó,
 *    manda la hora nueva).
 *  - `confirmar`: la cita se puede confirmar (`pendiente`) y no hay una
 *    petición de otra hora abierta (R6).
 *  - `cancelar`: la cita se puede cancelar (vigente), haya o no petición.
 *  - `pedirOtraHora`: la cita se puede reagendar (vigente) y no hay ya una
 *    petición abierta (R5, R6).
 *
 * Las guardas de estado salen de `Cita.accionesPermitidas()`, la ÚNICA fuente
 * del grafo (ADR-04 §1): aquí solo se suman las reglas del paciente (la
 * petición abierta y el `inicio`).
 */
export function accionesPermitidasPaciente(
  cita: Pick<Cita, 'inicio' | 'accionesPermitidas'>,
  haySolicitudOtraHoraAbierta: boolean,
  ahora: Date,
): AccionPaciente[] {
  if (!(ahora.getTime() < cita.inicio.getTime())) return [];

  const delGrafo = cita.accionesPermitidas();
  const permitidas = new Set<AccionPaciente>();

  if (delGrafo.includes('confirmar') && !haySolicitudOtraHoraAbierta) {
    permitidas.add('confirmar');
  }
  if (delGrafo.includes('cancelar')) {
    permitidas.add('cancelar');
  }
  // Pedir otra hora es pedir que se REAGENDE: mismo requisito de estado.
  if (delGrafo.includes('reagendar') && !haySolicitudOtraHoraAbierta) {
    permitidas.add('pedirOtraHora');
  }

  return ACCIONES_PACIENTE.filter((accion) => permitidas.has(accion));
}
