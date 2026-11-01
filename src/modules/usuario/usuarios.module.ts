import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import { SharedModule } from '../../shared/shared.module';
import { FirmaJwtModule } from '../auth/firma-jwt.module';
import { TenantModule } from '../tenant/tenant.module';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { CambiarContrasenaService } from './application/cambiar-contrasena.service';
import { PerfilService } from './application/perfil.service';
import { UsuariosService } from './application/usuarios.service';
import { EmisorSesion } from './domain/emisor-sesion';
import { IUsuarioRepository } from './domain/usuario.repository';
import { TypeOrmUsuarioRepository } from './infrastructure/persistence/typeorm-usuario.repository';
import { UsuarioOrmEntity } from './infrastructure/persistence/usuario.orm-entity';
import { PerfilController } from './presentation/perfil.controller';
import { UsuariosController } from './presentation/usuarios.controller';

/**
 * Usuarios: registro público (`POST /api/usuarios`) y la cuenta del usuario de
 * la sesión (US-10: `GET`/`PATCH /api/usuarios/me` y
 * `PUT /api/usuarios/me/contrasena`).
 *
 * Importa `FirmaJwtModule` (y NO `AuthModule`, que importa este) para el
 * puerto `EmisorSesion`: el cambio de contraseña firma el token nuevo de la
 * sesión actual sin ciclo (ADR-15 §6, opción D3). `JwtAuthGuard` no tiene
 * dependencias y la estrategia `jwt` la registra `AuthModule` en passport.
 * Consecuencia: armar este módulo exige `JWT_SECRET` en el entorno.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UsuarioOrmEntity]),
    TenantModule,
    SharedModule,
    FirmaJwtModule,
  ],
  controllers: [UsuariosController, PerfilController],
  providers: [
    {
      provide: UsuariosService,
      useFactory: (
        ur: IUsuarioRepository,
        tr: ITenantRepository,
        tx: TransactionRunner,
      ) => new UsuariosService(ur, tr, tx),
      inject: [IUsuarioRepository, ITenantRepository, TransactionRunner],
    },
    {
      provide: PerfilService,
      useFactory: (
        ur: IUsuarioRepository,
        tr: ITenantRepository,
        tx: TransactionRunner,
      ) => new PerfilService(ur, tr, tx),
      inject: [IUsuarioRepository, ITenantRepository, TransactionRunner],
    },
    {
      provide: CambiarContrasenaService,
      useFactory: (
        ur: IUsuarioRepository,
        tx: TransactionRunner,
        emisor: EmisorSesion,
      ) => new CambiarContrasenaService(ur, tx, emisor),
      inject: [IUsuarioRepository, TransactionRunner, EmisorSesion],
    },
    {
      provide: IUsuarioRepository,
      useClass: TypeOrmUsuarioRepository,
    },
  ],
  exports: [IUsuarioRepository],
})
export class UsuariosModule {}
