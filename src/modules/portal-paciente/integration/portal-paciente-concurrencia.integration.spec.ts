import { createHash } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CitasService } from '../../cita/application/citas.service';
import { EnlaceCitaNoValidoError } from '../../cita/application/enlace-cita-no-valido.error';
import { EnlacesCitaService } from '../../cita/application/enlaces-cita.service';
import { CitaModule } from '../../cita/cita.module';
import { CitaRepository } from '../../cita/domain/cita.repository';
import { EnlaceCitaRepository } from '../../cita/domain/enlace-cita.repository';
import { PedidoPor } from '../../cita/domain/cambio-cita.entity';
import { TransicionEstadoInvalidaError } from '../../cita/domain/exceptions/transicion-estado-invalida.error';
import { PacientesService } from '../../paciente/application/pacientes.service';
import { BandejaSolicitudesService } from '../../solicitud/application/bandeja-solicitudes.service';
import { SolicitudesOtraHoraService } from '../../solicitud/application/solicitudes-otra-hora.service';
import { SolicitudCita } from '../../solicitud/domain/solicitud-cita.entity';
import { SolicitudCitaRepository } from '../../solicitud/domain/solicitud-cita.repository';
import { SolicitudModule } from '../../solicitud/solicitud.module';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import { PortalPacienteService } from '../application/portal-paciente.service';
import { LectorNombresCita } from '../domain/lector-nombres-cita';
import { PortalPacienteModule } from '../portal-paciente.module';

/**
 * Concurrencia del portal del paciente contra PostgreSQL real (Definición de
 * Terminado de US-04, "Concurrencia"; contrato §3.1 y §3.4).
 *
 * Los módulos REALES (`cita`, `solicitud`, `portal-paciente`) con sus
 * adaptadores TypeORM y el outbox. Cada caso deja una transacción ABIERTA en
 * una conexión (un `QueryRunner`) y lanza la otra operación por el camino de
 * siempre, que toma OTRA conexión del pool: así se ve quién espera a quién.
 *
 *  - El paciente cancela mientras el profesional reagenda la misma cita, en
 *    los dos órdenes: una sola historia coherente en la bitácora y el outbox.
 *  - La bandeja acepta una petición de otra hora mientras el paciente cancela
 *    (orden de bloqueo solicitud → cita contra cita): sin interbloqueo, 409.
 *  - El profesional invalida el enlace mientras el paciente actúa: el portal
 *    relee el enlace tras el bloqueo y responde el mismo 404.
 *  - `asegurarActivo` dos a la vez: un solo enlace activo y el MISMO token.
 *  - `FOR NO KEY UPDATE` (y no `FOR UPDATE`) sobre la cita: el INSERT en
 *    `enlaces_cita` (FK → `FOR KEY SHARE`) no queda esperando, en ninguno de
 *    los dos sentidos; con `FOR UPDATE` sí esperaría (control).
 *  - US-11: `aceptar-terminos` (cita → paciente) mientras la bandeja acepta
 *    una solicitud del MISMO paciente (solicitud → paciente → cita nueva), en
 *    los dos órdenes, sin interbloqueo; dos `aceptar-terminos` a la vez → una
 *    fila; y si el registro falla en la bandeja, no queda nada.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const configuracionTypeOrm = {
  ...typeOrmTestConfig,
  // Las entidades de cita, paciente, solicitud y enlaces las registran sus
  // módulos (forFeature).
  autoLoadEntities: true,
} as TypeOrmModuleOptions;

const DIA = 24 * 60 * 60 * 1000;
/** Instante redondeado al minuto, `dias` días en el futuro. */
const enDias = (dias: number): Date =>
  new Date(Math.ceil((Date.now() + dias * DIA) / 60_000) * 60_000);

const sha256 = (texto: string): string =>
  createHash('sha256').update(texto).digest('hex');

