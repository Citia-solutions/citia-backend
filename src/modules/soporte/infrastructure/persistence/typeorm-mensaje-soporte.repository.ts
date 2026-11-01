import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  CategoriaSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../../domain/mensaje-soporte.entity';
import { MensajeSoporteRepository } from '../../domain/mensaje-soporte.repository';
import { PREDICADO_PENDIENTES } from './mensaje-soporte.orm-entity';

/** Largo de `ultimo_error` (`VARCHAR(100)`, migración 1750000020000). */
export const LARGO_MAXIMO_ULTIMO_ERROR_SOPORTE = 100;

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columnas de la fila con los nombres de `DatosMensajeSoporte`. */
const COLUMNAS = `
  "id",
  "tenant_id"            AS "tenantId",
  "usuario_id"           AS "usuarioId",
  "categoria",
  "mensaje",
  "estado_envio"         AS "estadoEnvio",
  "intentos",
  "proximo_intento_en"   AS "proximoIntentoEn",
  "ultimo_error"         AS "ultimoError",
  "proveedor",
  "proveedor_mensaje_id" AS "proveedorMensajeId",
  "enviado_en"           AS "enviadoEn",
  "creado_en"            AS "creadoEn"`;

interface FilaMensajeSoporte {
  id: string;
  tenantId: string;
  usuarioId: string;
  categoria: CategoriaSoporte;
  mensaje: string;
  estadoEnvio: EstadoEnvioSoporte;
  intentos: number | string;
  proximoIntentoEn: Date;
  ultimoError: string | null;
  proveedor: string | null;
  proveedorMensajeId: string | null;
  enviadoEn: Date | null;
  creadoEn: Date;
}

/**
 * Adaptador TypeORM de `mensajes_soporte` (US-10, ADR-15 §7).
 *
 * SQL explícito sobre el `EntityManager` de la transacción: `RETURNING`,
 * `FOR UPDATE SKIP LOCKED` y la guarda de estado en el `WHERE`. Todos los
 * métodos lanzan sin `tx` (ver el puerto). `id`, `creado_en` y
 * `proximo_intento_en` del mensaje nuevo los pone la base; las fechas del
 * envío llegan en el mensaje.
 *
 * Nunca registra ni repite el texto del mensaje en un error.
 */
@Injectable()
export class TypeOrmMensajeSoporteRepository extends MensajeSoporteRepository {
  async insertar(
    mensaje: MensajeSoporte,
    tx: TransactionContext,
  ): Promise<MensajeSoporte> {
    const manager = this.manager(tx, 'insertar');
    if (mensaje.estaGuardado() || !mensaje.estaPendiente()) {
      throw new Error(
        'MensajeSoporteRepository.insertar: solo se inserta un mensaje recién creado (pendiente)',
      );
    }
    // `estado_envio`, `intentos`, `proximo_intento_en` (now() de la
    // transacción) y `creado_en` los pone la base.
    const filas: unknown = await manager.query(
      `INSERT INTO "mensajes_soporte" ("tenant_id", "usuario_id", "categoria", "mensaje")
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNAS}`,
      [mensaje.tenantId, mensaje.usuarioId, mensaje.categoria, mensaje.mensaje],
    );
    const [fila] = filasDe<FilaMensajeSoporte>(filas);
    if (!fila) {
      throw new Error(
        'MensajeSoporteRepository.insertar: la base no devolvió la fila',
      );
    }
    return aDominio(fila);
  }

