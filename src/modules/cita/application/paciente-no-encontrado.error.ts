// Error de aplicacion: el pacienteId indicado no existe dentro del tenant del
// usuario autenticado. Sirve tambien como barrera de aislamiento multi-tenant:
// un paciente de otro tenant se comporta como inexistente.
export class PacienteNoEncontradoError extends Error {
  constructor(pacienteId: string) {
    super(`No existe un paciente con id "${pacienteId}" en este tenant`);
    this.name = 'PacienteNoEncontradoError';
  }
}
