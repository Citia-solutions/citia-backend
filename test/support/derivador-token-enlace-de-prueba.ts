import { createHash, createHmac } from 'node:crypto';

import { DerivadorTokenEnlace } from '../../src/modules/cita/domain/derivador-token-enlace';

/**
 * Doble de `DerivadorTokenEnlace` para los tests de `application/` (que por
 * ADR-02 no pueden importar `infrastructure/`). Misma fórmula que el
 * adaptador real (`HmacDerivadorTokenEnlace`, con su propio spec):
 *
 *   token = base64url(HMAC-SHA256(clave, "enlace-cita:" + citaId + ":" + version))
 *   hash  = sha256(token) en hex
 *
 * Cuenta las llamadas para comprobar que un formato inválido no deriva nada.
 */
export class DerivadorTokenEnlaceDePrueba extends DerivadorTokenEnlace {
  derivaciones = 0;
  hasheos = 0;

  constructor(
    private readonly clave = 'clave-de-prueba-del-enlace-32-caracteres',
  ) {
    super();
  }

  derivar(citaId: string, version: number): string {
    this.derivaciones++;
    return createHmac('sha256', this.clave)
      .update(`enlace-cita:${citaId}:${version}`, 'utf8')
      .digest('base64url');
  }

  hashear(token: string): string {
    this.hasheos++;
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
