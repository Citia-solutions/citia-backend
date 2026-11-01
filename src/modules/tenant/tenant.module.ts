import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConsultarSuscripcionService } from './application/consultar-suscripcion.service';
import { ITenantRepository } from './domain/tenant.repository';
import { TenantOrmEntity } from './infrastructure/persistence/tenant.orm-entity';
import { TypeOrmTenantRepository } from './infrastructure/persistence/typeorm-tenant.repository';
import { SuscripcionController } from './presentation/suscripcion.controller';

/**
 * Organizaciones (tenants): el puerto `ITenantRepository` (lo usan `auth`,
 * `usuario`, `solicitud`…) y la suscripción en lectura
 * (`GET /api/organizacion/suscripcion`, US-10, ADR-15 §3).
 *
 * No importa ningún módulo de negocio (lo importan `AuthModule` y
 * `UsuariosModule`): `SuscripcionController` usa `JwtAuthGuard`, que no tiene
 * dependencias, sin importar `AuthModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TenantOrmEntity])],
  controllers: [SuscripcionController],
  providers: [
    {
      provide: ITenantRepository,
      useClass: TypeOrmTenantRepository,
    },
    {
      provide: ConsultarSuscripcionService,
      useFactory: (tr: ITenantRepository) =>
        new ConsultarSuscripcionService(tr),
      inject: [ITenantRepository],
    },
  ],
  exports: [ITenantRepository],
})
export class TenantModule {}
