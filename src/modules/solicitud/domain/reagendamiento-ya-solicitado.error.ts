/**
 * Ya hay una solicitud de otra hora `recibida` para esa cita de origen
 * (Fase 3, R5: como mucho UNA, índice único parcial
 * `uq_solicitud_reagendamiento_recibida`).
 *
 * La lanza el adaptador de persistencia al traducir el 23505 de Postgres, así
 * la capa de aplicación no conoce TypeORM. El portal del paciente la responde
 * con el 409 uniforme ("Esta acción ya no está disponible"). El mensaje no
 * lleva ids: no hay nada que revelar.
 */
export class ReagendamientoYaSolicitadoError extends Error {
  constructor() {
    super('Ya hay una solicitud de otra hora abierta para esta cita');
    this.name = 'ReagendamientoYaSolicitadoError';
  }
}
