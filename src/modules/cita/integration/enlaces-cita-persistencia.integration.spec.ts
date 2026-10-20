import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { PacienteOrmEntity } from '../../paciente/infrastructure/persistence/paciente.orm-entity';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import {
  ActorCambio,
  CambioCita,
  PedidoPor,
  TipoCambio,
} from '../domain/cambio-cita.entity';
import { EstadoCita } from '../domain/cita.entity';
import {
  EnlaceCita,
  MotivoRevocacionEnlace,
} from '../domain/enlace-cita.entity';
import { CambioCitaOrmEntity } from '../infrastructure/persistence/cambio-cita.orm-entity';
import { CitaOrmEntity } from '../infrastructure/persistence/cita.orm-entity';
import { EnlaceCitaOrmEntity } from '../infrastructure/persistence/enlace-cita.orm-entity';
import { TypeOrmCambioCitaRepository } from '../infrastructure/persistence/typeorm-cambio-cita.repository';
import { TypeOrmCitaRepository } from '../infrastructure/persistence/typeorm-cita.repository';
import { TypeOrmEnlaceCitaRepository } from '../infrastructure/persistence/typeorm-enlace-cita.repository';

/**
 * Persistencia de la Fase 3 del módulo `cita` contra PostgreSQL real
 * (contrato §2.1 y §3.1). Lo que los dobles NO reproducen:
 *
 *  - las tres claves únicas de `enlaces_cita` (hash, (cita, versión) y la
 *    PARCIAL "un activo por cita") y que `ON CONFLICT DO NOTHING` sin destino
 *    las respete todas, también entre dos transacciones a la vez;
 *  - los CHECK (formato del hash, versión, coherencia de la revocación);
 *  - la revocación "gana la primera";
 *  - `buscarPorIdParaActualizar` (FOR NO KEY UPDATE) bloqueando a otra conexión;
 *  - el `DISTINCT ON` de `ultimosCambiosPorTipo`;
 *  - US-07.01: `registrarPrimeraApertura` (`UPDATE … WHERE primera_apertura_en
 *    IS NULL`) una sola vez, también con dos transacciones a la vez, sin pisar
 *    la revocación; y `pedido_por` de ida y vuelta por el adaptador, con sus
 *    dos CHECK.
 *
 * Dos DataSource = dos "procesos", cada uno con su pool.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const ENTIDADES = [
  TenantOrmEntity,
  UsuarioOrmEntity,
  PacienteOrmEntity,
  CitaOrmEntity,
  CambioCitaOrmEntity,
  EnlaceCitaOrmEntity,
];

const hashDe = (texto: string): string =>
  createHash('sha256').update(texto).digest('hex');

const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/** Error de Postgres tal como lo deja TypeORM (`QueryFailedError`). */
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

