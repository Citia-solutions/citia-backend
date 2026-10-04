import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { TenantModule } from '../tenant/tenant.module';
import { IUsuarioRepository } from '../usuario/domain/usuario.repository';
import { UsuariosModule } from '../usuario/usuarios.module';
import { AuthService } from './application/auth.service';
import { ITokenSigner } from './domain/token-signer';
import { JwtTokenSigner } from './infrastructure/jwt-token-signer';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './presentation/auth.controller';

/**
 * Modulo de infraestructura de autenticacion (plataforma transversal).
 *
 * Provee y exporta la plataforma JWT lista para usar:
 *   - JwtModule configurado (JWT_SECRET + expiresIn desde ConfigService).
 *   - JwtStrategy (passport-jwt) ya registrada.
 *   - JwtAuthGuard reutilizable.
 *
 * FRONTERA con api-agent:
 *   - api-agent debe IMPORTAR este AuthModule en su modulo de login
 *     (p.ej. en un futuro modulo de login o ampliando este mismo).
 *   - Al importar AuthModule, `JwtService` queda disponible para inyectar
 *     en el auth.service y firmar el token en el login.
 *   - NO redefinir JwtModule en otro lado: reusar este (config centralizada).
 *
 * Este modulo NO contiene controller ni logica de login a proposito.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') ?? '1d',
        } as JwtSignOptions,
      }),
    }),
    TenantModule,
    UsuariosModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    {
      provide: ITokenSigner,
      useClass: JwtTokenSigner,
    },
    {
      provide: AuthService,
      useFactory: (
        ur: IUsuarioRepository,
        tr: ITenantRepository,
        signer: ITokenSigner,
      ) => new AuthService(ur, tr, signer),
      inject: [IUsuarioRepository, ITenantRepository, ITokenSigner],
    },
  ],
  exports: [JwtModule, PassportModule, JwtAuthGuard],
})
export class AuthModule {}
