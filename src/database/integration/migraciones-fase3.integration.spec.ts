import { createHash, randomUUID } from 'node:crypto';

import { DataSource, DataSourceOptions } from 'typeorm';

import { typeOrmTestConfig } from '../../../test/typeorm-test.config';
import { EnlaceCita } from '../../modules/cita/domain/enlace-cita.entity';
import { TypeOrmEnlaceCitaRepository } from '../../modules/cita/infrastructure/persistence/typeorm-enlace-cita.repository';
import { CreateTenantsAndUsuarios1750000000000 } from '../migrations/1750000000000-CreateTenantsAndUsuarios';
import { AddSlugToTenants1750000001000 } from '../migrations/1750000001000-AddSlugToTenants';
import { CreatePacientes1750000002000 } from '../migrations/1750000002000-CreatePacientes';
import { CreateCitas1750000003000 } from '../migrations/1750000003000-CreateCitas';
import { AddRutYContactoAPacientes1750000004000 } from '../migrations/1750000004000-AddRutYContactoAPacientes';
import { CreateCambiosCita1750000005000 } from '../migrations/1750000005000-CreateCambiosCita';
import { CreateSolicitudesCita1750000006000 } from '../migrations/1750000006000-CreateSolicitudesCita';
import { AddResueltaEnASolicitudesCita1750000007000 } from '../migrations/1750000007000-AddResueltaEnASolicitudesCita';
import { CreateEventosSalida1750000008000 } from '../migrations/1750000008000-CreateEventosSalida';
import { CreateConfiguracionesRecordatorio1750000009000 } from '../migrations/1750000009000-CreateConfiguracionesRecordatorio';
import { CreateRecordatorios1750000010000 } from '../migrations/1750000010000-CreateRecordatorios';
import { CreateSupresionesCorreo1750000011000 } from '../migrations/1750000011000-CreateSupresionesCorreo';
import { CreateEnlacesCita1750000012000 } from '../migrations/1750000012000-CreateEnlacesCita';
import { AddDescartadaAEstadoSolicitudesCita1750000013000 } from '../migrations/1750000013000-AddDescartadaAEstadoSolicitudesCita';
import { AddReagendamientoASolicitudesCita1750000014000 } from '../migrations/1750000014000-AddReagendamientoASolicitudesCita';

/**
 * Migraciones de la Fase 3 contra PostgreSQL real: el resto de las pruebas de
 * integración crean el esquema con `synchronize` (desde las entidades), así que
 * el SQL de las migraciones solo se prueba aquí.
 *
 *  1. Todo el historial sube en UN lote con `transaction: 'all'` (como
 *     `migration:run`): el `ADD VALUE 'descartada'` de la 1750000013000 y la
 *     1750000014000 conviven en la misma transacción sin usar el valor nuevo.
 *  2. El esquema resultante (enums, índices parciales, CHECK, nulabilidad).
 *  3. El `down` de cada una se niega a perder datos que el esquema anterior
 *     no puede representar, y con la tabla limpia revierte de verdad.
 *  4. Vuelven a subir después de bajar.
 *
 * Los pasos dependen del anterior: corren en orden, en un solo `describe`.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*). Borra el esquema de
 * `citia_test` al empezar (`dropSchema`). Corre con `npm run test:integration`.
 */

const MIGRACIONES = [
  CreateTenantsAndUsuarios1750000000000,
  AddSlugToTenants1750000001000,
  CreatePacientes1750000002000,
  CreateCitas1750000003000,
  AddRutYContactoAPacientes1750000004000,
  CreateCambiosCita1750000005000,
  CreateSolicitudesCita1750000006000,
  AddResueltaEnASolicitudesCita1750000007000,
  CreateEventosSalida1750000008000,
  CreateConfiguracionesRecordatorio1750000009000,
  CreateRecordatorios1750000010000,
  CreateSupresionesCorreo1750000011000,
  CreateEnlacesCita1750000012000,
  AddDescartadaAEstadoSolicitudesCita1750000013000,
  AddReagendamientoASolicitudesCita1750000014000,
];

const FASE_3 = [
  'CreateEnlacesCita1750000012000',
  'AddDescartadaAEstadoSolicitudesCita1750000013000',
  'AddReagendamientoASolicitudesCita1750000014000',
];

const hashDe = (texto: string): string =>
  createHash('sha256').update(texto).digest('hex');

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

