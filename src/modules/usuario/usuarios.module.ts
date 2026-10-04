import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import { SharedModule } from '../../shared/shared.module';
import { TenantModule } from '../tenant/tenant.module';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { UsuariosService } from './application/usuarios.service';
import { IUsuarioRepository } from './domain/usuario.repository';
import { TypeOrmUsuarioRepository } from './infrastructure/persistence/typeorm-usuario.repository';
import { UsuarioOrmEntity } from './infrastructure/persistence/usuario.orm-entity';
import { UsuariosController } from './presentation/usuarios.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsuarioOrmEntity]),
    TenantModule,
    SharedModule,
  ],
  controllers: [UsuariosController],
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
      provide: IUsuarioRepository,
      useClass: TypeOrmUsuarioRepository,
    },
  ],
  exports: [IUsuarioRepository],
})
export class UsuariosModule {}
