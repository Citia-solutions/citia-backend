import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '../tenant/tenant.module';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { UsuariosService } from './application/usuarios.service';
import { IUsuarioRepository } from './domain/usuario.repository';
import { TypeOrmUsuarioRepository } from './infrastructure/persistence/typeorm-usuario.repository';
import { UsuarioOrmEntity } from './infrastructure/persistence/usuario.orm-entity';
import { UsuariosController } from './presentation/usuarios.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UsuarioOrmEntity]), TenantModule],
  controllers: [UsuariosController],
  providers: [
    {
      provide: UsuariosService,
      useFactory: (ur: IUsuarioRepository, tr: ITenantRepository) =>
        new UsuariosService(ur, tr),
      inject: [IUsuarioRepository, ITenantRepository],
    },
    {
      provide: IUsuarioRepository,
      useClass: TypeOrmUsuarioRepository,
    },
  ],
})
export class UsuariosModule {}
