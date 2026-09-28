import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  FindOptionsOrder,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../../domain/solicitud-cita.entity';
import { SolicitudCitaRepository } from '../../domain/solicitud-cita.repository';
import { SolicitudCitaOrmEntity } from './solicitud-cita.orm-entity';

@Injectable()
export class TypeOrmSolicitudCitaRepository extends SolicitudCitaRepository {
  constructor(
    @InjectRepository(SolicitudCitaOrmEntity)
    private readonly repo: Repository<SolicitudCitaOrmEntity>,
  ) {
    super();
  }

  private repoFor(tx?: TransactionContext): Repository<SolicitudCitaOrmEntity> {
    return tx
      ? (tx as EntityManager).getRepository(SolicitudCitaOrmEntity)
      : this.repo;
  }

  async guardar(
    solicitud: SolicitudCita,
    tx?: TransactionContext,
  ): Promise<SolicitudCita> {
    const orm = await this.repoFor(tx).save(this.toPersistence(solicitud));
    // En un UPDATE TypeORM no relee @CreateDateColumn: se conserva la del dominio.
    return this.toDomain({
      ...orm,
      recibidaEn: orm.recibidaEn ?? solicitud.recibidaEn,
    });
  }

  async buscarAbiertaPorRut(
    rut: string,
    tenantId: string,
    desde: Date,
    tx?: TransactionContext,
  ): Promise<SolicitudCita | null> {
    const orm = await this.repoFor(tx).findOne({
      where: {
        rut,
        tenantId,
        estado: EstadoSolicitud.RECIBIDA,
        recibidaEn: MoreThanOrEqual(desde),
      },
    });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async buscarPorId(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<SolicitudCita | null> {
    const orm = await this.repoFor(tx).findOne({ where: { id, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null> {
    // `TransactionContext` es `unknown` y admite undefined: sin este chequeo
    // se caería al repositorio por defecto y TypeORM rechazaría el bloqueo con
    // un error menos claro.
    if (!tx) {
      throw new Error(
        'buscarPorIdParaActualizar requiere una transacción (SELECT ... FOR UPDATE)',
      );
    }
    const orm = await this.repoFor(tx).findOne({
      where: { id, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async listarPorEstado(
    tenantId: string,
    estado: EstadoSolicitud,
    limite: number,
    tx?: TransactionContext,
  ): Promise<SolicitudCita[]> {
    // Desempate por `id` para que el orden sea estable entre llamadas.
    const order: FindOptionsOrder<SolicitudCitaOrmEntity> =
      estado === EstadoSolicitud.RECIBIDA
        ? { recibidaEn: 'ASC', id: 'ASC' }
        : {
            // NULLS LAST: en Postgres `DESC` pone los NULL primero por
            // defecto; una resuelta sin marca no debe encabezar la bandeja.
            resueltaEn: { direction: 'DESC', nulls: 'LAST' },
            id: 'ASC',
          };

    const filas = await this.repoFor(tx).find({
      where: { tenantId, estado },
      order,
      take: limite,
    });
    return filas.map((orm) => this.toDomain(orm));
  }

  private toDomain(orm: SolicitudCitaOrmEntity): SolicitudCita {
    return SolicitudCita.reconstituir({
      id: orm.id,
      tenantId: orm.tenantId,
      usuarioId: orm.usuarioId,
      rut: orm.rut,
      nombrePaciente: orm.nombrePaciente,
      telefono: orm.telefono,
      correo: orm.correo,
      motivo: orm.motivo,
      preferenciaHoraria: orm.preferenciaHoraria,
      consentimiento: orm.consentimiento,
      estado: orm.estado,
      citaId: orm.citaId,
      recibidaEn: orm.recibidaEn,
      resueltaEn: orm.resueltaEn,
    });
  }

  private toPersistence(
    domain: SolicitudCita,
  ): Partial<SolicitudCitaOrmEntity> {
    const orm: Partial<SolicitudCitaOrmEntity> = {
      tenantId: domain.tenantId,
      usuarioId: domain.usuarioId,
      rut: domain.rut,
      nombrePaciente: domain.nombrePaciente,
      telefono: domain.telefono,
      correo: domain.correo,
      motivo: domain.motivo,
      preferenciaHoraria: domain.preferenciaHoraria,
      consentimiento: domain.consentimiento,
      estado: domain.estado,
      citaId: domain.citaId,
      resueltaEn: domain.resueltaEn,
    };
    if (domain.id !== undefined) orm.id = domain.id;
    return orm;
  }
}
