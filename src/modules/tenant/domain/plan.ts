/**
 * Catálogo de planes (US-10, ADR-15 §3, T7). Sin tabla: el código del plan
 * vive en `tenants.plan` (`VARCHAR`, por defecto `'free'`) y aquí se le pone
 * nombre legible. Función pura.
 */

/** El plan de todas las organizaciones durante el piloto. */
export const PLAN_PILOTO = 'free';

export interface DescripcionPlan {
  /** Nombre legible para la pantalla de suscripción. */
  nombre: string;
  /** Texto de apoyo, o `null` si el plan no tiene. */
  descripcion: string | null;
}

/**
 * `free` → "Plan piloto": nombre PROVISIONAL hasta que se responda Q18
 * (cambiarlo es esta línea).
 */
const CATALOGO: ReadonlyMap<string, DescripcionPlan> = new Map([
  [
    PLAN_PILOTO,
    { nombre: 'Plan piloto', descripcion: 'Sin cobro durante el piloto' },
  ],
]);

/**
 * Nombre legible y descripción de un plan. Un código desconocido no falla: se
 * muestra el código tal cual, sin descripción.
 */
export function describirPlan(codigo: string): DescripcionPlan {
  const conocido = CATALOGO.get(codigo);
  return conocido ? { ...conocido } : { nombre: codigo, descripcion: null };
}
