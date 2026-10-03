// Error de aplicacion: no existe un paciente con ese id dentro del tenant del
// usuario autenticado. Es tambien la barrera de aislamiento multi-tenant: un
// paciente de otro tenant se comporta como inexistente.
//
// Vive en el modulo paciente y lo reutiliza cita. Cada controller decide el
// codigo: en `PATCH /pacientes/:id` el paciente es el recurso de la URL (404);
// en `POST /citas` es una referencia del cuerpo (400).
export class PacienteNoEncontradoError extends Error {
  constructor(pacienteId: string) {
    super(`No existe un paciente con id "${pacienteId}" en este tenant`);
    this.name = 'PacienteNoEncontradoError';
  }
}
