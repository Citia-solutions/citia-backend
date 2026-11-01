import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';

import { EmisorSesion } from '../usuario/domain/emisor-sesion';
import { ITokenSigner } from './domain/token-signer';
import { JwtEmisorSesion } from './infrastructure/jwt-emisor-sesion';
import { JwtTokenSigner } from './infrastructure/jwt-token-signer';

/**
 * Firma de JWT (US-10, ADR-15 §6, opción D3): el ÚNICO lugar donde se
 * registra el `JwtModule` (`JWT_SECRET` y `JWT_EXPIRES_IN`, default `1d`).
 *
 * Exporta:
 *   - `JwtModule` (y con él `JwtService`);
 *   - `ITokenSigner` → `JwtTokenSigner` (lo usa el login de `AuthService`);
 *   - `EmisorSesion` → `JwtEmisorSesion` (el puerto de `usuario/domain` con el
 *     que el cambio de contraseña firma el token nuevo de la sesión actual).
 *
 * Lo importan `AuthModule` (que lo reexporta) y `UsuariosModule`. NO importa
 * ningún módulo de negocio: por eso `UsuariosModule` puede importarlo sin
 * ciclo (`AuthModule → UsuariosModule → FirmaJwtModule`, `AuthModule →
 * FirmaJwtModule`). No redefinir `JwtModule` en otro lado.
 *
 * `imports: [ConfigModule]` resuelve `ConfigService` también donde no hay un
 * `ConfigModule.forRoot` global (p. ej. una integración que arma solo
 * `UsuariosModule`): ahí lee `JWT_SECRET` de `process.env`.
 */
@Module({
  imports: [
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
  ],
  providers: [
    {
      provide: ITokenSigner,
      useClass: JwtTokenSigner,
    },
    {
      provide: EmisorSesion,
      useFactory: (signer: ITokenSigner) => new JwtEmisorSesion(signer),
      inject: [ITokenSigner],
    },
  ],
  exports: [JwtModule, ITokenSigner, EmisorSesion],
})
export class FirmaJwtModule {}
