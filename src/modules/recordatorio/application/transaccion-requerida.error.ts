/**
 * La reconciliación se llamó sin transacción. Todo el trabajo del módulo va
 * dentro de una (ADR-12 §4 regla 3): el candado consultivo por cita solo dura
 * lo que dura su transacción, y lo escrito debe confirmarse con la marca de
 * entregado del hecho.
 */
export class TransaccionRequeridaError extends Error {
  constructor(operacion: string) {
    super(`${operacion} requiere una transacción (ADR-12 §4)`);
    this.name = 'TransaccionRequeridaError';
  }
}
