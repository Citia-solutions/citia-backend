import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../domain/usuario.entity';
import { TypeOrmUsuarioRepository } from '../infrastructure/persistence/typeorm-usuario.repository';
import { UsuarioOrmEntity } from '../infrastructure/persistence/usuario.orm-entity';

/**
 * Métodos de US-10 de `TypeOrmUsuarioRepository` contra PostgreSQL real
 * (ADR-15 §4 y §5). Lo que el doble del unitario NO reproduce:
 *
 *  - `estadoSesion` con y sin corte, y aislado por organización;
 *  - el UPDATE CONDICIONAL del cambio de contraseña: dos cambios A LA VEZ con
 *    el mismo hash anterior → uno escribe y el otro no (el segundo espera el
 *    bloqueo de la fila y Postgres vuelve a evaluar el WHERE);
 *  - `actualizarPerfil`: cambia `actualizado_en`, no toca lo ausente y no
 *    escribe sin cambios;
 *  - el CHECK de la especialidad (creado por `synchronize` desde la entidad).
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const ENTIDADES = [TenantOrmEntity, UsuarioOrmEntity];

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

describe('Sesiones y perfil de usuario contra PostgreSQL (integration)', () => {
  let base: DataSource;
  let repo: TypeOrmUsuarioRepository;

  let tenantId: string;
  let otroTenantId: string;
  let correlativo = 0;

  /** Un usuario nuevo de `tenant` con `hash` como contraseña. */
  const crearUsuario = async (
    tenant: string = tenantId,
    hash = '$2b$10$original',
  ): Promise<string> => {
    correlativo++;
    const usuario = await base.getRepository(UsuarioOrmEntity).save({
      email: `u${correlativo}@sesiones.cl`,
      passwordHash: hash,
      nombreCompleto: `Usuario ${correlativo}`,
      rol: RolUsuario.ADMINISTRADOR,
      tenantId: tenant,
    });
    return usuario.id;
  };

  const leer = async (id: string) => {
    const [fila] = await base.query<
      {
        hash: string;
        nombre: string;
        especialidad: string | null;
        corte: Date | null;
        actualizadoEn: Date;
      }[]
    >(
      `SELECT password_hash AS hash, nombre_completo AS nombre, especialidad,
              sesiones_validas_desde AS corte, actualizado_en AS "actualizadoEn"
         FROM usuarios WHERE id = $1`,
      [id],
    );
    return fila;
  };

  /** Fija `actualizado_en` en el pasado y devuelve el valor tal como se lee. */
  const envejecer = async (id: string): Promise<number> => {
    await base.query('UPDATE usuarios SET actualizado_en = $2 WHERE id = $1', [
      id,
      new Date('2026-01-01T00:00:00.000Z'),
    ]);
    return (await leer(id)).actualizadoEn.getTime();
  };

  /** Espera a que alguna conexión de la base de test quede esperando un candado. */
  const esperarBloqueadas = async (cuantas = 1): Promise<void> => {
    const limite = Date.now() + 5_000;
    for (;;) {
      const [{ n }] = await base.query<{ n: number }[]>(
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
    base = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: ENTIDADES,
    });
    await base.initialize();
    repo = new TypeOrmUsuarioRepository(base.getRepository(UsuarioOrmEntity));

    const [tenant, otro] = await base.getRepository(TenantOrmEntity).save([
      { nombre: 'Clínica Sesiones', slug: 'clinica-sesiones-int' },
      { nombre: 'Otra Clínica', slug: 'otra-clinica-sesiones-int' },
    ]);
    tenantId = tenant.id;
    otroTenantId = otro.id;
  });

  afterAll(async () => {
    await base?.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('estadoSesion', () => {
    it('sin corte: devuelve el corte en null (todo usuario recién registrado)', async () => {
      // Arrange
      const id = await crearUsuario();

      // Act + Assert
      expect(await repo.estadoSesion(id, tenantId)).toEqual({
        sesionesValidasDesde: null,
      });
    });

    it('con corte: devuelve el instante exacto (timestamptz)', async () => {
      // Arrange
      const id = await crearUsuario();
      const corte = new Date('2026-10-31T15:04:05.000Z');
      await repo.cambiarContrasena(id, tenantId, {
        hashAnterior: '$2b$10$original',
        hashNuevo: '$2b$10$nuevo',
        sesionesValidasDesde: corte,
      });

      // Act
      const estado = await repo.estadoSesion(id, tenantId);

      // Assert
      expect(estado?.sesionesValidasDesde?.getTime()).toBe(corte.getTime());
    });

    it('de otra organización o inexistente: null', async () => {
      // Arrange
      const id = await crearUsuario();

      // Act + Assert
      expect(await repo.estadoSesion(id, otroTenantId)).toBeNull();
      expect(
        await repo.estadoSesion(
          '00000000-0000-4000-8000-000000000000',
          tenantId,
        ),
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('findById', () => {
    it('trae los campos de US-10 y respeta la organización', async () => {
      // Arrange
      const id = await crearUsuario();
      await repo.actualizarPerfil(id, tenantId, { especialidad: 'Nutrición' });

      // Act
      const usuario = await repo.findById(id, tenantId);

      // Assert
      expect(usuario?.especialidad).toBe('Nutrición');
      expect(usuario?.sesionesValidasDesde).toBeNull();
      expect(usuario?.passwordHash).toBe('$2b$10$original');
      expect(await repo.findById(id, otroTenantId)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('cambiarContrasena', () => {
    const corte = new Date('2026-10-31T15:00:00.000Z');

    it('con el hash anterior correcto: escribe hash, corte y actualizado_en', async () => {
      // Arrange
      const id = await crearUsuario();
      const antes = await envejecer(id);

      // Act
      const escribio = await repo.cambiarContrasena(id, tenantId, {
        hashAnterior: '$2b$10$original',
        hashNuevo: '$2b$10$nuevo',
        sesionesValidasDesde: corte,
      });

      // Assert
      expect(escribio).toBe(true);
      const fila = await leer(id);
      expect(fila.hash).toBe('$2b$10$nuevo');
      expect(fila.corte?.getTime()).toBe(corte.getTime());
      expect(fila.actualizadoEn.getTime()).toBeGreaterThan(antes);
    });

    it('con un hash anterior que ya no es el guardado: no escribe nada', async () => {
      // Arrange
      const id = await crearUsuario();

      // Act
      const escribio = await repo.cambiarContrasena(id, tenantId, {
        hashAnterior: '$2b$10$otro',
        hashNuevo: '$2b$10$nuevo',
        sesionesValidasDesde: corte,
      });

      // Assert
      expect(escribio).toBe(false);
      const fila = await leer(id);
      expect(fila.hash).toBe('$2b$10$original');
      expect(fila.corte).toBeNull();
    });

    it('en otra organización: no escribe nada', async () => {
      // Arrange
      const id = await crearUsuario();

      // Act + Assert
      expect(
        await repo.cambiarContrasena(id, otroTenantId, {
          hashAnterior: '$2b$10$original',
          hashNuevo: '$2b$10$nuevo',
          sesionesValidasDesde: corte,
        }),
      ).toBe(false);
      expect((await leer(id)).hash).toBe('$2b$10$original');
    });

    it('DOS cambios a la vez con el mismo hash anterior: uno escribe (true) y el otro no (false)', async () => {
      // Arrange
      const id = await crearUsuario();
      const corteA = new Date('2026-10-31T15:00:01.000Z');
      const corteB = new Date('2026-10-31T15:00:02.000Z');
      const a: QueryRunner = base.createQueryRunner();
      const b: QueryRunner = base.createQueryRunner();
      for (const qr of [a, b]) {
        await qr.connect();
        await qr.startTransaction();
      }
      try {
        // Act — A toma la fila; B queda esperando su bloqueo
        const deA = await repo.cambiarContrasena(
          id,
          tenantId,
          {
            hashAnterior: '$2b$10$original',
            hashNuevo: '$2b$10$deA',
            sesionesValidasDesde: corteA,
          },
          a.manager,
        );
        const deB = observar(
          repo.cambiarContrasena(
            id,
            tenantId,
            {
              hashAnterior: '$2b$10$original',
              hashNuevo: '$2b$10$deB',
              sesionesValidasDesde: corteB,
            },
            b.manager,
          ),
        );
        await esperarBloqueadas();
        expect(deB.terminada()).toBe(false);

        await a.commitTransaction();
        const resultadoB = await deB.promesa;
        await b.commitTransaction();

        // Assert
        expect([deA, resultadoB]).toEqual([true, false]);
      } finally {
        for (const qr of [a, b]) {
          if (qr.isTransactionActive) await qr.rollbackTransaction();
          await qr.release();
        }
      }
      const fila = await leer(id);
      expect(fila.hash).toBe('$2b$10$deA');
      expect(fila.corte?.getTime()).toBe(corteA.getTime());
    });

    it('DOS cambios a la vez, cada uno en su transacción, sin orden fijo: exactamente uno gana', async () => {
      // Arrange
      const id = await crearUsuario();
      const cambio = (hashNuevo: string) =>
        base.transaction((tx) =>
          repo.cambiarContrasena(
            id,
            tenantId,
            {
              hashAnterior: '$2b$10$original',
              hashNuevo,
              sesionesValidasDesde: corte,
            },
            tx,
          ),
        );

      // Act
      const resultados = await Promise.all([
        cambio('$2b$10$x'),
        cambio('$2b$10$y'),
      ]);

      // Assert
      expect([...resultados].sort()).toEqual([false, true]);
      const ganador = resultados[0] ? '$2b$10$x' : '$2b$10$y';
      expect((await leer(id)).hash).toBe(ganador);
    });
  });

  // ---------------------------------------------------------------------------
  describe('actualizarPerfil', () => {
    it('cambia solo lo presente y actualizado_en; devuelve la fila completa', async () => {
      // Arrange
      const id = await crearUsuario();
      await repo.actualizarPerfil(id, tenantId, { especialidad: 'Psicología' });
      const antes = await envejecer(id);

      // Act
      const usuario = await repo.actualizarPerfil(id, tenantId, {
        nombreCompleto: 'Dra. Nueva',
      });

      // Assert
      expect(usuario?.nombreCompleto).toBe('Dra. Nueva');
      expect(usuario?.especialidad).toBe('Psicología');
      expect(usuario?.email).toMatch(/@sesiones\.cl$/);
      expect(usuario?.passwordHash).toBe('$2b$10$original');
      const fila = await leer(id);
      expect(fila.nombre).toBe('Dra. Nueva');
      expect(fila.especialidad).toBe('Psicología');
      expect(fila.actualizadoEn.getTime()).toBeGreaterThan(antes);
    });

    it('la especialidad en null la borra y no toca el nombre', async () => {
      // Arrange
      const id = await crearUsuario();
      await repo.actualizarPerfil(id, tenantId, { especialidad: 'Psicología' });

      // Act
      const usuario = await repo.actualizarPerfil(id, tenantId, {
        especialidad: null,
      });

      // Assert
      expect(usuario?.especialidad).toBeNull();
      expect((await leer(id)).nombre).toBe(usuario?.nombreCompleto);
    });

    it('sin cambios no escribe (actualizado_en no se mueve)', async () => {
      // Arrange
      const id = await crearUsuario();
      const antes = await envejecer(id);

      // Act
      const usuario = await repo.actualizarPerfil(id, tenantId, {});

      // Assert
      expect(usuario?.id).toBe(id);
      expect((await leer(id)).actualizadoEn.getTime()).toBe(antes);
    });

    it('de otra organización: null y no escribe', async () => {
      // Arrange
      const id = await crearUsuario();

      // Act + Assert
      expect(
        await repo.actualizarPerfil(id, otroTenantId, {
          nombreCompleto: 'Intruso',
        }),
      ).toBeNull();
      expect((await leer(id)).nombre).not.toBe('Intruso');
    });

    it('el CHECK rechaza una especialidad en blanco (red de seguridad del dominio)', async () => {
      // Arrange
      const id = await crearUsuario();

      // Act + Assert
      expect(
        await errorDe(
          repo.actualizarPerfil(id, tenantId, { especialidad: '   ' }),
        ),
      ).toEqual({
        code: '23514',
        constraint: 'CHK_usuarios_especialidad_no_vacia',
      });
    });
  });
});
