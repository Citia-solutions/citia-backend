/**
 * Un hecho que escucha `SuscriptorSolicitudes` llegó sin un dato que necesita
 * (p. ej. `citaId` en el payload). El despachador lo registra como
 * `SuscriptorSolicitudes:EventoSolicitudInvalidoError` y lo reintenta hasta la
 * carta muerta, que alerta (ADR-12 §3): un hecho mal formado es un error de
 * programación y tiene que verse.
 *
 * El mensaje nombra el campo, nunca su valor.
 */
export class EventoSolicitudInvalidoError extends Error {
  constructor(
    readonly nombreEvento: string,
    readonly campo: string,
  ) {
    super(
      `El hecho ${nombreEvento} no trae "${campo}" válido; no se puede revisar la solicitud de otra hora`,
    );
    this.name = 'EventoSolicitudInvalidoError';
  }
}
