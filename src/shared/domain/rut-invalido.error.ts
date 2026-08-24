/**
 * El RUT no supera la validacion de digito verificador (modulo 11).
 * Error de dominio puro: el controller lo traduce a 400.
 */
export class RutInvalidoError extends Error {
  constructor(rut: string) {
    super(`El RUT "${rut}" no es valido`);
    this.name = 'RutInvalidoError';
  }
}
