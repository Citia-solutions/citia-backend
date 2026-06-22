import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsuariosService } from './application/usuarios.service';
import { User } from './domain/user.entity';
import { USER_REPOSITORY } from './domain/user.repository';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm-user.repository';
import { UsuariosController } from './presentation/usuarios.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
  ],
})
export class UsuariosModule {}
