/**
 * Se intentó aceptar una solicitud `nueva` sin `duracionMin` o sin
 * `tipoConsulta`. Desde la Fase 3 los dos son opcionales en
 * `AceptarSolicitudDto` (una de reagendamiento solo mueve la cita y los
 * ignora), pero una `nueva` crea una cita y los necesita. El controller lo
 * traduce a 400.
 */
export class DatosAceptacionIncompletosError extends Error {
  constructor() {
    super(
      'Para aceptar una solicitud nueva, duracionMin y tipoConsulta son obligatorios',
    );
    this.name = 'DatosAceptacionIncompletosError';
  }
}
