import { DataSource, DataSourceOptions } from 'typeorm';

import { typeOrmTestConfig } from '../../../test/typeorm-test.config';
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
import { AddOrigenACitas1750000015000 } from '../migrations/1750000015000-AddOrigenACitas';
import { AddPedidoPorACambiosCita1750000016000 } from '../migrations/1750000016000-AddPedidoPorACambiosCita';
import { AddPrimeraAperturaAEnlacesCita1750000017000 } from '../migrations/1750000017000-AddPrimeraAperturaAEnlacesCita';
import { AddIndiceCierreGhostingACitas1750000018000 } from '../migrations/1750000018000-AddIndiceCierreGhostingACitas';

/**
 * Migraciones de US-07.01 (1750000015000 a 1750000018000) contra PostgreSQL
 * real. El resto de las pruebas de integración crean el esquema con
 * `synchronize` (desde las entidades): el SQL de las migraciones, y sobre todo
 * el RELLENO de `citas.origen`, solo se prueba aquí. Mismo patrón que
 * `migraciones-fase3.integration.spec.ts`.
 *
 *  1. Todo el historial (19) sube en UN lote con `transaction: 'all'` (como
 *     `migration:run` y el `entrypoint.sh`): `CREATE TYPE` y su uso conviven
 *     en la misma transacción.
 *  2. El esquema: enums, default, nulabilidad, los dos CHECK, el índice
 *     parcial (y que el planificador lo usa con el predicado de la consulta).
 *  3. El `down` de cada una revierte (18 → 15).
 *  4. Con datos de ANTES de US-07.01, las cuatro suben juntas y el relleno
 *     marca `solicitud_publica` solo la cita creada por una `nueva` aceptada
 *     de su mismo tenant; `actualizado_en` no cambia; la bitácora no se
 *     rellena (H12) y el enlace previo queda sin apertura.
 *  5. Los CHECK de `pedido_por` y el DEFAULT `'manual'` sobre el esquema
 *     migrado.
 *  6. Con datos, vuelven a bajar y a subir, y el relleno da lo mismo.
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
  AddOrigenACitas1750000015000,
  AddPedidoPorACambiosCita1750000016000,
  AddPrimeraAperturaAEnlacesCita1750000017000,
  AddIndiceCierreGhostingACitas1750000018000,
];

const US_07_01 = [
  'AddOrigenACitas1750000015000',
  'AddPedidoPorACambiosCita1750000016000',
  'AddPrimeraAperturaAEnlacesCita1750000017000',
  'AddIndiceCierreGhostingACitas1750000018000',
];

// Marca de tiempo fija: el relleno no debe tocar `actualizado_en`.
const ACTUALIZADO_EN = '2026-01-01T00:00:00.000Z';

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

describe('Migraciones de US-07.01 contra PostgreSQL (integration)', () => {
  let base: DataSource;

  // Datos de ANTES de US-07.01 (paso 4).
  let tenantA: string;
  let tenantB: string;
  /** Las citas sembradas, por el caso que representan. */
  const citas: Record<string, string> = {};
  let enlacePrevio: string;

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

  const columna = async (
    tabla: string,
    nombre: string,
  ): Promise<{
    nula: string;
    defecto: string | null;
    tipo: string;
    udt: string;
  } | null> => {
    const [fila] = await base.query<
      { nula: string; defecto: string | null; tipo: string; udt: string }[]
    >(
      `SELECT is_nullable AS nula, column_default AS defecto,
              data_type AS tipo, udt_name AS udt
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tabla, nombre],
    );
    return fila ?? null;
  };

  const definicionIndice = async (nombre: string): Promise<string | null> => {
    const [fila] = await base.query<{ def: string }[]>(
      'SELECT indexdef AS def FROM pg_indexes WHERE indexname = $1',
      [nombre],
    );
    return fila?.def ?? null;
  };

  const restriccion = async (nombre: string): Promise<string | null> => {
    const [fila] = await base.query<{ def: string }[]>(
      'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
      [nombre],
    );
    return fila?.def ?? null;
  };

  const ejecutadas = async (): Promise<string[]> => {
    const filas = await base.query<{ name: string }[]>(
      'SELECT name FROM migrations ORDER BY timestamp',
    );
    return filas.map((f) => f.name);
  };

  const origenDe = async (citaId: string): Promise<string> => {
    const [fila] = await base.query<{ origen: string }[]>(
      'SELECT origen::text AS origen FROM citas WHERE id = $1',
      [citaId],
    );
    return fila.origen;
  };

  const exigirRelleno = async (): Promise<void> => {
    expect({
      manual: await origenDe(citas.manual),
      creadaPorNuevaAceptada: await origenDe(citas.creadaPorNuevaAceptada),
      origenDeReagendamientoAceptado: await origenDe(
        citas.origenDeReagendamientoAceptado,
      ),
      deOtroTenant: await origenDe(citas.deOtroTenant),
      conNuevaRechazada: await origenDe(citas.conNuevaRechazada),
      conNuevaRecibida: await origenDe(citas.conNuevaRecibida),
    }).toEqual({
      manual: 'manual',
      creadaPorNuevaAceptada: 'solicitud_publica',
      // Una de reagendamiento aceptada apunta a su cita de ORIGEN (ADR-10 R2)
      origenDeReagendamientoAceptado: 'manual',
      // `cita_id` sin FK (ADR-09): el filtro por tenant es defensa en profundidad
      deOtroTenant: 'manual',
      conNuevaRechazada: 'manual',
      conNuevaRecibida: 'manual',
    });
  };

  const insertarCita = async (
    tenantId: string,
    usuarioId: string,
    pacienteId: string,
  ): Promise<string> => {
    const [{ id }] = await base.query<{ id: string }[]>(
      `INSERT INTO citas (inicio, duracion_min, tipo_consulta, tenant_id, paciente_id, usuario_id)
       VALUES (now() + interval '1 day', 45, 'Control', $1, $2, $3)
       RETURNING id::text AS id`,
      [tenantId, pacienteId, usuarioId],
    );
    return id;
  };

  const insertarSolicitud = (campos: {
    tenantId: string;
    citaId: string;
    tipo: 'nueva' | 'reagendamiento';
    estado: 'recibida' | 'aceptada' | 'rechazada';
  }): Promise<unknown> =>
    base.query(
      `INSERT INTO solicitudes_cita
         (tenant_id, rut, nombre_paciente, telefono, correo, motivo,
          preferencia_horaria, estado, tipo, cita_origen_id, cita_id)
       VALUES ($1, $2, 'X', '+56 9 0', $3, 'm', 'p', $4, $5, $6, $7)`,
      [
        campos.tenantId,
        campos.tipo === 'nueva' ? '123456785' : null,
        campos.tipo === 'nueva' ? 'x@correo.cl' : null,
        campos.estado,
        campos.tipo,
        campos.tipo === 'reagendamiento' ? campos.citaId : null,
        // `cita_id` se llena solo al aceptar (nueva: la creada; reagendamiento: la de origen)
        campos.estado === 'aceptada' ? campos.citaId : null,
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

  it('1. sube todo el historial (19) en un solo lote (transaction "all") sobre un esquema vacío', async () => {
    // Act
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(
      MIGRACIONES.map((M) => new M().name),
    );
    expect(corridas.map((m) => m.name).slice(-4)).toEqual(US_07_01);
  });

  it('2a. citas.origen: enum de dos valores, NOT NULL, DEFAULT manual', async () => {
    expect(await valoresEnum('enum_citas_origen')).toEqual([
      'manual',
      'solicitud_publica',
    ]);
    expect(await columna('citas', 'origen')).toEqual({
      nula: 'NO',
      defecto: "'manual'::enum_citas_origen",
      tipo: 'USER-DEFINED',
      udt: 'enum_citas_origen',
    });
  });

  it('2b. cambios_cita.pedido_por: enum de dos valores, NULL sin default, y sus dos CHECK', async () => {
    expect(await valoresEnum('enum_cambios_cita_pedido_por')).toEqual([
      'paciente',
      'profesional',
    ]);
    expect(await columna('cambios_cita', 'pedido_por')).toEqual({
      nula: 'YES',
      defecto: null,
      tipo: 'USER-DEFINED',
      udt: 'enum_cambios_cita_pedido_por',
    });
    // Las definiciones mencionan las columnas y los valores del contrato.
    const soloCambios = await restriccion('CHK_cambios_cita_pedido_por');
    expect(soloCambios).toMatch(/pedido_por IS NULL/);
    expect(soloCambios).toMatch(/'cancelada'/);
    expect(soloCambios).toMatch(/'reagendada'/);
    const delPaciente = await restriccion(
      'CHK_cambios_cita_pedido_por_paciente',
    );
    expect(delPaciente).toMatch(/actor_tipo <> 'paciente'/);
    expect(delPaciente).toMatch(/pedido_por = 'paciente'/);
  });

  it('2c. enlaces_cita.primera_apertura_en: TIMESTAMPTZ NULL, sin default; la revocación sigue igual', async () => {
    expect(await columna('enlaces_cita', 'primera_apertura_en')).toEqual({
      nula: 'YES',
      defecto: null,
      tipo: 'timestamp with time zone',
      udt: 'timestamptz',
    });
    expect(await restriccion('CHK_enlaces_cita_revocacion')).not.toBeNull();
  });

  it('2d. idx_cita_pendiente_inicio: parcial sobre inicio de las pendientes, y el planificador lo usa con el predicado de la consulta del job (sin cast)', async () => {
    // Assert — definición
    expect(await definicionIndice('idx_cita_pendiente_inicio')).toMatch(
      /USING btree \(inicio\) WHERE \(estado = 'pendiente'::enum_citas_estado\)$/,
    );

    // Assert — el plan, con el predicado escrito como en SqlCandidatasGhosting
    const plan = await base.transaction(async (tx) => {
      await tx.query('SET LOCAL enable_seqscan = off');
      const filas = await tx.query<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN SELECT c."id" FROM "citas" AS c
          WHERE c."estado" = 'pendiente' AND c."inicio" < $1 AND c."inicio" > $2`,
        [
          new Date('2026-10-19T03:00:00.000Z'),
          new Date('2026-10-17T03:22:00.000Z'),
        ],
      );
      return filas.map((f) => f['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/idx_cita_pendiente_inicio/);
  });

  it('3. el down de cada una revierte, de la 18 a la 15', async () => {
    // 18: el índice
    await base.undoLastMigration();
    expect(await definicionIndice('idx_cita_pendiente_inicio')).toBeNull();

    // 17: la columna de la apertura
    await base.undoLastMigration();
    expect(await columna('enlaces_cita', 'primera_apertura_en')).toBeNull();
    expect(await restriccion('CHK_enlaces_cita_revocacion')).not.toBeNull();

    // 16: la columna, los dos CHECK y el tipo
    await base.undoLastMigration();
    expect(await columna('cambios_cita', 'pedido_por')).toBeNull();
    expect(await restriccion('CHK_cambios_cita_pedido_por')).toBeNull();
    expect(
      await restriccion('CHK_cambios_cita_pedido_por_paciente'),
    ).toBeNull();
    expect(await valoresEnum('enum_cambios_cita_pedido_por')).toEqual([]);

    // 15: la columna y el tipo
    await base.undoLastMigration();
    expect(await columna('citas', 'origen')).toBeNull();
    expect(await valoresEnum('enum_citas_origen')).toEqual([]);

    // Queda el esquema de la Fase 3
    expect((await ejecutadas()).at(-1)).toBe(
      'AddReagendamientoASolicitudesCita1750000014000',
    );
  });

  it('4a. con datos de antes de US-07.01, las cuatro suben juntas en un lote', async () => {
    // Arrange — dos organizaciones con su profesional y su paciente
    [{ id: tenantA }] = await base.query<{ id: string }[]>(
      `INSERT INTO tenants (nombre, slug) VALUES ('Clínica A', 'clinica-a-us0701') RETURNING id::text AS id`,
    );
    [{ id: tenantB }] = await base.query<{ id: string }[]>(
      `INSERT INTO tenants (nombre, slug) VALUES ('Clínica B', 'clinica-b-us0701') RETURNING id::text AS id`,
    );
    const usuario = async (tenantId: string, email: string) =>
      (
        await base.query<{ id: string }[]>(
          `INSERT INTO usuarios (email, password_hash, nombre_completo, tenant_id)
           VALUES ($1, 'x', 'Dra.', $2) RETURNING id::text AS id`,
          [email, tenantId],
        )
      )[0].id;
    const paciente = async (tenantId: string) =>
      (
        await base.query<{ id: string }[]>(
          `INSERT INTO pacientes (nombre, telefono, tenant_id)
           VALUES ('P', '+56 9 0', $1) RETURNING id::text AS id`,
          [tenantId],
        )
      )[0].id;
    const uA = await usuario(tenantA, 'a@us0701.cl');
    const uB = await usuario(tenantB, 'b@us0701.cl');
    const pA = await paciente(tenantA);
    const pB = await paciente(tenantB);

    citas.manual = await insertarCita(tenantA, uA, pA);
    citas.creadaPorNuevaAceptada = await insertarCita(tenantA, uA, pA);
    citas.origenDeReagendamientoAceptado = await insertarCita(tenantA, uA, pA);
    citas.deOtroTenant = await insertarCita(tenantB, uB, pB);
    citas.conNuevaRechazada = await insertarCita(tenantA, uA, pA);
    citas.conNuevaRecibida = await insertarCita(tenantA, uA, pA);

    await insertarSolicitud({
      tenantId: tenantA,
      citaId: citas.creadaPorNuevaAceptada,
      tipo: 'nueva',
      estado: 'aceptada',
    });
    await insertarSolicitud({
      tenantId: tenantA,
      citaId: citas.origenDeReagendamientoAceptado,
      tipo: 'reagendamiento',
      estado: 'aceptada',
    });
    // Una `nueva` aceptada del tenant A que apunta a una cita del tenant B
    await insertarSolicitud({
      tenantId: tenantA,
      citaId: citas.deOtroTenant,
      tipo: 'nueva',
      estado: 'aceptada',
    });
    // Rechazada y recibida no llenan cita_id (se fuerza aquí para probar el filtro)
    await base.query(
      `INSERT INTO solicitudes_cita
         (tenant_id, rut, nombre_paciente, telefono, correo, motivo,
          preferencia_horaria, estado, tipo, cita_id)
       VALUES ($1, '123456785', 'X', '+56 9 0', 'x@correo.cl', 'm', 'p', 'rechazada', 'nueva', $2),
              ($1, '123456785', 'X', '+56 9 0', 'x@correo.cl', 'm', 'p', 'recibida', 'nueva', $3)`,
      [tenantA, citas.conNuevaRechazada, citas.conNuevaRecibida],
    );

    // Bitácora previa (sin pedido_por) y un enlace previo
    await base.query(
      `INSERT INTO cambios_cita (cita_id, tenant_id, tipo, actor_tipo)
       VALUES ($1, $2, 'cancelada', 'paciente'), ($1, $2, 'reagendada', 'profesional')`,
      [citas.manual, tenantA],
    );
    [{ id: enlacePrevio }] = await base.query<{ id: string }[]>(
      `INSERT INTO enlaces_cita (cita_id, tenant_id, version, token_hash)
       VALUES ($1, $2, 1, $3) RETURNING id::text AS id`,
      [citas.manual, tenantA, 'a'.repeat(64)],
    );
    await base.query('UPDATE citas SET actualizado_en = $1', [ACTUALIZADO_EN]);

    // Act
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(US_07_01);
  });

  it('4b. relleno: solicitud_publica SOLO para la cita creada por una nueva aceptada de su tenant', async () => {
    await exigirRelleno();
  });

  it('4c. el relleno no toca actualizado_en', async () => {
    const [{ n }] = await base.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM citas WHERE actualizado_en <> $1',
      [ACTUALIZADO_EN],
    );
    expect(n).toBe(0);
  });

  it('4d. la bitácora no se rellena (H12) y el enlace previo queda sin apertura', async () => {
    const cambios = await base.query<
      { tipo: string; pedidoPor: string | null }[]
    >(
      `SELECT tipo::text AS tipo, pedido_por::text AS "pedidoPor"
         FROM cambios_cita WHERE cita_id = $1 ORDER BY tipo::text`,
      [citas.manual],
    );
    expect(cambios).toEqual([
      { tipo: 'cancelada', pedidoPor: null },
      { tipo: 'reagendada', pedidoPor: null },
    ]);
    const [enlace] = await base.query<{ apertura: Date | null }[]>(
      'SELECT primera_apertura_en AS apertura FROM enlaces_cita WHERE id = $1',
      [enlacePrevio],
    );
    expect(enlace.apertura).toBeNull();
  });

  it('5a. CHK_cambios_cita_pedido_por: pedido_por solo en una cancelación o un reagendamiento', async () => {
    const cambio = (tipo: string, actor: string, pedido: string | null) =>
      base.query(
        `INSERT INTO cambios_cita (cita_id, tenant_id, tipo, actor_tipo, pedido_por)
         VALUES ($1, $2, $3, $4, $5)`,
        [citas.manual, tenantA, tipo, actor, pedido],
      );

    for (const tipo of [
      'creada',
      'editada',
      'confirmada',
      'asistio',
      'no_asistio',
      'ghosting',
    ]) {
      expect(await errorDe(cambio(tipo, 'profesional', 'paciente'))).toEqual({
        code: '23514',
        constraint: 'CHK_cambios_cita_pedido_por',
      });
      // Sin pedido_por, cualquier tipo entra
      await expect(cambio(tipo, 'profesional', null)).resolves.toBeDefined();
    }
    await expect(
      cambio('cancelada', 'profesional', 'paciente'),
    ).resolves.toBeDefined();
    await expect(
      cambio('reagendada', 'profesional', 'profesional'),
    ).resolves.toBeDefined();
  });

  it('5b. CHK_cambios_cita_pedido_por_paciente: el paciente nunca actúa "por decisión del profesional"', async () => {
    const cambio = (tipo: string, actor: string, pedido: string | null) =>
      base.query(
        `INSERT INTO cambios_cita (cita_id, tenant_id, tipo, actor_tipo, pedido_por)
         VALUES ($1, $2, $3, $4, $5)`,
        [citas.manual, tenantA, tipo, actor, pedido],
      );

    expect(
      await errorDe(cambio('cancelada', 'paciente', 'profesional')),
    ).toEqual({
      code: '23514',
      constraint: 'CHK_cambios_cita_pedido_por_paciente',
    });
    // Vacío (las filas anteriores) y `paciente` entran
    await expect(
      cambio('cancelada', 'paciente', 'paciente'),
    ).resolves.toBeDefined();
    await expect(cambio('cancelada', 'paciente', null)).resolves.toBeDefined();
    // El sistema no está restringido por este CHECK
    await expect(
      cambio('cancelada', 'sistema', 'profesional'),
    ).resolves.toBeDefined();
    // Un valor fuera del enum lo rechaza el tipo (22P02)
    expect(
      (await errorDe(cambio('cancelada', 'profesional', 'sistema'))).code,
    ).toBe('22P02');
  });

  it('5c. una cita insertada sin origen (la app vieja durante el despliegue) queda manual', async () => {
    // Arrange
    const [{ usuarioId, pacienteId }] = await base.query<
      { usuarioId: string; pacienteId: string }[]
    >(
      `SELECT usuario_id::text AS "usuarioId", paciente_id::text AS "pacienteId"
         FROM citas WHERE id = $1`,
      [citas.manual],
    );

    // Act
    const id = await insertarCita(tenantA, usuarioId, pacienteId);

    // Assert
    expect(await origenDe(id)).toBe('manual');
    await base.query('DELETE FROM citas WHERE id = $1', [id]);
  });

  it('6. con datos (también filas con pedido_por), vuelven a bajar (18 → 15) y a subir en un lote, y el relleno da lo mismo', async () => {
    // Act — bajan con datos: el down no se niega, pierde las columnas nuevas
    // (⚠️ documentado en cada migración)
    for (let i = 0; i < 4; i++) await base.undoLastMigration();
    expect(await columna('citas', 'origen')).toBeNull();
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(US_07_01);
    await exigirRelleno();
    expect(await definicionIndice('idx_cita_pendiente_inicio')).not.toBeNull();
    expect(await ejecutadas()).toEqual(MIGRACIONES.map((M) => new M().name));
  });
});
