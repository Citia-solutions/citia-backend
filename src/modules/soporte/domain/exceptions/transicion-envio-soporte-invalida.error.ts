/**
 * Error de programación: se intentó mover el envío de un mensaje a soporte que
 * ya no está `pendiente` (`enviado` y `fallido` son finales). Nunca llega a
 * una ruta: el job lo trata como un error propio (se revierte y se registra
 * como fallo, si la fila sigue pendiente). Solo lleva el estado, nunca el
 * texto del mensaje.
 */
export class TransicionEnvioSoporteInvalidaError extends Error {
  constructor(
    readonly transicion: string,
    readonly estado: string,
  ) {
    super(
      `Mensaje a soporte: no se puede aplicar ${transicion} desde el estado ${estado} (solo desde pendiente)`,
    );
    this.name = 'TransicionEnvioSoporteInvalidaError';
  }
}
