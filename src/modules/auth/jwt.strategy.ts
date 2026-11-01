import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { VerificarSesionService } from './application/verificar-sesion.service';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

/**
 * Estrategia passport-jwt.
 *
 * - Extrae el token del header `Authorization: Bearer <token>`.
 * - Verifica la firma con `JWT_SECRET` y el vencimiento (`exp`).
 * - Despues, en `validate`, comprueba que la sesion siga vigente (US-10,
 *   ADR-15 §5): consulta la base en CADA peticion autenticada (una columna por
 *   clave primaria, sin cache) con `VerificarSesionService`. Si el usuario ya
 *   no existe en su organizacion o el token es anterior a su corte de
 *   sesiones (cambio de contraseña), 401: el mismo de un token vencido.
 * - El valor retornado por `validate` se inyecta en `req.user`.
 *
 * Registrada una sola vez (en `AuthModule`): cubre todas las rutas con
 * `JwtAuthGuard` sin tocar ningun controller.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly verificarSesion: VerificarSesionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const sesion = await this.verificarSesion.verificar(
      payload.sub,
      payload.tenantId,
      payload.iat,
    );
    if (!sesion.vigente) {
      // Solo ids y el motivo: nunca el token ni el correo.
      this.logger.log({
        evento: 'auth.sesion_cortada',
        usuarioId: payload.sub,
        tenantId: payload.tenantId,
        motivo: sesion.motivo,
      });
      throw new UnauthorizedException();
    }
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      rol: payload.rol,
    };
  }
}
