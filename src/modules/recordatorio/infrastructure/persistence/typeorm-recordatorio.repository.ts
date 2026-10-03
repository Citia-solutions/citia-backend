import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { truncarError } from '../../../../shared/infrastructure/salida/typeorm-eventos-salida.repository';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoCancelacion,
  MotivoOmision,
  MotivoRecordatorio,
} from '../../domain/recordatorio.entity';
import {
  ConteoDesenlaces,
  DatosRecordatorio,
  EnvioAceptado,
  EventoEntrega,
  FalloEnvio,
  LocalizadorEntrega,
  NuevoRecordatorio,
  RecordatorioRepository,
  ReintentoEnvio,
  ResultadoEventoEntrega,
  TipoEventoEntrega,
} from '../../domain/recordatorio.repository';
import {
  afectadasDe,
  esUuid,
  exigirTransaccion,
  filasDe,
  validarPeriodo,
} from './soporte-sql';

/**
 * Espacio de nombres del candado consultivo por cita. Se usa la forma de DOS
 * claves de `pg_advisory_xact_lock(int4, int4)`, que según la documentación
 * de Postgres no se cruza con la de una clave (`int8`) que usan otros
 * candados del proyecto (p. ej. la purga del outbox).
 */
export const CLAVE_CANDADO_CITA = 'recordatorios.cita';

/** SQL del candado: `hashtext(espacio)`, `hashtext(cita_id)`. */
export const SQL_CANDADO_CITA =
  'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))';

/** Columnas de la fila con los nombres de `DatosRecordatorio`. */
const COLUMNAS = `
  "id",
  "tenant_id"            AS "tenantId",
  "cita_id"              AS "citaId",
  "canal",
  "antelacion_min"       AS "antelacionMin",
  "inicio_cita"          AS "inicioCita",
  "programado_para"      AS "programadoPara",
  "vence_en"             AS "venceEn",
  "estado",
  "motivo",
  "intentos",
  "proximo_intento_en"   AS "proximoIntentoEn",
  "ultimo_error"         AS "ultimoError",
  "proveedor",
  "proveedor_mensaje_id" AS "proveedorMensajeId",
  "enviado_en"           AS "enviadoEn",
  "entregado_en"         AS "entregadoEn",
  "queja_en"             AS "quejaEn",
  "creado_en"            AS "creadoEn",
  "actualizado_en"       AS "actualizadoEn"`;

/** Columnas que escribe una inserción, en el orden de los parámetros. */
const COLUMNAS_INSERCION = [
  'tenant_id',
  'cita_id',
  'canal',
  'antelacion_min',
  'inicio_cita',
  'programado_para',
  'vence_en',
  'estado',
  'motivo',
  'proximo_intento_en',
] as const;

/**
 * Destino del `ON CONFLICT`: columnas y predicado de `uq_recordatorio_clave`.
 * Postgres infiere el índice único PARCIAL solo si se repite su `WHERE`.
 */
export const CONFLICTO_CLAVE_RECORDATORIO = `("cita_id", "canal", "antelacion_min", "programado_para") WHERE "estado" <> 'cancelado'`;

/** Estados vivos desde los que un evento de entrega puede hacer avanzar la fila. */
const DESDE_ENTREGA = `'${EstadoRecordatorio.PROGRAMADO}', '${EstadoRecordatorio.ENVIADO}'`;

interface FilaRecordatorio {
  id: string;
  tenantId: string;
  citaId: string;
  canal: CanalRecordatorio;
  antelacionMin: number | string;
  inicioCita: Date;
  programadoPara: Date;
  venceEn: Date;
  estado: EstadoRecordatorio;
  motivo: MotivoRecordatorio | null;
  intentos: number | string;
  proximoIntentoEn: Date;
  ultimoError: string | null;
  proveedor: string | null;
  proveedorMensajeId: string | null;
  enviadoEn: Date | null;
  entregadoEn: Date | null;
  quejaEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

interface SentenciaSql {
  sql: string;
  parametros: unknown[];
}

/**
 * Adaptador TypeORM de `recordatorios` (ADR-13 §2, §6, §7, §9, §10, §11).
 *
 * Escribe con SQL explícito: `ON CONFLICT` sobre la clave PARCIAL, guardas de
 * estado en el `WHERE`, `FOR UPDATE SKIP LOCKED` y `RETURNING`. Todos los
 * métodos resuelven el `EntityManager` del `tx` y lanzan sin él (ver el
 * puerto). `creado_en` / `actualizado_en` los pone la base; las fechas de
 * negocio llegan por parámetro.
 */
@Injectable()
export class TypeOrmRecordatorioRepository extends RecordatorioRepository {
  async bloquearCitaParaReconciliar(
    citaId: string,
    tx: TransactionContext,
  ): Promise<void> {
    // Bloqueante y de TRANSACCIÓN: una segunda reconciliación de la misma cita
    // espera aquí hasta que la primera confirme o revierta.
    await this.manager(tx, 'bloquearCitaParaReconciliar').query(
      SQL_CANDADO_CITA,
      [CLAVE_CANDADO_CITA, citaId],
    );
  }

