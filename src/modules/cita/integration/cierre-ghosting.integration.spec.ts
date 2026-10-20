import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { EventoSalidaOrmEntity } from '../../../shared/infrastructure/salida/evento-salida.orm-entity';
import { PublicadorEventosEnSalida } from '../../../shared/infrastructure/salida/publicador-eventos-en-salida';
import { TypeOrmEventosSalidaRepository } from '../../../shared/infrastructure/salida/typeorm-eventos-salida.repository';
import { TypeOrmTransactionRunner } from '../../../shared/infrastructure/typeorm-transaction-runner';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacientesService } from '../../paciente/application/pacientes.service';
import { PacienteOrmEntity } from '../../paciente/infrastructure/persistence/paciente.orm-entity';
import { TypeOrmPacienteRepository } from '../../paciente/infrastructure/persistence/typeorm-paciente.repository';
import { RecordatorioOrmEntity } from '../../recordatorio/infrastructure/persistence/recordatorio.orm-entity';
import { SolicitudCitaOrmEntity } from '../../solicitud/infrastructure/persistence/solicitud-cita.orm-entity';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import {
  CierreGhostingService,
  ResultadoCierreGhosting,
} from '../application/cierre-ghosting.service';
import { CitasService } from '../application/citas.service';
import { CitaModule } from '../cita.module';
import {
  CandidatasGhosting,
  CriterioCierreGhosting,
} from '../domain/candidatas-ghosting';
import {
  CORTE_GHOSTING,
  limiteCierreGhosting,
} from '../domain/cierre-ghosting';
import { Cita, EstadoCita, OrigenCita } from '../domain/cita.entity';
import { CitaRepository } from '../domain/cita.repository';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CambioCitaOrmEntity } from '../infrastructure/persistence/cambio-cita.orm-entity';
import { CitaOrmEntity } from '../infrastructure/persistence/cita.orm-entity';
import { EnlaceCitaOrmEntity } from '../infrastructure/persistence/enlace-cita.orm-entity';
import { SqlCandidatasGhosting } from '../infrastructure/persistence/sql-candidatas-ghosting';
import { TypeOrmCambioCitaRepository } from '../infrastructure/persistence/typeorm-cambio-cita.repository';
import { TypeOrmCitaRepository } from '../infrastructure/persistence/typeorm-cita.repository';

/**
 * Job G1 (US-07.01, DT-11) contra PostgreSQL real, con el SQL de
 * `SqlCandidatasGhosting`, el `CitasService` y el outbox REALES de
 * `CitaModule` (Definición de Terminado, "Integración"):
 *
 *  - la regla caso por caso: una condición falla por vez → no es candidata;
 *    y los que sí entran (`entregado`, `enviado` sin webhook, petición
 *    `rechazada`…), con los bordes exclusivos del corte y del límite;
 *  - `SKIP LOCKED`: dos `reclamarSiguiente` en dos transacciones a la vez
 *    toman citas distintas, sin esperar;
 *  - dos `ejecutar` en paralelo desde dos "procesos" (el `CitaModule` y una
 *    réplica armada a mano con los mismos adaptadores sobre OTRO DataSource,
 *    otro pool): cada cita se cierra UNA vez, con una fila en `cambios_cita` y
 *    un hecho en `eventos_salida`; volver a correr no cierra nada;
 *  - el modo apagado no escribe nada y su conteo coincide con lo que después
 *    cierra el modo prendido;
 *  - el bloqueo es `FOR NO KEY UPDATE`: el `INSERT` en `enlaces_cita` sobre la
 *    cita reclamada no espera (y un `FOR UPDATE` sí choca).
 *
 * El job LEE `recordatorios` y `solicitudes_cita` (dependencia de esquema, sin
 * imports en el código): esta prueba registra sus entidades ORM para que
 * `synchronize` cree esas tablas igual que las migraciones. Si cambia una de
 * las columnas que usa la consulta, esta suite falla (riesgo 9 del plan).
 *
 * Los instantes están fijos: el job se arma aquí con un reloj fijo (AHORA) y
 * todas las citas que cierra son de días ya pasados, así que el reloj real de
 * `CitasService` (que exige `ahora ≥ inicio`) nunca las rechaza.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const TZ = 'America/Santiago';
const MINUTO = 60_000;
const HORA = 60 * MINUTO;

// Lunes 19 de octubre de 2026, 09:00 en Chile (UTC-3): el "ahora" del tick.
const AHORA = new Date('2026-10-19T12:00:00.000Z');
// 00:00 del lunes 19 en Chile: entran las citas con inicio ANTERIOR.
const LIMITE = limiteCierreGhosting(AHORA, TZ);
const CORTE = CORTE_GHOSTING;
// Domingo 18, 10:00 en Chile: un día que ya terminó, después del corte.
const INICIO_OK = new Date('2026-10-18T13:00:00.000Z');
// Lunes 19, 10:00 en Chile: HOY, su día no terminó.
const HOY = new Date('2026-10-19T13:00:00.000Z');
// La hora que tenía una cita antes de reagendarla.
const HORA_ANTERIOR = new Date('2026-10-17T13:00:00.000Z');
// El recordatorio salió después del corte (ya llevaba el enlace).
const ENVIO_OK = new Date('2026-10-17T04:00:00.000Z');

const CRITERIO: CriterioCierreGhosting = { limite: LIMITE, corte: CORTE };

const configuracionTypeOrm: TypeOrmModuleOptions = {
  ...typeOrmTestConfig,
  entities: [
    TenantOrmEntity,
    UsuarioOrmEntity,
    PacienteOrmEntity,
    CitaOrmEntity,
    CambioCitaOrmEntity,
    EnlaceCitaOrmEntity,
    EventoSalidaOrmEntity,
    // Las dos tablas que LEE el job (de otros módulos, sin import en `cita`).
    RecordatorioOrmEntity,
    SolicitudCitaOrmEntity,
  ],
};

interface Organizacion {
  tenantId: string;
  usuarioId: string;
  pacienteId: string;
}

/** Un recordatorio de la cita; por defecto, enviado por Resend desde el corte para su hora vigente. */
interface Recordatorio {
  estado?: string;
  motivo?: string | null;
  proveedor?: string | null;
  enviadoEn?: Date | null;
  entregadoEn?: Date | null;
  /** Por defecto, el `inicio` vigente de la cita. */
  inicioCita?: Date;
  /** Por defecto, el de la cita. */
  tenant?: 'a' | 'b';
}

