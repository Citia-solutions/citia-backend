import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  EntityManager,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { Cita } from '../../domain/cita.entity';
import { CitaRepository } from '../../domain/cita.repository';
import { CitaOrmEntity } from './cita.orm-entity';

// Adaptador de persistencia para el modulo cita.
// Conecta la entidad de dominio con la base de datos via TypeORM.
@Injectable()
export class TypeOrmCitaRepository extends CitaRepository {
  constructor(
    @InjectRepository(CitaOrmEntity)
    private readonly repo: Repository<CitaOrmEntity>,
  ) {
    super();
  }

  private repoFor(tx?: TransactionContext): Repository<CitaOrmEntity> {
    return tx ? (tx as EntityManager).getRepository(CitaOrmEntity) : this.repo;
  }

  async guardar(cita: Cita, tx?: TransactionContext): Promise<Cita> {
    const orm = await this.repoFor(tx).save(this.toPersistence(cita));
    return this.toDomain(orm);
  }

  async buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
    tx?: TransactionContext,
  ): Promise<Cita[]> {
    const inicioDia = new Date(dia);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);

    // Rango semiabierto [00:00, día+1 00:00) para que las 00:00 del día
    // siguiente NO cuenten como del día actual.
    const filas = await this.repoFor(tx).find({
      where: {
        tenantId,
        usuarioId,
        inicio: And(MoreThanOrEqual(inicioDia), LessThan(finDia)),
      },
      order: { inicio: 'ASC' },
    });

    return filas.map((orm) => this.toDomain(orm));
  }

  private toDomain(orm: CitaOrmEntity): Cita {
    return Cita.reconstituir({
      id: orm.id,
      inicio: orm.inicio,
      duracionMin: orm.duracionMin,
      tipoConsulta: orm.tipoConsulta,
      estado: orm.estado,
      tenantId: orm.tenantId,
      pacienteId: orm.pacienteId,
      usuarioId: orm.usuarioId,
      creadoEn: orm.creadoEn,
      actualizadoEn: orm.actualizadoEn,
    });
  }

  private toPersistence(domain: Cita): Partial<CitaOrmEntity> {
    const orm: Partial<CitaOrmEntity> = {};
    if (domain.id !== undefined) orm.id = domain.id;
    orm.inicio = domain.inicio;
    orm.duracionMin = domain.duracionMin;
    orm.tipoConsulta = domain.tipoConsulta;
    orm.estado = domain.estado;
    orm.tenantId = domain.tenantId;
    orm.pacienteId = domain.pacienteId;
    orm.usuarioId = domain.usuarioId;
    return orm;
  }
}
