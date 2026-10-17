import { createHash, createHmac } from 'node:crypto';

import { DerivadorTokenEnlace } from '../../domain/derivador-token-enlace';

/**
 * Adaptador de `DerivadorTokenEnlace` sobre `node:crypto` (Fase 3, E2):
 *
 *   token = base64url(HMAC-SHA256(clave, "enlace-cita:" + citaId + ":" + version))
 *   hash  = sha256(token) en hex
 *
 * La clave es `ENLACE_CITA_CLAVE` (validada al arrancar en
 * `shared/infrastructure/config/entorno.ts`). Es un secreto: nunca se
 * registra ni aparece en un mensaje de error. El token tampoco.
 */
export class HmacDerivadorTokenEnlace extends DerivadorTokenEnlace {
  constructor(private readonly clave: string) {
    super();
    if (typeof clave !== 'string' || clave.length === 0) {
      throw new Error(
        'HmacDerivadorTokenEnlace: falta la clave del enlace (ENLACE_CITA_CLAVE)',
      );
    }
  }

  derivar(citaId: string, version: number): string {
    // 32 bytes de HMAC → 43 caracteres en base64url (Node no añade relleno).
    return createHmac('sha256', this.clave)
      .update(`enlace-cita:${citaId}:${version}`, 'utf8')
      .digest('base64url');
  }

  hashear(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