  async insertarSiNoExisten(
    nuevos: readonly NuevoRecordatorio[],
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]> {
    const manager = this.manager(tx, 'insertarSiNoExisten');
    if (nuevos.length === 0) return [];

    const parametros: unknown[] = [];
    const tuplas = nuevos.map((nuevo) => {
      validarNuevo(nuevo);
      const base = parametros.length;
      parametros.push(
        nuevo.tenantId,
        nuevo.citaId,
        nuevo.canal,
        nuevo.antelacionMin,
        nuevo.inicioCita,
        nuevo.programadoPara,
        nuevo.venceEn,
        nuevo.estado,
        nuevo.motivo,
        nuevo.proximoIntentoEn,
      );
      const marcadores = COLUMNAS_INSERCION.map(
        (_columna, i) => `$${base + i + 1}`,
      );
      return `(${marcadores.join(', ')})`;
    });

    const columnas = COLUMNAS_INSERCION.map((c) => `"${c}"`).join(', ');
    const filas = await manager.query<FilaRecordatorio[]>(
      `INSERT INTO "recordatorios" (${columnas})
       VALUES ${tuplas.join(', ')}
       ON CONFLICT ${CONFLICTO_CLAVE_RECORDATORIO} DO NOTHING
       RETURNING ${COLUMNAS}`,
      parametros,
    );
    return filasDe<FilaRecordatorio>(filas).map(aDatos);
  }

  async listarVigentesDeCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]> {
    const manager = this.manager(tx, 'listarVigentesDeCita');
    if (!esUuid(citaId)) return [];
    const filas = await manager.query<FilaRecordatorio[]>(
      `SELECT ${COLUMNAS}
         FROM "recordatorios"
        WHERE "cita_id" = $1
          AND "tenant_id" = $2
          AND "estado" <> '${EstadoRecordatorio.CANCELADO}'
        ORDER BY "programado_para", "id"`,
      [citaId, tenantId],
    );
    return filasDe<FilaRecordatorio>(filas).map(aDatos);
  }

