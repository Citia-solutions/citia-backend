import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
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

  private repoFor(tx?: TransactionContext): Repository<TenantOrmEntity> {
    return tx
      ? (tx as EntityManager).getRepository(TenantOrmEntity)
      : this.repo;
  }

  async guardar(
    tenant: Partial<Tenant>,
    tx?: TransactionContext,
  ): Promise<Tenant> {
    const orm = await this.repoFor(tx).save(this.toPersistence(tenant));
    return this.toDomain(orm);
  }

  async findById(id: string, tx?: TransactionContext): Promise<Tenant | null> {
    const orm = await this.repoFor(tx).findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async findBySlug(
    slug: string,
    tx?: TransactionContext,
  ): Promise<Tenant | null> {
    const orm = await this.repoFor(tx).findOne({ where: { slug } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  private toDomain(orm: TenantOrmEntity): Tenant {
    const tenant = new Tenant();
    tenant.id = orm.id;
    tenant.nombre = orm.nombre;
    tenant.slug = orm.slug;
    tenant.tipo = orm.tipo;
    tenant.plan = orm.plan;
    tenant.creadoEn = orm.creadoEn;
    return tenant;
  }

  private toPersistence(domain: Partial<Tenant>): Partial<TenantOrmEntity> {
    const orm: Partial<TenantOrmEntity> = {};
    if (domain.id !== undefined) orm.id = domain.id;
    if (domain.nombre !== undefined) orm.nombre = domain.nombre;
    if (domain.slug !== undefined) orm.slug = domain.slug;
    if (domain.tipo !== undefined) orm.tipo = domain.tipo;
    if (domain.plan !== undefined) orm.plan = domain.plan;
    return orm;
  }
}
