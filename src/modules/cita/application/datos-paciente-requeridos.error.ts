/**
 * Al agendar hay que indicar a quien: o el id de un paciente ya existente, o
 * los datos del paciente para resolverlo/crearlo. No llego ninguno de los dos.
 */
export class DatosPacienteRequeridosError extends Error {
  constructor() {
    super('Debe indicarse pacienteId o los datos del paciente');
    this.name = 'DatosPacienteRequeridosError';
  }
}