/** Una fila de la bitácora, en orden. */
interface CambioFila {
  tipo: string;
  actorTipo: string;
  actorId: string | null;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
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

describe('Portal del paciente: concurrencia contra PostgreSQL (integration)', () => {
  let modulo: TestingModule;
  let datos: DataSource;
  let citas: CitasService;
  let enlaces: EnlacesCitaService;
  let portal: PortalPacienteService;
  let bandeja: BandejaSolicitudesService;
  let transacciones: TransactionRunner;
  let citaRepo: CitaRepository;
  let enlaceRepo: EnlaceCitaRepository;
  let pacientes: PacientesService;
  let solicitudRepo: SolicitudCitaRepository;
  let profesional: AuthenticatedUser;
  let abiertas: QueryRunner[] = [];

  /**
   * Un `TransactionRunner` que corre el trabajo en la transacción que el test
   * dejó ABIERTA en `qr`: así el caso de uso REAL (portal o bandeja) hace todo
   * su camino y queda sin confirmar, con sus candados tomados.
   */
  const enLaAbierta = (qr: QueryRunner): TransactionRunner => ({
    run: (trabajo) => trabajo(qr.manager),
  });

  const portalEn = (qr: QueryRunner): PortalPacienteService =>
    new PortalPacienteService(
      enLaAbierta(qr),
      enlaces,
      citas,
      modulo.get(SolicitudesOtraHoraService),
      modulo.get(LectorNombresCita),
      pacientes,
      'America/Santiago',
    );

  const bandejaEn = (qr: QueryRunner): BandejaSolicitudesService =>
    new BandejaSolicitudesService(
      solicitudRepo,
      citas,
      pacientes,
      enLaAbierta(qr),
      modulo.get(PublicadorEventos),
    );

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

  const crearCita = async (inicio = enDias(3)): Promise<string> => {
    const cita = await citas.crearCita(
      {
        inicio: inicio.toISOString(),
        duracionMin: 45,
        tipoConsulta: 'Control',
        paciente: {
          nombre: 'Paciente Concurrente',
          telefono: '+56 9 1234 5678',
          correo: 'concurrente@correo.cl',
          consentimiento: true,
          // US-11: el alta con `paciente` registra la aceptación del
          // profesional.
          terminosVersion: '1.0',
        },
      },
      profesional,
    );
    return cita.id;
  };

  /** Token del enlace activo, como lo emite el envío del recordatorio. */
  const emitirToken = (citaId: string): Promise<string> =>
    transacciones.run((tx) =>
      enlaces.asegurarActivo(citaId, profesional.tenantId, tx),
    );

  const leerCita = async (
    citaId: string,
  ): Promise<{ estado: string; inicio: Date }> => {
    const [fila] = await datos.query<{ estado: string; inicio: Date }[]>(
      'SELECT estado::text AS estado, inicio FROM citas WHERE id = $1',
      [citaId],
    );
    return fila;
  };

  const bitacoraDe = (citaId: string): Promise<CambioFila[]> =>
    datos.query<CambioFila[]>(
      `SELECT tipo::text            AS "tipo",
              actor_tipo::text      AS "actorTipo",
              actor_id::text        AS "actorId",
              estado_anterior::text AS "estadoAnterior",
              estado_nuevo::text    AS "estadoNuevo"
         FROM cambios_cita
        WHERE cita_id = $1
        ORDER BY ocurrido_en, id`,
      [citaId],
    );

  /** Cada cambio parte del estado en que dejó la cita el anterior. */
  const exigirBitacoraCoherente = (bitacora: CambioFila[]): void => {
    for (let i = 1; i < bitacora.length; i++) {
      expect(bitacora[i].estadoAnterior).toBe(bitacora[i - 1].estadoNuevo);
    }
  };

  const hechosDe = async (citaId: string): Promise<string[]> =>
    (
      await datos.query<{ nombre: string }[]>(
        `SELECT nombre FROM eventos_salida
          WHERE payload->>'citaId' = $1
          ORDER BY ocurrido_en, creado_en`,
        [citaId],
      )
    ).map((h) => h.nombre);

  const enlacesDe = (citaId: string) =>
    datos.query<{ version: number; activo: boolean; tokenHash: string }[]>(
      `SELECT version, revocado_en IS NULL AS activo, token_hash AS "tokenHash"
         FROM enlaces_cita WHERE cita_id = $1 ORDER BY version`,
      [citaId],
    );

  beforeAll(async () => {
    modulo = await Test.createTestingModule({
      imports: [
        // APP_TZ y ENLACE_CITA_CLAVE con sus valores por defecto (no producción).
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot(configuracionTypeOrm),
        CitaModule,
        SolicitudModule,
        PortalPacienteModule,
      ],
    }).compile();

    datos = modulo.get(DataSource);
    citas = modulo.get(CitasService);
    enlaces = modulo.get(EnlacesCitaService);
    portal = modulo.get(PortalPacienteService);
    bandeja = modulo.get(BandejaSolicitudesService);
    transacciones = modulo.get(TransactionRunner);
    citaRepo = modulo.get(CitaRepository);
    enlaceRepo = modulo.get(EnlaceCitaRepository);
    pacientes = modulo.get(PacientesService);
    solicitudRepo = modulo.get(SolicitudCitaRepository);

    const tenant = await datos
      .getRepository(TenantOrmEntity)
      .save({ nombre: 'Clínica Concurrente', slug: 'clinica-concurrente' });
    const usuario = await datos.getRepository(UsuarioOrmEntity).save({
      email: 'profesional@concurrente.cl',
      passwordHash: '$2b$10$hash-de-prueba',
      nombreCompleto: 'Dra. Concurrente',
      rol: RolUsuario.PROFESIONAL,
      tenantId: tenant.id,
    });
    profesional = {
      userId: usuario.id,
      email: usuario.email,
      tenantId: tenant.id,
      rol: RolUsuario.PROFESIONAL,
    };
  });

  beforeEach(async () => {
    await datos.query(
      'TRUNCATE eventos_salida, cambios_cita, enlaces_cita, solicitudes_cita, citas, aceptaciones_terminos, pacientes',
    );
  });

  afterEach(async () => {
    // Nunca dejar una transacción abierta: bloquearía al siguiente caso.
    for (const qr of abiertas) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      if (!qr.isReleased) await qr.release();
    }
    abiertas = [];
  });

  afterAll(async () => {
    await modulo?.close();
  });

  // ---------------------------------------------------------------------------
  describe('el paciente cancela mientras el profesional reagenda la MISMA cita', () => {
    it('el paciente llega primero: el reagendamiento espera, relee la cita ya cancelada y falla limpio (409); queda una sola transición', async () => {
      // Arrange
      const citaId = await crearCita();
      const inicioOriginal = (await leerCita(citaId)).inicio;
      const token = await emitirToken(citaId);
      const enlaceId = (await enlaceRepo
        .buscarActivoPorCita(citaId, datos.manager)
        .then((e) => e?.id)) as string;

      // El paciente, en su transacción: lo mismo que hace el portal
      // (resolver bloquea la cita → cancelar), todavía sin confirmar.
      const delPaciente = await abrirTx();
      const resuelto = await enlaces.resolver(token, delPaciente.manager);
      expect(resuelto).not.toBeNull();
      await citas.cancelarComoPaciente(
        resuelto!.cita,
        resuelto!.enlace,
        'me surgió algo',
        delPaciente.manager,
      );

      // Act — el profesional reagenda desde el voucher (otra conexión)
      const reagenda = observar(
        citas.reagendar(
          citaId,
          { inicio: enDias(5).toISOString() },
          profesional,
        ),
      );
      await esperarBloqueo();
      expect(reagenda.terminada()).toBe(false);
      await delPaciente.commitTransaction();

      // Assert — falla limpio, sin escribir nada
      await expect(reagenda.promesa).rejects.toBeInstanceOf(
        TransicionEstadoInvalidaError,
      );
      expect(await leerCita(citaId)).toEqual({
        estado: 'cancelada',
        inicio: inicioOriginal,
      });
      const bitacora = await bitacoraDe(citaId);
      expect(bitacora).toEqual([
        {
          tipo: 'creada',
          actorTipo: 'profesional',
          actorId: profesional.userId,
          estadoAnterior: null,
          estadoNuevo: 'pendiente',
        },
        {
          tipo: 'cancelada',
          actorTipo: 'paciente',
          actorId: enlaceId,
          estadoAnterior: 'pendiente',
          estadoNuevo: 'cancelada',
        },
      ]);
      exigirBitacoraCoherente(bitacora);
      expect(await hechosDe(citaId)).toEqual(['CitaCreada', 'CitaCancelada']);
    });

    it('el profesional llega primero: el portal espera el bloqueo, relee la hora NUEVA y cancela sobre ella; la bitácora encadena reagendada → cancelada', async () => {
      // Arrange
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      const nuevoInicio = enDias(6);

      // El profesional, en su transacción (la de la bandeja o el voucher),
      // todavía sin confirmar.
      const delProfesional = await abrirTx();
      await citas.reagendarEnTx(
        citaId,
        nuevoInicio,
        profesional,
        delProfesional.manager,
        PedidoPor.PACIENTE,
      );

      // Act — el paciente cancela por el portal (otra conexión)
      const cancela = observar(portal.cancelar(token, 'no puedo'));
      await esperarBloqueo();
      expect(cancela.terminada()).toBe(false);
      await delProfesional.commitTransaction();

      // Assert — la vista es la de la hora NUEVA, ya cancelada
      expect(await cancela.promesa).toMatchObject({
        inicio: nuevoInicio.toISOString(),
        estado: 'cancelada',
        accionesPermitidas: [],
      });
      expect(await leerCita(citaId)).toEqual({
        estado: 'cancelada',
        inicio: nuevoInicio,
      });
      const bitacora = await bitacoraDe(citaId);
      expect(bitacora.map((c) => [c.tipo, c.actorTipo])).toEqual([
        ['creada', 'profesional'],
        ['reagendada', 'profesional'],
        ['cancelada', 'paciente'],
      ]);
      exigirBitacoraCoherente(bitacora);
      expect(await hechosDe(citaId)).toEqual([
        'CitaCreada',
        'CitaReagendada',
        'CitaCancelada',
      ]);
    });

    it('la bandeja acepta la petición de otra hora mientras el paciente cancela: sin interbloqueo, la bandeja recibe 409 y la petición sigue abierta', async () => {
      // Arrange — petición de otra hora abierta
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      await portal.pedirOtraHora(token, { preferencia: 'tardes' });
      const [{ id: solicitudId }] = await datos.query<{ id: string }[]>(
        'SELECT id::text AS id FROM solicitudes_cita WHERE cita_origen_id = $1',
        [citaId],
      );
      const delPaciente = await abrirTx();
      const resuelto = await enlaces.resolver(token, delPaciente.manager);
      await citas.cancelarComoPaciente(
        resuelto!.cita,
        resuelto!.enlace,
        undefined,
        delPaciente.manager,
      );

      // Act — la bandeja bloquea la solicitud y después espera la cita
      const acepta = observar(
        bandeja.aceptar(
          solicitudId,
          { inicio: enDias(7).toISOString() },
          profesional,
        ),
      );
      await esperarBloqueo();
      expect(acepta.terminada()).toBe(false);
      await delPaciente.commitTransaction();

      // Assert
      await expect(acepta.promesa).rejects.toBeInstanceOf(
        TransicionEstadoInvalidaError,
      );
      const [solicitud] = await datos.query<
        { estado: string; citaId: string | null }[]
      >(
        `SELECT estado::text AS estado, cita_id::text AS "citaId"
           FROM solicitudes_cita WHERE id = $1`,
        [solicitudId],
      );
      expect(solicitud).toEqual({ estado: 'recibida', citaId: null });
      expect((await leerCita(citaId)).estado).toBe('cancelada');
      expect(await hechosDe(citaId)).toEqual([
        'CitaCreada',
        'ReagendamientoSolicitado',
        'CitaCancelada',
      ]);
      exigirBitacoraCoherente(await bitacoraDe(citaId));
    });
  });

  // ---------------------------------------------------------------------------
  describe('el profesional invalida el enlace mientras el paciente actúa', () => {
    it('el portal espera el bloqueo de la cita, RELEE el enlace (ya revocado) y responde el mismo 404 sin escribir nada', async () => {
      // Arrange
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      // Los pasos de `EnlacesCitaService.invalidar`, en una transacción
      // abierta: cita bloqueada → enlace revocado.
      const invalida = await abrirTx();
      await citaRepo.buscarPorIdParaActualizar(
        citaId,
        profesional.tenantId,
        invalida.manager,
      );
      const activo = await enlaceRepo.buscarActivoPorCita(
        citaId,
        invalida.manager,
      );
      activo!.invalidar(profesional.userId, new Date());
      await enlaceRepo.guardar(activo!, invalida.manager);

      // Act — el paciente confirma (otra conexión): ve el enlace aún activo
      // (no confirmado), se bloquea en la cita…
      const confirma = observar(portal.confirmar(token));
      await esperarBloqueo();
      expect(confirma.terminada()).toBe(false);
      await invalida.commitTransaction();

      // Assert — …y al releer el enlace ya revocado: el MISMO 404
      await expect(confirma.promesa).rejects.toBeInstanceOf(
        EnlaceCitaNoValidoError,
      );
      expect((await leerCita(citaId)).estado).toBe('pendiente');
      expect((await bitacoraDe(citaId)).map((c) => c.tipo)).toEqual(['creada']);
      expect(await hechosDe(citaId)).toEqual(['CitaCreada']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('asegurarActivo a la vez para la misma cita (E1)', () => {
    it('el segundo envío espera al primero en el índice único y termina con el MISMO token; un solo enlace activo y solo su hash en la base', async () => {
      // Arrange — el primer envío emitió la v1 y sigue con su tx abierta
      const citaId = await crearCita();
      const primero = await abrirTx();
      const tokenPrimero = await enlaces.asegurarActivo(
        citaId,
        profesional.tenantId,
        primero.manager,
      );

      // Act — el segundo envío (otra conexión) no ve la v1 sin confirmar,
      // intenta insertarla y queda esperando en el índice único
      const segundo = observar(emitirToken(citaId));
      await esperarBloqueo();
      expect(segundo.terminada()).toBe(false);
      await primero.commitTransaction();

      // Assert
      expect(await segundo.promesa).toBe(tokenPrimero);
      expect(await enlacesDe(citaId)).toEqual([
        { version: 1, activo: true, tokenHash: sha256(tokenPrimero) },
      ]);
      const crudo = JSON.stringify(
        await datos.query('SELECT * FROM enlaces_cita WHERE cita_id = $1', [
          citaId,
        ]),
      );
      expect(crudo).not.toContain(tokenPrimero);
    });

    it('si el primero se revierte, el segundo emite el suyo: sigue habiendo un enlace activo, con el mismo token (misma cita y versión)', async () => {
      // Arrange
      const citaId = await crearCita();
      const primero = await abrirTx();
      const tokenPrimero = await enlaces.asegurarActivo(
        citaId,
        profesional.tenantId,
        primero.manager,
      );

      // Act
      const segundo = observar(emitirToken(citaId));
      await esperarBloqueo();
      await primero.rollbackTransaction();

      // Assert
      expect(await segundo.promesa).toBe(tokenPrimero);
      expect(await enlacesDe(citaId)).toEqual([
        { version: 1, activo: true, tokenHash: sha256(tokenPrimero) },
      ]);
    });

    it('cinco envíos en paralelo sin coordinar → el mismo token y un solo enlace', async () => {
      // Arrange
      const citaId = await crearCita();

      // Act
      const tokens = await Promise.all(
        Array.from({ length: 5 }, () => emitirToken(citaId)),
      );

      // Assert
      expect(new Set(tokens).size).toBe(1);
      expect(await enlacesDe(citaId)).toEqual([
        { version: 1, activo: true, tokenHash: sha256(tokens[0]) },
      ]);
      // Y ese token resuelve en el portal
      await expect(portal.ver(tokens[0])).resolves.toMatchObject({
        estado: 'pendiente',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('FOR NO KEY UPDATE sobre la cita: la emisión del enlace no espera', () => {
    it('con la cita bloqueada y MUTADA por el profesional (tx abierta), el INSERT en enlaces_cita no espera', async () => {
      // Arrange — reagendar: FOR NO KEY UPDATE + UPDATE de la cita
      const citaId = await crearCita();
      const delProfesional = await abrirTx();
      await citas.reagendarEnTx(
        citaId,
        enDias(8),
        profesional,
        delProfesional.manager,
        PedidoPor.PACIENTE,
      );
      const envio = await abrirTx();
      // Si tuviera que esperar el candado, fallaría con 55P03 en vez de colgarse.
      await envio.query(`SET LOCAL lock_timeout = '1s'`);

      // Act — el INSERT toma FOR KEY SHARE sobre la cita (FK)
      const token = await enlaces.asegurarActivo(
        citaId,
        profesional.tenantId,
        envio.manager,
      );
      await envio.commitTransaction();

      // Assert — emitido mientras la mutación sigue abierta
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(delProfesional.isTransactionActive).toBe(true);
      await delProfesional.commitTransaction();
      expect(await enlacesDe(citaId)).toHaveLength(1);
    });

    it('al revés: con el envío a medio camino (enlace insertado, tx abierta mientras llama a Resend), el profesional muta la cita sin esperar', async () => {
      // Arrange
      const citaId = await crearCita();
      const envio = await abrirTx();
      await enlaces.asegurarActivo(citaId, profesional.tenantId, envio.manager);
      const delProfesional = await abrirTx();
      await delProfesional.query(`SET LOCAL lock_timeout = '1s'`);
      const nuevoInicio = enDias(9);

      // Act
      const reagendada = await citas.reagendarEnTx(
        citaId,
        nuevoInicio,
        profesional,
        delProfesional.manager,
        PedidoPor.PACIENTE,
      );
      await delProfesional.commitTransaction();

      // Assert
      expect(reagendada.estado).toBe('pendiente');
      expect(envio.isTransactionActive).toBe(true);
      await envio.commitTransaction();
      expect((await leerCita(citaId)).inicio).toEqual(nuevoInicio);
    });

    it('control: con FOR UPDATE (lo que NO se usa) el mismo INSERT sí quedaría esperando', async () => {
      // Arrange
      const citaId = await crearCita();
      const conForUpdate = await abrirTx();
      await conForUpdate.query(
        'SELECT id FROM citas WHERE id = $1 FOR UPDATE',
        [citaId],
      );
      const envio = await abrirTx();
      await envio.query(`SET LOCAL lock_timeout = '300ms'`);

      // Act & Assert — 55P03 lock_not_available: el FOR KEY SHARE de la FK choca
      expect(
        await codigoDeError(
          enlaces.asegurarActivo(citaId, profesional.tenantId, envio.manager),
        ),
      ).toBe('55P03');
    });
  });

  // ---------------------------------------------------------------------------
  // US-07.01 (H5): el GET anota la primera apertura del enlace. Toma la fila
  // del enlace DESPUÉS de la cita (que `resolver` ya bloqueó), así que
  // respeta "la cita primero, después su enlace" y no se interbloquea.
  describe('primera apertura del enlace (US-07.01)', () => {
    const aperturaDe = async (citaId: string): Promise<Date | null> => {
      const [fila] = await datos.query<{ apertura: Date | null }[]>(
        `SELECT primera_apertura_en AS apertura FROM enlaces_cita
          WHERE cita_id = $1 AND revocado_en IS NULL`,
        [citaId],
      );
      return fila.apertura;
    };

    it('el GET del paciente mientras el profesional reagenda la misma cita: espera el bloqueo, ve la hora NUEVA y anota la apertura; sin interbloqueo', async () => {
      // Arrange — el profesional mueve la cita y no confirma todavía
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      const nuevoInicio = enDias(6);
      const delProfesional = await abrirTx();
      await citas.reagendarEnTx(
        citaId,
        nuevoInicio,
        profesional,
        delProfesional.manager,
        PedidoPor.PROFESIONAL,
      );

      // Act — el paciente abre su página (otra conexión)
      const abre = observar(portal.ver(token));
      await esperarBloqueo();
      expect(abre.terminada()).toBe(false);
      await delProfesional.commitTransaction();

      // Assert
      expect(await abre.promesa).toMatchObject({
        inicio: nuevoInicio.toISOString(),
        estado: 'pendiente',
      });
      expect(await aperturaDe(citaId)).toBeInstanceOf(Date);
      // Abrir no escribió en la bitácora ni publicó nada
      expect((await bitacoraDe(citaId)).map((c) => c.tipo)).toEqual([
        'creada',
        'reagendada',
      ]);
      expect(await hechosDe(citaId)).toEqual(['CitaCreada', 'CitaReagendada']);
    });

    it('al revés: con el GET a medio camino (cita bloqueada y apertura anotada, tx abierta), el reagendamiento espera y termina; la apertura queda', async () => {
      // Arrange — los pasos del GET, en una transacción abierta
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      const abierta = new Date(Math.floor(Date.now() / 1000) * 1000);
      const delPaciente = await abrirTx();
      const resuelto = await enlaces.resolver(token, delPaciente.manager);
      expect(resuelto).not.toBeNull();
      await enlaces.registrarPrimeraApertura(
        resuelto!.enlace,
        abierta,
        delPaciente.manager,
      );

      // Act — el profesional reagenda desde el voucher (otra conexión)
      const nuevoInicio = enDias(7);
      const reagenda = observar(
        citas.reagendar(
          citaId,
          { inicio: nuevoInicio.toISOString() },
          profesional,
        ),
      );
      await esperarBloqueo();
      expect(reagenda.terminada()).toBe(false);
      await delPaciente.commitTransaction();

      // Assert
      await expect(reagenda.promesa).resolves.toMatchObject({
        estado: 'pendiente',
      });
      expect((await leerCita(citaId)).inicio).toEqual(nuevoInicio);
      expect(await aperturaDe(citaId)).toEqual(abierta);
    });

    it('dos GET a la vez: el segundo espera al primero y no cambia su apertura (una sola primera_apertura_en)', async () => {
      // Arrange — el primer GET, a medio camino (tx abierta)
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      const primera = new Date(Math.floor(Date.now() / 1000) * 1000 - 5_000);
      const primerGet = await abrirTx();
      const resuelto = await enlaces.resolver(token, primerGet.manager);
      await enlaces.registrarPrimeraApertura(
        resuelto!.enlace,
        primera,
        primerGet.manager,
      );

      // Act — el segundo GET, por el camino de siempre
      const segundoGet = observar(portal.ver(token));
      await esperarBloqueo();
      expect(segundoGet.terminada()).toBe(false);
      await primerGet.commitTransaction();

      // Assert — la vista sale igual y la apertura es la del primero
      await expect(segundoGet.promesa).resolves.toMatchObject({
        estado: 'pendiente',
      });
      expect(await aperturaDe(citaId)).toEqual(primera);
    });

    it('cinco GET en paralelo sin coordinar → cinco vistas iguales y una sola apertura; ni bitácora ni hechos nuevos', async () => {
      // Arrange
      const citaId = await crearCita();
      const token = await emitirToken(citaId);
      const antesDeAbrir = Date.now();

      // Act
      const vistas = await Promise.all(
        Array.from({ length: 5 }, () => portal.ver(token)),
      );

      // Assert
      expect(new Set(vistas.map((v) => JSON.stringify(v))).size).toBe(1);
      const apertura = await aperturaDe(citaId);
      expect(apertura).toBeInstanceOf(Date);
      expect(apertura!.getTime()).toBeGreaterThanOrEqual(antesDeAbrir - 1_000);
      // Una sola fila de enlace (la apertura no emite otro)
      expect(await enlacesDe(citaId)).toHaveLength(1);
      expect((await bitacoraDe(citaId)).map((c) => c.tipo)).toEqual(['creada']);
      expect(await hechosDe(citaId)).toEqual(['CitaCreada']);
    });
  });

  // ---------------------------------------------------------------------------
  // US-11 (ADR-16 §8, plan «Orden de bloqueo»): el portal toma la cita y, AL
  // FINAL, la fila del paciente (la bandera); la bandeja toma la solicitud, el
  // paciente (correo vacío y la bandera) y crea una cita NUEVA. Nadie bloquea
  // una cita existente después de un paciente: el que llega segundo espera en
  // la fila del paciente y termina, sin interbloqueo (40P01).
  describe('términos del paciente (US-11)', () => {
    const RUT = '123456785';

    interface Escenario {
      pacienteId: string;
      citaId: string;
      token: string;
      solicitudId: string;
    }

    /** Las aceptaciones del paciente, por canal (orden estable). */
    const aceptacionesDe = (pacienteId: string) =>
      datos.query<
        {
          canal: string;
          version: string;
          enlaceId: string | null;
          solicitudId: string | null;
        }[]
      >(
        `SELECT canal, version, enlace_id::text AS "enlaceId",
                solicitud_id::text AS "solicitudId"
           FROM aceptaciones_terminos
          WHERE paciente_id = $1
          ORDER BY canal`,
        [pacienteId],
      );

    const banderaDe = async (pacienteId: string): Promise<boolean> => {
      const [{ consentimiento }] = await datos.query<
        { consentimiento: boolean }[]
      >('SELECT consentimiento FROM pacientes WHERE id = $1', [pacienteId]);
      return consentimiento;
    };

    const enlaceActivoDe = async (citaId: string): Promise<string> =>
      (await enlaceRepo.buscarActivoPorCita(citaId, datos.manager))!.id;

    /**
     * Un paciente de antes de US-11 (sin aceptación, bandera en false; D7),
     * con una cita y su enlace, que además envió el formulario público con
     * la versión 1.0 (la bandeja lo vinculará por RUT).
     */
    const prepararEscenario = async (
      correo: string | null,
    ): Promise<Escenario> => {
      const [{ id: pacienteId }] = await datos.query<{ id: string }[]>(
        `INSERT INTO pacientes (rut, nombre, telefono, correo, consentimiento, tenant_id)
         VALUES ($1, 'Paciente Piloto', '+56 9 3333 3333', $2, false, $3)
         RETURNING id::text AS id`,
        [RUT, correo, profesional.tenantId],
      );
      // Con `pacienteId`: no registra ninguna aceptación.
      const cita = await citas.crearCita(
        {
          inicio: enDias(3).toISOString(),
          duracionMin: 45,
          tipoConsulta: 'Control',
          pacienteId,
        },
        profesional,
      );
      const token = await emitirToken(cita.id);
      const solicitud = await solicitudRepo.guardar(
        SolicitudCita.recibir({
          tenantId: profesional.tenantId,
          rut: RUT,
          nombrePaciente: 'Paciente Piloto',
          telefono: '+56 9 3333 3333',
          correo: 'piloto@correo.cl',
          motivo: 'Otra hora',
          preferenciaHoraria: 'mañanas',
          consentimiento: true,
          terminosVersion: '1.0',
        }),
      );
      expect(await aceptacionesDe(pacienteId)).toEqual([]);
      return { pacienteId, citaId: cita.id, token, solicitudId: solicitud.id };
    };

    const aceptarEnBandeja = (
      e: Escenario,
      bandejaUsada: BandejaSolicitudesService = bandeja,
    ) =>
      bandejaUsada.aceptar(
        e.solicitudId,
        {
          inicio: enDias(5).toISOString(),
          duracionMin: 45,
          tipoConsulta: 'Control',
        },
        profesional,
      );

    /** Lo que tiene que quedar con las dos aceptaciones confirmadas. */
    const exigirAmbasAceptaciones = async (e: Escenario): Promise<void> => {
      expect(await aceptacionesDe(e.pacienteId)).toEqual([
        {
          canal: 'enlace_cita',
          version: '1.0',
          enlaceId: await enlaceActivoDe(e.citaId),
          solicitudId: null,
        },
        {
          canal: 'formulario_publico',
          version: '1.0',
          enlaceId: null,
          solicitudId: e.solicitudId,
        },
      ]);
      expect(await banderaDe(e.pacienteId)).toBe(true);
      const [solicitud] = await datos.query<
        { estado: string; citaId: string | null }[]
      >(
        `SELECT estado::text AS estado, cita_id::text AS "citaId"
           FROM solicitudes_cita WHERE id = $1`,
        [e.solicitudId],
      );
      expect(solicitud.estado).toBe('aceptada');
      // La cita nueva de la bandeja es del MISMO paciente (vinculado por RUT)
      const [{ n }] = await datos.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM citas WHERE paciente_id = $1',
        [e.pacienteId],
      );
      expect(n).toBe(2);
      // La cita del enlace no cambió: aceptar no es una acción sobre ella
      expect((await leerCita(e.citaId)).estado).toBe('pendiente');
      expect((await bitacoraDe(e.citaId)).map((c) => c.tipo)).toEqual([
        'creada',
      ]);
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe.each<[string, string | null]>([
      ['con correo en la ficha', 'piloto@correo.cl'],
      // La bandeja, además, completa el correo: toma el paciente ANTES.
      ['con la ficha sin correo (ADR-13 §14)', null],
    ])('aceptar-terminos contra la bandeja, %s', (_caso, correo) => {
      it('el paciente llega primero: la bandeja espera la fila del paciente y termina; las dos aceptaciones quedan, sin interbloqueo', async () => {
        // Arrange — el portal hizo TODO su camino (cita → aceptación →
        // bandera) y no confirma todavía
        const e = await prepararEscenario(correo);
        const delPaciente = await abrirTx();
        const vista = await portalEn(delPaciente).aceptarTerminos(
          e.token,
          '1.0',
        );
        expect(vista.terminosPendientes).toBe(false);

        // Act — la bandeja acepta la solicitud del mismo paciente (otra
        // conexión)
        const acepta = observar(aceptarEnBandeja(e));
        await esperarBloqueo();
        expect(acepta.terminada()).toBe(false);
        await delPaciente.commitTransaction();

        // Assert
        const { cita } = await acepta.promesa;
        expect(cita.pacienteId).toBe(e.pacienteId);
        expect(cita.paciente?.consentimiento).toBe(true);
        await exigirAmbasAceptaciones(e);
      });

      it('la bandeja llega primero: el portal (con la cita ya bloqueada) espera la fila del paciente y termina; sin interbloqueo', async () => {
        // Arrange — la bandeja hizo TODO su camino (solicitud → paciente →
        // cita nueva → aceptación → bandera) y no confirma todavía
        const e = await prepararEscenario(correo);
        const deLaBandeja = await abrirTx();
        await aceptarEnBandeja(e, bandejaEn(deLaBandeja));

        // Act — el paciente acepta desde su enlace (otra conexión): no ve la
        // aceptación del formulario (sin confirmar) e intenta registrar la suya
        const acepta = observar(portal.aceptarTerminos(e.token, '1.0'));
        await esperarBloqueo();
        expect(acepta.terminada()).toBe(false);
        await deLaBandeja.commitTransaction();

        // Assert — la vista sale ya sin pendientes
        expect((await acepta.promesa).terminosPendientes).toBe(false);
        await exigirAmbasAceptaciones(e);
      });
    });

    it('dos aceptar-terminos a la vez con el MISMO enlace: el segundo espera la cita, ve la aceptación del primero y no escribe → una fila', async () => {
      // Arrange
      const e = await prepararEscenario('piloto@correo.cl');
      const primero = await abrirTx();
      await portalEn(primero).aceptarTerminos(e.token, '1.0');

      // Act
      const segundo = observar(portal.aceptarTerminos(e.token, '1.0'));
      await esperarBloqueo();
      expect(segundo.terminada()).toBe(false);
      await primero.commitTransaction();

      // Assert
      expect((await segundo.promesa).terminosPendientes).toBe(false);
      expect(await aceptacionesDe(e.pacienteId)).toEqual([
        {
          canal: 'enlace_cita',
          version: '1.0',
          enlaceId: await enlaceActivoDe(e.citaId),
          solicitudId: null,
        },
      ]);
      expect(await banderaDe(e.pacienteId)).toBe(true);
    });

    it('cinco aceptar-terminos en paralelo con el mismo enlace → una fila y cinco vistas sin pendientes', async () => {
      // Arrange
      const e = await prepararEscenario('piloto@correo.cl');

      // Act
      const vistas = await Promise.all(
        Array.from({ length: 5 }, () => portal.aceptarTerminos(e.token, '1.0')),
      );

      // Assert
      expect(vistas.every((v) => v.terminosPendientes === false)).toBe(true);
      expect(await aceptacionesDe(e.pacienteId)).toHaveLength(1);
    });

    it('dos enlaces de DOS citas del mismo paciente a la vez: no comparten candado de cita y el índice único deja UNA fila (la del primero)', async () => {
      // Arrange — una segunda cita del mismo paciente, con su enlace
      const e = await prepararEscenario('piloto@correo.cl');
      const otra = await citas.crearCita(
        {
          inicio: enDias(4).toISOString(),
          duracionMin: 45,
          tipoConsulta: 'Control',
          pacienteId: e.pacienteId,
        },
        profesional,
      );
      const otroToken = await emitirToken(otra.id);
      const primero = await abrirTx();
      await portalEn(primero).aceptarTerminos(e.token, '1.0');

      // Act — el segundo bloquea SU cita, no ve la fila sin confirmar e
      // intenta insertar: espera en el índice único
      const segundo = observar(portal.aceptarTerminos(otroToken, '1.0'));
      await esperarBloqueo();
      expect(segundo.terminada()).toBe(false);
      await primero.commitTransaction();

      // Assert — ON CONFLICT DO NOTHING: gana el primer acto
      expect((await segundo.promesa).terminosPendientes).toBe(false);
      const filas = await aceptacionesDe(e.pacienteId);
      expect(filas).toHaveLength(1);
      expect(filas[0].enlaceId).toBe(await enlaceActivoDe(e.citaId));
    });

    it('si el registro de la aceptación falla en la bandeja, se revierte todo: ni cita nueva, ni paciente, ni solicitud aceptada, ni hechos', async () => {
      // Arrange — un RUT que no es paciente: la bandeja lo crearía
      const solicitud = await solicitudRepo.guardar(
        SolicitudCita.recibir({
          tenantId: profesional.tenantId,
          rut: '111111111',
          nombrePaciente: 'Paciente Nuevo',
          telefono: '+56 9 4444 4444',
          correo: 'nuevo@correo.cl',
          motivo: 'Primera vez',
          preferenciaHoraria: 'tardes',
          consentimiento: true,
          terminosVersion: '1.0',
        }),
      );
      jest
        .spyOn(pacientes, 'registrarAceptacion')
        .mockRejectedValueOnce(new Error('falla el registro'));

      // Act & Assert
      await expect(
        bandeja.aceptar(
          solicitud.id,
          {
            inicio: enDias(5).toISOString(),
            duracionMin: 45,
            tipoConsulta: 'Control',
          },
          profesional,
        ),
      ).rejects.toThrow('falla el registro');

      const [{ citasN, pacientesN, aceptacionesN, hechosN }] =
        await datos.query<
          {
            citasN: number;
            pacientesN: number;
            aceptacionesN: number;
            hechosN: number;
          }[]
        >(
          `SELECT (SELECT count(*)::int FROM citas)                 AS "citasN",
                  (SELECT count(*)::int FROM pacientes)             AS "pacientesN",
                  (SELECT count(*)::int FROM aceptaciones_terminos) AS "aceptacionesN",
                  (SELECT count(*)::int FROM eventos_salida)        AS "hechosN"`,
        );
      expect({ citasN, pacientesN, aceptacionesN, hechosN }).toEqual({
        citasN: 0,
        pacientesN: 0,
        aceptacionesN: 0,
        hechosN: 0,
      });
      const [fila] = await datos.query<
        { estado: string; citaId: string | null }[]
      >(
        `SELECT estado::text AS estado, cita_id::text AS "citaId"
           FROM solicitudes_cita WHERE id = $1`,
        [solicitud.id],
      );
      expect(fila).toEqual({ estado: 'recibida', citaId: null });
    });
  });
});
