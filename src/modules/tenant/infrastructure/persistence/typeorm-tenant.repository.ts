import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Tenant } from '../../domain/tenant.entity';
import { ITenantRepository } from '../../domain/tenant.repository';
import { TenantOrmEntity } from './tenant.orm-entity';

@Injectable()
export class TypeOrmTenantRepository extends ITenantRepository {
  constructor(
    @InjectRepository(TenantOrmEntity)
    private readonly repo: Repository<TenantOrmEntity>,
  ) {
    super();
  }

  async guardar(tenant: Partial<Tenant>): Promise<Tenant> {
    const orm = await this.repo.save(this.toPersistence(tenant));
    return this.toDomain(orm);
  }

  async findById(id: string): Promise<Tenant | null> {
    const orm = await this.repo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  private toDomain(orm: TenantOrmEntity): Tenant {
    const tenant = new Tenant();
    tenant.id = orm.id;
    tenant.nombre = orm.nombre;
    tenant.tipo = orm.tipo;
    tenant.plan = orm.plan;
    tenant.creadoEn = orm.creadoEn;
    return tenant;
  }

  private toPersistence(domain: Partial<Tenant>): Partial<TenantOrmEntity> {
    const orm: Partial<TenantOrmEntity> = {};
    if (domain.id !== undefined) orm.id = domain.id;
    if (domain.nombre !== undefined) orm.nombre = domain.nombre;
    if (domain.tipo !== undefined) orm.tipo = domain.tipo;
    if (domain.plan !== undefined) orm.plan = domain.plan;
    return orm;
  }
}
