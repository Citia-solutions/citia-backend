import { DataSource, DataSourceOptions } from 'typeorm';

import { typeOrmTestConfig } from '../../../test/typeorm-test.config';
import { PREDICADO_PENDIENTES } from '../../modules/soporte/infrastructure/persistence/mensaje-soporte.orm-entity';
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
import { AddPerfilYSesionesAUsuarios1750000019000 } from '../migrations/1750000019000-AddPerfilYSesionesAUsuarios';
import { CreateMensajesSoporte1750000020000 } from '../migrations/1750000020000-CreateMensajesSoporte';

/**
 * Migraciones de US-10 (1750000019000 y 1750000020000) contra PostgreSQL
 * real. El resto de las pruebas de integración crean el esquema con
 * `synchronize` (desde las entidades): el SQL de las migraciones solo se
 * prueba aquí. Mismo patrón que `migraciones-us0701.integration.spec.ts`.
 *
 *  1. Todo el historial (21) sube en UN lote con `transaction: 'all'` (como
 *     `migration:run` y el `entrypoint.sh`).
 *  2. El esquema: columnas (tipo, largo, nulabilidad, default), los CHECK,
 *     las FK, los dos índices (el parcial con su predicado, y que el
 *     planificador lo usa con la consulta del reclamo).
 *  3. El `down` de cada una revierte (20 → 19).
 *  4. Con un usuario de ANTES de US-10, las dos suben juntas: queda con las
 *     dos columnas en NULL (nadie pierde su sesión) y `actualizado_en` no
 *     cambia.
 *  5. Los CHECK, las FK y los default sobre el esquema migrado.
 *  6. Con datos (también mensajes), vuelven a bajar y a subir.
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
  AddPerfilYSesionesAUsuarios1750000019000,
  CreateMensajesSoporte1750000020000,
];

const US_10 = [
  'AddPerfilYSesionesAUsuarios1750000019000',
  'CreateMensajesSoporte1750000020000',
];

// Marca de tiempo fija: la migración no debe tocar `actualizado_en`.
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

interface Columna {
  nula: string;
  defecto: string | null;
  tipo: string;
  largo: number | null;
}

describe('Migraciones de US-10 contra PostgreSQL (integration)', () => {
  let base: DataSource;

  // Datos de ANTES de US-10 (paso 4).
  let tenantId: string;
  let usuarioId: string;

  const columna = async (
    tabla: string,
    nombre: string,
  ): Promise<Columna | null> => {
    const [fila] = await base.query<Columna[]>(
      `SELECT is_nullable AS nula, column_default AS defecto,
              data_type AS tipo, character_maximum_length::int AS largo
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

  const tablaExiste = async (tabla: string): Promise<boolean> => {
    const [{ existe }] = await base.query<{ existe: boolean }[]>(
      'SELECT to_regclass($1) IS NOT NULL AS existe',
      [`public.${tabla}`],
    );
    return existe;
  };

  const ejecutadas = async (): Promise<string[]> => {
    const filas = await base.query<{ name: string }[]>(
      'SELECT name FROM migrations ORDER BY timestamp',
    );
    return filas.map((f) => f.name);
  };

  /** INSERT en `mensajes_soporte` con solo lo obligatorio más `extra`. */
  const insertarMensaje = (extra: Record<string, unknown> = {}) => {
    const campos: Record<string, unknown> = {
      tenant_id: tenantId,
      usuario_id: usuarioId,
      mensaje: 'No carga la agenda',
      ...extra,
    };
    const nombres = Object.keys(campos);
    return base.query<{ id: string }[]>(
      `INSERT INTO mensajes_soporte (${nombres.map((n) => `"${n}"`).join(', ')})
       VALUES (${nombres.map((_n, i) => `$${i + 1}`).join(', ')})
       RETURNING id::text AS id`,
      Object.values(campos),
    );
  };

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

  it('1. sube todo el historial (21) en un solo lote (transaction "all") sobre un esquema vacío', async () => {
    // Act
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(
      MIGRACIONES.map((M) => new M().name),
    );
    expect(corridas.map((m) => m.name).slice(-2)).toEqual(US_10);
  });

  it('2a. usuarios: especialidad VARCHAR(100) NULL y sesiones_validas_desde TIMESTAMPTZ NULL, sin default', async () => {
    expect(await columna('usuarios', 'especialidad')).toEqual({
      nula: 'YES',
      defecto: null,
      tipo: 'character varying',
      largo: 100,
    });
    expect(await columna('usuarios', 'sesiones_validas_desde')).toEqual({
      nula: 'YES',
      defecto: null,
      tipo: 'timestamp with time zone',
      largo: null,
    });
    const check = await restriccion('CHK_usuarios_especialidad_no_vacia');
    expect(check).toMatch(/especialidad IS NULL/);
    expect(check).toMatch(/btrim/);
  });

  it('2b. mensajes_soporte: columnas, tipos, largos, nulabilidad y default', async () => {
    const esperado: Record<string, Columna> = {
      id: {
        nula: 'NO',
        defecto: 'gen_random_uuid()',
        tipo: 'uuid',
        largo: null,
      },
      tenant_id: { nula: 'NO', defecto: null, tipo: 'uuid', largo: null },
      usuario_id: { nula: 'NO', defecto: null, tipo: 'uuid', largo: null },
      categoria: {
        nula: 'NO',
        defecto: "'otro'::character varying",
        tipo: 'character varying',
        largo: 20,
      },
      mensaje: { nula: 'NO', defecto: null, tipo: 'text', largo: null },
      estado_envio: {
        nula: 'NO',
        defecto: "'pendiente'::character varying",
        tipo: 'character varying',
        largo: 20,
      },
      intentos: { nula: 'NO', defecto: '0', tipo: 'integer', largo: null },
      proximo_intento_en: {
        nula: 'NO',
        defecto: 'now()',
        tipo: 'timestamp with time zone',
        largo: null,
      },
      ultimo_error: {
        nula: 'YES',
        defecto: null,
        tipo: 'character varying',
        largo: 100,
      },
      proveedor: {
        nula: 'YES',
        defecto: null,
        tipo: 'character varying',
        largo: 20,
      },
      proveedor_mensaje_id: {
        nula: 'YES',
        defecto: null,
        tipo: 'character varying',
        largo: 100,
      },
      enviado_en: {
        nula: 'YES',
        defecto: null,
        tipo: 'timestamp with time zone',
        largo: null,
      },
      creado_en: {
        nula: 'NO',
        defecto: 'now()',
        tipo: 'timestamp with time zone',
        largo: null,
      },
    };
    for (const [nombre, definicion] of Object.entries(esperado)) {
      expect({
        nombre,
        ...(await columna('mensajes_soporte', nombre)),
      }).toEqual({ nombre, ...definicion });
    }
    const [{ n }] = await base.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'mensajes_soporte'`,
    );
    expect(n).toBe(Object.keys(esperado).length);
  });

  it('2c. mensajes_soporte: PK, las dos FK (RESTRICT / CASCADE) y los cinco CHECK', async () => {
    expect(await restriccion('PK_mensajes_soporte_id')).toBe(
      'PRIMARY KEY (id)',
    );
    for (const [nombre, tabla, columnaFk] of [
      ['FK_mensajes_soporte_tenant_id', 'tenants', 'tenant_id'],
      ['FK_mensajes_soporte_usuario_id', 'usuarios', 'usuario_id'],
    ]) {
      const fk = await restriccion(nombre);
      expect(fk).toMatch(
        new RegExp(
          `^FOREIGN KEY \\(${columnaFk}\\) REFERENCES ${tabla}\\(id\\)`,
        ),
      );
      expect(fk).toMatch(/ON UPDATE CASCADE/);
      expect(fk).toMatch(/ON DELETE RESTRICT/);
    }

    const categoria = await restriccion('CHK_mensajes_soporte_categoria');
    for (const valor of ['problema', 'consulta', 'sugerencia', 'otro']) {
      expect(categoria).toContain(`'${valor}'`);
    }
    const estado = await restriccion('CHK_mensajes_soporte_estado_envio');
    for (const valor of ['pendiente', 'enviado', 'fallido']) {
      expect(estado).toContain(`'${valor}'`);
    }
    const texto = await restriccion('CHK_mensajes_soporte_mensaje');
    expect(texto).toMatch(/char_length\(mensaje\)/);
    expect(texto).toMatch(/2000/);
    expect(texto).toMatch(/btrim\(mensaje\)/);
    expect(await restriccion('CHK_mensajes_soporte_enviado')).toMatch(
      /enviado_en IS NOT NULL/,
    );
    expect(await restriccion('CHK_mensajes_soporte_intentos')).toMatch(
      /intentos >= 0/,
    );
  });

  it('2d. idx_mensajes_soporte_pendientes: parcial sobre proximo_intento_en de las pendientes, y el planificador lo usa con el predicado del reclamo', async () => {
    // Assert — definición
    expect(await definicionIndice('idx_mensajes_soporte_pendientes')).toMatch(
      /USING btree \(proximo_intento_en\) WHERE \(\(estado_envio\)::text = 'pendiente'::text\)$/,
    );

    // Assert — el plan, con el predicado escrito como en el adaptador
    const plan = await base.transaction(async (tx) => {
      await tx.query('SET LOCAL enable_seqscan = off');
      const filas = await tx.query<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN SELECT "id" FROM "mensajes_soporte"
          WHERE ${PREDICADO_PENDIENTES} AND "proximo_intento_en" <= $1
          ORDER BY "proximo_intento_en", "id"
          LIMIT 1
          FOR UPDATE SKIP LOCKED`,
        [new Date('2026-10-31T15:00:00.000Z')],
      );
      return filas.map((f) => f['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/idx_mensajes_soporte_pendientes/);
  });

  it('2e. idx_mensajes_soporte_tenant_creado: por tenant y creado_en, y lo usa el conteo del tope', async () => {
    // Assert — definición
    expect(
      await definicionIndice('idx_mensajes_soporte_tenant_creado'),
    ).toMatch(/USING btree \(tenant_id, creado_en\)$/);

    // Assert — el plan del conteo de `contarCreadosDesde`
    const plan = await base.transaction(async (tx) => {
      await tx.query('SET LOCAL enable_seqscan = off');
      const filas = await tx.query<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN SELECT count(*)::int AS "total" FROM "mensajes_soporte"
          WHERE "tenant_id" = $1 AND "creado_en" >= $2`,
        [
          '7e000000-0000-4000-8000-000000000001',
          new Date('2026-10-30T15:00:00.000Z'),
        ],
      );
      return filas.map((f) => f['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/idx_mensajes_soporte_tenant_creado/);
  });

  it('3. el down de cada una revierte, de la 20 a la 19', async () => {
    // 20: la tabla (y con ella sus índices)
    await base.undoLastMigration();
    expect(await tablaExiste('mensajes_soporte')).toBe(false);
    expect(
      await definicionIndice('idx_mensajes_soporte_pendientes'),
    ).toBeNull();
    expect(
      await definicionIndice('idx_mensajes_soporte_tenant_creado'),
    ).toBeNull();

    // 19: el CHECK y las dos columnas
    await base.undoLastMigration();
    expect(await restriccion('CHK_usuarios_especialidad_no_vacia')).toBeNull();
    expect(await columna('usuarios', 'especialidad')).toBeNull();
    expect(await columna('usuarios', 'sesiones_validas_desde')).toBeNull();

    // Queda el esquema de US-07.01
    expect((await ejecutadas()).at(-1)).toBe(
      'AddIndiceCierreGhostingACitas1750000018000',
    );
  });

  it('4a. con un usuario de antes de US-10, las dos suben juntas en un lote', async () => {
    // Arrange
    [{ id: tenantId }] = await base.query<{ id: string }[]>(
      `INSERT INTO tenants (nombre, slug) VALUES ('Clínica US-10', 'clinica-us10')
       RETURNING id::text AS id`,
    );
    [{ id: usuarioId }] = await base.query<{ id: string }[]>(
      `INSERT INTO usuarios (email, password_hash, nombre_completo, rol, tenant_id, actualizado_en)
       VALUES ('dra@us10.cl', 'x', 'Dra. US-10', 'ADMINISTRADOR', $1, $2)
       RETURNING id::text AS id`,
      [tenantId, ACTUALIZADO_EN],
    );

    // Act
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(US_10);
  });

  it('4b. el usuario previo queda sin especialidad y SIN corte (nadie pierde su sesión); actualizado_en no cambia', async () => {
    const [fila] = await base.query<
      {
        especialidad: string | null;
        corte: Date | null;
        actualizadoEn: Date;
      }[]
    >(
      `SELECT especialidad, sesiones_validas_desde AS corte,
              actualizado_en AS "actualizadoEn"
         FROM usuarios WHERE id = $1`,
      [usuarioId],
    );
    expect(fila.especialidad).toBeNull();
    expect(fila.corte).toBeNull();
    expect(fila.actualizadoEn.toISOString()).toBe(ACTUALIZADO_EN);
  });

  it('5a. CHK_usuarios_especialidad_no_vacia: NULL o con algo más que espacios; el largo lo corta el VARCHAR(100)', async () => {
    const especialidad = (valor: string | null) =>
      base.query('UPDATE usuarios SET especialidad = $2 WHERE id = $1', [
        usuarioId,
        valor,
      ]);

    for (const enBlanco of ['', '   ']) {
      expect(await errorDe(especialidad(enBlanco))).toEqual({
        code: '23514',
        constraint: 'CHK_usuarios_especialidad_no_vacia',
      });
    }
    // 22001: value too long for type character varying(100)
    expect((await errorDe(especialidad('a'.repeat(101)))).code).toBe('22001');

    await expect(especialidad('a'.repeat(100))).resolves.toBeDefined();
    await expect(especialidad('Kinesiología')).resolves.toBeDefined();
    await expect(especialidad(null)).resolves.toBeDefined();
  });

  it('5b. sesiones_validas_desde guarda el instante con zona', async () => {
    // Arrange
    const corte = new Date('2026-10-31T15:04:05.000Z');

    // Act
    await base.query(
      'UPDATE usuarios SET sesiones_validas_desde = $2 WHERE id = $1',
      [usuarioId, corte],
    );

    // Assert
    const [{ leido }] = await base.query<{ leido: Date }[]>(
      'SELECT sesiones_validas_desde AS leido FROM usuarios WHERE id = $1',
      [usuarioId],
    );
    expect(leido.getTime()).toBe(corte.getTime());
  });

  it('5c. mensajes_soporte: los default de un mensaje nuevo', async () => {
    // Act
    const [{ id }] = await insertarMensaje();

    // Assert
    const [fila] = await base.query<
      {
        categoria: string;
        estado: string;
        intentos: number;
        proximo: Date | null;
        creado: Date | null;
        enviado: Date | null;
      }[]
    >(
      `SELECT categoria, estado_envio AS estado, intentos,
              proximo_intento_en AS proximo, creado_en AS creado,
              enviado_en AS enviado
         FROM mensajes_soporte WHERE id = $1`,
      [id],
    );
    expect(fila).toEqual({
      categoria: 'otro',
      estado: 'pendiente',
      intentos: 0,
      proximo: expect.any(Date) as Date,
      creado: expect.any(Date) as Date,
      enviado: null,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('5d. mensajes_soporte: los CHECK rechazan lo que el dominio no deja pasar', async () => {
    const casos: [string, Record<string, unknown>, string][] = [
      [
        'categoría fuera de las cuatro',
        { categoria: 'urgente' },
        'CHK_mensajes_soporte_categoria',
      ],
      [
        '2001 caracteres',
        { mensaje: 'a'.repeat(2001) },
        'CHK_mensajes_soporte_mensaje',
      ],
      ['texto vacío', { mensaje: '' }, 'CHK_mensajes_soporte_mensaje'],
      ['texto en blanco', { mensaje: '    ' }, 'CHK_mensajes_soporte_mensaje'],
      [
        'estado desconocido',
        { estado_envio: 'perdido' },
        'CHK_mensajes_soporte_estado_envio',
      ],
      [
        'enviado sin enviado_en',
        { estado_envio: 'enviado' },
        'CHK_mensajes_soporte_enviado',
      ],
      [
        'pendiente con enviado_en',
        { enviado_en: new Date() },
        'CHK_mensajes_soporte_enviado',
      ],
      [
        'fallido con enviado_en',
        { estado_envio: 'fallido', enviado_en: new Date() },
        'CHK_mensajes_soporte_enviado',
      ],
      ['intentos negativos', { intentos: -1 }, 'CHK_mensajes_soporte_intentos'],
    ];
    for (const [caso, extra, constraint] of casos) {
      expect({ caso, ...(await errorDe(insertarMensaje(extra))) }).toEqual({
        caso,
        code: '23514',
        constraint,
      });
    }

    // Lo que sí entra
    await expect(
      insertarMensaje({ mensaje: 'a'.repeat(2000) }),
    ).resolves.toBeDefined();
    await expect(
      insertarMensaje({ estado_envio: 'enviado', enviado_en: new Date() }),
    ).resolves.toBeDefined();
    await expect(
      insertarMensaje({ estado_envio: 'fallido', intentos: 8 }),
    ).resolves.toBeDefined();
    // `ultimo_error` es VARCHAR(100): el adaptador trunca antes
    expect(
      (await errorDe(insertarMensaje({ ultimo_error: 'E'.repeat(101) }))).code,
    ).toBe('22001');
  });

  it('5e. mensajes_soporte: las FK exigen organización y usuario, y no dejan borrar al autor', async () => {
    const inexistente = '00000000-0000-4000-8000-000000000000';

    expect(await errorDe(insertarMensaje({ tenant_id: inexistente }))).toEqual({
      code: '23503',
      constraint: 'FK_mensajes_soporte_tenant_id',
    });
    expect(await errorDe(insertarMensaje({ usuario_id: inexistente }))).toEqual(
      {
        code: '23503',
        constraint: 'FK_mensajes_soporte_usuario_id',
      },
    );
    // ON DELETE RESTRICT
    expect(
      await errorDe(
        base.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]),
      ),
    ).toEqual({ code: '23503', constraint: 'FK_mensajes_soporte_usuario_id' });
  });

  it('6. con datos, vuelven a bajar (20 → 19) y a subir en un lote; el down no se niega y pierde lo de US-10', async () => {
    // Arrange — hay mensajes (5c a 5e) y el usuario tiene especialidad y corte
    await base.query(
      `UPDATE usuarios SET especialidad = 'Kinesiología', sesiones_validas_desde = now()
        WHERE id = $1`,
      [usuarioId],
    );

    // Act — ⚠️ documentado en cada migración
    await base.undoLastMigration();
    await base.undoLastMigration();
    expect(await tablaExiste('mensajes_soporte')).toBe(false);
    expect(await columna('usuarios', 'especialidad')).toBeNull();
    const corridas = await base.runMigrations({ transaction: 'all' });

    // Assert
    expect(corridas.map((m) => m.name)).toEqual(US_10);
    expect(await ejecutadas()).toEqual(MIGRACIONES.map((M) => new M().name));
    const [fila] = await base.query<
      { especialidad: string | null; corte: Date | null }[]
    >(
      'SELECT especialidad, sesiones_validas_desde AS corte FROM usuarios WHERE id = $1',
      [usuarioId],
    );
    expect(fila).toEqual({ especialidad: null, corte: null });
    const [{ n }] = await base.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM mensajes_soporte',
    );
    expect(n).toBe(0);
  });
});
