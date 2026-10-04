/**
 * Error de dominio: se intento crear un paciente (o cambiar su correo) sin un
 * correo. Desde la Fase 2 el correo es obligatorio en toda escritura nueva,
 * porque sin el no hay recordatorios (ADR-13 §14). Las filas viejas con NULL
 * siguen siendo validas al reconstituirlas. El controller lo traduce a 400.
 */
export class CorreoPacienteRequeridoError extends Error {
  constructor() {
    super('El correo del paciente es obligatorio');
    this.name = 'CorreoPacienteRequeridoError';
  }
}
