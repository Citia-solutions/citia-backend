import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { RolUsuario, Usuario } from '../../domain/usuario.entity';
import {
  CambioContrasena,
  CambiosPerfil,
  EstadoSesionUsuario,
  IUsuarioRepository,
} from '../../domain/usuario.repository';
import { UsuarioOrmEntity } from './usuario.orm-entity';

//Adaptador de persistencia para modulo usuario - Conecta entity del dominio con base de datos

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columnas de la fila con los nombres de las propiedades de `UsuarioOrmEntity`. */
const COLUMNAS = `
  "id",
  "email",
  "password_hash"          AS "passwordHash",
  "nombre_completo"        AS "nombreCompleto",
  "especialidad",
  "rol",
  "tenant_id"              AS "tenantId",
  "sesiones_validas_desde" AS "sesionesValidasDesde",
  "creado_en"              AS "creadoEn",
  "actualizado_en"         AS "actualizadoEn"`;

/** Fila leída de `usuarios`: la de TypeORM o la de un SQL con `COLUMNAS`. */
interface FilaUsuario {
  id: string;
  email: string;
  passwordHash: string;
  nombreCompleto: string;
  especialidad?: string | null;
  rol: RolUsuario;
  tenantId: string;
  sesionesValidasDesde?: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

@Injectable()
export class TypeOrmUsuarioRepository extends IUsuarioRepository {
  constructor(
    @InjectRepository(UsuarioOrmEntity)
    private readonly repo: Repository<UsuarioOrmEntity>,
  ) {
    super();
  }

  private repoFor(tx?: TransactionContext): Repository<UsuarioOrmEntity> {
    return tx
      ? (tx as EntityManager).getRepository(UsuarioOrmEntity)
      : this.repo;
  }

  /** El `EntityManager` de la transacción, o el de la conexión por defecto. */
  private managerFor(tx?: TransactionContext): EntityManager {
    return tx ? (tx as EntityManager) : this.repo.manager;
  }

