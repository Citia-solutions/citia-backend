import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { CambioContactoPaciente, Paciente } from '../../domain/paciente.entity';
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

  async buscarPorIds(
    ids: readonly string[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente[]> {
    // IN () no es SQL valido: sin ids no hay nada que buscar.
    if (ids.length === 0) return [];
    const filas = await this.repoFor(tx).find({
      where: { id: In([...ids]), tenantId },
    });
    return filas.map((orm) => this.toDomain(orm));
  }

  async actualizarContacto(
    id: string,
    tenantId: string,
    cambio: CambioContactoPaciente,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const valores: Partial<PacienteOrmEntity> = {};
    if (cambio.telefono !== undefined) valores.telefono = cambio.telefono;
    if (cambio.correo !== undefined) valores.correo = cambio.correo;

    // UPDATE sin SET no es SQL valido. El dominio no deja llegar un cambio
    // vacio; si llegara, se responde solo si la fila existe.
    if (Object.keys(valores).length === 0) {
      return (await this.buscarPorId(id, tenantId, tx)) !== null;
    }

    // UPDATE ... WHERE id AND tenant_id: el aislamiento vive en la escritura.
    // TypeORM actualiza `actualizado_en` (@UpdateDateColumn) por su cuenta.
    const resultado = await this.repoFor(tx).update({ id, tenantId }, valores);
    return (resultado.affected ?? 0) > 0;
  }

  async completarCorreoSiVacio(
    id: string,
    tenantId: string,
    correo: string,
    tx?: TransactionContext,
  ): Promise<boolean> {
    // La condicion va en el WHERE, no en un SELECT previo: con dos
    // transacciones a la vez, la segunda espera el bloqueo de la fila, vuelve
    // a evaluar el WHERE contra la version confirmada y no escribe nada.
    const resultado = await this.repoFor(tx)
      .createQueryBuilder()
      .update(PacienteOrmEntity)
      .set({ correo })
      .where('id = :id', { id })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere("(correo IS NULL OR btrim(correo) = '')")
      .execute();
    return (resultado.affected ?? 0) > 0;
  }

  private toDomain(orm: PacienteOrmEntity): Paciente {
    return Paciente.reconstituir({
      id: orm.id,
      rut: orm.rut,
      nombre: orm.nombre,
      telefono: orm.telefono,
      correo: orm.correo,
      consentimiento: orm.consentimiento,
      tenantId: orm.tenantId,
    });
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
