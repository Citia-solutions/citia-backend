import { ContrasenaNoValidaError } from './exceptions/contrasena-no-valida.error';

/**
 * Política de la contraseña nueva (US-10, ADR-15 §4, paso 4). Función pura.
 *
 *  - Al menos `LARGO_MINIMO_CONTRASENA` caracteres, como el registro.
 *  - Como mucho `BYTES_MAXIMOS_CONTRASENA` bytes en UTF-8: bcrypt ignora lo
 *    que pase de 72 bytes, y sin el tope alguien creería tener una contraseña
 *    más larga de la que tiene. Con tildes, `ñ` o emojis caben menos de 72
 *    caracteres (una `ñ` son 2 bytes).
 *
 * El mínimo cuenta caracteres (puntos de código), no unidades UTF-16; el
 * máximo, bytes con `TextEncoder` (lo mismo que recibe bcrypt). El DTO solo
 * comprueba el mínimo (class-validator no cuenta bytes): el tope es de aquí.
 */

export const LARGO_MINIMO_CONTRASENA = 8;
export const BYTES_MAXIMOS_CONTRASENA = 72;

/** Lanza `ContrasenaNoValidaError` si `texto` no cumple la política. */
export function validarContrasenaNueva(texto: string): void {
  if (
    typeof texto !== 'string' ||
    Array.from(texto).length < LARGO_MINIMO_CONTRASENA
  ) {
    throw new ContrasenaNoValidaError(
      `La nueva contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`,
    );
  }
  if (new TextEncoder().encode(texto).length > BYTES_MAXIMOS_CONTRASENA) {
    throw new ContrasenaNoValidaError(
      `La nueva contraseña es demasiado larga: como máximo ${BYTES_MAXIMOS_CONTRASENA} bytes (${BYTES_MAXIMOS_CONTRASENA} letras sin tildes; menos si lleva tildes, ñ o emojis)`,
    );
  }
}