  async contarCreadosDesde(
    tenantId: string,
    desde: Date,
    tx: TransactionContext,
  ): Promise<number> {
    const manager = this.manager(tx, 'contarCreadosDesde');
    if (!(desde instanceof Date) || Number.isNaN(desde.getTime())) {
      throw new RangeError('contarCreadosDesde: desde inválida');
    }
    // `idx_mensajes_soporte_tenant_creado`.
    const filas: unknown = await manager.query(
      `SELECT count(*)::int AS "total"
         FROM "mensajes_soporte"
        WHERE "tenant_id" = $1
          AND "creado_en" >= $2`,
      [tenantId, desde],
    );
    const [fila] = filasDe<{ total: number | string }>(filas);
    return Number(fila?.total ?? 0);
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async reclamarSiguientePendiente(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<MensajeSoporte | null> {
    // Sin filtro de tenant a propósito: la cola es de toda la plataforma. El
    // predicado se escribe IGUAL al del índice parcial para que lo use.
    const filas: unknown = await this.manager(
      tx,
      'reclamarSiguientePendiente',
    ).query(
      `SELECT ${COLUMNAS}
         FROM "mensajes_soporte"
        WHERE ${PREDICADO_PENDIENTES}
          AND "proximo_intento_en" <= $1
        ORDER BY "proximo_intento_en", "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [ahora],
    );
    const [fila] = filasDe<FilaMensajeSoporte>(filas);
    return fila ? aDominio(fila) : null;
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async bloquearPorId(
    id: string,
    tx: TransactionContext,
  ): Promise<MensajeSoporte | null> {
    const manager = this.manager(tx, 'bloquearPorId');
    if (!FORMATO_UUID.test(id)) return null;
    // FOR UPDATE sin SKIP LOCKED: si otro proceso la tomó entre la reversión
    // y este registro, se espera a que termine y se lee lo que dejó.
    const filas: unknown = await manager.query(
      `SELECT ${COLUMNAS}
         FROM "mensajes_soporte"
        WHERE "id" = $1
        FOR UPDATE`,
      [id],
    );
    const [fila] = filasDe<FilaMensajeSoporte>(filas);
    return fila ? aDominio(fila) : null;
  }

  // BARRIDO GLOBAL (ADR-12 §6): el tenant es el de la fila tomada.
  async guardarEnvio(
    mensaje: MensajeSoporte,
    tx: TransactionContext,
  ): Promise<void> {
    const manager = this.manager(tx, 'guardarEnvio');
    // Guarda en el WHERE: solo una fila que en la base sigue `pendiente`
    // (la tomada en esta misma transacción). Nunca pisa un final.
    const resultado: unknown = await manager.query(
      `UPDATE "mensajes_soporte"
          SET "estado_envio" = $3,
              "intentos" = $4,
              "proximo_intento_en" = $5,
              "ultimo_error" = $6,
              "proveedor" = $7,
              "proveedor_mensaje_id" = $8,
              "enviado_en" = $9
        WHERE "id" = $1
          AND "tenant_id" = $2
          AND ${PREDICADO_PENDIENTES}
        RETURNING "id"`,
      [
        mensaje.id,
        mensaje.tenantId,
        mensaje.estadoEnvio,
        mensaje.intentos,
        mensaje.proximoIntentoEn,
        mensaje.ultimoError === null
          ? null
          : truncarCodigo(mensaje.ultimoError),
        mensaje.proveedor,
        mensaje.proveedorMensajeId,
        mensaje.enviadoEn,
      ],
    );
    if (filasDe<{ id: string }>(resultado).length !== 1) {
      throw new Error(
        `MensajeSoporteRepository.guardarEnvio: el mensaje ${mensaje.id} no existe o ya no está pendiente`,
      );
    }
  }

  private manager(tx: TransactionContext, operacion: string): EntityManager {
    // `TransactionContext` es `unknown` y admite undefined: sin este chequeo
    // una escritura caería fuera de la transacción del caso de uso, o un
    // FOR UPDATE se soltaría al instante.
    if (!tx) {
      throw new Error(
        `MensajeSoporteRepository.${operacion} requiere una transacción (ADR-15 §7)`,
      );
    }
    return tx as EntityManager;
  }
}

/** Recorta sin partir un par sustituto por la mitad (`VARCHAR(100)`). */
export function truncarCodigo(codigo: string): string {
  const caracteres = Array.from(codigo);
  return caracteres.length <= LARGO_MAXIMO_ULTIMO_ERROR_SOPORTE
    ? codigo
    : caracteres.slice(0, LARGO_MAXIMO_ULTIMO_ERROR_SOPORTE).join('');
}

function aDominio(fila: FilaMensajeSoporte): MensajeSoporte {
  return MensajeSoporte.reconstituir({
    id: fila.id,
    tenantId: fila.tenantId,
    usuarioId: fila.usuarioId,
    categoria: fila.categoria,
    mensaje: fila.mensaje,
    estadoEnvio: fila.estadoEnvio,
    intentos: Number(fila.intentos),
    proximoIntentoEn: fila.proximoIntentoEn,
    ultimoError: fila.ultimoError,
    proveedor: fila.proveedor,
    proveedorMensajeId: fila.proveedorMensajeId,
    enviadoEn: fila.enviadoEn,
    creadoEn: fila.creadoEn,
  });
}

/**
 * Filas de un `EntityManager.query`. Con Postgres, TypeORM devuelve las filas
 * tal cual para SELECT e INSERT, pero `[filas, cantidad]` para UPDATE y DELETE.
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
