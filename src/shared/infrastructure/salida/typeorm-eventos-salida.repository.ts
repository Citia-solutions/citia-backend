import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  EntityManager,
  LessThan,
  LessThanOrEqual,
  QueryDeepPartialEntity,
  Repository,
} from 'typeorm';

import {
  EstadoEventoSalida,
  EventoSalida,
  EventosSalidaRepository,
  ResultadoPurgaSalida,
} from '../../application/eventos-salida.repository';
import {
  PoliticaReintentoSalida,
  agotoIntentos,
  calcularEsperaReintentoMs,
  validarPoliticaReintentoSalida,
} from '../../application/politica-reintento-salida';
import { EventoDominio } from '../../application/publicador-eventos';
import { TransactionContext } from '../../application/transaction-runner';
import { EventoSalidaOrmEntity } from './evento-salida.orm-entity';

/** Largo máximo de `ultimo_error` (caracteres). */
export const LARGO_MAXIMO_ULTIMO_ERROR = 500;

/**
 * Clave del candado consultivo de la purga. Se hashea en SQL
 * (`hashtext`) para que sea legible y se pueda buscar.
 */
export const CLAVE_CANDADO_PURGA_SALIDA = 'eventos_salida.purga';

const MS_POR_DIA = 86_400_000;

/**
 * Adaptador TypeORM del outbox (ADR-12 §1–§3).
 *
 * No inyecta un `Repository` por defecto: ningún método puede correr fuera de
 * una transacción (ver el puerto), así que todos resuelven el repositorio desde
 * el `EntityManager` del `tx` opaco (ADR-06 §4).
 */