describe('Enlaces de cita y bloqueo de cita contra PostgreSQL (integration)', () => {
  let baseA: DataSource;
  let baseB: DataSource;
  const enlaces = new TypeOrmEnlaceCitaRepository();

  let tenantId: string;
  let otroTenantId: string;
  let usuarioId: string;

  const enTx = <T>(
    trabajo: (tx: EntityManager) => Promise<T>,
    base: DataSource = baseA,
  ): Promise<T> => base.transaction((manager) => trabajo(manager));

  const citas = (base: DataSource = baseA) =>
    new TypeOrmCitaRepository(
      base.getRepository(CitaOrmEntity),
      new ConfigService(),
    );

  const crearCita = async (tenant = tenantId): Promise<string> => {
    const paciente = await baseA.getRepository(PacienteOrmEntity).save({
      nombre: 'Paciente Enlace',
      telefono: '+56 9 0000 0000',
      correo: 'paciente@enlace.cl',
      consentimiento: true,
      rut: null,
      tenantId: tenant,
    });
    const cita = await baseA.getRepository(CitaOrmEntity).save({
      inicio: new Date(Date.now() + 86_400_000),
      duracionMin: 45,
      tipoConsulta: 'Control',
      estado: EstadoCita.PENDIENTE,
      tenantId: tenant,
      pacienteId: paciente.id,
      usuarioId,
    });
    return cita.id;
  };

  const emitir = (citaId: string, version: number, tenant = tenantId) =>
    EnlaceCita.emitir({
      citaId,
      tenantId: tenant,
      version,
      tokenHash: hashDe(`${citaId}:${version}`),
    });

  const contarEnlaces = async (citaId: string): Promise<number> => {
    const [{ n }] = await baseA.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM enlaces_cita WHERE cita_id = $1',
      [citaId],
    );
    return n;
  };

  const insertarCrudo = (
    citaId: string,
    version: number,
    tokenHash: string,
    extra: { revocadoEn?: Date; motivo?: string | null } = {},
  ): Promise<unknown> =>
    baseA.query(
      `INSERT INTO enlaces_cita
         (cita_id, tenant_id, version, token_hash, revocado_en, motivo_revocacion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        citaId,
        tenantId,
        version,
        tokenHash,
        extra.revocadoEn ?? null,
        extra.motivo ?? null,
      ],
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
    baseB = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: ENTIDADES,
      synchronize: false,
      dropSchema: false,
    });
    await baseB.initialize();

    const [tenant, otro] = await baseA.getRepository(TenantOrmEntity).save([
      { nombre: 'Clínica Enlaces', slug: 'clinica-enlaces-int' },
      { nombre: 'Otra Clínica', slug: 'otra-clinica-enlaces-int' },
    ]);
    tenantId = tenant.id;
    otroTenantId = otro.id;
    const usuario = await baseA.getRepository(UsuarioOrmEntity).save({
      email: 'profesional@enlaces-int.cl',
      passwordHash: '$2b$10$hash-de-prueba',
      nombreCompleto: 'Dra. Enlaces',
      rol: RolUsuario.PROFESIONAL,
      tenantId,
    });
    usuarioId = usuario.id;
  });

  beforeEach(async () => {
    await baseA.query('TRUNCATE enlaces_cita, cambios_cita, citas, pacientes');
  });

  afterAll(async () => {
    await baseB?.destroy();
    await baseA?.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('ciclo de un enlace (asegurarActivo → invalidar → siguiente versión)', () => {
    it('debería insertar la v1, leerla por cita y por hash, y conocer su versión', async () => {
      // Arrange
      const citaId = await crearCita();

      // Act
      const insertado = await enTx((tx) =>
        enlaces.insertarSiNoExiste(emitir(citaId, 1), tx),
      );

      // Assert
      expect(insertado).toBe(true);
      const activo = await enTx((tx) =>
        enlaces.buscarActivoPorCita(citaId, tx),
      );
      expect(activo).toMatchObject({
        citaId,
        tenantId,
        version: 1,
        tokenHash: hashDe(`${citaId}:1`),
      });
      expect(activo?.id).toEqual(expect.any(String));
      expect(activo?.emitidoEn).toBeInstanceOf(Date);
      expect(activo?.estaActivo()).toBe(true);
      const porHash = await enTx((tx) =>
        enlaces.buscarPorTokenHash(hashDe(`${citaId}:1`), tx),
      );
      expect(porHash?.id).toBe(activo?.id);
      expect(await enTx((tx) => enlaces.maxVersion(citaId, tx))).toBe(1);
    });

    it('debería devolver null / null cuando la cita nunca tuvo enlace', async () => {
      const citaId = await crearCita();
      expect(
        await enTx((tx) => enlaces.buscarActivoPorCita(citaId, tx)),
      ).toBeNull();
      expect(await enTx((tx) => enlaces.maxVersion(citaId, tx))).toBeNull();
      expect(
        await enTx((tx) => enlaces.buscarPorTokenHash(hashDe('nada'), tx)),
      ).toBeNull();
    });

    it('ON CONFLICT: repetir la misma (cita, versión) no inserta otra fila', async () => {
      // Arrange
      const citaId = await crearCita();
      await enTx((tx) => enlaces.insertarSiNoExiste(emitir(citaId, 1), tx));

      // Act
      const otraVez = await enTx((tx) =>
        enlaces.insertarSiNoExiste(emitir(citaId, 1), tx),
      );

      // Assert
      expect(otraVez).toBe(false);
      expect(await contarEnlaces(citaId)).toBe(1);
    });

    it('ON CONFLICT: con un activo, otra versión choca con el índice PARCIAL y no inserta', async () => {
      // Arrange
      const citaId = await crearCita();
      await enTx((tx) => enlaces.insertarSiNoExiste(emitir(citaId, 1), tx));

      // Act
      const v2 = await enTx((tx) =>
        enlaces.insertarSiNoExiste(emitir(citaId, 2), tx),
      );

      // Assert
      expect(v2).toBe(false);
      expect(await contarEnlaces(citaId)).toBe(1);
    });

    it('invalidar libera el hueco: la v2 entra, la v1 sigue resolviendo por hash pero revocada', async () => {
      // Arrange
      const citaId = await crearCita();
      await enTx((tx) => enlaces.insertarSiNoExiste(emitir(citaId, 1), tx));
      const ahora = new Date('2026-10-15T10:00:00.000Z');

      // Act
      const revocado = await enTx(async (tx) => {
        const v1 = await enlaces.buscarActivoPorCita(citaId, tx);
        v1!.invalidar(usuarioId, ahora);
        return enlaces.guardar(v1!, tx);
      });
      const v2 = await enTx(async (tx) => {
        const max = await enlaces.maxVersion(citaId, tx);
        return enlaces.insertarSiNoExiste(
          emitir(citaId, EnlaceCita.siguienteVersion(max)),
          tx,
        );
      });

      // Assert
      expect(revocado).toMatchObject({
        revocadoEn: ahora,
        motivoRevocacion: MotivoRevocacionEnlace.INVALIDADO,
        revocadoPor: usuarioId,
      });
      expect(v2).toBe(true);
      const activo = await enTx((tx) =>
        enlaces.buscarActivoPorCita(citaId, tx),
      );
      expect(activo?.version).toBe(2);
      const viejo = await enTx((tx) =>
        enlaces.buscarPorTokenHash(hashDe(`${citaId}:1`), tx),
      );
      expect(viejo?.estaActivo()).toBe(false);
      expect(await enTx((tx) => enlaces.maxVersion(citaId, tx))).toBe(2);
    });

    it('guardar: la primera revocación gana (no se pisa ni se des-revoca)', async () => {
      // Arrange
      const citaId = await crearCita();
      await enTx((tx) => enlaces.insertarSiNoExiste(emitir(citaId, 1), tx));
      // Dos lecturas del mismo enlace activo (como dos peticiones a la vez).
      const primera = (await enTx((tx) =>
        enlaces.buscarActivoPorCita(citaId, tx),
      ))!;
      const segunda = (await enTx((tx) =>
        enlaces.buscarActivoPorCita(citaId, tx),
      ))!;
      primera.invalidar(usuarioId, new Date('2026-10-15T10:00:00.000Z'));
      segunda.invalidar(
        '00000000-0000-4000-8000-000000000999',
        new Date('2026-10-16T10:00:00.000Z'),
      );

      // Act
      await enTx((tx) => enlaces.guardar(primera, tx));
      const resultado = await enTx((tx) => enlaces.guardar(segunda, tx));

      // Assert
      expect(resultado.revocadoPor).toBe(usuarioId);
      expect(resultado.revocadoEn).toEqual(
        new Date('2026-10-15T10:00:00.000Z'),
      );
    });

    it('dos transacciones emitiendo la misma v1 a la vez: una inserta, la otra ve el conflicto', async () => {
      // Arrange
      const citaId = await crearCita();
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        expect(
          await enlaces.insertarSiNoExiste(emitir(citaId, 1), a.manager),
        ).toBe(true);

        // Act — B intenta lo mismo desde otro proceso: espera a A.
        const deB = observar(
          enTx(
            (tx) => enlaces.insertarSiNoExiste(emitir(citaId, 1), tx),
            baseB,
          ),
        );
        await esperarBloqueadas();
        expect(deB.terminada()).toBe(false);
        await a.commitTransaction();

        // Assert
        expect(await deB.promesa).toBe(false);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      expect(await contarEnlaces(citaId)).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('restricciones de la tabla (sin ON CONFLICT)', () => {
    it('uq_enlace_cita_activo: dos activos para la misma cita', async () => {
      const citaId = await crearCita();
      await insertarCrudo(citaId, 1, hashDe('a'));

      expect(await errorDe(insertarCrudo(citaId, 2, hashDe('b')))).toEqual({
        code: '23505',
        constraint: 'uq_enlace_cita_activo',
      });
    });

    it('uq_enlace_cita_activo: varios revocados y un activo conviven', async () => {
      const citaId = await crearCita();
      const revocado = { revocadoEn: new Date(), motivo: 'invalidado' };
      await insertarCrudo(citaId, 1, hashDe('a'), revocado);
      await insertarCrudo(citaId, 2, hashDe('b'), revocado);

      await expect(
        insertarCrudo(citaId, 3, hashDe('c')),
      ).resolves.toBeDefined();
      expect(await contarEnlaces(citaId)).toBe(3);
    });

    it('uq_enlace_cita_version: la misma versión dos veces', async () => {
      const citaId = await crearCita();
      await insertarCrudo(citaId, 1, hashDe('a'), {
        revocadoEn: new Date(),
        motivo: 'invalidado',
      });

      expect(await errorDe(insertarCrudo(citaId, 1, hashDe('b')))).toEqual({
        code: '23505',
        constraint: 'uq_enlace_cita_version',
      });
    });

    it('uq_enlace_cita_token_hash: el mismo hash en otra cita', async () => {
      const citaA = await crearCita();
      const citaB = await crearCita();
      await insertarCrudo(citaA, 1, hashDe('mismo'));

      expect(await errorDe(insertarCrudo(citaB, 1, hashDe('mismo')))).toEqual({
        code: '23505',
        constraint: 'uq_enlace_cita_token_hash',
      });
    });

    it.each([
      ['el token en claro (43 caracteres)', 'Ab-_'.repeat(10) + 'xyz'],
      ['un hash en mayúsculas', 'A'.repeat(64)],
    ])('CHK_enlaces_cita_token_hash: rechaza %s', async (_caso, valor) => {
      const citaId = await crearCita();

      expect(await errorDe(insertarCrudo(citaId, 1, valor))).toEqual({
        code: '23514',
        constraint: 'CHK_enlaces_cita_token_hash',
      });
    });

    it('CHK_enlaces_cita_version: versión 0', async () => {
      const citaId = await crearCita();

      expect(await errorDe(insertarCrudo(citaId, 0, hashDe('a')))).toEqual({
        code: '23514',
        constraint: 'CHK_enlaces_cita_version',
      });
    });

    it.each<[string, { revocadoEn?: Date; motivo?: string | null }]>([
      ['revocado sin motivo', { revocadoEn: new Date(), motivo: null }],
      ['motivo sin revocar', { motivo: 'invalidado' }],
      ['motivo desconocido', { revocadoEn: new Date(), motivo: 'otro' }],
    ])('CHK_enlaces_cita_revocacion: %s', async (_caso, extra) => {
      const citaId = await crearCita();

      expect(
        await errorDe(insertarCrudo(citaId, 1, hashDe('a'), extra)),
      ).toEqual({
        code: '23514',
        constraint: 'CHK_enlaces_cita_revocacion',
      });
    });

    it('FK_enlaces_cita: la cita debe existir', async () => {
      const error = await errorDe(
        insertarCrudo('00000000-0000-4000-8000-000000000001', 1, hashDe('a')),
      );

      expect(error.code).toBe('23503');
    });
  });

  // ---------------------------------------------------------------------------
  describe('CitaRepository.buscarPorIdParaActualizar (FOR NO KEY UPDATE)', () => {
    it('debería bloquear la cita: otra transacción espera hasta el commit y relee', async () => {
      // Arrange
      const citaId = await crearCita();
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        const deA = await citas().buscarPorIdParaActualizar(
          citaId,
          tenantId,
          a.manager,
        );
        deA!.confirmar();
        await citas().guardar(deA!, a.manager);

        // Act — B pide la misma cita con bloqueo desde otro proceso.
        const deB = observar(
          enTx(
            (tx) =>
              citas(baseB).buscarPorIdParaActualizar(citaId, tenantId, tx),
            baseB,
          ),
        );
        await esperarBloqueadas();
        expect(deB.terminada()).toBe(false);
        await a.commitTransaction();

        // Assert — B ve el estado confirmado por A.
        expect((await deB.promesa)?.estado).toBe(EstadoCita.CONFIRMADA);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
    });

    it('debería devolver null para una cita de otro tenant', async () => {
      const citaId = await crearCita();

      expect(
        await enTx((tx) =>
          citas().buscarPorIdParaActualizar(citaId, otroTenantId, tx),
        ),
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('CambioCitaRepository.ultimosCambiosPorTipo', () => {
    const registrar = (
      citaId: string,
      tipo: TipoCambio,
      actor: ActorCambio,
      ocurridoEn: string,
      tenant = tenantId,
    ): Promise<unknown> =>
      baseA.query(
        `INSERT INTO cambios_cita (cita_id, tenant_id, tipo, actor_tipo, ocurrido_en)
         VALUES ($1, $2, $3, $4, $5)`,
        [citaId, tenant, tipo, actor, ocurridoEn],
      );

    it('debería devolver el actor del ÚLTIMO cambio de cada tipo pedido', async () => {
      // Arrange — confirmó el profesional, se reagendó, confirmó el paciente.
      const citaId = await crearCita();
      await registrar(
        citaId,
        TipoCambio.CREADA,
        ActorCambio.PROFESIONAL,
        '2026-10-01T10:00:00Z',
      );
      await registrar(
        citaId,
        TipoCambio.CONFIRMADA,
        ActorCambio.PROFESIONAL,
        '2026-10-02T10:00:00Z',
      );
      await registrar(
        citaId,
        TipoCambio.REAGENDADA,
        ActorCambio.PROFESIONAL,
        '2026-10-03T10:00:00Z',
      );
      await registrar(
        citaId,
        TipoCambio.CONFIRMADA,
        ActorCambio.PACIENTE,
        '2026-10-04T10:00:00Z',
      );
      const repo = new TypeOrmCambioCitaRepository(
        baseA.getRepository(CambioCitaOrmEntity),
      );

      // Act
      const ultimos = await repo.ultimosCambiosPorTipo(citaId, tenantId, [
        TipoCambio.CONFIRMADA,
        TipoCambio.REAGENDADA,
        TipoCambio.CANCELADA,
      ]);

      // Assert — con el instante, para comparar confirmación y reagendamiento.
      expect(ultimos).toEqual({
        [TipoCambio.CONFIRMADA]: {
          actor: ActorCambio.PACIENTE,
          ocurridoEn: new Date('2026-10-04T10:00:00Z'),
        },
        [TipoCambio.REAGENDADA]: {
          actor: ActorCambio.PROFESIONAL,
          ocurridoEn: new Date('2026-10-03T10:00:00Z'),
        },
      });
    });

    it('debería devolver {} para la cita vista desde otro tenant', async () => {
      const citaId = await crearCita();
      await registrar(
        citaId,
        TipoCambio.CANCELADA,
        ActorCambio.PACIENTE,
        '2026-10-02T10:00:00Z',
      );
      const repo = new TypeOrmCambioCitaRepository(
        baseA.getRepository(CambioCitaOrmEntity),
      );

      expect(
        await repo.ultimosCambiosPorTipo(citaId, otroTenantId, [
          TipoCambio.CANCELADA,
        ]),
      ).toEqual({});
      expect(
        await repo.ultimosCambiosPorTipo(citaId, tenantId, [
          TipoCambio.CANCELADA,
        ]),
      ).toEqual({
        [TipoCambio.CANCELADA]: {
          actor: ActorCambio.PACIENTE,
          ocurridoEn: new Date('2026-10-02T10:00:00Z'),
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('EnlaceCitaRepository.registrarPrimeraApertura (US-07.01, H5)', () => {
    const T1 = new Date('2026-10-19T15:00:00.000Z');
    const T2 = new Date('2026-10-19T16:00:00.000Z');

    const emitirV1 = async (citaId: string): Promise<EnlaceCita> => {
      await enTx((tx) => enlaces.insertarSiNoExiste(emitir(citaId, 1), tx));
      return (await enTx((tx) => enlaces.buscarActivoPorCita(citaId, tx)))!;
    };

    const columnasDe = async (enlaceId: string) => {
      const [fila] = await baseA.query<
        {
          apertura: Date | null;
          revocadoEn: Date | null;
          motivo: string | null;
          revocadoPor: string | null;
        }[]
      >(
        `SELECT primera_apertura_en     AS apertura,
                revocado_en             AS "revocadoEn",
                motivo_revocacion::text AS motivo,
                revocado_por::text      AS "revocadoPor"
           FROM enlaces_cita WHERE id = $1`,
        [enlaceId],
      );
      return fila;
    };

    it('debería escribir la primera vez (true) y no cambiar el valor la segunda (false); el dominio la relee', async () => {
      // Arrange
      const citaId = await crearCita();
      const enlace = await emitirV1(citaId);
      expect(enlace.primeraAperturaEn).toBeNull();

      // Act
      const primera = await enTx((tx) =>
        enlaces.registrarPrimeraApertura(enlace.id, T1, tx),
      );
      const segunda = await enTx((tx) =>
        enlaces.registrarPrimeraApertura(enlace.id, T2, tx),
      );

      // Assert
      expect([primera, segunda]).toEqual([true, false]);
      expect((await columnasDe(enlace.id)).apertura).toEqual(T1);
      expect(
        (await enTx((tx) => enlaces.buscarActivoPorCita(citaId, tx)))
          ?.primeraAperturaEn,
      ).toEqual(T1);
      expect(
        (
          await enTx((tx) =>
            enlaces.buscarPorTokenHash(hashDe(`${citaId}:1`), tx),
          )
        )?.primeraAperturaEn,
      ).toEqual(T1);
    });

    it('dos a la vez (dos procesos): la segunda espera el candado de la fila, reevalúa el WHERE y no escribe', async () => {
      // Arrange
      const citaId = await crearCita();
      const enlace = await emitirV1(citaId);
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        expect(
          await enlaces.registrarPrimeraApertura(enlace.id, T1, a.manager),
        ).toBe(true);

        // Act — B (otro pool) intenta la suya mientras A no confirma
        const deB = observar(
          enTx(
            (tx) => enlaces.registrarPrimeraApertura(enlace.id, T2, tx),
            baseB,
          ),
        );
        await esperarBloqueadas();
        expect(deB.terminada()).toBe(false);
        await a.commitTransaction();

        // Assert
        expect(await deB.promesa).toBe(false);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      expect((await columnasDe(enlace.id)).apertura).toEqual(T1);
    });

    it('si la primera se revierte, la que esperaba escribe la suya (sigue habiendo una sola)', async () => {
      // Arrange
      const citaId = await crearCita();
      const enlace = await emitirV1(citaId);
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        await enlaces.registrarPrimeraApertura(enlace.id, T1, a.manager);
        const deB = observar(
          enTx(
            (tx) => enlaces.registrarPrimeraApertura(enlace.id, T2, tx),
            baseB,
          ),
        );
        await esperarBloqueadas();

        // Act
        await a.rollbackTransaction();

        // Assert
        expect(await deB.promesa).toBe(true);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      expect((await columnasDe(enlace.id)).apertura).toEqual(T2);
    });

    it('seis a la vez desde los dos procesos, sin coordinar → escribe exactamente una', async () => {
      // Arrange
      const citaId = await crearCita();
      const enlace = await emitirV1(citaId);
      const instantes = Array.from(
        { length: 6 },
        (_, i) => new Date(T1.getTime() + i * 1000),
      );

      // Act
      const escritas = await Promise.all(
        instantes.map((instante, i) =>
          enTx(
            (tx) => enlaces.registrarPrimeraApertura(enlace.id, instante, tx),
            i % 2 === 0 ? baseA : baseB,
          ),
        ),
      );

      // Assert
      expect(escritas.filter(Boolean)).toHaveLength(1);
      const ganadora = instantes[escritas.indexOf(true)];
      expect((await columnasDe(enlace.id)).apertura).toEqual(ganadora);
    });

    it('no toca las columnas de revocación, y revocar (guardar) no pisa la apertura aunque la entidad se haya leído antes', async () => {
      // Arrange — la entidad se lee ANTES de la apertura (queda vieja)
      const citaId = await crearCita();
      const leidaAntes = await emitirV1(citaId);
      await enTx((tx) =>
        enlaces.registrarPrimeraApertura(leidaAntes.id, T1, tx),
      );
      expect(await columnasDe(leidaAntes.id)).toEqual({
        apertura: T1,
        revocadoEn: null,
        motivo: null,
        revocadoPor: null,
      });

      // Act
      leidaAntes.invalidar(usuarioId, T2);
      const revocado = await enTx((tx) => enlaces.guardar(leidaAntes, tx));

      // Assert
      expect(await columnasDe(leidaAntes.id)).toEqual({
        apertura: T1,
        revocadoEn: T2,
        motivo: MotivoRevocacionEnlace.INVALIDADO,
        revocadoPor: usuarioId,
      });
      expect(revocado.primeraAperturaEn).toEqual(T1);
    });

    it('se guarda por versión: tras invalidar, la v2 empieza sin apertura y la v1 conserva la suya', async () => {
      // Arrange
      const citaId = await crearCita();
      const v1 = await emitirV1(citaId);
      await enTx((tx) => enlaces.registrarPrimeraApertura(v1.id, T1, tx));
      v1.invalidar(usuarioId, T2);
      await enTx((tx) => enlaces.guardar(v1, tx));

      // Act
      await enTx((tx) => enlaces.insertarSiNoExiste(emitir(citaId, 2), tx));
      const v2 = await enTx((tx) => enlaces.buscarActivoPorCita(citaId, tx));

      // Assert
      expect(v2?.version).toBe(2);
      expect(v2?.primeraAperturaEn).toBeNull();
      expect((await columnasDe(v1.id)).apertura).toEqual(T1);
    });

    it('un id que no es UUID o que no existe → false, sin escribir nada', async () => {
      // Arrange
      const citaId = await crearCita();
      const enlace = await emitirV1(citaId);

      // Act & Assert
      expect(
        await enTx((tx) =>
          enlaces.registrarPrimeraApertura('no-es-un-uuid', T1, tx),
        ),
      ).toBe(false);
      expect(
        await enTx((tx) =>
          enlaces.registrarPrimeraApertura(
            '00000000-0000-4000-8000-000000000123',
            T1,
            tx,
          ),
        ),
      ).toBe(false);
      expect((await columnasDe(enlace.id)).apertura).toBeNull();
    });

    it('sin transacción lanza (como todo el puerto)', async () => {
      // Arrange
      const citaId = await crearCita();
      const enlace = await emitirV1(citaId);

      // Act & Assert
      await expect(
        enlaces.registrarPrimeraApertura(enlace.id, T1, undefined),
      ).rejects.toThrow(/requiere una transacción/);
      expect((await columnasDe(enlace.id)).apertura).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('CambioCitaRepository: pedido_por de ida y vuelta (US-07.01, H3)', () => {
    const repo = () =>
      new TypeOrmCambioCitaRepository(baseA.getRepository(CambioCitaOrmEntity));

    const insertarCrudoCambio = (
      citaId: string,
      tipo: string,
      actor: string,
      pedidoPor: string | null,
    ): Promise<unknown> =>
      baseA.query(
        `INSERT INTO cambios_cita (cita_id, tenant_id, tipo, actor_tipo, pedido_por)
         VALUES ($1, $2, $3, $4, $5)`,
        [citaId, tenantId, tipo, actor, pedidoPor],
      );

    it('registrar persiste pedido_por y historialDeCita lo devuelve tal cual (el vacío como null)', async () => {
      // Arrange
      const citaId = await crearCita();
      const cambio = (
        tipo: TipoCambio,
        pedidoPor: PedidoPor | null,
        actorTipo = ActorCambio.PROFESIONAL,
      ) =>
        CambioCita.registrar({
          citaId,
          tenantId,
          tipo,
          actorTipo,
          actorId: actorTipo === ActorCambio.PROFESIONAL ? usuarioId : null,
          pedidoPor,
        });

      // Act — uno detrás de otro, para que `ocurrido_en` los ordene
      await repo().registrar(cambio(TipoCambio.CREADA, null));
      await repo().registrar(cambio(TipoCambio.REAGENDADA, PedidoPor.PACIENTE));
      await repo().registrar(
        cambio(TipoCambio.REAGENDADA, PedidoPor.PROFESIONAL),
      );
      await repo().registrar(cambio(TipoCambio.CANCELADA, null));

      // Assert
      const historial = await repo().historialDeCita(citaId, tenantId);
      expect(historial.map((c) => [c.tipo, c.pedidoPor])).toEqual([
        [TipoCambio.CREADA, null],
        [TipoCambio.REAGENDADA, PedidoPor.PACIENTE],
        [TipoCambio.REAGENDADA, PedidoPor.PROFESIONAL],
        [TipoCambio.CANCELADA, null],
      ]);
      const [{ n }] = await baseA.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM cambios_cita
          WHERE cita_id = $1 AND pedido_por::text = 'paciente'`,
        [citaId],
      );
      expect(n).toBe(1);
    });

    it('una fila anterior a US-07.01 (cancelada por el paciente, sin pedido_por) vuelve con null: el adaptador no la completa', async () => {
      // Arrange
      const citaId = await crearCita();
      await insertarCrudoCambio(citaId, 'cancelada', 'paciente', null);

      // Act
      const [cambio] = await repo().historialDeCita(citaId, tenantId);

      // Assert
      expect(cambio.actorTipo).toBe(ActorCambio.PACIENTE);
      expect(cambio.pedidoPor).toBeNull();
    });

    it('los CHECK del esquema de synchronize rechazan lo mismo que el dominio', async () => {
      // Arrange
      const citaId = await crearCita();

      // Act & Assert
      expect(
        await errorDe(
          insertarCrudoCambio(citaId, 'confirmada', 'profesional', 'paciente'),
        ),
      ).toEqual({ code: '23514', constraint: 'CHK_cambios_cita_pedido_por' });
      expect(
        await errorDe(
          insertarCrudoCambio(citaId, 'cancelada', 'paciente', 'profesional'),
        ),
      ).toEqual({
        code: '23514',
        constraint: 'CHK_cambios_cita_pedido_por_paciente',
      });
      await expect(
        insertarCrudoCambio(citaId, 'cancelada', 'paciente', 'paciente'),
      ).resolves.toBeDefined();
    });
  });
});
