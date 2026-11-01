/**
 * Respuesta de `GET /api/organizacion/suscripcion` (US-10, ADR-15 §3, P4).
 * Lectura de lo que hay en `tenants`: no hay tabla de suscripciones ni dinero
 * en la v1.
 */
export class SuscripcionDto {
  /** Código interno del plan (`tenants.plan`); hoy `'free'`. */
  plan: string;
  /** Nombre legible (Q18; provisional "Plan piloto"). */
  planNombre: string;
  /** "Sin cobro durante el piloto", o `null` si el plan no tiene texto. */
  descripcion: string | null;
  /** Alta de la organización (`tenants.creado_en`). */
  altaEn: Date;
  /** Siempre `null` en la v1. */
  renovacionEn: Date | null;
  /** Siempre `null` en la v1. */
  metodoPago: string | null;

  constructor(datos: SuscripcionDto) {
    Object.assign(this, datos);
  }
}