  async findByEmailAndTenant(
    email: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Usuario | null> {
    const orm = await this.repoFor(tx).findOne({ where: { email, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async guardar(
    usuario: Partial<Usuario>,
    tx?: TransactionContext,
  ): Promise<Usuario> {
    const orm = await this.repoFor(tx).save(this.toPersistence(usuario));
    return this.toDomain(orm);
  }

  async findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Usuario | null> {
    // `id` y `tenant_id` son UUID: un valor con otra forma haría fallar la
    // consulta entera (22P02) en vez de "no existe".
    if (!sonUuid(id, tenantId)) return null;
    const orm = await this.repoFor(tx).findOne({ where: { id, tenantId } });
    if (!orm) return null;
    return this.toDomain(orm);
  }

  async actualizarPerfil(
    id: string,
    tenantId: string,
    cambios: CambiosPerfil,
    tx?: TransactionContext,
  ): Promise<Usuario | null> {
    if (!sonUuid(id, tenantId)) return null;

    const asignaciones: string[] = [];
    const parametros: unknown[] = [id, tenantId];
    if (cambios.nombreCompleto !== undefined) {
      parametros.push(cambios.nombreCompleto);
      asignaciones.push(`"nombre_completo" = $${parametros.length}`);
    }
    if (cambios.especialidad !== undefined) {
      // `null` borra la especialidad.
      parametros.push(cambios.especialidad);
      asignaciones.push(`"especialidad" = $${parametros.length}`);
    }

    // UPDATE sin SET no es SQL válido. Sin cambios no se escribe (ni siquiera
    // `actualizado_en`): se devuelve la fila tal como está.
    if (asignaciones.length === 0) return this.findById(id, tenantId, tx);

    // El aislamiento vive en la escritura: WHERE id AND tenant_id.
    const resultado: unknown = await this.managerFor(tx).query(
      `UPDATE "usuarios"
          SET ${asignaciones.join(', ')},
              "actualizado_en" = now()
        WHERE "id" = $1
          AND "tenant_id" = $2
        RETURNING ${COLUMNAS}`,
      parametros,
    );
    const [fila] = filasDe<FilaUsuario>(resultado);
    return fila ? this.toDomain(fila) : null;
  }

  async cambiarContrasena(
    id: string,
    tenantId: string,
    cambio: CambioContrasena,
    tx?: TransactionContext,
  ): Promise<boolean> {
    validarCambioContrasena(cambio);
    if (!sonUuid(id, tenantId)) return false;

    // CONDICIONAL al hash leído por el caso de uso (ADR-15 §4, paso 7). Con
    // dos cambios a la vez, el segundo espera el bloqueo de la fila, Postgres
    // vuelve a evaluar el WHERE contra la versión confirmada y no escribe.
    const resultado: unknown = await this.managerFor(tx).query(
      `UPDATE "usuarios"
          SET "password_hash" = $3,
              "sesiones_validas_desde" = $5,
              "actualizado_en" = now()
        WHERE "id" = $1
          AND "tenant_id" = $2
          AND "password_hash" = $4
        RETURNING "id"`,
      [
        id,
        tenantId,
        cambio.hashNuevo,
        cambio.hashAnterior,
        cambio.sesionesValidasDesde,
      ],
    );
    return filasDe<{ id: string }>(resultado).length === 1;
  }

  async estadoSesion(
    id: string,
    tenantId: string,
  ): Promise<EstadoSesionUsuario | null> {
    if (!sonUuid(id, tenantId)) return null;
    // Solo la columna del corte, por clave primaria: corre en cada petición
    // autenticada (ADR-15 §5). Nunca carga el hash.
    const filas = await this.repo.manager.query<
      { sesionesValidasDesde: Date | null }[]
    >(
      `SELECT "sesiones_validas_desde" AS "sesionesValidasDesde"
         FROM "usuarios"
        WHERE "id" = $1
          AND "tenant_id" = $2`,
      [id, tenantId],
    );
    const [fila] = filasDe<{ sesionesValidasDesde: Date | null }>(filas);
    return fila ? { sesionesValidasDesde: fila.sesionesValidasDesde } : null;
  }

  private toDomain(orm: FilaUsuario): Usuario {
    const usuario = new Usuario();
    usuario.id = orm.id;
    usuario.email = orm.email;
    usuario.passwordHash = orm.passwordHash;
    usuario.nombreCompleto = orm.nombreCompleto;
    // `save()` de un parcial no devuelve las columnas que no recibió: lo que
    // falta es NULL en la base.
    usuario.especialidad = orm.especialidad ?? null;
    usuario.rol = orm.rol;
    usuario.tenantId = orm.tenantId;
    usuario.sesionesValidasDesde = orm.sesionesValidasDesde ?? null;
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
    if (domain.especialidad !== undefined)
      orm.especialidad = domain.especialidad;
    if (domain.rol !== undefined) orm.rol = domain.rol;
    if (domain.tenantId !== undefined) orm.tenantId = domain.tenantId;
    // `sesionesValidasDesde` NO se mapea a propósito: solo la escribe
    // `cambiarContrasena` (ADR-15 §5), nunca un `guardar`.
    return orm;
  }
}

function sonUuid(...valores: string[]): boolean {
  return valores.every(
    (valor) => typeof valor === 'string' && FORMATO_UUID.test(valor),
  );
}

/**
 * Un hash nuevo vacío dejaría la cuenta sin forma de entrar, y un corte
 * inválido (`NaN`) cortaría o no las sesiones según cómo lo lea Postgres.
 */
function validarCambioContrasena(cambio: CambioContrasena): void {
  if (typeof cambio.hashNuevo !== 'string' || cambio.hashNuevo === '') {
    throw new Error('cambiarContrasena: hashNuevo vacío');
  }
  if (
    !(cambio.sesionesValidasDesde instanceof Date) ||
    Number.isNaN(cambio.sesionesValidasDesde.getTime())
  ) {
    throw new RangeError('cambiarContrasena: sesionesValidasDesde inválida');
  }
}

/**
 * Filas de un `EntityManager.query`. Con Postgres, TypeORM devuelve las filas
 * tal cual para SELECT, pero `[filas, cantidad]` para UPDATE y DELETE.
 */
function filasDe<T>(resultado: unknown): T[] {
  if (
    Array.isArray(resultado) &&
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  ) {
    return resultado[0] as T[];
  }
  return Array.isArray(resultado) ? (resultado as T[]) : [];
}