describe('Migraciones de la Fase 3 contra PostgreSQL (integration)', () => {
  let base: DataSource;
  let tenantId: string;
  let citaId: string;

  const valoresEnum = async (tipo: string): Promise<string[]> => {
    const filas = await base.query<{ v: string }[]>(
      `SELECT e.enumlabel AS v
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = $1
        ORDER BY e.enumsortorder`,
      [tipo],
    );
    return filas.map((f) => f.v);
  };

  const definicionIndice = async (nombre: string): Promise<string | null> => {
    const [fila] = await base.query<{ def: string }[]>(
      'SELECT indexdef AS def FROM pg_indexes WHERE indexname = $1',
      [nombre],
    );
    return fila?.def ?? null;
  };

  const restricciones = async (tabla: string): Promise<string[]> => {
    const filas = await base.query<{ n: string }[]>(
      `SELECT conname AS n FROM pg_constraint
        WHERE conrelid = to_regclass($1)
          AND contype IN ('c', 'f', 'p', 'u')
        ORDER BY conname`,
      [tabla],
    );
    return filas.map((f) => f.n);
  };

  const columna = async (
    tabla: string,
    nombre: string,
  ): Promise<{ nula: string; defecto: string | null } | null> => {
    const [fila] = await base.query<{ nula: string; defecto: string | null }[]>(
      `SELECT is_nullable AS nula, column_default AS defecto
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tabla, nombre],
    );
    return fila ?? null;
  };

  const existeTabla = async (tabla: string): Promise<boolean> => {
    const [fila] = await base.query<{ existe: boolean }[]>(
      'SELECT to_regclass($1) IS NOT NULL AS existe',
      [tabla],
    );
    return fila.existe;
  };

  const ejecutadas = async (): Promise<string[]> => {
    const filas = await base.query<{ name: string }[]>(
      'SELECT name FROM migrations ORDER BY timestamp',
    );
    return filas.map((f) => f.name);
  };

  const insertarSolicitud = (campos: {
    tipo?: string;
    citaOrigenId?: string | null;
    rut?: string | null;
    correo?: string | null;
    estado?: string;
  }): Promise<unknown> =>
    campos.tipo === undefined
      ? base.query(
          `INSERT INTO solicitudes_cita
             (tenant_id, rut, nombre_paciente, telefono, correo, motivo,
              preferencia_horaria, estado)
           VALUES ($1, $2, 'X', '+56 9 0', $3, 'm', 'p', $4)`,
          [
            tenantId,
            campos.rut === undefined ? '123456785' : campos.rut,
            campos.correo === undefined ? 'x@correo.cl' : campos.correo,
            campos.estado ?? 'recibida',
          ],
        )
      : base.query(
          `INSERT INTO solicitudes_cita
             (tenant_id, rut, nombre_paciente, telefono, correo, motivo,
              preferencia_horaria, estado, tipo, cita_origen_id)
           VALUES ($1, $2, 'X', '+56 9 0', $3, 'm', 'p', $4, $5, $6)`,
          [
            tenantId,
            campos.rut === undefined ? '123456785' : campos.rut,
            campos.correo === undefined ? 'x@correo.cl' : campos.correo,
            campos.estado ?? 'recibida',
            campos.tipo,
            campos.citaOrigenId ?? null,
          ],
        );

  beforeAll(async () => {
    base = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: [],
      migrations: MIGRACIONES,
      synchronize: false,
      dropSchema: true,
    });
    await base.initialize();
  });

  afterAll(async () => {
    await base?.destroy();
  });

  it('1. sube todo el historial en un solo lote (transaction "all")', async () => {
    // Act
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(
      MIGRACIONES.map((M) => new M().name),
    );
  });

  it('2a. enums: estado con descartada, tipo nuevo y actores de la bitácora completos', async () => {
    expect(await valoresEnum('enum_solicitudes_cita_estado')).toEqual([
      'recibida',
      'aceptada',
      'rechazada',
      'descartada',
    ]);
    expect(await valoresEnum('enum_solicitudes_cita_tipo')).toEqual([
      'nueva',
      'reagendamiento',
    ]);
    // §2.3: sin cambio de esquema; ya tenía `paciente` y `sistema`.
    expect(await valoresEnum('enum_cambios_cita_actor')).toEqual([
      'profesional',
      'paciente',
      'sistema',
    ]);
  });

  it('2b. enlaces_cita: claves únicas (una parcial), CHECK y FK', async () => {
    expect(await definicionIndice('uq_enlace_cita_token_hash')).toMatch(
      /CREATE UNIQUE INDEX .* \(token_hash\)$/,
    );
    expect(await definicionIndice('uq_enlace_cita_version')).toMatch(
      /CREATE UNIQUE INDEX .* \(cita_id, version\)$/,
    );
    expect(await definicionIndice('uq_enlace_cita_activo')).toMatch(
      /CREATE UNIQUE INDEX .* \(cita_id\) WHERE \(revocado_en IS NULL\)$/,
    );
    expect(await restricciones('enlaces_cita')).toEqual([
      'CHK_enlaces_cita_revocacion',
      'CHK_enlaces_cita_token_hash',
      'CHK_enlaces_cita_version',
      'FK_enlaces_cita_cita_id',
      'PK_enlaces_cita_id',
    ]);
    expect(await columna('enlaces_cita', 'emitido_en')).toEqual({
      nula: 'NO',
      defecto: 'now()',
    });
  });

  it('2c. solicitudes_cita: tipo, origen, nulabilidad, CHECK e índices', async () => {
    expect(await columna('solicitudes_cita', 'tipo')).toEqual({
      nula: 'NO',
      defecto: "'nueva'::enum_solicitudes_cita_tipo",
    });
    expect((await columna('solicitudes_cita', 'cita_origen_id'))?.nula).toBe(
      'YES',
    );
    expect((await columna('solicitudes_cita', 'enlace_id'))?.nula).toBe('YES');
    expect((await columna('solicitudes_cita', 'rut'))?.nula).toBe('YES');
    expect((await columna('solicitudes_cita', 'correo'))?.nula).toBe('YES');
    expect(await restricciones('solicitudes_cita')).toEqual(
      expect.arrayContaining([
        'CHK_solicitudes_cita_nueva_datos',
        'CHK_solicitudes_cita_reagendamiento_origen',
      ]),
    );
    expect(
      await definicionIndice('uq_solicitud_reagendamiento_recibida'),
    ).toMatch(
      /CREATE UNIQUE INDEX .* \(cita_origen_id\) WHERE \(\(tipo = 'reagendamiento'::enum_solicitudes_cita_tipo\) AND \(estado = 'recibida'::enum_solicitudes_cita_estado\)\)$/,
    );
    expect(await definicionIndice('idx_solicitud_tenant_cita_origen')).toMatch(
      /\(tenant_id, cita_origen_id\)$/,
    );
  });

  it('3. el esquema migrado se comporta como el de las entidades', async () => {
    // Arrange — datos mínimos, por SQL (no hay entidades en este DataSource).
    [{ id: tenantId }] = await base.query<{ id: string }[]>(
      `INSERT INTO tenants (nombre, slug) VALUES ('Clínica Migraciones', 'clinica-migraciones') RETURNING id`,
    );
    const [{ id: usuarioId }] = await base.query<{ id: string }[]>(
      `INSERT INTO usuarios (email, password_hash, nombre_completo, tenant_id)
       VALUES ('p@migraciones.cl', 'x', 'Dra. Migraciones', $1) RETURNING id`,
      [tenantId],
    );
    const [{ id: pacienteId }] = await base.query<{ id: string }[]>(
      `INSERT INTO pacientes (nombre, telefono, tenant_id) VALUES ('P', '+56 9 0', $1) RETURNING id`,
      [tenantId],
    );
    [{ id: citaId }] = await base.query<{ id: string }[]>(
      `INSERT INTO citas (inicio, duracion_min, tipo_consulta, tenant_id, paciente_id, usuario_id)
       VALUES (now() + interval '1 day', 45, 'Control', $1, $2, $3) RETURNING id`,
      [tenantId, pacienteId, usuarioId],
    );
    const enlaces = new TypeOrmEnlaceCitaRepository();
    const emitir = (version: number) =>
      EnlaceCita.emitir({
        citaId,
        tenantId,
        version,
        tokenHash: hashDe(`${citaId}:${version}`),
      });

    // Act & Assert — enlaces: el adaptador sobre el índice PARCIAL real.
    expect(
      await base.transaction((tx) => enlaces.insertarSiNoExiste(emitir(1), tx)),
    ).toBe(true);
    expect(
      await base.transaction((tx) => enlaces.insertarSiNoExiste(emitir(2), tx)),
    ).toBe(false);
    expect(
      await errorDe(
        base.query(
          `INSERT INTO enlaces_cita (cita_id, tenant_id, version, token_hash) VALUES ($1, $2, 2, $3)`,
          [citaId, tenantId, hashDe('otro')],
        ),
      ),
    ).toEqual({ code: '23505', constraint: 'uq_enlace_cita_activo' });

    // Solicitudes: reglas de la Fase 3 sobre el esquema migrado.
    const origen = randomUUID();
    await insertarSolicitud({
      tipo: 'reagendamiento',
      citaOrigenId: origen,
      rut: null,
      correo: null,
    });
    expect(
      await errorDe(
        insertarSolicitud({ tipo: 'reagendamiento', citaOrigenId: origen }),
      ),
    ).toEqual({
      code: '23505',
      constraint: 'uq_solicitud_reagendamiento_recibida',
    });
    expect(
      await errorDe(
        insertarSolicitud({ tipo: 'reagendamiento', citaOrigenId: null }),
      ),
    ).toEqual({
      code: '23514',
      constraint: 'CHK_solicitudes_cita_reagendamiento_origen',
    });
    expect(await errorDe(insertarSolicitud({ rut: null }))).toEqual({
      code: '23514',
      constraint: 'CHK_solicitudes_cita_nueva_datos',
    });
    // Una fila previa a la Fase 3 (sin tipo) queda como `nueva`.
    await insertarSolicitud({});
    const [{ tipo }] = await base.query<{ tipo: string }[]>(
      `SELECT tipo FROM solicitudes_cita WHERE cita_origen_id IS NULL LIMIT 1`,
    );
    expect(tipo).toBe('nueva');
    // `descartada` ya se puede usar (la transacción del lote confirmó).
    await base.query(
      `UPDATE solicitudes_cita SET estado = 'descartada', resuelta_en = now()
        WHERE cita_origen_id = $1`,
      [origen],
    );
  });

  it('4a. el down de 1750000014000 se niega a perder solicitudes de reagendamiento', async () => {
    // Act & Assert
    await expect(base.undoLastMigration()).rejects.toThrow(
      /solicitud\(es\) de reagendamiento/,
    );
    expect(await ejecutadas()).toEqual(
      expect.arrayContaining([
        'AddReagendamientoASolicitudesCita1750000014000',
      ]),
    );
    expect(await existeTabla('enlaces_cita')).toBe(true);
  });

  it('4b. sin reagendamientos, el down de 1750000014000 revierte y deja RUT/correo NOT NULL', async () => {
    // Arrange
    await base.query(
      `DELETE FROM solicitudes_cita WHERE tipo = 'reagendamiento'`,
    );
    // Para el paso siguiente: una `nueva` descartada a mano.
    await insertarSolicitud({ estado: 'descartada' });

    // Act
    await base.undoLastMigration();

    // Assert
    expect(await columna('solicitudes_cita', 'tipo')).toBeNull();
    expect(await columna('solicitudes_cita', 'cita_origen_id')).toBeNull();
    expect(await columna('solicitudes_cita', 'enlace_id')).toBeNull();
    expect((await columna('solicitudes_cita', 'rut'))?.nula).toBe('NO');
    expect((await columna('solicitudes_cita', 'correo'))?.nula).toBe('NO');
    expect(await valoresEnum('enum_solicitudes_cita_tipo')).toEqual([]);
    expect(
      await definicionIndice('uq_solicitud_reagendamiento_recibida'),
    ).toBeNull();
    expect(
      await definicionIndice('idx_solicitud_tenant_cita_origen'),
    ).toBeNull();
  });

  it('4c. el down de 1750000013000 se niega a perder solicitudes descartadas', async () => {
    await expect(base.undoLastMigration()).rejects.toThrow(
      /solicitud\(es\) 'descartada'/,
    );
    expect(await valoresEnum('enum_solicitudes_cita_estado')).toContain(
      'descartada',
    );
  });

  it('4d. sin descartadas, el down de 1750000013000 recrea el enum sin el valor', async () => {
    // Arrange
    await base.query(
      `DELETE FROM solicitudes_cita WHERE estado = 'descartada'`,
    );

    // Act
    await base.undoLastMigration();

    // Assert
    expect(await valoresEnum('enum_solicitudes_cita_estado')).toEqual([
      'recibida',
      'aceptada',
      'rechazada',
    ]);
    expect(await valoresEnum('enum_solicitudes_cita_estado_old')).toEqual([]);
    expect(await columna('solicitudes_cita', 'estado')).toEqual({
      nula: 'NO',
      defecto: "'recibida'::enum_solicitudes_cita_estado",
    });
    // Los índices sobre `estado` siguen ahí (se reconstruyeron).
    expect(
      await definicionIndice('idx_solicitud_tenant_estado'),
    ).not.toBeNull();
    expect(
      await definicionIndice('idx_solicitud_tenant_rut_estado'),
    ).not.toBeNull();
    // Las filas que quedaban siguen leyéndose.
    const [{ n }] = await base.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM solicitudes_cita WHERE estado = 'recibida'`,
    );
    expect(n).toBeGreaterThan(0);
  });

  it('4e. el down de 1750000012000 borra la tabla de enlaces', async () => {
    await base.undoLastMigration();

    expect(await existeTabla('enlaces_cita')).toBe(false);
    expect(await ejecutadas()).not.toContain('CreateEnlacesCita1750000012000');
  });

  it('5. vuelven a subir después de bajar', async () => {
    // Act
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(FASE_3);
    expect(await existeTabla('enlaces_cita')).toBe(true);
    expect(await valoresEnum('enum_solicitudes_cita_estado')).toContain(
      'descartada',
    );
    expect((await columna('solicitudes_cita', 'rut'))?.nula).toBe('YES');
  });
});
