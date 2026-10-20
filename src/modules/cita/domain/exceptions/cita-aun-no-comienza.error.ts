/**
 * Error de dominio (US-07.01, H2): se intentó marcar la asistencia o la
 * inasistencia de una cita antes de su hora de inicio.
 *
 * La petición está bien formada (no es un 400) y la cita existe (no es un
 * 404): en este momento la cita no admite la operación, igual que una
 * transición ilegal. Por eso el controller lo traduce a **409**, la misma
 * familia de respuesta que `TransicionEstadoInvalidaError`.
 *
 * El mensaje es fijo y no lleva ids, horas ni datos del paciente.
 */
export class CitaAunNoComienzaError extends Error {
  constructor() {
    super(
      'La cita todavía no comienza: la asistencia y la inasistencia se marcan desde su hora de inicio',
    );
    this.name = 'CitaAunNoComienzaError';
  }
}
