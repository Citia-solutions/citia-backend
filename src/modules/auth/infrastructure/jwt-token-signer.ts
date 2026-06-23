import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ITokenSigner } from '../domain/token-signer';
import { JwtPayload } from '../jwt-payload.interface';

/**
 * Adaptador del puerto ITokenSigner basado en el JwtService de NestJS.
 *
 * Reusa el JwtModule ya configurado por AuthModule (secret + expiresIn desde env);
 * NO reconfigura nada.
 */
@Injectable()
export class JwtTokenSigner extends ITokenSigner {
  constructor(private readonly jwtService: JwtService) {
    super();
  }

  sign(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