@Injectable()
export class TypeOrmEventosSalidaRepository extends EventosSalidaRepository {
  async insertar(
    evento: EventoDominio,
    tx: TransactionContext,
  ): Promise<string> {
    const id = randomUUID();
    // `intentos`, `proximo_intento_en` (now() de la transacción) y `creado_en`
    // los pone la BD.
    await this.repoFor(tx, 'insertar').insert({
      id,
      nombre: evento.nombre,
      tenantId: evento.tenantId,
      // El tipo de `insert` recorre el objeto como si fueran columnas y no
      // admite `unknown`; para una columna jsonb el valor va entero.
      payload: evento.payload as QueryDeepPartialEntity<
        EventoSalidaOrmEntity['payload']
      >,
      ocurridoEn: evento.ocurridoEn,
      estado: EstadoEventoSalida.PENDIENTE,
    });
    return id;
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async reclamarProximoPendiente(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<EventoSalida | null> {
    // SELECT ... WHERE estado = 'pendiente' AND proximo_intento_en <= $ahora
    //  ORDER BY ocurrido_en, id LIMIT 1 FOR UPDATE SKIP LOCKED
    // Sin relaciones, así que `findOne` emite un LIMIT 1 directo (sin la
    // subconsulta DISTINCT que TypeORM usa con joins).
    const fila = await this.repoFor(tx, 'reclamarProximoPendiente').findOne({
      where: {
        estado: EstadoEventoSalida.PENDIENTE,
        proximoIntentoEn: LessThanOrEqual(ahora),
      },
      order: { ocurridoEn: 'ASC', id: 'ASC' },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    });
    return fila ? this.toEvento(fila) : null;
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async marcarEntregado(
    id: string,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    const resultado = await this.repoFor(tx, 'marcarEntregado').update(
      { id, estado: EstadoEventoSalida.PENDIENTE },
      { estado: EstadoEventoSalida.ENTREGADO, entregadoEn: ahora },
    );
    return (resultado.affected ?? 0) > 0;
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async registrarFallo(
    id: string,
    error: string,
    ahora: Date,
    politica: PoliticaReintentoSalida,
    tx: TransactionContext,
  ): Promise<EventoSalida | null> {
    validarPoliticaReintentoSalida(politica);
    const repo = this.repoFor(tx, 'registrarFallo');

    // FOR UPDATE sin SKIP LOCKED: si otro proceso tomó el hecho entre la
    // reversión y este registro, se espera a que termine. Al soltarlo, Postgres
    // reevalúa el WHERE: si lo entregó, la fila ya no es `pendiente` y no se
    // toca; si también falló, este fallo se suma (solo adelanta un reintento,
    // ADR-12 §3).
    const fila = await repo.findOne({
      where: { id, estado: EstadoEventoSalida.PENDIENTE },
      lock: { mode: 'pessimistic_write' },
    });
    if (!fila) return null;

    const intentos = fila.intentos + 1;
    const ultimoError = truncarError(error);

    if (agotoIntentos(intentos, politica)) {
      // Carta muerta. `proximo_intento_en` deja de importar y no se toca.
      await repo.update(
        { id },
        { intentos, ultimoError, estado: EstadoEventoSalida.FALLIDO },
      );
      return this.toEvento({
        ...fila,
        intentos,
        ultimoError,
        estado: EstadoEventoSalida.FALLIDO,
      });
    }

    // La espera usa el contador ANTES de este fallo: 10 s, 20 s, 40 s, …
    const proximoIntentoEn = new Date(
      ahora.getTime() + calcularEsperaReintentoMs(fila.intentos, politica),
    );
    await repo.update({ id }, { intentos, ultimoError, proximoIntentoEn });
    return this.toEvento({ ...fila, intentos, ultimoError, proximoIntentoEn });
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async purgarEntregadosAntiguos(
    ahora: Date,
    retencionDias: number,
    tx: TransactionContext,
  ): Promise<ResultadoPurgaSalida> {
    if (!Number.isFinite(retencionDias) || retencionDias <= 0) {
      throw new Error(
        `purgarEntregadosAntiguos: retencionDias debe ser > 0 (recibido ${retencionDias})`,
      );
    }
    const manager = this.managerFor(tx, 'purgarEntregadosAntiguos');

    // Candado de TRANSACCIÓN: se suelta solo al terminar `tx`, también si
    // revienta. Si lo tiene otro proceso, esta purga no hace nada.
    const [candado] = await manager.query<{ obtenido: boolean }[]>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS "obtenido"',
      [CLAVE_CANDADO_PURGA_SALIDA],
    );
    if (!candado?.obtenido) return { ejecutada: false, borrados: 0 };

    const limite = new Date(ahora.getTime() - retencionDias * MS_POR_DIA);
    const resultado = await manager
      .getRepository(EventoSalidaOrmEntity)
      .delete({
        estado: EstadoEventoSalida.ENTREGADO,
        entregadoEn: LessThan(limite),
      });
    return { ejecutada: true, borrados: resultado.affected ?? 0 };
  }

  // `TransactionContext` es `unknown` y admite undefined. Sin este chequeo se
  // perdería la atomicidad en silencio (insertar) o TypeORM rechazaría el
  // bloqueo con un error menos claro.
  private managerFor(tx: TransactionContext, operacion: string): EntityManager {
    if (!tx) {
      throw new Error(
        `EventosSalidaRepository.${operacion} requiere una transacción (ADR-12)`,
      );
    }
    return tx as EntityManager;
  }

  private repoFor(
    tx: TransactionContext,
    operacion: string,
  ): Repository<EventoSalidaOrmEntity> {
    return this.managerFor(tx, operacion).getRepository(EventoSalidaOrmEntity);
  }

  private toEvento(orm: EventoSalidaOrmEntity): EventoSalida {
    return {
      id: orm.id,
      nombre: orm.nombre,
      tenantId: orm.tenantId,
      payload: orm.payload,
      ocurridoEn: orm.ocurridoEn,
      estado: orm.estado,
      intentos: orm.intentos,
      proximoIntentoEn: orm.proximoIntentoEn,
      ultimoError: orm.ultimoError,
      entregadoEn: orm.entregadoEn,
      creadoEn: orm.creadoEn,
    };
  }
}

/** Recorta sin partir un par sustituto (emoji, etc.) por la mitad. */
export function truncarError(error: string): string {
  const caracteres = Array.from(error);
  return caracteres.length <= LARGO_MAXIMO_ULTIMO_ERROR
    ? error
    : caracteres.slice(0, LARGO_MAXIMO_ULTIMO_ERROR).join('');
}
