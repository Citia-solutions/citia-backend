import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  ActorCambio,
  CambioCita,
  TipoCambio,
} from '../../domain/cambio-cita.entity';
import {
  CambioCitaRepository,
  UltimoCambio,
} from '../../domain/cambio-cita.repository';
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

  async ultimosCambiosPorTipo(
    citaId: string,
    tenantId: string,
    tipos: readonly TipoCambio[],
    tx?: TransactionContext,
  ): Promise<Partial<Record<TipoCambio, UltimoCambio>>> {
    if (tipos.length === 0) return {};
    // DISTINCT ON: una fila por tipo, la de `ocurrido_en` más reciente (el
    // `id` solo desempata de forma estable). La comparación va por texto: el
    // nombre del tipo enum difiere entre la migración y `synchronize`.
    const filas = await this.repoFor(tx).query<
      { tipo: TipoCambio; actorTipo: ActorCambio; ocurridoEn: Date }[]
    >(
      `SELECT DISTINCT ON ("tipo")
              "tipo",
              "actor_tipo"  AS "actorTipo",
              "ocurrido_en" AS "ocurridoEn"
         FROM "cambios_cita"
        WHERE "cita_id" = $1
          AND "tenant_id" = $2
          AND "tipo"::text = ANY($3::text[])
        ORDER BY "tipo", "ocurrido_en" DESC, "id" DESC`,
      [citaId, tenantId, [...tipos]],
    );

    const resultado: Partial<Record<TipoCambio, UltimoCambio>> = {};
    for (const fila of filas) {
      resultado[fila.tipo] = {
        actor: fila.actorTipo,
        ocurridoEn: fila.ocurridoEn,
      };
    }
    return resultado;
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
      // Tal cual está en la base: vacío sigue vacío (H12).
      pedidoPor: orm.pedidoPor,
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
      pedidoPor: domain.pedidoPor,
    };
  }
}
