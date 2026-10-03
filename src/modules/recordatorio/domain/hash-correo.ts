// Hash de una dirección para `supresiones_correo` (ADR-13 §2): SHA-256 del
// correo normalizado, en hex. Guardar el hash y no la dirección basta para
// comparar, y no deja otra copia del dato personal.
//
// Pura y determinista. Usa `node:crypto` (biblioteca estándar del runtime, no
// un framework): ADR-02 prohíbe `typeorm`, `@nestjs/*` y `class-validator` en
// `domain/`, y esto no los toca.
//
// Equivalente en SQL, para revisar o quitar una supresión a mano (deuda
// prevista 5 de ADR-13; vale para direcciones sin espacios exóticos):
//   encode(sha256(convert_to(lower(btrim('Ana@Mail.cl')), 'UTF8')), 'hex')
import { createHash } from 'node:crypto';

import { normalizarCorreo } from '../../../shared/domain/correo';

/** Forma de un `correo_hash` válido: 64 caracteres hex en minúsculas. */
export const FORMATO_HASH_CORREO = /^[0-9a-f]{64}$/;

/**
 * `correo_hash` de una dirección. Normaliza con `normalizarCorreo` (sin
 * espacios alrededor, en minúsculas): la misma forma con la que se guarda el
 * correo del paciente, así el hash del webhook y el del paciente coinciden.
 *
 * Lanza con una dirección vacía: quien llama ya debió resolver "sin correo"
 * (política 5) antes de mirar supresiones.
 */
export function calcularHashCorreo(correo: string): string {
  const normalizado = normalizarCorreo(correo);
  if (normalizado.length === 0) {
    throw new RangeError('calcularHashCorreo: el correo está vacío');
  }
  return createHash('sha256').update(normalizado, 'utf8').digest('hex');
}
