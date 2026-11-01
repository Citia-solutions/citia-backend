/**
 * Error de dominio: un usuario que no es `ADMINISTRADOR` pidió la suscripción
 * de su organización (US-10, ADR-15 §3, P4). Lo decide el caso de uso con el
 * rol del token (opción G2, sin guard de rol general: DT-02). El controller lo
 * traduce a 403.
 */
export class SoloAdministradorError extends Error {
  constructor() {
    super('Solo el administrador de la organización puede ver la suscripción');
    this.name = 'SoloAdministradorError';
  }
}
