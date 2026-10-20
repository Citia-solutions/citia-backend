import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  EntityManager,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { rangoDelDiaEnZona } from '../../../../shared/domain/timezone';
import { Cita, EstadoCita } from '../../domain/cita.entity';
import { CitaRepository } from '../../domain/cita.repository';
import { CitaOrmEntity } from './cita.orm-entity';

/** Las columnas de `citas` que hacen falta para reconstituir una `Cita`. */
export type FilaCita = Pick<
  CitaOrmEntity,
  | 'id'
  | 'inicio'
  | 'duracionMin'
  | 'tipoConsulta'
  | 'estado'
  | 'origen'
  | 'tenantId'
  | 'pacienteId'
  | 'usuarioId'
  | 'creadoEn'
  | 'actualizadoEn'
>;

// Propiedad de `FilaCita` → columna de `citas`. El `Record` obliga a nombrar
// cada propiedad: una columna nueva en `FilaCita` no compila sin su entrada.
const COLUMNAS_CITA: Readonly<Record<keyof FilaCita, string>> = {
  id: 'id',
  inicio: 'inicio',
  duracionMin: 'duracion_min',
  tipoConsulta: 'tipo_consulta',
  estado: 'estado',
  origen: 'origen',
  tenantId: 'tenant_id',
  pacienteId: 'paciente_id',
  usuarioId: 'usuario_id',
  creadoEn: 'creado_en',
  actualizadoEn: 'actualizado_en',
};

/**
 * Lista de `SELECT` de una `FilaCita` para el SQL escrito a mano sobre
 * `citas` (p. ej. `SqlCandidatasGhosting`), con cada columna renombrada a su
 * propiedad: `c."duracion_min" AS "duracionMin", …`. `alias` es el de la tabla
 * en la consulta.
 */
export function columnasCita(alias: string): string {
  return Object.entries(COLUMNAS_CITA)
    .map(([propiedad, columna]) => `${alias}."${columna}" AS "${propiedad}"`)
    .join(', ');
}

/**
 * ÚNICO mapeo de una fila de `citas` a la entidad de dominio: lo usan este
 * repositorio (sobre `CitaOrmEntity`) y el SQL a mano (sobre `columnasCita`).
 */
export function citaDesdeFila(fila: FilaCita): Cita {
  return Cita.reconstituir({
    id: fila.id,
    inicio: fila.inicio,
    duracionMin: fila.duracionMin,
    tipoConsulta: fila.tipoConsulta,
    estado: fila.estado,
    origen: fila.origen,
    tenantId: fila.tenantId,
    pacienteId: fila.pacienteId,
    usuarioId: fila.usuarioId,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  });
}

// Adaptador de persistencia para el modulo cita.
// Conecta la entidad de dominio con la base de datos via TypeORM.
@Injectable()
export class TypeOrmCitaRepository extends CitaRepository {
  constructor(
    @InjectRepository(CitaOrmEntity)
    private readonly repo: Repository<CitaOrmEntity>,
    private readonly config: ConfigService,
  ) {
    super();
  }

  private repoFor(tx?: TransactionContext): Repository<CitaOrmEntity> {
    return tx ? (tx as EntityManager).getRepository(CitaOrmEntity) : this.repo;
  }

  async guardar(cita: Cita, tx?: TransactionContext): Promise<Cita> {
    const orm = await this.repoFor(tx).save(this.toPersistence(cita));
    // En un UPDATE TypeORM no relee @CreateDateColumn: se conserva la del dominio.
    return this.toDomain({ ...orm, creadoEn: orm.creadoEn ?? cita.creadoEn });
  }

  async buscarPorId(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Cita | null> {
    const orm = await this.repoFor(tx).findOne({ where: { id, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<Cita | null> {
    // `TransactionContext` es `unknown` y admite undefined: sin este chequeo
    // se caería al repositorio por defecto y el bloqueo no protegería nada.
    if (!tx) {
      throw new Error(
        'buscarPorIdParaActualizar requiere una transacción (SELECT ... FOR NO KEY UPDATE)',
      );
    }
    const orm = await this.repoFor(tx).findOne({
      where: { id, tenantId },
      // FOR NO KEY UPDATE y no FOR UPDATE: serializa igual las mutaciones de la
      // cita, pero no choca con el FOR KEY SHARE que toma el INSERT en
      // `enlaces_cita` (FK a `citas`) mientras el envío del recordatorio
      // mantiene su transacción abierta.
      lock: { mode: 'for_no_key_update' },
    });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async buscarPorIds(
    ids: readonly string[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Cita[]> {
    // `IN ()` no es SQL válido: sin ids no se consulta.
    if (ids.length === 0) return [];
    // Usa la PK; el filtro por tenant es requisito de seguridad.
    const filas = await this.repoFor(tx).find({
      where: { id: In([...new Set(ids)]), tenantId },
    });
    return filas.map((orm) => this.toDomain(orm));
  }

  async buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
    tx?: TransactionContext,
  ): Promise<Cita[]> {
    // El "día" se calcula en la zona horaria de la clínica (no la del servidor,
    // que corre en UTC). Rango semiabierto [00:00, día+1 00:00) en esa zona,
    // convertido a instantes UTC para comparar contra la columna timestamptz.
    const tz = this.config.get<string>('APP_TZ', 'America/Santiago');
    const { desde, hasta } = rangoDelDiaEnZona(dia, tz);

    const filas = await this.repoFor(tx).find({
      where: {
        tenantId,
        usuarioId,
        inicio: And(MoreThanOrEqual(desde), LessThan(hasta)),
      },
      order: { inicio: 'ASC' },
    });

    return filas.map((orm) => this.toDomain(orm));
  }

  async buscarPorProfesionalEnRango(
    tenantId: string,
    usuarioId: string,
    desde: Date,
    hasta: Date,
    opciones?: { estados?: readonly EstadoCita[] },
    tx?: TransactionContext,
  ): Promise<Cita[]> {
    // Usa el indice (tenant_id, usuario_id, inicio). El rango llega ya en
    // instantes UTC: aqui no se lee APP_TZ.
    const where: FindOptionsWhere<CitaOrmEntity> = {
      tenantId,
      usuarioId,
      inicio: And(MoreThanOrEqual(desde), LessThan(hasta)),
    };
    // Lista vacia = "ningun estado" -> ninguna fila (IN () no es SQL valido).
    if (opciones?.estados !== undefined) {
      if (opciones.estados.length === 0) return [];
      where.estado = In([...opciones.estados]);
    }

    const filas = await this.repoFor(tx).find({
      where,
      order: { inicio: 'ASC', creadoEn: 'ASC' },
    });

    return filas.map((orm) => this.toDomain(orm));
  }

  private toDomain(orm: CitaOrmEntity): Cita {
    return citaDesdeFila(orm);
  }

  private toPersistence(domain: Cita): Partial<CitaOrmEntity> {
    const orm: Partial<CitaOrmEntity> = {};
    if (domain.id !== undefined) orm.id = domain.id;
    orm.inicio = domain.inicio;
    orm.duracionMin = domain.duracionMin;
    orm.tipoConsulta = domain.tipoConsulta;
    orm.estado = domain.estado;
    // Inmutable en el dominio: en un UPDATE se reescribe el mismo valor.
    orm.origen = domain.origen;
    orm.tenantId = domain.tenantId;
    orm.pacienteId = domain.pacienteId;
    orm.usuarioId = domain.usuarioId;
    return orm;
  }
}
