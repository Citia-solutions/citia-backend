import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { TenantModule } from '../tenant/tenant.module';
import { IUsuarioRepository } from '../usuario/domain/usuario.repository';
import { UsuariosModule } from '../usuario/usuarios.module';
import { AuthService } from './application/auth.service';
import { VerificarSesionService } from './application/verificar-sesion.service';
import { ITokenSigner } from './domain/token-signer';
import { FirmaJwtModule } from './firma-jwt.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './presentation/auth.controller';

/**
 * Autenticacion: login (`POST /api/auth/login`) y la plataforma JWT.
 *
 *   - `FirmaJwtModule` (importado y REEXPORTADO): el `JwtModule` configurado
 *     (`JWT_SECRET` + `JWT_EXPIRES_IN`), `ITokenSigner` y `EmisorSesion`. Es el
 *     unico lugar donde se registra el `JwtModule` (ADR-15 §6); quien
 *     importaba `AuthModule` por el `JwtService` lo sigue recibiendo.
 *   - `JwtStrategy` (passport-jwt), registrada una sola vez aqui, y
 *     `JwtAuthGuard` reutilizable en cualquier modulo.
 *   - Corte de sesiones (US-10, ADR-15 §5): la estrategia consulta
 *     `VerificarSesionService` en cada peticion autenticada; un usuario
 *     inexistente o un token anterior a `usuarios.sesiones_validas_desde`
 *     (cambio de contraseña) recibe 401.
 *
 * Dependencias, sin ciclo: `AuthModule → UsuariosModule → FirmaJwtModule` y
 * `AuthModule → FirmaJwtModule`. `FirmaJwtModule` no importa ningun modulo de
 * negocio, y `UsuariosModule` nunca importa `AuthModule`: para firmar el token
 * nuevo del cambio de contraseña usa el puerto `EmisorSesion`.
 *
 * NO redefinir `JwtModule` en otro lado: importar `FirmaJwtModule` (o este).
 */
@Module({
  imports: [PassportModule, FirmaJwtModule, TenantModule, UsuariosModule],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    {
      provide: VerificarSesionService,
      useFactory: (ur: IUsuarioRepository) => new VerificarSesionService(ur),
      inject: [IUsuarioRepository],
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
  exports: [FirmaJwtModule, PassportModule, JwtAuthGuard],
})
export class AuthModule {}