  async listarPorCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]> {
    const manager = this.manager(tx, 'listarPorCita');
    if (!esUuid(citaId)) return [];
    const filas = await manager.query<FilaRecordatorio[]>(
      `SELECT ${COLUMNAS}
         FROM "recordatorios"
        WHERE "cita_id" = $1
          AND "tenant_id" = $2
        ORDER BY "programado_para", "creado_en", "id"`,
      [citaId, tenantId],
    );
    return filasDe<FilaRecordatorio>(filas).map(aDatos);
  }

  async anular(
    ids: readonly string[],
    tenantId: string,
    motivo: MotivoCancelacion,
    tx: TransactionContext,
  ): Promise<string[]> {
    const manager = this.manager(tx, 'anular');
    if (ids.length === 0) return [];
    const resultado: unknown = await manager.query(
      `UPDATE "recordatorios"
          SET "estado" = '${EstadoRecordatorio.CANCELADO}',
              "motivo" = $3,
              "actualizado_en" = now()
        WHERE "id" = ANY($1::uuid[])
          AND "tenant_id" = $2
          AND "estado" = '${EstadoRecordatorio.PROGRAMADO}'
        RETURNING "id"`,
      [[...ids], tenantId, motivo],
    );
    return filasDe<{ id: string }>(resultado).map((fila) => fila.id);
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async reclamarProximoProgramado(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio | null> {
    // Sin filtro de tenant a propósito: la cola es de toda la plataforma. Lo
    // que siga usa el `tenantId` de la fila tomada.
    const filas = await this.manager(tx, 'reclamarProximoProgramado').query<
      FilaRecordatorio[]
    >(
      `SELECT ${COLUMNAS}
         FROM "recordatorios"
        WHERE "estado" = '${EstadoRecordatorio.PROGRAMADO}'
          AND "proximo_intento_en" <= $1
        ORDER BY "proximo_intento_en", "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [ahora],
    );
    const [fila] = filasDe<FilaRecordatorio>(filas);
    return fila ? aDatos(fila) : null;
  }

  async registrarEnvio(
    id: string,
    tenantId: string,
    envio: EnvioAceptado,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.actualizarProgramado(
      tx,
      'registrarEnvio',
      `"estado" = '${EstadoRecordatorio.ENVIADO}',
       "enviado_en" = $3,
       "proveedor" = $4,
       "proveedor_mensaje_id" = $5,
       "intentos" = "intentos" + 1`,
      [id, tenantId, ahora, envio.proveedor, envio.proveedorMensajeId],
    );
  }

  async registrarReintento(
    id: string,
    tenantId: string,
    reintento: ReintentoEnvio,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.actualizarProgramado(
      tx,
      'registrarReintento',
      `"intentos" = "intentos" + 1,
       "ultimo_error" = $3,
       "proximo_intento_en" = $4`,
      [
        id,
        tenantId,
        truncarError(reintento.ultimoError),
        reintento.proximoIntentoEn,
      ],
    );
  }

  async posponer(
    id: string,
    tenantId: string,
    proximoIntentoEn: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.actualizarProgramado(
      tx,
      'posponer',
      `"proximo_intento_en" = $3`,
      [id, tenantId, proximoIntentoEn],
    );
  }

  async omitir(
    id: string,
    tenantId: string,
    motivo: MotivoOmision,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.actualizarProgramado(
      tx,
      'omitir',
      `"estado" = '${EstadoRecordatorio.OMITIDO}',
       "motivo" = $3`,
      [id, tenantId, motivo],
    );
  }

  async registrarFallo(
    id: string,
    tenantId: string,
    fallo: FalloEnvio,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.actualizarProgramado(
      tx,
      'registrarFallo',
      `"estado" = '${EstadoRecordatorio.FALLIDO}',
       "motivo" = $3,
       "ultimo_error" = COALESCE($4, "ultimo_error"),
       "intentos" = "intentos" + $5`,
      [
        id,
        tenantId,
        fallo.motivo,
        fallo.ultimoError === null ? null : truncarError(fallo.ultimoError),
        fallo.contarIntento ? 1 : 0,
      ],
    );
  }

  // SIN FILTRO DE TENANT: webhook (ADR-13 §10, ADR-12 §6)
  async registrarEventoEntrega(
    localizador: LocalizadorEntrega,
    evento: EventoEntrega,
    tx: TransactionContext,
  ): Promise<ResultadoEventoEntrega> {
    const manager = this.manager(tx, 'registrarEventoEntrega');

    // 1. Encontrar y BLOQUEAR la fila (espera si un envío la tiene tomada:
    //    así el evento se evalúa sobre el estado ya confirmado).
    const fila = await localizarParaActualizar(manager, localizador);
    if (!fila) return { recordatorio: null, aplicado: false };

    // 2. Actualizar solo si el evento la hace avanzar (guarda en el WHERE).
    const sentencia = sentenciaEventoEntrega(fila.id, evento);
    if (!sentencia) return { recordatorio: aDatos(fila), aplicado: false };
    const resultado: unknown = await manager.query(
      sentencia.sql,
      sentencia.parametros,
    );
    const [actualizada] = filasDe<FilaRecordatorio>(resultado);
    return actualizada
      ? { recordatorio: aDatos(actualizada), aplicado: true }
      : { recordatorio: aDatos(fila), aplicado: false };
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async contarEnviadosEntre(
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<number> {
    const manager = this.manager(tx, 'contarEnviadosEntre');
    validarPeriodo(desde, hasta, 'contarEnviadosEntre');
    const [fila] = await manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS "total"
         FROM "recordatorios"
        WHERE "enviado_en" >= $1
          AND "enviado_en" < $2`,
      [desde, hasta],
    );
    return Number(fila?.total ?? 0);
  }

  async contarEnviadosDeTenantEntre(
    tenantId: string,
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<number> {
    const manager = this.manager(tx, 'contarEnviadosDeTenantEntre');
    validarPeriodo(desde, hasta, 'contarEnviadosDeTenantEntre');
    const [fila] = await manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS "total"
         FROM "recordatorios"
        WHERE "enviado_en" >= $1
          AND "enviado_en" < $2
          AND "tenant_id" = $3`,
      [desde, hasta, tenantId],
    );
    return Number(fila?.total ?? 0);
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async contarDesenlacesEntre(
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<ConteoDesenlaces> {
    const manager = this.manager(tx, 'contarDesenlacesEntre');
    validarPeriodo(desde, hasta, 'contarDesenlacesEntre');
    const [fila] = await manager.query<
      { entregados: number; fallidos: number }[]
    >(
      `SELECT count(*) FILTER (WHERE "estado" = '${EstadoRecordatorio.ENTREGADO}')::int AS "entregados",
              count(*) FILTER (WHERE "estado" = '${EstadoRecordatorio.FALLIDO}')::int   AS "fallidos"
         FROM "recordatorios"
        WHERE "estado" IN ('${EstadoRecordatorio.ENTREGADO}', '${EstadoRecordatorio.FALLIDO}')
          AND "actualizado_en" >= $1
          AND "actualizado_en" < $2`,
      [desde, hasta],
    );
    return {
      entregados: Number(fila?.entregados ?? 0),
      fallidos: Number(fila?.fallidos ?? 0),
    };
  }

  /**
   * UPDATE de una fila TOMADA, solo si sigue `programado`. `$1` = id, `$2` =
   * tenant (el de la fila, ADR-12 §6); `asignaciones` usa desde `$3`.
   */
  private async actualizarProgramado(
    tx: TransactionContext,
    operacion: string,
    asignaciones: string,
    parametros: unknown[],
  ): Promise<boolean> {
    const resultado: unknown = await this.manager(tx, operacion).query(
      `UPDATE "recordatorios"
          SET ${asignaciones},
              "actualizado_en" = now()
        WHERE "id" = $1
          AND "tenant_id" = $2
          AND "estado" = '${EstadoRecordatorio.PROGRAMADO}'`,
      parametros,
    );
    return afectadasDe(resultado) > 0;
  }

  private manager(tx: TransactionContext, operacion: string): EntityManager {
    return exigirTransaccion(tx, 'RecordatorioRepository', operacion);
  }
}

/**
 * Un recordatorio nace `programado` u `omitido` (ADR-13 §4). Con otro estado
 * no participaría bien de la clave única (un `cancelado` nunca choca). El
 * emparejamiento estado/motivo lo garantiza el tipo y, al final, el CHECK.
 */
const ESTADOS_INICIALES: ReadonlySet<EstadoRecordatorio> = new Set([
  EstadoRecordatorio.PROGRAMADO,
  EstadoRecordatorio.OMITIDO,
]);

function validarNuevo(nuevo: NuevoRecordatorio): void {
  // El tipo ya lo exige; esto protege de un objeto armado sin él (p. ej. un
  // `as` en un test o un dato que viene de fuera).
  const estado = nuevo.estado as EstadoRecordatorio;
  if (!ESTADOS_INICIALES.has(estado)) {
    throw new Error(
      `insertarSiNoExisten: un recordatorio nace programado u omitido (recibido ${String(estado)})`,
    );
  }
}

/**
 * Busca la fila del evento y la bloquea (`FOR UPDATE`, sin SKIP LOCKED).
 * Primero por la etiqueta `recordatorio_id`; si falta, no es UUID o no existe,
 * por `proveedor_mensaje_id`.
 */
async function localizarParaActualizar(
  manager: EntityManager,
  localizador: LocalizadorEntrega,
): Promise<FilaRecordatorio | null> {
  if (esUuid(localizador.recordatorioId)) {
    const [fila] = filasDe<FilaRecordatorio>(
      await manager.query(
        `SELECT ${COLUMNAS}
           FROM "recordatorios"
          WHERE "id" = $1
          FOR UPDATE`,
        [localizador.recordatorioId],
      ),
    );
    if (fila) return fila;
  }
  if (localizador.proveedorMensajeId) {
    const [fila] = filasDe<FilaRecordatorio>(
      await manager.query(
        `SELECT ${COLUMNAS}
           FROM "recordatorios"
          WHERE "proveedor_mensaje_id" = $1
          ORDER BY "creado_en", "id"
          LIMIT 1
          FOR UPDATE`,
        [localizador.proveedorMensajeId],
      ),
    );
    if (fila) return fila;
  }
  return null;
}

/**
 * UPDATE MONÓTONO de cada evento de entrega (ADR-13 §9.4, §10). La guarda del
 * `WHERE` es la que impide retroceder: un evento repetido o fuera de orden no
 * encuentra la fila en un estado desde el que pueda avanzar.
 *
 * - `enviado`: solo completa el id del mensaje si faltaba.
 * - `entregado`: `programado`/`enviado` → `entregado`. Desde `programado` es
 *   el caso de una caída tras la aceptación del proveedor (ADR-13 §9.4):
 *   `enviado_en` se completa con la hora del evento para que el contador de
 *   cuota no la pierda.
 * - `rebotado` / `rechazado`: `programado`/`enviado` → `fallido`. ADR-13 §4
 *   lo dibuja desde `enviado`; desde `programado` se aplica por la misma razón
 *   que `entregado` (si no, el reintento reenviaría a un buzón que rebotó).
 * - `queja`: fija `queja_en` una sola vez; el estado no cambia.
 *
 * `null` si no hay nada que escribir (p. ej. `enviado` sin id de mensaje).
 */
function sentenciaEventoEntrega(
  id: string,
  evento: EventoEntrega,
): SentenciaSql | null {
  switch (evento.tipo) {
    case TipoEventoEntrega.ENVIADO:
      if (!evento.proveedorMensajeId) return null;
      return {
        sql: `UPDATE "recordatorios"
                 SET "proveedor_mensaje_id" = $2,
                     "proveedor" = COALESCE("proveedor", $3),
                     "actualizado_en" = now()
               WHERE "id" = $1
                 AND "proveedor_mensaje_id" IS NULL
               RETURNING ${COLUMNAS}`,
        parametros: [id, evento.proveedorMensajeId, evento.proveedor],
      };

    case TipoEventoEntrega.ENTREGADO:
      return {
        sql: `UPDATE "recordatorios"
                 SET "estado" = '${EstadoRecordatorio.ENTREGADO}',
                     "entregado_en" = COALESCE("entregado_en", $2),
                     "enviado_en" = COALESCE("enviado_en", $2),
                     "proveedor_mensaje_id" = COALESCE("proveedor_mensaje_id", $3),
                     "proveedor" = COALESCE("proveedor", $4),
                     "actualizado_en" = now()
               WHERE "id" = $1
                 AND "estado" IN (${DESDE_ENTREGA})
               RETURNING ${COLUMNAS}`,
        parametros: [
          id,
          evento.ocurridoEn,
          evento.proveedorMensajeId,
          evento.proveedor,
        ],
      };

    case TipoEventoEntrega.REBOTADO:
    case TipoEventoEntrega.RECHAZADO:
      return {
        sql: `UPDATE "recordatorios"
                 SET "estado" = '${EstadoRecordatorio.FALLIDO}',
                     "motivo" = $5,
                     "enviado_en" = COALESCE("enviado_en", $2),
                     "proveedor_mensaje_id" = COALESCE("proveedor_mensaje_id", $3),
                     "proveedor" = COALESCE("proveedor", $4),
                     "actualizado_en" = now()
               WHERE "id" = $1
                 AND "estado" IN (${DESDE_ENTREGA})
               RETURNING ${COLUMNAS}`,
        parametros: [
          id,
          evento.ocurridoEn,
          evento.proveedorMensajeId,
          evento.proveedor,
          evento.tipo === TipoEventoEntrega.REBOTADO
            ? MotivoRecordatorio.REBOTE
            : MotivoRecordatorio.RECHAZADO,
        ],
      };

    case TipoEventoEntrega.QUEJA:
      return {
        sql: `UPDATE "recordatorios"
                 SET "queja_en" = $2,
                     "actualizado_en" = now()
               WHERE "id" = $1
                 AND "queja_en" IS NULL
               RETURNING ${COLUMNAS}`,
        parametros: [id, evento.ocurridoEn],
      };

    default:
      return null;
  }
}

function aDatos(fila: FilaRecordatorio): DatosRecordatorio {
  return {
    id: fila.id,
    tenantId: fila.tenantId,
    citaId: fila.citaId,
    canal: fila.canal,
    antelacionMin: Number(fila.antelacionMin),
    inicioCita: fila.inicioCita,
    programadoPara: fila.programadoPara,
    venceEn: fila.venceEn,
    estado: fila.estado,
    motivo: fila.motivo,
    intentos: Number(fila.intentos),
    proximoIntentoEn: fila.proximoIntentoEn,
    ultimoError: fila.ultimoError,
    proveedor: fila.proveedor,
    proveedorMensajeId: fila.proveedorMensajeId,
    enviadoEn: fila.enviadoEn,
    entregadoEn: fila.entregadoEn,
    quejaEn: fila.quejaEn,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}
