import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThanOrEqual, Repository } from 'typeorm';

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
    return this.toDomain(orm);
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
    };
    if (domain.id !== undefined) orm.id = domain.id;
    return orm;
  }
}
