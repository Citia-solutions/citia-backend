import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  FindOptionsOrder,
  FindOptionsWhere,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  EstadoSolicitud,
  SolicitudCita,
  TipoSolicitud,
} from '../../domain/solicitud-cita.entity';
import {
  FiltrosListadoSolicitudes,
  SolicitudCitaRepository,
} from '../../domain/solicitud-cita.repository';
import { ReagendamientoYaSolicitadoError } from '../../domain/reagendamiento-ya-solicitado.error';
import { SolicitudCitaOrmEntity } from './solicitud-cita.orm-entity';

/** Índice único parcial de R5 (migración 1750000014000 y la entidad ORM). */
export const INDICE_REAGENDAMIENTO_RECIBIDA =
  'uq_solicitud_reagendamiento_recibida';

/** SQLSTATE de Postgres para `unique_violation`. */
const VIOLACION_UNICA = '23505';

interface DetalleErrorPostgres {
  code?: unknown;
  constraint?: unknown;
}

/**
 * ¿Es el 23505 del índice de R5? TypeORM copia `code` y `constraint` del
 * error del driver en el `QueryFailedError`; por si acaso se mira también
 * `driverError`.
 */
function esReagendamientoDuplicado(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const propio = error as unknown as DetalleErrorPostgres;
  const driver = (error.driverError ?? {}) as DetalleErrorPostgres;
  const code = propio.code ?? driver.code;
  const constraint = propio.constraint ?? driver.constraint;
  return (
    code === VIOLACION_UNICA && constraint === INDICE_REAGENDAMIENTO_RECIBIDA
  );
}

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
    let orm: SolicitudCitaOrmEntity;
    try {
      orm = await this.repoFor(tx).save(this.toPersistence(solicitud));
    } catch (error) {
      // R5: una segunda de reagendamiento `recibida` para la misma cita. Se
      // traduce aquí para que la aplicación no dependa de TypeORM ni de los
      // códigos de Postgres. Dentro de una transacción, esta queda abortada:
      // quien llama debe dejar que el error la revierta.
      if (esReagendamientoDuplicado(error)) {
        throw new ReagendamientoYaSolicitadoError();
      }
      throw error;
    }
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
        // R5: pedir otra hora para una cita no cuenta para la regla anti-spam.
        tipo: TipoSolicitud.NUEVA,
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

  async buscarReagendamientoAbierto(
    citaOrigenId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<SolicitudCita | null> {
    const orm = await this.repoFor(tx).findOne({
      where: TypeOrmSolicitudCitaRepository.reagendamientoAbierto(
        citaOrigenId,
        tenantId,
      ),
    });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async buscarReagendamientoAbiertoParaActualizar(
    citaOrigenId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null> {
    if (!tx) {
      throw new Error(
        'buscarReagendamientoAbiertoParaActualizar requiere una transacción (SELECT ... FOR UPDATE)',
      );
    }
    const orm = await this.repoFor(tx).findOne({
      where: TypeOrmSolicitudCitaRepository.reagendamientoAbierto(
        citaOrigenId,
        tenantId,
      ),
      lock: { mode: 'pessimistic_write' },
    });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async listarPorEstado(
    tenantId: string,
    estado: EstadoSolicitud,
    limite: number,
    filtros?: FiltrosListadoSolicitudes,
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

    const where: FindOptionsWhere<SolicitudCitaOrmEntity> = {
      tenantId,
      estado,
    };
    // Usa el índice (tenant_id, cita_origen_id).
    if (filtros?.citaOrigenId !== undefined) {
      where.citaOrigenId = filtros.citaOrigenId;
    }

    const filas = await this.repoFor(tx).find({
      where,
      order,
      take: limite,
    });
    return filas.map((orm) => this.toDomain(orm));
  }

  // Mismo predicado que el índice único parcial `uq_solicitud_reagendamiento_recibida`
  // (INDICE_REAGENDAMIENTO_RECIBIDA).
  private static reagendamientoAbierto(
    citaOrigenId: string,
    tenantId: string,
  ): FindOptionsWhere<SolicitudCitaOrmEntity> {
    return {
      citaOrigenId,
      tenantId,
      tipo: TipoSolicitud.REAGENDAMIENTO,
      estado: EstadoSolicitud.RECIBIDA,
    };
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
      tipo: orm.tipo,
      citaOrigenId: orm.citaOrigenId,
      enlaceId: orm.enlaceId,
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
      tipo: domain.tipo,
      citaOrigenId: domain.citaOrigenId,
      enlaceId: domain.enlaceId,
    };
    if (domain.id !== undefined) orm.id = domain.id;
    return orm;
  }
}
