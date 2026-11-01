import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

import { CanalMensajeriaFalso } from '../../../../test/support/mensajeria-falsa';
import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { TypeOrmTransactionRunner } from '../../../shared/infrastructure/typeorm-transaction-runner';
import {
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
} from '../../recordatorio/domain/canal-mensajeria';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { TypeOrmTenantRepository } from '../../tenant/infrastructure/persistence/typeorm-tenant.repository';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { TypeOrmUsuarioRepository } from '../../usuario/infrastructure/persistence/typeorm-usuario.repository';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import { EnviarMensajesSoporteService } from '../application/enviar-mensajes-soporte.service';
import {
  CategoriaSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../domain/mensaje-soporte.entity';
import { MensajeSoporteOrmEntity } from '../infrastructure/persistence/mensaje-soporte.orm-entity';
import { TypeOrmMensajeSoporteRepository } from '../infrastructure/persistence/typeorm-mensaje-soporte.repository';

/**
 * `mensajes_soporte` contra PostgreSQL real (US-10, ADR-15 §7). Lo que el
 * doble del unitario NO reproduce:
 *
 *  - dos `reclamarSiguientePendiente` en dos transacciones a la vez → filas
 *    distintas (`FOR UPDATE SKIP LOCKED`), y la fila vuelve a la cola si la
 *    transacción revierte;
 *  - `bloquearPorId` ESPERA a la transacción que tiene la fila;
 *  - `contarCreadosDesde` cuenta solo su organización y desde el instante;
 *  - `guardarEnvio` con la guarda de estado;
 *  - los CHECK (2001 caracteres, texto en blanco, `enviado` sin `enviado_en`)
 *    creados por `synchronize` desde la entidad.
 *
 *  - el envío completo: dos `EnviarMensajesSoporteService.ejecutar` en
 *    paralelo (uno por "proceso") con un canal falso → cada mensaje sale UNA
 *    sola vez.
 *
 * Dos DataSource = dos "procesos", cada uno con su pool.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const ENTIDADES = [TenantOrmEntity, UsuarioOrmEntity, MensajeSoporteOrmEntity];

const MIN = 60_000;
const HORA = 60 * MIN;
/** Reloj fijo de las pruebas: lejos de "ahora" para no depender de la hora. */
const AHORA = new Date('2030-01-15T15:00:00.000Z');

const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

interface ErrorPostgres {
  code?: string;
  constraint?: string;
}

async function errorDe(promesa: Promise<unknown>): Promise<ErrorPostgres> {
  try {
    await promesa;
  } catch (error: unknown) {
    const e = error as ErrorPostgres & { driverError?: ErrorPostgres };
    return {
      code: e.code ?? e.driverError?.code,
      constraint: e.constraint ?? e.driverError?.constraint,
    };
  }
  throw new Error('se esperaba que la base rechazara la sentencia');
}

/** Para saber si una promesa ya terminó sin esperarla. */
function observar<T>(promesa: Promise<T>): {
  promesa: Promise<T>;
  terminada: () => boolean;
} {
  let terminada = false;
  const envuelta = promesa.finally(() => {
    terminada = true;
  });
  envuelta.catch(() => undefined);
  return { promesa: envuelta, terminada: () => terminada };
}

describe('Mensajes a soporte contra PostgreSQL (integration)', () => {
  let baseA: DataSource;
  let baseB: DataSource;
  const repo = new TypeOrmMensajeSoporteRepository();

  let tenantId: string;
  let otroTenantId: string;
  let usuarioId: string;
  let otroUsuarioId: string;

  const enTx = <T>(
    trabajo: (tx: EntityManager) => Promise<T>,
    base: DataSource = baseA,
  ): Promise<T> => base.transaction((manager) => trabajo(manager));

  /** Inserta por el adaptador (como el caso de uso) y devuelve el guardado. */
  const insertar = (
    extra: Partial<Parameters<typeof MensajeSoporte.crear>[0]> = {},
  ): Promise<MensajeSoporte> =>
    enTx((tx) =>
      repo.insertar(
        MensajeSoporte.crear({
          tenantId,
          usuarioId,
          categoria: CategoriaSoporte.PROBLEMA,
          mensaje: 'No carga la agenda',
          ...extra,
        }),
        tx,
      ),
    );

  /** Fija columnas a mano (fechas de la cola, estado) para armar escenarios. */
  const fijar = (id: string, columnas: Record<string, unknown>) => {
    const nombres = Object.keys(columnas);
    return baseA.query(
      `UPDATE mensajes_soporte
          SET ${nombres.map((n, i) => `"${n}" = $${i + 2}`).join(', ')}
        WHERE id = $1`,
      [id, ...Object.values(columnas)],
    );
  };

  const leer = async (id: string): Promise<MensajeSoporte> => {
    const mensaje = await enTx((tx) => repo.bloquearPorId(id, tx));
    if (!mensaje) throw new Error(`mensaje ${id} no encontrado`);
    return mensaje;
  };

  /** Deja la cola vacía: lo anterior pasa a `fallido`. */
  const vaciarCola = () =>
    baseA.query(
      `UPDATE mensajes_soporte SET estado_envio = 'fallido'
        WHERE estado_envio = 'pendiente'`,
    );

  const esperarBloqueadas = async (cuantas = 1): Promise<void> => {
    const limite = Date.now() + 5_000;
    for (;;) {
      const [{ n }] = await baseA.query<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_locks l
           JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE NOT l.granted
            AND a.datname = current_database()`,
      );
      if (n >= cuantas) return;
      if (Date.now() > limite) {
        throw new Error(`se esperaban ${cuantas} conexiones bloqueadas`);
      }
      await esperar(20);
    }
  };

  beforeAll(async () => {
    baseA = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: ENTIDADES,
    });
    await baseA.initialize();
    // El segundo proceso NO toca el esquema: ya lo dejó listo el primero.
    baseB = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: ENTIDADES,
      synchronize: false,
      dropSchema: false,
    });
    await baseB.initialize();

    const [tenant, otro] = await baseA.getRepository(TenantOrmEntity).save([
      { nombre: 'Clínica Soporte', slug: 'clinica-soporte-int' },
      { nombre: 'Otra Clínica', slug: 'otra-clinica-soporte-int' },
    ]);
    tenantId = tenant.id;
    otroTenantId = otro.id;
    const [usuario, otroUsuario] = await baseA
      .getRepository(UsuarioOrmEntity)
      .save([
        {
          email: 'dra@soporte.cl',
          passwordHash: 'x',
          nombreCompleto: 'Dra. Soporte',
          rol: RolUsuario.ADMINISTRADOR,
          tenantId,
        },
        {
          email: 'dr@otra.cl',
          passwordHash: 'x',
          nombreCompleto: 'Dr. Otra',
          rol: RolUsuario.ADMINISTRADOR,
          tenantId: otroTenantId,
        },
      ]);
    usuarioId = usuario.id;
    otroUsuarioId = otroUsuario.id;
  });

  afterAll(async () => {
    await baseB?.destroy();
    await baseA?.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('insertar', () => {
    it('devuelve el mensaje con id, creadoEn y proximoIntentoEn puestos por la base', async () => {
      // Act
      const guardado = await insertar({
        categoria: undefined,
        mensaje: '  Hola,\nno carga la agenda.  ',
      });

      // Assert
      expect(guardado.estaGuardado()).toBe(true);
      expect(guardado.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(guardado.creadoEn).toBeInstanceOf(Date);
      expect(guardado.proximoIntentoEn).toBeInstanceOf(Date);
      expect(guardado.categoria).toBe(CategoriaSoporte.OTRO);
      expect(guardado.mensaje).toBe('Hola,\nno carga la agenda.');
      expect(guardado.estadoEnvio).toBe(EstadoEnvioSoporte.PENDIENTE);
      expect(guardado.intentos).toBe(0);
      expect(guardado.enviadoEn).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('contarCreadosDesde', () => {
    it('cuenta solo los de su organización y desde el instante dado', async () => {
      // Arrange — dos recientes y uno de hace 25 h en el tenant; uno del otro
      await baseA.query('DELETE FROM mensajes_soporte');
      const reciente1 = await insertar();
      const reciente2 = await insertar();
      const viejo = await insertar();
      await enTx((tx) =>
        repo.insertar(
          MensajeSoporte.crear({
            tenantId: otroTenantId,
            usuarioId: otroUsuarioId,
            mensaje: 'De otra organización',
          }),
          tx,
        ),
      );
      await fijar(reciente1.id, {
        creado_en: new Date(AHORA.getTime() - HORA),
      });
      await fijar(reciente2.id, {
        creado_en: new Date(AHORA.getTime() - 23 * HORA),
      });
      await fijar(viejo.id, {
        creado_en: new Date(AHORA.getTime() - 25 * HORA),
      });

      // Act
      const desde = new Date(AHORA.getTime() - 24 * HORA);
      const total = await enTx((tx) =>
        repo.contarCreadosDesde(tenantId, desde, tx),
      );
      const delOtro = await enTx((tx) =>
        repo.contarCreadosDesde(otroTenantId, new Date(0), tx),
      );

      // Assert
      expect(total).toBe(2);
      expect(delOtro).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('reclamo con FOR UPDATE SKIP LOCKED', () => {
    it('dos transacciones a la vez reclaman filas DISTINTAS, en orden de próximo intento, sin esperarse', async () => {
      // Arrange — tres vencidos (en orden), uno futuro y uno ya enviado
      await vaciarCola();
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const m = await insertar();
        await fijar(m.id, {
          proximo_intento_en: new Date(AHORA.getTime() - (3 - i) * MIN),
        });
        ids.push(m.id);
      }
      const futuro = await insertar();
      await fijar(futuro.id, {
        proximo_intento_en: new Date(AHORA.getTime() + MIN),
      });
      const yaEnviado = await insertar();
      await fijar(yaEnviado.id, {
        estado_envio: 'enviado',
        enviado_en: AHORA,
        proximo_intento_en: new Date(AHORA.getTime() - 10 * MIN),
      });

      const a = baseA.createQueryRunner();
      const b = baseB.createQueryRunner();
      const c = baseB.createQueryRunner();
      for (const qr of [a, b, c]) {
        await qr.connect();
        await qr.startTransaction();
      }
      try {
        // Act
        const deA = await repo.reclamarSiguientePendiente(AHORA, a.manager);
        const deB = await repo.reclamarSiguientePendiente(AHORA, b.manager);
        const deC = await repo.reclamarSiguientePendiente(AHORA, c.manager);
        const deD = await enTx(
          (tx) => repo.reclamarSiguientePendiente(AHORA, tx),
          baseB,
        );

        // Assert — cada uno el siguiente libre; nada más disponible
        expect([deA?.id, deB?.id, deC?.id]).toEqual(ids);
        expect(deD).toBeNull();

        // A lo envía y confirma; B revierte (p. ej. el proceso murió)
        await repo.guardarEnvio(
          MensajeSoporte.reconstituir({
            id: deA!.id,
            tenantId: deA!.tenantId,
            usuarioId: deA!.usuarioId,
            categoria: deA!.categoria,
            mensaje: deA!.mensaje,
            estadoEnvio: EstadoEnvioSoporte.ENVIADO,
            intentos: 1,
            proximoIntentoEn: deA!.proximoIntentoEn,
            ultimoError: null,
            proveedor: 'registro',
            proveedorMensajeId: 'msg_a',
            enviadoEn: AHORA,
            creadoEn: deA!.creadoEn,
          }),
          a.manager,
        );
        await a.commitTransaction();
        await b.rollbackTransaction();

        // El de B vuelve a la cola; el enviado no
        const otraVez = await enTx((tx) =>
          repo.reclamarSiguientePendiente(AHORA, tx),
        );
        expect(otraVez?.id).toBe(ids[1]);
      } finally {
        for (const qr of [a, b, c]) {
          if (qr.isTransactionActive) await qr.rollbackTransaction();
          await qr.release();
        }
      }
      const enviado = await leer(ids[0]);
      expect(enviado.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(enviado.proveedorMensajeId).toBe('msg_a');
    });

    it('bloquearPorId ESPERA a la transacción que tiene la fila y lee lo que dejó', async () => {
      // Arrange
      await vaciarCola();
      const m = await insertar();
      await fijar(m.id, {
        proximo_intento_en: new Date(AHORA.getTime() - MIN),
      });
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        const tomado = await repo.reclamarSiguientePendiente(AHORA, a.manager);
        expect(tomado?.id).toBe(m.id);

        // Act — otro proceso intenta bloquearla para registrar un fallo
        const espera = observar(
          enTx((tx) => repo.bloquearPorId(m.id, tx), baseB),
        );
        await esperarBloqueadas();
        expect(espera.terminada()).toBe(false);

        // A lo deja `fallido` y confirma
        await repo.guardarEnvio(
          MensajeSoporte.reconstituir({
            id: tomado!.id,
            tenantId: tomado!.tenantId,
            usuarioId: tomado!.usuarioId,
            categoria: tomado!.categoria,
            mensaje: tomado!.mensaje,
            estadoEnvio: EstadoEnvioSoporte.FALLIDO,
            intentos: 1,
            proximoIntentoEn: tomado!.proximoIntentoEn,
            ultimoError: 'resend_422',
            proveedor: null,
            proveedorMensajeId: null,
            enviadoEn: null,
            creadoEn: tomado!.creadoEn,
          }),
          a.manager,
        );
        await a.commitTransaction();

        // Assert — B ve el estado confirmado (ya no pendiente)
        const visto = await espera.promesa;
        expect(visto?.estadoEnvio).toBe(EstadoEnvioSoporte.FALLIDO);
        expect(visto?.estaPendiente()).toBe(false);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
    });

    it('dos EnviarMensajesSoporteService.ejecutar en paralelo con un canal falso → cada mensaje se envía UNA vez', async () => {
      // Arrange — seis vencidos en la cola
      await vaciarCola();
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const m = await insertar();
        await fijar(m.id, {
          proximo_intento_en: new Date(AHORA.getTime() - (6 - i) * MIN),
        });
        ids.push(m.id);
      }
      // Un canal compartido que tarda un poco en responder: mientras uno
      // espera con su fila bloqueada, el otro proceso reclama la siguiente.
      const canal = new CanalMensajeriaFalso();
      const lento: CanalMensajeria = {
        enviar: async (mensaje: MensajeSaliente): Promise<ResultadoEnvio> => {
          await esperar(30);
          return canal.enviar(mensaje);
        },
      };
      const servicio = (base: DataSource): EnviarMensajesSoporteService =>
        new EnviarMensajesSoporteService(
          new TypeOrmTransactionRunner(base),
          repo,
          new TypeOrmUsuarioRepository(base.getRepository(UsuarioOrmEntity)),
          new TypeOrmTenantRepository(base.getRepository(TenantOrmEntity)),
          lento,
          {
            destino: 'soporte@citiahealth.cl',
            tz: 'America/Santiago',
            pausaEntreEnviosMs: 0,
          },
          () => AHORA,
        );

      // Act
      const [deA, deB] = await Promise.all([
        servicio(baseA).ejecutar({ lote: 20 }),
        servicio(baseB).ejecutar({ lote: 20 }),
      ]);

      // Assert — cada clave UNA vez, y todos enviados
      const claves = canal.enviados.map((m) => m.claveIdempotencia).sort();
      expect(claves).toEqual(ids.map((id) => `soporte/${id}`).sort());
      expect(deA.enviados + deB.enviados).toBe(6);
      // Los dos procesos trabajaron (el canal lento los obliga a turnarse)
      expect(deA.enviados).toBeGreaterThan(0);
      expect(deB.enviados).toBeGreaterThan(0);
      expect(deA.erroresInternos).toEqual([]);
      expect(deB.erroresInternos).toEqual([]);
      for (const id of ids) {
        const enviado = await leer(id);
        expect(enviado.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
        expect(enviado.enviadoEn).toEqual(AHORA);
        expect(enviado.proveedorMensajeId).toBe(`msg_soporte/${id}`);
        expect(enviado.intentos).toBe(1);
      }
      // Reply-To = correo del profesional, leído por el puerto de usuario
      expect(new Set(canal.enviados.map((m) => m.responderA))).toEqual(
        new Set(['dra@soporte.cl']),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('guardarEnvio', () => {
    it('persiste un reintento (intentos, próximo intento y código truncado) y deja la fila pendiente', async () => {
      // Arrange
      await vaciarCola();
      const m = await insertar();
      const proximo = new Date(AHORA.getTime() + 2 * MIN);

      // Act
      await enTx(async (tx) => {
        const bloqueado = await repo.bloquearPorId(m.id, tx);
        await repo.guardarEnvio(
          MensajeSoporte.reconstituir({
            id: bloqueado!.id,
            tenantId: bloqueado!.tenantId,
            usuarioId: bloqueado!.usuarioId,
            categoria: bloqueado!.categoria,
            mensaje: bloqueado!.mensaje,
            estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
            intentos: 1,
            proximoIntentoEn: proximo,
            ultimoError: 'E'.repeat(150),
            proveedor: null,
            proveedorMensajeId: null,
            enviadoEn: null,
            creadoEn: bloqueado!.creadoEn,
          }),
          tx,
        );
      });

      // Assert
      const leido = await leer(m.id);
      expect(leido.estaPendiente()).toBe(true);
      expect(leido.intentos).toBe(1);
      expect(leido.proximoIntentoEn.getTime()).toBe(proximo.getTime());
      expect(leido.ultimoError).toBe('E'.repeat(100));
    });

    it('no pisa un mensaje que ya no está pendiente (lanza y no escribe)', async () => {
      // Arrange
      const m = await insertar();
      await fijar(m.id, { estado_envio: 'enviado', enviado_en: AHORA });
      const enviado = await leer(m.id);

      // Act
      const intento = enTx((tx) =>
        repo.guardarEnvio(
          MensajeSoporte.reconstituir({
            id: enviado.id,
            tenantId: enviado.tenantId,
            usuarioId: enviado.usuarioId,
            categoria: enviado.categoria,
            mensaje: enviado.mensaje,
            estadoEnvio: EstadoEnvioSoporte.FALLIDO,
            intentos: 9,
            proximoIntentoEn: enviado.proximoIntentoEn,
            ultimoError: 'x',
            proveedor: null,
            proveedorMensajeId: null,
            enviadoEn: null,
            creadoEn: enviado.creadoEn,
          }),
          tx,
        ),
      );

      // Assert
      await expect(intento).rejects.toThrow(/ya no está pendiente/);
      expect((await leer(m.id)).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
    });
  });

  // ---------------------------------------------------------------------------
  describe('los CHECK de la entidad (synchronize)', () => {
    const insertarCrudo = (extra: Record<string, unknown>) => {
      const campos: Record<string, unknown> = {
        tenant_id: tenantId,
        usuario_id: usuarioId,
        mensaje: 'Texto',
        ...extra,
      };
      const nombres = Object.keys(campos);
      return baseA.query(
        `INSERT INTO mensajes_soporte (${nombres.map((n) => `"${n}"`).join(', ')})
         VALUES (${nombres.map((_n, i) => `$${i + 1}`).join(', ')})`,
        Object.values(campos),
      );
    };

    it.each<[string, Record<string, unknown>, string]>([
      [
        '2001 caracteres',
        { mensaje: 'a'.repeat(2001) },
        'CHK_mensajes_soporte_mensaje',
      ],
      [
        'un texto en blanco',
        { mensaje: '   ' },
        'CHK_mensajes_soporte_mensaje',
      ],
      [
        'enviado sin enviado_en',
        { estado_envio: 'enviado' },
        'CHK_mensajes_soporte_enviado',
      ],
      [
        'una categoría desconocida',
        { categoria: 'urgente' },
        'CHK_mensajes_soporte_categoria',
      ],
      ['intentos negativos', { intentos: -1 }, 'CHK_mensajes_soporte_intentos'],
    ])('rechazan %s', async (_caso, extra, constraint) => {
      expect(await errorDe(insertarCrudo(extra))).toEqual({
        code: '23514',
        constraint,
      });
    });
  });
});
