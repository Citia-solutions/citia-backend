/**
 * Error de dominio: un mensaje a soporte no cumple sus reglas (US-10, P7). Es
 * la red de seguridad del DTO; la ruta lo traduce a 400. El mensaje del error
 * NUNCA repite el texto recibido (puede traer datos de pacientes).
 */
export class MensajeSoporteInvalidoError extends Error {
  constructor(
    readonly campo: 'mensaje' | 'categoria',
    detalle: string,
  ) {
    super(`Mensaje a soporte inválido (${campo}): ${detalle}`);
    this.name = 'MensajeSoporteInvalidoError';
  }
}
