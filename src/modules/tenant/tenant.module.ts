import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ITenantRepository } from './domain/tenant.repository';
import { TenantOrmEntity } from './infrastructure/persistence/tenant.orm-entity';
import { TypeOrmTenantRepository } from './infrastructure/persistence/typeorm-tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TenantOrmEntity])],
  providers: [
    {
      provide: ITenantRepository,
      useClass: TypeOrmTenantRepository,
    },
  ],
  exports: [ITenantRepository],
})
export class TenantModule {}
