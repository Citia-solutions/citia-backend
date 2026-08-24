import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { Paciente } from '../../domain/paciente.entity';
import { PacienteRepository } from '../../domain/paciente.repository';
import { PacienteOrmEntity } from './paciente.orm-entity';

// Adaptador de persistencia para el modulo paciente.
// Conecta la entidad de dominio con la base de datos via TypeORM.
@Injectable()
export class TypeOrmPacienteRepository extends PacienteRepository {
  constructor(
    @InjectRepository(PacienteOrmEntity)
    private readonly repo: Repository<PacienteOrmEntity>,
  ) {
    super();
  }

  private repoFor(tx?: TransactionContext): Repository<PacienteOrmEntity> {
    return tx
      ? (tx as EntityManager).getRepository(PacienteOrmEntity)
      : this.repo;
  }

  async guardar(
    paciente: Partial<Paciente>,
    tx?: TransactionContext,
  ): Promise<Paciente> {
    const orm = await this.repoFor(tx).save(this.toPersistence(paciente));
    return this.toDomain(orm);
  }

  async buscarPorId(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente | null> {
    const orm = await this.repoFor(tx).findOne({ where: { id, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async buscarPorRut(
    rut: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente | null> {
    const orm = await this.repoFor(tx).findOne({ where: { rut, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  private toDomain(orm: PacienteOrmEntity): Paciente {
    const paciente = new Paciente();
    paciente.id = orm.id;
    paciente.rut = orm.rut;
    paciente.nombre = orm.nombre;
    paciente.telefono = orm.telefono;
    paciente.correo = orm.correo;
    paciente.consentimiento = orm.consentimiento;
    paciente.tenantId = orm.tenantId;
    return paciente;
  }

  private toPersistence(domain: Partial<Paciente>): Partial<PacienteOrmEntity> {
    const orm: Partial<PacienteOrmEntity> = {};
    if (domain.id !== undefined) orm.id = domain.id;
    if (domain.rut !== undefined) orm.rut = domain.rut;
    if (domain.nombre !== undefined) orm.nombre = domain.nombre;
    if (domain.telefono !== undefined) orm.telefono = domain.telefono;
    if (domain.correo !== undefined) orm.correo = domain.correo;
    if (domain.consentimiento !== undefined)
      orm.consentimiento = domain.consentimiento;
    if (domain.tenantId !== undefined) orm.tenantId = domain.tenantId;
    return orm;
  }
}
