import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Usuario } from '../../domain/usuario.entity';
import { IUsuarioRepository } from '../../domain/usuario.repository';
import { UsuarioOrmEntity } from './usuario.orm-entity';

@Injectable()
export class TypeOrmUsuarioRepository extends IUsuarioRepository {
  constructor(
    @InjectRepository(UsuarioOrmEntity)
    private readonly repo: Repository<UsuarioOrmEntity>,
  ) {
    super();
  }

  async findByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<Usuario | null> {
    const orm = await this.repo.findOne({ where: { email, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async guardar(usuario: Partial<Usuario>): Promise<Usuario> {
    const orm = await this.repo.save(this.toPersistence(usuario));
    return this.toDomain(orm);
  }

  private toDomain(orm: UsuarioOrmEntity): Usuario {
    const usuario = new Usuario();
    usuario.id = orm.id;
    usuario.email = orm.email;
    usuario.passwordHash = orm.passwordHash;
    usuario.nombreCompleto = orm.nombreCompleto;
    usuario.rol = orm.rol;
    usuario.tenantId = orm.tenantId;
    usuario.creadoEn = orm.creadoEn;
    usuario.actualizadoEn = orm.actualizadoEn;
    return usuario;
  }

  private toPersistence(domain: Partial<Usuario>): Partial<UsuarioOrmEntity> {
    const orm: Partial<UsuarioOrmEntity> = {};
    if (domain.id !== undefined) orm.id = domain.id;
    if (domain.email !== undefined) orm.email = domain.email;
    if (domain.passwordHash !== undefined)
      orm.passwordHash = domain.passwordHash;
    if (domain.nombreCompleto !== undefined)
      orm.nombreCompleto = domain.nombreCompleto;
    if (domain.rol !== undefined) orm.rol = domain.rol;
    if (domain.tenantId !== undefined) orm.tenantId = domain.tenantId;
    return orm;
  }
}
