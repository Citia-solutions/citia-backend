import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

/**
 * Estrategia passport-jwt.
 *
 * - Extrae el token del header `Authorization: Bearer <token>`.
 * - Verifica la firma con `JWT_SECRET`.
 * - El valor retornado por `validate` se inyecta en `req.user`.
 *
 * No consulta la base de datos: confia en los claims del token. Si en el futuro
 * se necesita revocacion/lookup de usuario, hacerlo aqui o en un guard adicional.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      rol: payload.rol,
    };
  }
}
