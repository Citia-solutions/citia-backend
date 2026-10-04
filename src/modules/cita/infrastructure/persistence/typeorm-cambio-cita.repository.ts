import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { CambioCita } from '../../domain/cambio-cita.entity';
import { CambioCitaRepository } from '../../domain/cambio-cita.repository';
import { CambioCitaOrmEntity } from './cambio-cita.orm-entity';

@Injectable()
export class TypeOrmCambioCitaRepository extends CambioCitaRepository {
  constructor(
    @InjectRepository(CambioCitaOrmEntity)
    private readonly repo: Repository<CambioCitaOrmEntity>,
  ) {
    super();
  }

  private repoFor(tx?: TransactionContext): Repository<CambioCitaOrmEntity> {
    return tx
      ? (tx as EntityManager).getRepository(CambioCitaOrmEntity)
      : this.repo;
  }

  async registrar(
    cambio: CambioCita,
    tx?: TransactionContext,
  ): Promise<CambioCita> {
    const orm = await this.repoFor(tx).save(this.toPersistence(cambio));
    return this.toDomain(orm);
  }

  async historialDeCita(
    citaId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<CambioCita[]> {
    const filas = await this.repoFor(tx).find({
      where: { citaId, tenantId },
      order: { ocurridoEn: 'ASC' },
    });
    return filas.map((orm) => this.toDomain(orm));
  }

  private toDomain(orm: CambioCitaOrmEntity): CambioCita {
    const cambio = CambioCita.registrar({
      citaId: orm.citaId,
      tenantId: orm.tenantId,
      tipo: orm.tipo,
      estadoAnterior: orm.estadoAnterior,
      estadoNuevo: orm.estadoNuevo,
      inicioAnterior: orm.inicioAnterior,
      inicioNuevo: orm.inicioNuevo,
      motivo: orm.motivo,
      actorTipo: orm.actorTipo,
      actorId: orm.actorId,
    });
    cambio.id = orm.id;
    cambio.ocurridoEn = orm.ocurridoEn;
    return cambio;
  }

  private toPersistence(domain: CambioCita): Partial<CambioCitaOrmEntity> {
    return {
      citaId: domain.citaId,
      tenantId: domain.tenantId,
      tipo: domain.tipo,
      estadoAnterior: domain.estadoAnterior,
      estadoNuevo: domain.estadoNuevo,
      inicioAnterior: domain.inicioAnterior,
      inicioNuevo: domain.inicioNuevo,
      motivo: domain.motivo,
      actorTipo: domain.actorTipo,
      actorId: domain.actorId,
    };
  }
}
