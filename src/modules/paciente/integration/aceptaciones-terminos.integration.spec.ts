import { randomUUID } from 'node:crypto';

import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import { PacientesService } from '../application/pacientes.service';
import {
  AceptacionTerminos,
  CanalAceptacion,
} from '../domain/aceptacion-terminos.entity';
import { AceptacionTerminosOrmEntity } from '../infrastructure/persistence/aceptacion-terminos.orm-entity';
import { PacienteOrmEntity } from '../infrastructure/persistence/paciente.orm-entity';
import { TypeOrmAceptacionTerminosRepository } from '../infrastructure/persistence/typeorm-aceptacion-terminos.repository';
import { TypeOrmPacienteRepository } from '../infrastructure/persistence/typeorm-paciente.repository';

/**
 * `aceptaciones_terminos` y la bandera `pacientes.consentimiento` (US-11,
 * ADR-16 §3–§4) contra PostgreSQL real. Lo que los dobles NO reproducen:
 *
 *  - los tres CHECK (canal, referencia del canal, formato de la versión, con
 *    la barra de la regex llegando a Postgres);
 *  - el índice único (paciente, versión, canal) con `ON CONFLICT DO NOTHING`
 *    cuando DOS transacciones en conexiones distintas insertan a la vez;
 *  - el `INSERT … SELECT … FROM pacientes` por id Y tenant;
 *  - las FK `RESTRICT` (la prueba no se puede borrar por debajo);
 *  - el `UPDATE` condicional y por tenant de `marcarConsentimiento`;
 *  - que la fila y la bandera viajan en la transacción de quien registra.
 *
 * Dos `DataSource` (dos pools) sobre la misma base: la segunda conexión no
 * comparte la transacción de la primera, así se ve quién espera a quién.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const ENTIDADES = [
  TenantOrmEntity,
  UsuarioOrmEntity,
  PacienteOrmEntity,
  AceptacionTerminosOrmEntity,
];

const INDICE_UNICO = 'uq_aceptaciones_terminos_paciente_version_canal';
const AHORA = new Date('2026-11-14T15:00:00.000Z');

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

interface FilaAceptacion {
  id: string;
  tenantId: string;
  pacienteId: string;
  version: string;
  canal: string;
  aceptadaEn: Date;
  usuarioId: string | null;
  solicitudId: string | null;
  enlaceId: string | null;
  registradaEn: Date;
}

describe('aceptaciones_terminos contra PostgreSQL (integration)', () => {
  let baseA: DataSource;
  let baseB: DataSource;
  let aceptacionesA: TypeOrmAceptacionTerminosRepository;
  let aceptacionesB: TypeOrmAceptacionTerminosRepository;
  let pacientesA: TypeOrmPacienteRepository;

  let tenantId: string;
  let otroTenantId: string;
  let usuarioId: string;
  // Se recrean en cada caso (la bandera arranca en false).
  let pacienteId: string;
  let pacienteAjenoId: string;

  const enTx = <T>(
    trabajo: (tx: EntityManager) => Promise<T>,
    base: DataSource = baseA,
  ): Promise<T> => base.transaction((manager) => trabajo(manager));

  /** Una aceptación recién registrada (sin id), por canal. */
  const registrar = (
    canal: CanalAceptacion,
    extra: Partial<{
      pacienteId: string;
      tenantId: string;
      aceptadaEn: Date;
    }> = {},
  ): AceptacionTerminos => {
    const base = {
      tenantId: extra.tenantId ?? tenantId,
      pacienteId: extra.pacienteId ?? pacienteId,
      version: '1.0',
      aceptadaEn: extra.aceptadaEn ?? AHORA,
    };
    switch (canal) {
      case CanalAceptacion.FORMULARIO_PUBLICO:
        return AceptacionTerminos.registrar({
          ...base,
          canal,
          solicitudId: randomUUID(),
        });
      case CanalAceptacion.ENLACE_CITA:
        return AceptacionTerminos.registrar({
          ...base,
          canal,
          enlaceId: randomUUID(),
        });
      case CanalAceptacion.PROFESIONAL:
        return AceptacionTerminos.registrar({ ...base, canal, usuarioId });
    }
  };

  /** INSERT directo, para probar las restricciones sin pasar por el dominio. */
  const insertarCrudo = (
    campos: Partial<{
      tenantId: string;
      pacienteId: string;
      version: string;
      canal: string;
      usuarioId: string | null;
      solicitudId: string | null;
      enlaceId: string | null;
    }> = {},
  ): Promise<unknown> =>
    baseA.query(
      `INSERT INTO aceptaciones_terminos
         (tenant_id, paciente_id, version, canal, aceptada_en,
          usuario_id, solicitud_id, enlace_id)
       VALUES ($1, $2, $3, $4, now(), $5, $6, $7)`,
      [
        campos.tenantId ?? tenantId,
        campos.pacienteId ?? pacienteId,
        campos.version ?? '1.0',
        campos.canal ?? 'profesional',
        campos.usuarioId === undefined ? usuarioId : campos.usuarioId,
        campos.solicitudId ?? null,
        campos.enlaceId ?? null,
      ],
    );

  const filas = (id = pacienteId): Promise<FilaAceptacion[]> =>
    baseA.query<FilaAceptacion[]>(
      `SELECT id::text            AS "id",
              tenant_id::text     AS "tenantId",
              paciente_id::text   AS "pacienteId",
              version, canal,
              aceptada_en         AS "aceptadaEn",
              usuario_id::text    AS "usuarioId",
              solicitud_id::text  AS "solicitudId",
              enlace_id::text     AS "enlaceId",
              registrada_en       AS "registradaEn"
         FROM aceptaciones_terminos
        WHERE paciente_id = $1
        ORDER BY registrada_en, id`,
      [id],
    );

  const fichaDe = async (
    id: string,
  ): Promise<{ consentimiento: boolean; actualizadoEn: Date }> => {
    const [fila] = await baseA.query<
      { consentimiento: boolean; actualizadoEn: Date }[]
    >(
      `SELECT consentimiento, actualizado_en AS "actualizadoEn"
         FROM pacientes WHERE id = $1`,
      [id],
    );
    return fila;
  };

  const esperarBloqueadas = async (): Promise<void> => {
    const limite = Date.now() + 5_000;
    for (;;) {
      const [{ n }] = await baseA.query<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_locks l
           JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE NOT l.granted
            AND a.datname = current_database()`,
      );
      if (n >= 1) return;
      if (Date.now() > limite)
        throw new Error('se esperaba una conexión bloqueada');
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
    aceptacionesA = new TypeOrmAceptacionTerminosRepository(baseA.manager);
    aceptacionesB = new TypeOrmAceptacionTerminosRepository(baseB.manager);
    pacientesA = new TypeOrmPacienteRepository(
      baseA.getRepository(PacienteOrmEntity),
    );

    const [tenant, otro] = await baseA.getRepository(TenantOrmEntity).save([
      { nombre: 'Clínica Términos', slug: 'clinica-terminos-int' },
      { nombre: 'Otra Clínica', slug: 'otra-clinica-terminos-int' },
    ]);
    tenantId = tenant.id;
    otroTenantId = otro.id;
    const usuario = await baseA.getRepository(UsuarioOrmEntity).save({
      email: 'profesional@terminos-int.cl',
      passwordHash: '$2b$10$hash-de-prueba',
      nombreCompleto: 'Dra. Términos',
      rol: RolUsuario.PROFESIONAL,
      tenantId,
    });
    usuarioId = usuario.id;
  });

  beforeEach(async () => {
    await baseA.query('TRUNCATE aceptaciones_terminos, pacientes');
    const [propio, ajeno] = await baseA.getRepository(PacienteOrmEntity).save([
      {
        rut: '123456785',
        nombre: 'Paciente Términos',
        telefono: '+56 9 1111 1111',
        correo: 'terminos@correo.cl',
        consentimiento: false,
        tenantId,
      },
      {
        rut: '111111111',
        nombre: 'Paciente de Otra Clínica',
        telefono: '+56 9 2222 2222',
        correo: 'otra@correo.cl',
        consentimiento: false,
        tenantId: otroTenantId,
      },
    ]);
    pacienteId = propio.id;
    pacienteAjenoId = ajeno.id;
  });

  afterAll(async () => {
    await baseB?.destroy();
    await baseA?.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('insertarSiNoExiste: ida y vuelta', () => {
    it('debería guardar la fila tal cual, con id y registrada_en de la base', async () => {
      // Arrange
      const antes = Date.now();
      const aceptacion = registrar(CanalAceptacion.PROFESIONAL);

      // Act
      const insertada = await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(aceptacion, tx),
      );

      // Assert
      expect(insertada).toBe(true);
      const [fila] = await filas();
      expect(fila).toMatchObject({
        tenantId,
        pacienteId,
        version: '1.0',
        canal: 'profesional',
        aceptadaEn: AHORA,
        usuarioId,
        solicitudId: null,
        enlaceId: null,
      });
      expect(fila.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(fila.registradaEn.getTime()).toBeGreaterThanOrEqual(antes - 1_000);
    });

    it('una fila por canal: el mismo paciente y versión admite las tres', async () => {
      // Act
      const resultados = await enTx(async (tx) => [
        await aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.FORMULARIO_PUBLICO),
          tx,
        ),
        await aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA),
          tx,
        ),
        await aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.PROFESIONAL),
          tx,
        ),
      ]);

      // Assert
      expect(resultados).toEqual([true, true, true]);
      expect((await filas()).map((f) => f.canal).sort()).toEqual([
        'enlace_cita',
        'formulario_publico',
        'profesional',
      ]);
    });

    it('debería exigir la transacción (sin ella no escribe)', async () => {
      await expect(
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA),
          undefined,
        ),
      ).rejects.toThrow(/requiere una transacción/);
      expect(await filas()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('CHECK', () => {
    it('las expresiones llegan a Postgres con la barra de la regex (un punto literal)', async () => {
      // Act
      const [{ def }] = await baseA.query<{ def: string }[]>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'CHK_aceptaciones_terminos_version'`,
      );

      // Assert
      expect(def).toContain('^[0-9]+\\.[0-9]+$');
    });

    it.each(['1', 'v1.0', '1x0', '1.0.0', '', '.1', '1.'])(
      'CHK_aceptaciones_terminos_version: rechaza la versión %p',
      async (version) => {
        expect(await errorDe(insertarCrudo({ version }))).toEqual({
          code: '23514',
          constraint: 'CHK_aceptaciones_terminos_version',
        });
      },
    );

    it.each(['1.0', '10.25'])(
      'CHK_aceptaciones_terminos_version: admite %p',
      async (version) => {
        await expect(insertarCrudo({ version })).resolves.toBeDefined();
      },
    );

    it('CHK_aceptaciones_terminos_canal: rechaza un canal desconocido', async () => {
      // (Los CHECK se evalúan por orden alfabético de nombre: el del canal
      // salta antes que el de la referencia.)
      expect(await errorDe(insertarCrudo({ canal: 'telefono' }))).toEqual({
        code: '23514',
        constraint: 'CHK_aceptaciones_terminos_canal',
      });
    });

    it.each<[string, Parameters<typeof insertarCrudo>[0]]>([
      [
        'formulario_publico con la referencia de otro canal (enlace)',
        {
          canal: 'formulario_publico',
          usuarioId: null,
          enlaceId: randomUUID(),
        },
      ],
      [
        'enlace_cita con la referencia de otro canal (usuario)',
        { canal: 'enlace_cita' },
      ],
      [
        'profesional con dos referencias (usuario y solicitud)',
        { canal: 'profesional', solicitudId: randomUUID() },
      ],
      [
        'enlace_cita con dos referencias (enlace y solicitud)',
        {
          canal: 'enlace_cita',
          usuarioId: null,
          enlaceId: randomUUID(),
          solicitudId: randomUUID(),
        },
      ],
      [
        'profesional sin ninguna referencia',
        { canal: 'profesional', usuarioId: null },
      ],
    ])('CHK_aceptaciones_terminos_referencia: %s', async (_caso, campos) => {
      expect(await errorDe(insertarCrudo(campos))).toEqual({
        code: '23514',
        constraint: 'CHK_aceptaciones_terminos_referencia',
      });
    });

    it.each<[string, Parameters<typeof insertarCrudo>[0]]>([
      [
        'formulario_publico',
        {
          canal: 'formulario_publico',
          usuarioId: null,
          solicitudId: randomUUID(),
        },
      ],
      [
        'enlace_cita',
        { canal: 'enlace_cita', usuarioId: null, enlaceId: randomUUID() },
      ],
      ['profesional', { canal: 'profesional' }],
    ])('admite %s con exactamente su referencia', async (_canal, campos) => {
      await expect(insertarCrudo(campos)).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe(`índice único ${INDICE_UNICO} (D11)`, () => {
    it('sin ON CONFLICT, la base rechaza la segunda fila del mismo paciente, versión y canal', async () => {
      // Arrange
      await insertarCrudo();

      // Act & Assert
      expect(await errorDe(insertarCrudo())).toEqual({
        code: '23505',
        constraint: INDICE_UNICO,
      });
    });

    it('con ON CONFLICT DO NOTHING, la segunda no escribe y devuelve false', async () => {
      // Arrange
      await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA),
          tx,
        ),
      );

      // Act
      const segunda = await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA),
          tx,
        ),
      );

      // Assert
      expect(segunda).toBe(false);
      expect(await filas()).toHaveLength(1);
    });

    it('dos transacciones a la vez en conexiones distintas: la segunda espera en el índice y, al confirmar la primera, no escribe → UNA fila (la del primer acto)', async () => {
      // Arrange — A inserta y sigue con su transacción abierta
      const primeraEn = new Date('2026-11-14T15:00:00.000Z');
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        expect(
          await aceptacionesA.insertarSiNoExiste(
            registrar(CanalAceptacion.ENLACE_CITA, { aceptadaEn: primeraEn }),
            a.manager,
          ),
        ).toBe(true);

        // Act — B (otro pool) intenta lo mismo
        const deB = observar(
          enTx(
            (tx) =>
              aceptacionesB.insertarSiNoExiste(
                registrar(CanalAceptacion.ENLACE_CITA, {
                  aceptadaEn: new Date('2026-11-14T15:00:05.000Z'),
                }),
                tx,
              ),
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
      const quedan = await filas();
      expect(quedan).toHaveLength(1);
      expect(quedan[0].aceptadaEn).toEqual(primeraEn);
    });

    it('si la primera se revierte, la segunda (que esperaba) escribe la suya', async () => {
      // Arrange
      const segundaEn = new Date('2026-11-14T15:00:05.000Z');
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        await aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA),
          a.manager,
        );

        // Act
        const deB = observar(
          enTx(
            (tx) =>
              aceptacionesB.insertarSiNoExiste(
                registrar(CanalAceptacion.ENLACE_CITA, {
                  aceptadaEn: segundaEn,
                }),
                tx,
              ),
            baseB,
          ),
        );
        await esperarBloqueadas();
        await a.rollbackTransaction();

        // Assert
        expect(await deB.promesa).toBe(true);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      const quedan = await filas();
      expect(quedan).toHaveLength(1);
      expect(quedan[0].aceptadaEn).toEqual(segundaEn);
    });

    it('cinco inserciones en paralelo, cada una en su transacción → una sola fila y un solo true', async () => {
      // Act
      const resultados = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          enTx(
            (tx) =>
              (i % 2 === 0 ? aceptacionesA : aceptacionesB).insertarSiNoExiste(
                registrar(CanalAceptacion.FORMULARIO_PUBLICO),
                tx,
              ),
            i % 2 === 0 ? baseA : baseB,
          ),
        ),
      );

      // Assert
      expect(resultados.filter(Boolean)).toHaveLength(1);
      expect(await filas()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('INSERT … SELECT por id y tenant', () => {
    it('con un paciente de OTRA organización no escribe nada', async () => {
      // Act — el tenant de la aceptación no es el del paciente
      const insertada = await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA, {
            pacienteId: pacienteAjenoId,
            tenantId,
          }),
          tx,
        ),
      );

      // Assert
      expect(insertada).toBe(false);
      expect(await filas(pacienteAjenoId)).toHaveLength(0);
      const [{ n }] = await baseA.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM aceptaciones_terminos',
      );
      expect(n).toBe(0);
    });

    it('con un paciente inexistente no escribe nada (ni falla por la FK)', async () => {
      // Act
      const insertada = await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA, { pacienteId: randomUUID() }),
          tx,
        ),
      );

      // Assert
      expect(insertada).toBe(false);
    });

    it('el tenant de la fila es el del paciente leído, no uno inventado', async () => {
      // Act
      await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA, {
            pacienteId: pacienteAjenoId,
            tenantId: otroTenantId,
          }),
          tx,
        ),
      );

      // Assert
      expect((await filas(pacienteAjenoId))[0].tenantId).toBe(otroTenantId);
    });
  });

  // ---------------------------------------------------------------------------
  describe('FK RESTRICT (la prueba no se borra por debajo)', () => {
    beforeEach(async () => {
      await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.PROFESIONAL),
          tx,
        ),
      );
    });

    it('borrar el paciente con una aceptación falla', async () => {
      expect(
        await errorDe(
          baseA.query('DELETE FROM pacientes WHERE id = $1', [pacienteId]),
        ),
      ).toEqual({
        code: '23503',
        constraint: 'FK_aceptaciones_terminos_paciente_id',
      });
      expect(await filas()).toHaveLength(1);
    });

    it('borrar el usuario que la marcó falla', async () => {
      expect(
        await errorDe(
          baseA.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]),
        ),
      ).toEqual({
        code: '23503',
        constraint: 'FK_aceptaciones_terminos_usuario_id',
      });
    });

    it('una aceptación con un usuario inexistente no entra', async () => {
      // Otra versión: la 1.0 profesional ya está (beforeEach) y chocaría
      // antes con el índice único.
      expect(
        await errorDe(
          insertarCrudo({
            canal: 'profesional',
            version: '2.0',
            usuarioId: randomUUID(),
          }),
        ),
      ).toEqual({
        code: '23503',
        constraint: 'FK_aceptaciones_terminos_usuario_id',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('existeDelTitular', () => {
    it('no cuenta la del profesional; sí la del enlace; filtra por tenant y versión', async () => {
      // Arrange
      await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.PROFESIONAL),
          tx,
        ),
      );
      const consultar = (t = tenantId, versiones = ['1.0']) =>
        aceptacionesA.existeDelTitular(pacienteId, t, versiones);

      // Act & Assert
      expect(await consultar()).toBe(false);
      await enTx((tx) =>
        aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.ENLACE_CITA),
          tx,
        ),
      );
      expect(await consultar()).toBe(true);
      expect(await consultar(otroTenantId)).toBe(false);
      expect(await consultar(tenantId, ['2.0'])).toBe(false);
      expect(await consultar(tenantId, ['2.0', '1.0'])).toBe(true);
    });

    it('dentro de su tx ve la fila sin confirmar; otra conexión no la ve hasta el COMMIT', async () => {
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        // Arrange
        await aceptacionesA.insertarSiNoExiste(
          registrar(CanalAceptacion.FORMULARIO_PUBLICO),
          a.manager,
        );

        // Act & Assert — lectura sin bloqueo: no espera
        expect(
          await aceptacionesA.existeDelTitular(
            pacienteId,
            tenantId,
            ['1.0'],
            a.manager,
          ),
        ).toBe(true);
        expect(
          await aceptacionesB.existeDelTitular(pacienteId, tenantId, ['1.0']),
        ).toBe(false);
        await a.commitTransaction();
        expect(
          await aceptacionesB.existeDelTitular(pacienteId, tenantId, ['1.0']),
        ).toBe(true);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('marcarConsentimiento (la bandera derivada, ADR-16 §4)', () => {
    it('false → true: escribe una vez y toca actualizado_en; la segunda no escribe ni lo toca', async () => {
      // Arrange
      const antes = await fichaDe(pacienteId);
      await esperar(5);

      // Act
      const primera = await enTx((tx) =>
        pacientesA.marcarConsentimiento(pacienteId, tenantId, tx),
      );
      const tras = await fichaDe(pacienteId);
      const segunda = await enTx((tx) =>
        pacientesA.marcarConsentimiento(pacienteId, tenantId, tx),
      );

      // Assert
      expect([primera, segunda]).toEqual([true, false]);
      expect(tras.consentimiento).toBe(true);
      expect(tras.actualizadoEn.getTime()).toBeGreaterThan(
        antes.actualizadoEn.getTime(),
      );
      expect((await fichaDe(pacienteId)).actualizadoEn).toEqual(
        tras.actualizadoEn,
      );
    });

    it('respeta la organización: con otro tenant no escribe', async () => {
      // Act
      const escrito = await enTx((tx) =>
        pacientesA.marcarConsentimiento(pacienteAjenoId, tenantId, tx),
      );

      // Assert
      expect(escrito).toBe(false);
      expect((await fichaDe(pacienteAjenoId)).consentimiento).toBe(false);
    });

    it('un paciente inexistente o un id que no es UUID → false, sin error', async () => {
      expect(
        await enTx((tx) =>
          pacientesA.marcarConsentimiento(randomUUID(), tenantId, tx),
        ),
      ).toBe(false);
      expect(
        await enTx((tx) =>
          pacientesA.marcarConsentimiento('no-es-uuid', tenantId, tx),
        ),
      ).toBe(false);
    });

    it('nada la apaga: con la bandera en true no cambia', async () => {
      // Arrange
      await baseA.query(
        'UPDATE pacientes SET consentimiento = true WHERE id = $1',
        [pacienteId],
      );

      // Act & Assert
      expect(
        await enTx((tx) =>
          pacientesA.marcarConsentimiento(pacienteId, tenantId, tx),
        ),
      ).toBe(false);
      expect((await fichaDe(pacienteId)).consentimiento).toBe(true);
    });

    it('debería exigir la transacción', async () => {
      await expect(
        pacientesA.marcarConsentimiento(pacienteId, tenantId, undefined),
      ).rejects.toThrow(/requiere una transacción/);
    });
  });

  // ---------------------------------------------------------------------------
  // `PacientesService.registrarAceptacion` con los adaptadores reales: la fila
  // y la bandera van en la transacción de quien llama, juntas o ninguna.
  describe('registrarAceptacion en una transacción real', () => {
    let servicio: PacientesService;

    beforeAll(() => {
      const transacciones: TransactionRunner = {
        run: (trabajo) => baseA.transaction((manager) => trabajo(manager)),
      };
      servicio = new PacientesService(pacientesA, aceptacionesA, transacciones);
    });

    const delEnlace = {
      canal: CanalAceptacion.ENLACE_CITA as const,
      enlaceId: randomUUID(),
      version: '1.0',
      aceptadaEn: AHORA,
    };

    it('deja la fila y la bandera al confirmar', async () => {
      // Act
      const insertada = await enTx((tx) =>
        servicio.registrarAceptacion(
          { ...delEnlace, tenantId, pacienteId },
          tx,
        ),
      );

      // Assert
      expect(insertada).toBe(true);
      expect(await filas()).toHaveLength(1);
      expect((await fichaDe(pacienteId)).consentimiento).toBe(true);
    });

    it('si la transacción de quien llama se revierte, no queda ni la fila ni la bandera', async () => {
      // Act
      await expect(
        enTx(async (tx) => {
          await servicio.registrarAceptacion(
            { ...delEnlace, tenantId, pacienteId },
            tx,
          );
          throw new Error('falla lo que vino después');
        }),
      ).rejects.toThrow('falla lo que vino después');

      // Assert
      expect(await filas()).toHaveLength(0);
      expect((await fichaDe(pacienteId)).consentimiento).toBe(false);
    });

    it('con un paciente de otra organización no escribe ni la fila ni la bandera', async () => {
      // Act
      const insertada = await enTx((tx) =>
        servicio.registrarAceptacion(
          { ...delEnlace, tenantId, pacienteId: pacienteAjenoId },
          tx,
        ),
      );

      // Assert
      expect(insertada).toBe(false);
      expect(await filas(pacienteAjenoId)).toHaveLength(0);
      expect((await fichaDe(pacienteAjenoId)).consentimiento).toBe(false);
    });
  });
});
