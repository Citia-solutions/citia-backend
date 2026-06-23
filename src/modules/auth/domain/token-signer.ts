import { JwtPayload } from '../jwt-payload.interface';

/**
 * Puerto de firma de tokens (hexagonal).
 *
 * La capa application depende de esta abstraccion, no de `@nestjs/jwt`.
 * El adaptador concreto (basado en JwtService) se inyecta desde el modulo.
 */
export abstract class ITokenSigner {
  abstract sign(payload: JwtPayload): string;
}