/** Una cita con su evidencia. Por defecto: candidata (pendiente, ayer, un recordatorio real). */
interface Escenario {
  inicio?: Date;
  estado?: EstadoCita;
  tenant?: 'a' | 'b';
  origen?: OrigenCita;
  recordatorios?: Recordatorio[];
  peticion?: 'recibida' | 'rechazada';
}

/** Error de Postgres tal como lo deja TypeORM (`QueryFailedError`). */
async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (error: unknown) {
    const e = error as { code?: string; driverError?: { code?: string } };
    return e.code ?? e.driverError?.code ?? 'sin-codigo';
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

function comoActivo(
  resultado: ResultadoCierreGhosting,
): Extract<ResultadoCierreGhosting, { modo: 'activo' }> {
  if (resultado.modo !== 'activo') {
    throw new Error(`se esperaba el modo activo (llegó "${resultado.modo}")`);
  }
  return resultado;
}

describe('Job G1: cierre por ghosting contra PostgreSQL (integration)', () => {
  let modulo: TestingModule;
  // La "segunda réplica": su propio DataSource (otro pool de conexiones).
  let baseB: DataSource;
  let datos: DataSource;
  let transacciones: TransactionRunner;
  let candidatas: CandidatasGhosting;
  let citas: CitasService;
  let citaRepo: CitaRepository;
  let servicio: CierreGhostingService;
  let servicioB: CierreGhostingService;
  let a: Organizacion;
  let b: Organizacion;
  let profesionalA: AuthenticatedUser;
  let abiertas: QueryRunner[] = [];

  /** Una transacción que el test deja abierta en SU conexión. */
  const abrirTx = async (): Promise<QueryRunner> => {
    const qr = datos.createQueryRunner();
    abiertas.push(qr);
    await qr.connect();
    await qr.startTransaction();
    return qr;
  };

  /** Espera a que alguna conexión de la base de test quede esperando un candado. */
  const esperarBloqueo = async (): Promise<void> => {
    const limite = Date.now() + 5_000;
    for (;;) {
      const [{ n }] = await datos.query<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_locks l
           JOIN pg_stat_activity s ON s.pid = l.pid
          WHERE NOT l.granted
            AND s.datname = current_database()`,
      );
      if (n >= 1) return;
      if (Date.now() > limite) {
        throw new Error('se esperaba una conexión bloqueada');
      }
      await new Promise((resolver) => setTimeout(resolver, 20));
    }
  };

  const org = (cual: 'a' | 'b' = 'a'): Organizacion => (cual === 'a' ? a : b);

  const insertarCita = async (e: Escenario): Promise<string> => {
    const o = org(e.tenant);
    const [{ id }] = await datos.query<{ id: string }[]>(
      `INSERT INTO citas
         (inicio, duracion_min, tipo_consulta, estado, origen, tenant_id, paciente_id, usuario_id)
       VALUES ($1, 45, 'Control', $2, $3, $4, $5, $6)
       RETURNING id::text AS id`,
      [
        e.inicio ?? INICIO_OK,
        e.estado ?? EstadoCita.PENDIENTE,
        e.origen ?? OrigenCita.MANUAL,
        o.tenantId,
        o.pacienteId,
        o.usuarioId,
      ],
    );
    return id;
  };

  const insertarRecordatorio = (
    citaId: string,
    tenantDeLaCita: 'a' | 'b',
    inicioVigente: Date,
    antelacionMin: number,
    r: Recordatorio,
  ): Promise<unknown> => {
    const inicioCita = r.inicioCita ?? inicioVigente;
    const programadoPara = new Date(
      inicioCita.getTime() - antelacionMin * MINUTO,
    );
    const estado = r.estado ?? 'enviado';
    return datos.query(
      `INSERT INTO recordatorios
         (tenant_id, cita_id, canal, antelacion_min, inicio_cita, programado_para,
          vence_en, estado, motivo, proximo_intento_en, proveedor, enviado_en, entregado_en)
       VALUES ($1, $2, 'email', $3, $4, $5, $4, $6, $7, $5, $8, $9, $10)`,
      [
        org(r.tenant ?? tenantDeLaCita).tenantId,
        citaId,
        antelacionMin,
        inicioCita,
        programadoPara,
        estado,
        r.motivo ?? null,
        r.proveedor === undefined ? 'resend' : r.proveedor,
        r.enviadoEn === undefined ? ENVIO_OK : r.enviadoEn,
        r.entregadoEn ?? null,
      ],
    );
  };

  /** Una petición de otra hora (`reagendamiento`) sobre la cita. */
  const insertarPeticion = (
    citaId: string,
    tenant: 'a' | 'b',
    estado: 'recibida' | 'rechazada',
  ): Promise<unknown> =>
    datos.query(
      `INSERT INTO solicitudes_cita
         (tenant_id, usuario_id, rut, nombre_paciente, telefono, correo, motivo,
          preferencia_horaria, consentimiento, estado, tipo, cita_origen_id, resuelta_en)
       VALUES ($1, $2, NULL, 'Paciente G1', '+56 9 0000 0000', NULL, '',
               'tardes', true, $3, 'reagendamiento', $4, $5)`,
      [
        org(tenant).tenantId,
        org(tenant).usuarioId,
        estado,
        citaId,
        estado === 'recibida' ? null : AHORA,
      ],
    );

  /** Siembra una cita con su evidencia; por defecto, una candidata. */
  const sembrar = async (e: Escenario = {}): Promise<string> => {
    const tenant = e.tenant ?? 'a';
    const inicio = e.inicio ?? INICIO_OK;
    const citaId = await insertarCita(e);
    const antelaciones = [1440, 120, 60];
    for (const [i, r] of (e.recordatorios ?? [{}]).entries()) {
      await insertarRecordatorio(citaId, tenant, inicio, antelaciones[i], r);
    }
    if (e.peticion) await insertarPeticion(citaId, tenant, e.peticion);
    return citaId;
  };

  const estadoDe = async (citaId: string): Promise<string> => {
    const [fila] = await datos.query<{ estado: string }[]>(
      'SELECT estado::text AS estado FROM citas WHERE id = $1',
      [citaId],
    );
    return fila.estado;
  };

  const reclamarEnTx = (excluir: string[] = []): Promise<Cita | null> =>
    datos.transaction((tx) =>
      candidatas.reclamarSiguiente(CRITERIO, excluir, tx),
    );

  /** Lo que el modo apagado no debe tocar. */
  const foto = async () => ({
    citas: await datos.query<
      { id: string; estado: string; actualizadoEn: Date }[]
    >(
      `SELECT id::text AS id, estado::text AS estado, actualizado_en AS "actualizadoEn"
         FROM citas ORDER BY id`,
    ),
    cambios: (
      await datos.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM cambios_cita',
      )
    )[0].n,
    hechos: (
      await datos.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM eventos_salida',
      )
    )[0].n,
  });

  /** Por cita: su estado, sus cambios `ghosting` y sus hechos `CitaNoAsistida`. */
  const cierresDe = (ids: readonly string[]) =>
    datos.query<
      { id: string; estado: string; cambios: number; hechos: number }[]
    >(
      `SELECT c.id::text     AS id,
              c.estado::text AS estado,
              (SELECT count(*)::int FROM cambios_cita k
                WHERE k.cita_id = c.id AND k.tipo::text = 'ghosting') AS cambios,
              (SELECT count(*)::int FROM eventos_salida e
                WHERE e.payload->>'citaId' = c.id::text
                  AND e.nombre = 'CitaNoAsistida') AS hechos
         FROM citas c
        WHERE c.id = ANY($1::uuid[])
        ORDER BY c.id`,
      [ids],
    );

  beforeAll(async () => {
    modulo = await Test.createTestingModule({
      imports: [
        // APP_TZ y ENLACE_CITA_CLAVE con sus valores por defecto (no producción).
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot(configuracionTypeOrm),
        CitaModule,
      ],
    }).compile();
    // Otro "proceso": su PROPIO DataSource (otro pool), mismo esquema, sin
    // volver a crearlo. No es un segundo `TypeOrmModule.forRoot`: el registro
    // de nombres de @nestjs/typeorm es del proceso entero y no admite dos
    // data sources por defecto, y `CitaModule` solo sabe usar el por defecto.
    baseB = new DataSource({
      ...(configuracionTypeOrm as DataSourceOptions),
      synchronize: false,
      dropSchema: false,
    });
    await baseB.initialize();

    datos = modulo.get(DataSource);
    transacciones = modulo.get(TransactionRunner);
    candidatas = modulo.get(CandidatasGhosting);
    citas = modulo.get(CitasService);
    citaRepo = modulo.get(CitaRepository);
    // El caso de uso del módulo, con un reloj fijo (el del módulo es el real).
    servicio = new CierreGhostingService(
      transacciones,
      candidatas,
      citas,
      TZ,
      () => AHORA,
    );
    // La réplica B, con los MISMOS adaptadores reales que arma `CitaModule`
    // (cita.module.ts, paciente.module.ts y shared.module.ts), sobre su pool.
    const pacientesB = new TypeOrmPacienteRepository(
      baseB.getRepository(PacienteOrmEntity),
    );
    const transaccionesB = new TypeOrmTransactionRunner(baseB);
    servicioB = new CierreGhostingService(
      transaccionesB,
      new SqlCandidatasGhosting(baseB),
      new CitasService(
        new TypeOrmCitaRepository(
          baseB.getRepository(CitaOrmEntity),
          new ConfigService(),
        ),
        new TypeOrmCambioCitaRepository(
          baseB.getRepository(CambioCitaOrmEntity),
        ),
        pacientesB,
        new PacientesService(pacientesB),
        transaccionesB,
        new PublicadorEventosEnSalida(new TypeOrmEventosSalidaRepository()),
        TZ,
      ),
      TZ,
      () => AHORA,
    );

    const crearOrganizacion = async (n: string): Promise<Organizacion> => {
      const tenant = await datos
        .getRepository(TenantOrmEntity)
        .save({ nombre: `Clínica G1 ${n}`, slug: `clinica-g1-${n}` });
      const usuario = await datos.getRepository(UsuarioOrmEntity).save({
        email: `profesional@g1-${n}.cl`,
        passwordHash: '$2b$10$hash-de-prueba',
        nombreCompleto: `Dra. G1 ${n}`,
        rol: RolUsuario.PROFESIONAL,
        tenantId: tenant.id,
      });
      const paciente = await datos.getRepository(PacienteOrmEntity).save({
        nombre: `Paciente Secreta ${n}`,
        telefono: '+56 9 8765 4321',
        correo: `secreta-${n}@correo.cl`,
        consentimiento: true,
        rut: null,
        tenantId: tenant.id,
      });
      return {
        tenantId: tenant.id,
        usuarioId: usuario.id,
        pacienteId: paciente.id,
      };
    };
    a = await crearOrganizacion('a');
    b = await crearOrganizacion('b');
    profesionalA = {
      userId: a.usuarioId,
      email: 'profesional@g1-a.cl',
      tenantId: a.tenantId,
      rol: RolUsuario.PROFESIONAL,
    };
  });

  beforeEach(async () => {
    await datos.query(
      'TRUNCATE eventos_salida, cambios_cita, enlaces_cita, recordatorios, solicitudes_cita, citas',
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Nunca dejar una transacción abierta: bloquearía al siguiente caso.
    for (const qr of abiertas) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      if (!qr.isReleased) await qr.release();
    }
    abiertas = [];
  });

  afterAll(async () => {
    if (baseB?.isInitialized) await baseB.destroy();
    await modulo?.close();
  });

  it('los instantes de la prueba son los del plan (límite = 00:00 de hoy en Chile, corte de DT-11)', () => {
    expect(LIMITE.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(CORTE.toISOString()).toBe('2026-10-17T03:22:00.000Z');
  });

  // ---------------------------------------------------------------------------
  describe('la regla G1, caso por caso (una condición falla por vez)', () => {
    const NO_ENTRA: [string, Escenario][] = [
      ['inicio de HOY en APP_TZ (su día no terminó)', { inicio: HOY }],
      [
        'inicio justo a la medianoche local (el límite es exclusivo)',
        { inicio: LIMITE },
      ],
      ['inicio justo en el corte (el corte es exclusivo)', { inicio: CORTE }],
      [
        'inicio anterior al corte',
        { inicio: new Date(CORTE.getTime() - HORA) },
      ],
      [
        'recordatorio enviado antes del corte (no llevaba el enlace)',
        { recordatorios: [{ enviadoEn: new Date(CORTE.getTime() - MINUTO) }] },
      ],
      [
        'recordatorio con proveedor = registro (no salió, DT-40)',
        { recordatorios: [{ proveedor: 'registro' }] },
      ],
      [
        'recordatorio enviado sin proveedor anotado (no prueba que saliera)',
        { recordatorios: [{ proveedor: null }] },
      ],
      [
        'recordatorio fallido (rebote)',
        { recordatorios: [{ estado: 'fallido', motivo: 'rebote' }] },
      ],
      [
        'recordatorio omitido (sin correo)',
        { recordatorios: [{ estado: 'omitido', motivo: 'sin_correo' }] },
      ],
      [
        'recordatorio programado que nunca salió',
        {
          recordatorios: [
            { estado: 'programado', proveedor: null, enviadoEn: null },
          ],
        },
      ],
      [
        'recordatorio cancelado (reprogramado)',
        { recordatorios: [{ estado: 'cancelado', motivo: 'reprogramado' }] },
      ],
      [
        'recordatorio de la hora ANTERIOR a un reagendamiento (H10)',
        { recordatorios: [{ inicioCita: HORA_ANTERIOR }] },
      ],
      [
        'recordatorio con el tenant de otra organización (defensa en profundidad)',
        { recordatorios: [{ tenant: 'b' }] },
      ],
      [
        'sin ningún recordatorio (correo vacío, creada tarde, recordatorios apagados)',
        { recordatorios: [] },
      ],
      [
        'con una petición de otra hora recibida (sin atender)',
        { peticion: 'recibida' },
      ],
      ['cita confirmada (G1 no la toca)', { estado: EstadoCita.CONFIRMADA }],
      ['cita ya cerrada (asistio)', { estado: EstadoCita.ASISTIO }],
      ['cita cancelada', { estado: EstadoCita.CANCELADA }],
    ];

    const ENTRA: [string, Escenario][] = [
      [
        'recordatorio entregado (con webhook)',
        {
          recordatorios: [
            {
              estado: 'entregado',
              entregadoEn: new Date(ENVIO_OK.getTime() + MINUTO),
            },
          ],
        },
      ],
      ['recordatorio enviado sin webhook (DT-37)', {}],
      [
        'con una petición de otra hora RECHAZADA (no protege, riesgo 8)',
        { peticion: 'rechazada' },
      ],
      [
        'recordatorio enviado justo en el corte (el corte del envío es inclusivo)',
        { recordatorios: [{ enviadoEn: CORTE }] },
      ],
      [
        'inicio un minuto antes de la medianoche local',
        { inicio: new Date(LIMITE.getTime() - MINUTO) },
      ],
      [
        'inicio un minuto después del corte',
        { inicio: new Date(CORTE.getTime() + MINUTO) },
      ],
      [
        'uno de la hora anterior y otro de la hora vigente',
        { recordatorios: [{ inicioCita: HORA_ANTERIOR }, {}] },
      ],
      [
        'un fallido y otro enviado para la hora vigente',
        { recordatorios: [{ estado: 'fallido', motivo: 'rebote' }, {}] },
      ],
      [
        'cita de otra organización (barrido global, ADR-12 §6)',
        { tenant: 'b' },
      ],
      [
        'cita que nació de una solicitud pública',
        { origen: OrigenCita.SOLICITUD_PUBLICA },
      ],
    ];

    it.each(NO_ENTRA)(
      'no es candidata: %s (y queda como estaba)',
      async (_caso, escenario) => {
        // Arrange
        const citaId = await sembrar(escenario);

        // Act
        const conteo = await candidatas.contar(CRITERIO);
        const reclamada = await reclamarEnTx();

        // Assert
        expect(conteo).toEqual({ candidatas: 0, masAntigua: null });
        expect(reclamada).toBeNull();
        expect(await estadoDe(citaId)).toBe(
          escenario.estado ?? EstadoCita.PENDIENTE,
        );
      },
    );

    it.each(ENTRA)('es candidata: %s', async (_caso, escenario) => {
      // Arrange
      const citaId = await sembrar(escenario);

      // Act
      const conteo = await candidatas.contar(CRITERIO);
      const reclamada = await reclamarEnTx();

      // Assert — el conteo y el reclamo ven lo mismo, con el mapeo de siempre
      expect(conteo).toEqual({
        candidatas: 1,
        masAntigua: escenario.inicio ?? INICIO_OK,
      });
      expect(reclamada?.id).toBe(citaId);
      expect(reclamada?.estado).toBe(EstadoCita.PENDIENTE);
      expect(reclamada?.inicio).toEqual(escenario.inicio ?? INICIO_OK);
      expect(reclamada?.tenantId).toBe(org(escenario.tenant).tenantId);
      expect(reclamada?.origen).toBe(escenario.origen ?? OrigenCita.MANUAL);
    });

    it('todos juntos: el conteo es exactamente el de los que entran, y el reclamo los recorre por (inicio, id) saltando los excluidos', async () => {
      // Arrange
      const entran: string[] = [];
      for (const [, escenario] of ENTRA) entran.push(await sembrar(escenario));
      for (const [, escenario] of NO_ENTRA) await sembrar(escenario);
      const esperado = (
        await datos.query<{ id: string }[]>(
          `SELECT id::text AS id FROM citas WHERE id = ANY($1::uuid[])
            ORDER BY inicio, id`,
          [entran],
        )
      ).map((f) => f.id);

      // Act
      const conteo = await candidatas.contar(CRITERIO);
      const recorrido: string[] = [];
      for (;;) {
        const siguiente = await reclamarEnTx(recorrido);
        if (!siguiente) break;
        recorrido.push(siguiente.id);
      }

      // Assert
      expect(conteo.candidatas).toBe(ENTRA.length);
      expect(recorrido).toEqual(esperado);
    });

    it('un id excluido que no es UUID se ignora (no rompe el ::uuid[])', async () => {
      // Arrange
      const citaId = await sembrar();

      // Act & Assert
      expect((await reclamarEnTx(['no-es-un-uuid']))?.id).toBe(citaId);
    });
  });

  // ---------------------------------------------------------------------------
  describe('varias réplicas', () => {
    it('dos reclamarSiguiente en dos transacciones a la vez → citas distintas, sin esperar (SKIP LOCKED); contar no se bloquea', async () => {
      // Arrange — tres candidatas, de la más antigua a la más nueva
      const [c1, c2, c3] = [
        await sembrar({ inicio: new Date(INICIO_OK.getTime() - 2 * HORA) }),
        await sembrar({ inicio: new Date(INICIO_OK.getTime() - HORA) }),
        await sembrar({ inicio: INICIO_OK }),
      ];

      // Act — la réplica A reclama y deja su transacción abierta
      const replicaA = await abrirTx();
      const deA = await candidatas.reclamarSiguiente(
        CRITERIO,
        [],
        replicaA.manager,
      );
      // La réplica B, en otra conexión: si esperara el candado, fallaría a 1 s
      const replicaB = await abrirTx();
      await replicaB.query(`SET LOCAL lock_timeout = '1s'`);
      const deB = await candidatas.reclamarSiguiente(
        CRITERIO,
        [],
        replicaB.manager,
      );
      // Una tercera salta las dos tomadas
      const deC = await datos.transaction(async (tx) => {
        await tx.query(`SET LOCAL lock_timeout = '1s'`);
        return candidatas.reclamarSiguiente(CRITERIO, [], tx);
      });

      // Assert
      expect([deA?.id, deB?.id, deC?.id]).toEqual([c1, c2, c3]);
      // El conteo del modo apagado no bloquea ni salta: sigue viendo las tres
      expect((await candidatas.contar(CRITERIO)).candidatas).toBe(3);

      // Al revertir A, su cita vuelve a estar disponible (B sigue con la suya)
      await replicaA.rollbackTransaction();
      expect((await reclamarEnTx())?.id).toBe(c1);
    });

    it('dos ejecutar en paralelo desde dos procesos → cada cita se cierra UNA vez (una fila en la bitácora y un hecho por cita); volver a correr no cierra nada', async () => {
      // Arrange — ocho candidatas de las dos organizaciones y tres que no
      const candidatasIds: string[] = [];
      for (let i = 0; i < 8; i++) {
        candidatasIds.push(
          await sembrar({
            inicio: new Date(CORTE.getTime() + (i + 1) * HORA),
            tenant: i % 2 === 0 ? 'a' : 'b',
          }),
        );
      }
      const noCandidatas = [
        await sembrar({ inicio: HOY }),
        await sembrar({ peticion: 'recibida' }),
        await sembrar({ recordatorios: [{ proveedor: 'registro' }] }),
      ];

      // Act
      const [deA, deB] = (
        await Promise.all([
          servicio.ejecutar({ activo: true, lote: 200 }),
          servicioB.ejecutar({ activo: true, lote: 200 }),
        ])
      ).map(comoActivo);

      // Assert — entre las dos, exactamente las ocho, sin fallos
      expect(deA.cerradas + deB.cerradas).toBe(8);
      expect(deA.fallidas).toEqual([]);
      expect(deB.fallidas).toEqual([]);
      expect(await cierresDe(candidatasIds)).toEqual(
        [...candidatasIds].sort().map((id) => ({
          id,
          estado: 'ghosting',
          cambios: 1,
          hechos: 1,
        })),
      );
      // La bitácora del sistema: actor sistema, sin id, desde pendiente
      const bitacora = await datos.query<
        {
          actorTipo: string;
          actorId: string | null;
          estadoAnterior: string;
          estadoNuevo: string;
          pedidoPor: string | null;
        }[]
      >(
        `SELECT DISTINCT actor_tipo::text      AS "actorTipo",
                         actor_id::text        AS "actorId",
                         estado_anterior::text AS "estadoAnterior",
                         estado_nuevo::text    AS "estadoNuevo",
                         pedido_por::text      AS "pedidoPor"
           FROM cambios_cita WHERE tipo::text = 'ghosting'`,
      );
      expect(bitacora).toEqual([
        {
          actorTipo: 'sistema',
          actorId: null,
          estadoAnterior: 'pendiente',
          estadoNuevo: 'ghosting',
          pedidoPor: null,
        },
      ]);
      // Las que no cumplen G1 siguen pendientes, sin bitácora ni hechos
      expect(await cierresDe(noCandidatas)).toEqual(
        [...noCandidatas].sort().map((id) => ({
          id,
          estado: 'pendiente',
          cambios: 0,
          hechos: 0,
        })),
      );

      // Act 2 — el próximo tick (de las dos réplicas)
      const otraVez = (
        await Promise.all([
          servicio.ejecutar({ activo: true, lote: 200 }),
          servicioB.ejecutar({ activo: true, lote: 200 }),
        ])
      ).map(comoActivo);

      // Assert 2 — idempotente
      expect(otraVez.map((r) => r.cerradas)).toEqual([0, 0]);
      expect(
        (
          await datos.query<{ n: number }[]>(
            'SELECT count(*)::int AS n FROM cambios_cita',
          )
        )[0].n,
      ).toBe(8);
    });

    it('el profesional marca asistencia mientras el job cierra la misma cita → espera el bloqueo y recibe 409; queda una sola historia', async () => {
      // Arrange — el job reclamó y cerró, sin confirmar todavía
      const citaId = await sembrar();
      const job = await abrirTx();
      const reclamada = await candidatas.reclamarSiguiente(
        CRITERIO,
        [],
        job.manager,
      );
      await citas.cerrarPorGhostingEnTx(reclamada!, job.manager);

      // Act — el voucher, en otra conexión
      const marca = observar(citas.marcarAsistencia(citaId, profesionalA));
      await esperarBloqueo();
      expect(marca.terminada()).toBe(false);
      await job.commitTransaction();

      // Assert
      await expect(marca.promesa).rejects.toBeInstanceOf(
        TransicionEstadoInvalidaError,
      );
      expect(await cierresDe([citaId])).toEqual([
        { id: citaId, estado: 'ghosting', cambios: 1, hechos: 1 },
      ]);
    });

    it('con la cita bloqueada por el profesional (marcando asistencia), el job la salta sin esperar y después ya no es candidata', async () => {
      // Arrange — la mutación del profesional, en una transacción abierta
      const citaId = await sembrar();
      const delProfesional = await abrirTx();
      const cita = await citaRepo.buscarPorIdParaActualizar(
        citaId,
        a.tenantId,
        delProfesional.manager,
      );
      cita!.marcarAsistencia(AHORA);
      await citaRepo.guardar(cita!, delProfesional.manager);

      // Act — un tick mientras tanto
      const durante = comoActivo(
        await servicio.ejecutar({ activo: true, lote: 200 }),
      );
      await delProfesional.commitTransaction();
      const despues = comoActivo(
        await servicio.ejecutar({ activo: true, lote: 200 }),
      );

      // Assert
      expect(durante).toMatchObject({ cerradas: 0, fallidas: [] });
      expect(despues).toMatchObject({ cerradas: 0, fallidas: [] });
      expect(await estadoDe(citaId)).toBe('asistio');
    });
  });

  // ---------------------------------------------------------------------------
  describe('modo apagado (CIERRE_GHOSTING_ACTIVO=false)', () => {
    it('no escribe nada (citas, bitácora, outbox), no abre transacciones y su conteo es lo que después cierra el modo prendido', async () => {
      // Arrange — tres candidatas y dos que no
      const masAntigua = new Date(CORTE.getTime() + HORA);
      await sembrar({ inicio: masAntigua });
      await sembrar({ inicio: INICIO_OK, tenant: 'b' });
      await sembrar({ inicio: new Date(LIMITE.getTime() - MINUTO) });
      await sembrar({ inicio: HOY });
      await sembrar({ estado: EstadoCita.CONFIRMADA });
      const antes = await foto();
      const abrir = jest.spyOn(transacciones, 'run');
      const reclamar = jest.spyOn(candidatas, 'reclamarSiguiente');
      const cerrar = jest.spyOn(citas, 'cerrarPorGhostingEnTx');

      // Act
      const simulado = await servicio.ejecutar({ activo: false, lote: 200 });

      // Assert
      expect(simulado).toEqual({
        modo: 'simulado',
        limite: LIMITE,
        candidatas: 3,
        masAntigua,
      });
      expect(await foto()).toEqual(antes);
      expect(abrir).not.toHaveBeenCalled();
      expect(reclamar).not.toHaveBeenCalled();
      expect(cerrar).not.toHaveBeenCalled();

      // Act 2 — se prende el interruptor
      jest.restoreAllMocks();
      const activo = comoActivo(
        await servicio.ejecutar({ activo: true, lote: 200 }),
      );

      // Assert 2 — cierra exactamente lo que contó
      const contadas =
        simulado.modo === 'simulado' ? simulado.candidatas : Number.NaN;
      expect(activo.cerradas).toBe(contadas);
      expect(activo.fallidas).toEqual([]);
      const despues = await foto();
      expect(despues.cambios).toBe(antes.cambios + 3);
      expect(despues.hechos).toBe(antes.hechos + 3);
    });

    it('con el CierreGhostingService que arma CitaModule: APP_TZ por defecto y el reloj real', async () => {
      // Arrange — una candidata de un día ya pasado
      await sembrar();
      const limiteAntes = limiteCierreGhosting(new Date(), TZ);

      // Act
      const resultado = await modulo
        .get(CierreGhostingService)
        .ejecutar({ activo: false, lote: 200 });

      // Assert — el límite es el de "hoy" (antes o después de la llamada, por
      // si justo cruzó la medianoche)
      const limiteDespues = limiteCierreGhosting(new Date(), TZ);
      expect(resultado.modo).toBe('simulado');
      expect([limiteAntes.getTime(), limiteDespues.getTime()]).toContain(
        resultado.limite.getTime(),
      );
      expect(resultado).toMatchObject({
        candidatas: 1,
        masAntigua: INICIO_OK,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('una cita que falla', () => {
    it('su transacción se revierte entera (sin ghosting, bitácora ni hecho), va a fallidas sin datos del paciente y el tick sigue con las demás', async () => {
      // Arrange
      const falla = await sembrar({
        inicio: new Date(CORTE.getTime() + HORA),
      });
      const otras = [
        await sembrar({ inicio: new Date(CORTE.getTime() + 2 * HORA) }),
        await sembrar({ inicio: new Date(CORTE.getTime() + 3 * HORA) }),
      ];
      // Falla DESPUÉS de guardar, registrar y publicar (todo en el tx).
      const real = citas.cerrarPorGhostingEnTx.bind(
        citas,
      ) as CitasService['cerrarPorGhostingEnTx'];
      jest
        .spyOn(citas, 'cerrarPorGhostingEnTx')
        .mockImplementation(async (cita, tx) => {
          const cerrada = await real(cita, tx);
          if (cita.id === falla) {
            throw Object.assign(
              new Error('fallo simulado: Paciente Secreta a, +56 9 8765 4321'),
              { name: 'ErrorSimulado' },
            );
          }
          return cerrada;
        });

      // Act
      const resultado = comoActivo(
        await servicio.ejecutar({ activo: true, lote: 200 }),
      );

      // Assert
      expect(resultado.cerradas).toBe(2);
      expect(resultado.fallidas).toEqual([
        { citaId: falla, tenantId: a.tenantId, error: 'ErrorSimulado' },
      ]);
      expect(JSON.stringify(resultado)).not.toMatch(/Secreta|8765/);
      expect(await cierresDe([falla])).toEqual([
        { id: falla, estado: 'pendiente', cambios: 0, hechos: 0 },
      ]);
      expect((await cierresDe(otras)).map((c) => c.estado)).toEqual([
        'ghosting',
        'ghosting',
      ]);

      // Act 2 — el próximo tick, ya sin el fallo
      jest.restoreAllMocks();
      const siguiente = comoActivo(
        await servicio.ejecutar({ activo: true, lote: 200 }),
      );

      // Assert 2
      expect(siguiente).toMatchObject({ cerradas: 1, fallidas: [] });
      expect(await cierresDe([falla])).toEqual([
        { id: falla, estado: 'ghosting', cambios: 1, hechos: 1 },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('el bloqueo del reclamo es FOR NO KEY UPDATE (regla del módulo)', () => {
    it('con la cita reclamada (tx abierta), un FOR KEY SHARE y el INSERT en enlaces_cita no esperan; un FOR UPDATE y otra mutación sí chocan', async () => {
      // Arrange — el job reclamó la cita y sigue en su transacción
      const citaId = await sembrar();
      const job = await abrirTx();
      const reclamada = await candidatas.reclamarSiguiente(
        CRITERIO,
        [],
        job.manager,
      );
      expect(reclamada?.id).toBe(citaId);

      // Act & Assert — la fila SÍ está bloqueada para otra mutación…
      expect(
        await codigoDeError(
          datos.transaction((tx) =>
            tx.query(
              'SELECT id FROM citas WHERE id = $1 FOR NO KEY UPDATE NOWAIT',
              [citaId],
            ),
          ),
        ),
      ).toBe('55P03');
      expect(
        await codigoDeError(
          datos.transaction((tx) =>
            tx.query('SELECT id FROM citas WHERE id = $1 FOR UPDATE NOWAIT', [
              citaId,
            ]),
          ),
        ),
      ).toBe('55P03');
      // …pero no para el FOR KEY SHARE de la FK
      await expect(
        datos.transaction((tx) =>
          tx.query('SELECT id FROM citas WHERE id = $1 FOR KEY SHARE NOWAIT', [
            citaId,
          ]),
        ),
      ).resolves.toBeDefined();
      // El envío del recordatorio inserta el enlace sin esperar (falla a 1 s si esperara)
      const envio = await abrirTx();
      await envio.query(`SET LOCAL lock_timeout = '1s'`);
      await envio.query(
        `INSERT INTO enlaces_cita (cita_id, tenant_id, version, token_hash)
         VALUES ($1, $2, 1, $3)`,
        [citaId, a.tenantId, 'c'.repeat(64)],
      );
      await envio.commitTransaction();

      // Y el job termina su cierre en la misma transacción
      await citas.cerrarPorGhostingEnTx(reclamada!, job.manager);
      await job.commitTransaction();
      expect(await estadoDe(citaId)).toBe('ghosting');
      const [{ n }] = await datos.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM enlaces_cita WHERE cita_id = $1',
        [citaId],
      );
      expect(n).toBe(1);
    });

    it('el cierre del job conserva el origen de la cita', async () => {
      // Arrange
      const citaId = await sembrar({ origen: OrigenCita.SOLICITUD_PUBLICA });

      // Act
      comoActivo(await servicio.ejecutar({ activo: true, lote: 200 }));

      // Assert
      const [fila] = await datos.query<{ estado: string; origen: string }[]>(
        'SELECT estado::text AS estado, origen::text AS origen FROM citas WHERE id = $1',
        [citaId],
      );
      expect(fila).toEqual({ estado: 'ghosting', origen: 'solicitud_publica' });
    });
  });
});
