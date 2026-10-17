/**
 * El enlace es válido, pero la acción pedida no está entre las
 * `accionesPermitidas` del paciente en este momento (p. ej. confirmar una
 * cita ya confirmada, o confirmar con una petición de otra hora abierta).
 *
 * El controller la traduce al 409 uniforme del portal ("Esta acción ya no
 * está disponible"). Sin ids ni estado en el mensaje.
 */
export class AccionNoDisponibleError extends Error {
  constructor() {
    super('Esta acción ya no está disponible');
    this.name = 'AccionNoDisponibleError';
  }
}
