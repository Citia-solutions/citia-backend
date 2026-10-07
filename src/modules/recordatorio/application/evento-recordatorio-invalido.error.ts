/**
 * Un hecho que escucha `SuscriptorRecordatorios` llegó sin un dato que
 * necesita (p. ej. `citaId` en el payload). El despachador lo registra como
 * `SuscriptorRecordatorios:EventoRecordatorioInvalidoError` y lo reintenta
 * hasta la carta muerta, que alerta (ADR-12 §3): un hecho mal formado es un
 * error de programación y tiene que verse.
 *
 * El mensaje nombra el campo, nunca su valor.
 */
export class EventoRecordatorioInvalidoError extends Error {
  constructor(
    readonly nombreEvento: string,
    readonly campo: string,
  ) {
    super(
      `El hecho ${nombreEvento} no trae "${campo}" válido; no se puede reconciliar`,
    );
    this.name = 'EventoRecordatorioInvalidoError';
  }
}
