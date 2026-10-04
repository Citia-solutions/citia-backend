/**
 * La cita no existe en el tenant del token (o es de otro): la ruta de estado
 * de recordatorios responde 404 sin distinguir (ADR-13 §17).
 */
export class CitaDeRecordatoriosNoEncontradaError extends Error {
  constructor(readonly citaId: string) {
    super(`Cita ${citaId} no encontrada`);
    this.name = 'CitaDeRecordatoriosNoEncontradaError';
  }
}
