import { randomUUID } from 'node:crypto';

import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import {
  EstadoSolicitud,
  SolicitudCita,
  TipoSolicitud,
} from '../domain/solicitud-cita.entity';
import { ReagendamientoYaSolicitadoError } from '../domain/reagendamiento-ya-solicitado.error';
import { SolicitudCitaOrmEntity } from '../infrastructure/persistence/solicitud-cita.orm-entity';
import { TypeOrmSolicitudCitaRepository } from '../infrastructure/persistence/typeorm-solicitud-cita.repository';

/**
 * Persistencia de solicitudes de la Fase 3 (contrato §2.2 y §3.3) contra
 * PostgreSQL real. Lo que los dobles NO reproducen:
 *
 *  - la clave única PARCIAL "una de reagendamiento `recibida` por cita" (R5)
 *    y que deje de aplicar al resolverla;
 *  - los CHECK (reagendamiento ⇒ cita de origen; nueva ⇒ RUT y correo);
 *  - RUT/correo NULL de ida y vuelta;
 *  - `buscarAbiertaPorRut` contando solo `nueva`;
 *  - `buscarReagendamientoAbiertoParaActualizar`: si otra transacción la
 *    resuelve mientras se espera el bloqueo, devuelve `null`.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const ENTIDADES = [TenantOrmEntity, UsuarioOrmEntity, SolicitudCitaOrmEntity];

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

describe('Solicitudes de reagendamiento contra PostgreSQL (integration)', () => {
  let baseA: DataSource;
  let baseB: DataSource;
  let repo: TypeOrmSolicitudCitaRepository;

  let tenantId: string;
  let otroTenantId: string;
  let usuarioId: string;

  const enTx = <T>(
    trabajo: (tx: EntityManager) => Promise<T>,
    base: DataSource = baseA,
  ): Promise<T> => base.transaction((manager) => trabajo(manager));

  const pedirOtraHora = (
    citaOrigenId: string,
    extra: Partial<{ rut: string | null; correo: string | null }> = {},
  ): SolicitudCita =>
    SolicitudCita.pedirOtraHora({
      tenantId,
      citaOrigenId,
      enlaceId: randomUUID(),
      usuarioId,
      rut: extra.rut === undefined ? null : extra.rut,
      nombrePaciente: 'Paciente Reagenda',
      telefono: '+56 9 0000 0000',
      correo: extra.correo === undefined ? null : extra.correo,
      consentimiento: true,
      preferenciaHoraria: 'martes en la tarde',
    });

  const recibirNueva = (rut = '123456785'): SolicitudCita =>
    SolicitudCita.recibir({
      tenantId,
      rut,
      nombrePaciente: 'Paciente Nuevo',
      telefono: '+56 9 1111 1111',
      correo: 'nuevo@correo.cl',
      motivo: 'Control',
      preferenciaHoraria: 'mañanas',
      consentimiento: true,
    });

  /** INSERT directo, para probar las restricciones sin pasar por el dominio. */
  const insertarCrudo = (campos: {
    tipo: string;
    citaOrigenId?: string | null;
    rut?: string | null;
    correo?: string | null;
    estado?: string;
  }): Promise<unknown> =>
    baseA.query(
      `INSERT INTO solicitudes_cita
         (tenant_id, rut, nombre_paciente, telefono, correo, motivo,
          preferencia_horaria, tipo, cita_origen_id, estado)
       VALUES ($1, $2, 'X', '+56 9 0', $3, '', 'cuando sea', $4, $5, $6)`,
      [
        tenantId,
        campos.rut === undefined ? '123456785' : campos.rut,
        campos.correo === undefined ? 'x@correo.cl' : campos.correo,
        campos.tipo,
        campos.citaOrigenId ?? null,
        campos.estado ?? 'recibida',
      ],
    );

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
    repo = new TypeOrmSolicitudCitaRepository(
      baseA.getRepository(SolicitudCitaOrmEntity),
    );

    const [tenant, otro] = await baseA.getRepository(TenantOrmEntity).save([
      { nombre: 'Clínica Solicitudes', slug: 'clinica-solicitudes-int' },
      { nombre: 'Otra Clínica', slug: 'otra-clinica-solicitudes-int' },
    ]);
    tenantId = tenant.id;
    otroTenantId = otro.id;
    const usuario = await baseA.getRepository(UsuarioOrmEntity).save({
      email: 'profesional@solicitudes-int.cl',
      passwordHash: '$2b$10$hash-de-prueba',
      nombreCompleto: 'Dr. Solicitudes',
      rol: RolUsuario.PROFESIONAL,
      tenantId,
    });
    usuarioId = usuario.id;
  });

  beforeEach(async () => {
    await baseA.query('TRUNCATE solicitudes_cita');
  });

  afterAll(async () => {
    await baseB?.destroy();
    await baseA?.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('ida y vuelta', () => {
    it('debería guardar y releer una de reagendamiento sin RUT ni correo', async () => {
      // Arrange
      const citaOrigenId = randomUUID();
      const solicitud = pedirOtraHora(citaOrigenId);

      // Act
      const guardada = await repo.guardar(solicitud);
      const releida = await repo.buscarPorId(guardada.id, tenantId);

      // Assert
      expect(releida).toMatchObject({
        tipo: TipoSolicitud.REAGENDAMIENTO,
        citaOrigenId,
        enlaceId: solicitud.enlaceId,
        usuarioId,
        rut: null,
        correo: null,
        motivo: '',
        citaId: null,
        resueltaEn: null,
      });
      expect(releida?.estado).toBe(EstadoSolicitud.RECIBIDA);
      expect(releida?.recibidaEn).toBeInstanceOf(Date);
    });

    it('debería guardar una nueva con tipo nueva y sin origen (default de la columna)', async () => {
      const guardada = await repo.guardar(recibirNueva());
      const [fila] = await baseA.query<
        {
          tipo: string;
          cita_origen_id: string | null;
          enlace_id: string | null;
        }[]
      >(
        'SELECT tipo, cita_origen_id, enlace_id FROM solicitudes_cita WHERE id = $1',
        [guardada.id],
      );

      expect(fila).toEqual({
        tipo: 'nueva',
        cita_origen_id: null,
        enlace_id: null,
      });
    });

    it('debería persistir el descarte (estado descartada + resueltaEn)', async () => {
      // Arrange
      const guardada = await repo.guardar(pedirOtraHora(randomUUID()));
      const ahora = new Date('2026-10-15T09:00:00.000Z');

      // Act
      await enTx(async (tx) => {
        const s = await repo.buscarReagendamientoAbiertoParaActualizar(
          guardada.citaOrigenId!,
          tenantId,
          tx,
        );
        s!.descartar(ahora);
        await repo.guardar(s!, tx);
      });

      // Assert
      const releida = await repo.buscarPorId(guardada.id, tenantId);
      expect(releida?.estado).toBe(EstadoSolicitud.DESCARTADA);
      expect(releida?.resueltaEn).toEqual(ahora);
      expect(
        await repo.buscarReagendamientoAbierto(
          guardada.citaOrigenId!,
          tenantId,
        ),
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('uq_solicitud_reagendamiento_recibida (R5)', () => {
    it('debería rechazar una segunda de reagendamiento recibida para la misma cita', async () => {
      const citaOrigenId = randomUUID();
      await repo.guardar(pedirOtraHora(citaOrigenId));

      // La base la rechaza con el 23505 del índice parcial…
      expect(
        await errorDe(
          insertarCrudo({
            tipo: 'reagendamiento',
            citaOrigenId,
            rut: null,
            correo: null,
          }),
        ),
      ).toEqual({
        code: '23505',
        constraint: 'uq_solicitud_reagendamiento_recibida',
      });
      // …y el adaptador lo traduce a un error de dominio (la aplicación no
      // conoce TypeORM; el portal lo responde con 409).
      await expect(
        repo.guardar(pedirOtraHora(citaOrigenId)),
      ).rejects.toBeInstanceOf(ReagendamientoYaSolicitadoError);
    });

    it.each<[string, (s: SolicitudCita) => void]>([
      ['aceptada', (s) => s.aceptar(usuarioId, s.citaOrigenId!)],
      ['rechazada', (s) => s.rechazar(usuarioId)],
      ['descartada', (s) => s.descartar()],
    ])(
      'debería admitir otra cuando la anterior quedó %s',
      async (_estado, resolver) => {
        // Arrange
        const citaOrigenId = randomUUID();
        const primera = await repo.guardar(pedirOtraHora(citaOrigenId));
        resolver(primera);
        await repo.guardar(primera);

        // Act & Assert
        await expect(
          repo.guardar(pedirOtraHora(citaOrigenId)),
        ).resolves.toBeInstanceOf(SolicitudCita);
      },
    );

    it('no debería afectar a solicitudes nuevas ni a reagendamientos de otras citas', async () => {
      await repo.guardar(recibirNueva());
      await repo.guardar(recibirNueva('111111111'));
      await repo.guardar(pedirOtraHora(randomUUID()));

      await expect(
        repo.guardar(pedirOtraHora(randomUUID())),
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('CHECK', () => {
    it('CHK_solicitudes_cita_reagendamiento_origen: reagendamiento sin cita de origen', async () => {
      expect(
        await errorDe(
          insertarCrudo({ tipo: 'reagendamiento', citaOrigenId: null }),
        ),
      ).toEqual({
        code: '23514',
        constraint: 'CHK_solicitudes_cita_reagendamiento_origen',
      });
    });

    it.each([
      ['sin RUT', { rut: null }],
      ['sin correo', { correo: null }],
    ])('CHK_solicitudes_cita_nueva_datos: nueva %s', async (_caso, extra) => {
      expect(await errorDe(insertarCrudo({ tipo: 'nueva', ...extra }))).toEqual(
        {
          code: '23514',
          constraint: 'CHK_solicitudes_cita_nueva_datos',
        },
      );
    });

    it('el estado descartada existe en el tipo', async () => {
      await expect(
        insertarCrudo({
          tipo: 'reagendamiento',
          citaOrigenId: randomUUID(),
          estado: 'descartada',
        }),
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('consultas', () => {
    it('buscarAbiertaPorRut solo cuenta solicitudes nuevas (R5)', async () => {
      // Arrange — un reagendamiento abierto con el mismo RUT.
      const rut = '123456785';
      await repo.guardar(
        pedirOtraHora(randomUUID(), { rut, correo: 'a@b.cl' }),
      );
      const desde = new Date(Date.now() - 3_600_000);

      // Act & Assert
      expect(await repo.buscarAbiertaPorRut(rut, tenantId, desde)).toBeNull();
      const nueva = await repo.guardar(recibirNueva(rut));
      expect((await repo.buscarAbiertaPorRut(rut, tenantId, desde))?.id).toBe(
        nueva.id,
      );
    });

    it('buscarReagendamientoAbierto respeta el tenant', async () => {
      const citaOrigenId = randomUUID();
      const guardada = await repo.guardar(pedirOtraHora(citaOrigenId));

      expect(
        (await repo.buscarReagendamientoAbierto(citaOrigenId, tenantId))?.id,
      ).toBe(guardada.id);
      expect(
        await repo.buscarReagendamientoAbierto(citaOrigenId, otroTenantId),
      ).toBeNull();
    });

    it('listarPorEstado filtra por citaOrigenId (voucher, R4)', async () => {
      // Arrange
      const citaA = randomUUID();
      const citaB = randomUUID();
      const deA = await repo.guardar(pedirOtraHora(citaA));
      await repo.guardar(pedirOtraHora(citaB));
      await repo.guardar(recibirNueva());

      // Act
      const soloA = await repo.listarPorEstado(
        tenantId,
        EstadoSolicitud.RECIBIDA,
        100,
        { citaOrigenId: citaA },
      );
      const todas = await repo.listarPorEstado(
        tenantId,
        EstadoSolicitud.RECIBIDA,
        100,
      );

      // Assert
      expect(soloA.map((s) => s.id)).toEqual([deA.id]);
      expect(todas).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  describe('buscarReagendamientoAbiertoParaActualizar (FOR UPDATE)', () => {
    it('debería devolver null si otra transacción la resolvió mientras esperaba el bloqueo', async () => {
      // Arrange — A la bloquea y la acepta (la bandeja).
      const citaOrigenId = randomUUID();
      await repo.guardar(pedirOtraHora(citaOrigenId));
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        const deA = await repo.buscarReagendamientoAbiertoParaActualizar(
          citaOrigenId,
          tenantId,
          a.manager,
        );
        deA!.aceptar(usuarioId, citaOrigenId);
        await repo.guardar(deA!, a.manager);

        // Act — B (el suscriptor) intenta descartarla desde otro proceso.
        const repoB = new TypeOrmSolicitudCitaRepository(
          baseB.getRepository(SolicitudCitaOrmEntity),
        );
        const deB = observar(
          enTx(
            (tx) =>
              repoB.buscarReagendamientoAbiertoParaActualizar(
                citaOrigenId,
                tenantId,
                tx,
              ),
            baseB,
          ),
        );
        await esperarBloqueadas();
        expect(deB.terminada()).toBe(false);
        await a.commitTransaction();

        // Assert — ya no está `recibida`: nada que descartar.
        expect(await deB.promesa).toBeNull();
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      const final = await repo.listarPorEstado(
        tenantId,
        EstadoSolicitud.ACEPTADA,
        10,
      );
      expect(final).toHaveLength(1);
    });
  });
});
