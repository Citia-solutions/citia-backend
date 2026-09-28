import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { JwtPayload } from '../src/modules/auth/jwt-payload.interface';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { CitasService } from '../src/modules/cita/application/citas.service';
import { Cita, EstadoCita } from '../src/modules/cita/domain/cita.entity';
import { PacientesService } from '../src/modules/paciente/application/pacientes.service';
import { BandejaSolicitudesService } from '../src/modules/solicitud/application/bandeja-solicitudes.service';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../src/modules/solicitud/domain/solicitud-cita.entity';
import { SolicitudesController } from '../src/modules/solicitud/presentation/solicitudes.controller';
import { RolUsuario } from '../src/modules/usuario/domain/usuario.entity';
import {
  ContadorTransacciones,
  InMemoryCambioCitaRepository,
  InMemoryCitaRepository,
  InMemoryPacienteRepository,
  InMemorySolicitudCitaRepository,
  PublicadorEnMemoria,
} from './support/in-memory-repositories';

/**
 * E2E de la bandeja de solicitudes (cierre de Fase 1 §c) SIN base de datos.
 *
 * Pila HTTP real: prefijo `api`, ValidationPipe global (whitelist +
 * transform), JwtAuthGuard + JwtStrategy reales, ParseUUIDPipe,
 * SolicitudesController, BandejaSolicitudesService, CitasService y
 * PacientesService reales. Solo la persistencia es en memoria (contrato del
 * puerto, con copias). Lo que NO cubre (pendiente contra Postgres, DT-20): el
 * `SELECT ... FOR UPDATE` real bajo concurrencia, la migración `resuelta_en`
 * y el adaptador TypeORM.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';

const TZ = 'America/Santiago';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USUARIO_A = 'usuario-a';
const COLEGA_A = 'usuario-a2';
const USUARIO_B = 'usuario-b';

const SOL_A = '5f0c0000-0000-4000-8000-00000000000a';
const SOL_A_VIEJA = '5f0c0000-0000-4000-8000-0000000000a0';
const SOL_A_RUT_CONOCIDO = '5f0c0000-0000-4000-8000-0000000000ac';
const SOL_A_ACEPTADA = '5f0c0000-0000-4000-8000-0000000000aa';
const SOL_A_RECHAZADA = '5f0c0000-0000-4000-8000-0000000000ab';
const SOL_B = '5f0c0000-0000-4000-8000-00000000000b';
const INEXISTENTE = '5f0c0000-0000-4000-8000-000000000fff';

const PACIENTE_CONOCIDO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CITA_EXISTENTE = '11111111-1111-4111-8111-111111111111';

const RECIBIDA_EN = '2026-09-17T14:02:11.000Z';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// Matcher asimétrico tipado como `unknown` (expect.stringMatching es `any`).
const UN_INSTANTE_ISO: unknown = expect.stringMatching(ISO);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Hora que elige el profesional: 18-sep 10:00 en Santiago = 13:00Z.
const CUERPO_ACEPTAR = {
  inicio: '2026-09-18T10:00:00-03:00',
  duracionMin: 50,
  tipoConsulta: 'Dolor de muela desde el lunes',
};

// --- Formas de respuesta -----------------------------------------------------

interface SolicitudBody {
  id: string;
  estado: string;
  rut: string;
  nombrePaciente: string;
  telefono: string;
  correo: string;
  motivo: string;
  preferenciaHoraria: string;
  consentimiento: boolean;
  recibidaEn: string;
  resueltaEn: string | null;
  citaId: string | null;
}

interface CitaBody {
  id: string;
  inicio: string;
  duracionMin: number;
  tipoConsulta: string;
  estado: string;
  pacienteId: string;
  paciente: Record<string, unknown>;
  avisos: { solapamientos: { id: string; pacienteNombre: string }[] };
}

interface AceptadaBody {
  solicitud: SolicitudBody;
  cita: CitaBody;
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

describe('Bandeja de solicitudes /api/solicitudes (e2e sin BD)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const solicitudRepo = new InMemorySolicitudCitaRepository();
  const citaRepo = new InMemoryCitaRepository(TZ);
  const cambioRepo = new InMemoryCambioCitaRepository();
  const pacienteRepo = new InMemoryPacienteRepository();
  const tx = new ContadorTransacciones();
  const eventos = new PublicadorEnMemoria();

  let tokenA: string;
  let tokenColegaA: string;
  let tokenB: string;

  const server = (): App => app.getHttpServer() as App;

  const firmar = (sub: string, tenantId: string): Promise<string> =>
    jwt.signAsync({
      sub,
      email: `${sub}@demo.com`,
      tenantId,
      rol: RolUsuario.PROFESIONAL,
    } satisfies JwtPayload);

  const solicitud = (
    id: string,
    tenantId: string,
    props: Partial<{
      rut: string;
      estado: EstadoSolicitud;
      recibidaEn: string;
      resueltaEn: string | null;
      consentimiento: boolean;
    }> = {},
  ): SolicitudCita =>
    SolicitudCita.reconstituir({
      id,
      tenantId,
      usuarioId:
        (props.estado ?? EstadoSolicitud.RECIBIDA) === EstadoSolicitud.RECIBIDA
          ? null
          : USUARIO_A,
      rut: props.rut ?? '111111111',
      nombrePaciente: 'Paciente Público',
      telefono: '+56 9 5555 5555',
      correo: 'publico@mail.com',
      motivo: 'Dolor de muela desde el lunes',
      preferenciaHoraria: 'viernes, 18 de septiembre a las 10:00',
      consentimiento: props.consentimiento ?? true,
      estado: props.estado ?? EstadoSolicitud.RECIBIDA,
      citaId: props.estado === EstadoSolicitud.ACEPTADA ? CITA_EXISTENTE : null,
      recibidaEn: new Date(props.recibidaEn ?? RECIBIDA_EN),
      resueltaEn: props.resueltaEn ? new Date(props.resueltaEn) : null,
    });

  const sembrar = (): void => {
    solicitudRepo.solicitudes.clear();
    solicitudRepo.cargasConBloqueo.length = 0;
    citaRepo.citas.clear();
    cambioRepo.cambios.length = 0;
    pacienteRepo.pacientes.clear();
    eventos.eventos.length = 0;
    tx.abiertas = 0;

    solicitudRepo.sembrar(solicitud(SOL_A, TENANT_A));
    // Más antigua que la ventana anti-spam: la bandeja NO la oculta.
    solicitudRepo.sembrar(
      solicitud(SOL_A_VIEJA, TENANT_A, {
        rut: '222222222',
        recibidaEn: '2026-01-02T10:00:00.000Z',
      }),
    );
    solicitudRepo.sembrar(
      solicitud(SOL_A_RUT_CONOCIDO, TENANT_A, {
        rut: '123456785',
        recibidaEn: '2026-09-18T09:00:00.000Z',
        consentimiento: false,
      }),
    );
    solicitudRepo.sembrar(
      solicitud(SOL_A_ACEPTADA, TENANT_A, {
        estado: EstadoSolicitud.ACEPTADA,
        resueltaEn: '2026-09-19T10:00:00.000Z',
      }),
    );
    solicitudRepo.sembrar(
      solicitud(SOL_A_RECHAZADA, TENANT_A, {
        estado: EstadoSolicitud.RECHAZADA,
        resueltaEn: '2026-09-20T10:00:00.000Z',
      }),
    );
    solicitudRepo.sembrar(solicitud(SOL_B, TENANT_B));

    // Paciente ya conocido en A (RUT 12.345.678-5).
    pacienteRepo.pacientes.set(PACIENTE_CONOCIDO, {
      id: PACIENTE_CONOCIDO,
      rut: '123456785',
      nombre: 'Ana Pérez (ficha)',
      telefono: '+56 9 1111 1111',
      correo: 'ana@mail.com',
      consentimiento: true,
      tenantId: TENANT_A,
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule,
        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.getOrThrow<string>('JWT_SECRET'),
          }),
        }),
      ],
      controllers: [SolicitudesController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        {
          provide: CitasService,
          useFactory: () =>
            new CitasService(
              citaRepo,
              cambioRepo,
              pacienteRepo,
              new PacientesService(pacienteRepo),
              tx,
              eventos,
              TZ,
            ),
        },
        {
          provide: BandejaSolicitudesService,
          inject: [CitasService],
          useFactory: (citas: CitasService) =>
            new BandejaSolicitudesService(solicitudRepo, citas, tx, eventos),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Igual que src/main.ts.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwt = moduleFixture.get(JwtService);
    tokenA = await firmar(USUARIO_A, TENANT_A);
    tokenColegaA = await firmar(COLEGA_A, TENANT_A);
    tokenB = await firmar(USUARIO_B, TENANT_B);
  });

  beforeEach(() => {
    sembrar();
  });

  afterAll(async () => {
    await app.close();
  });

  const aceptar = (
    id: string,
    token: string,
    cuerpo: object = CUERPO_ACEPTAR,
  ) =>
    request(server())
      .post(`/api/solicitudes/${id}/aceptar`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);

  const rechazar = (id: string, token: string) =>
    request(server())
      .post(`/api/solicitudes/${id}/rechazar`)
      .set('Authorization', `Bearer ${token}`);

  const estadoPersistido = (id: string): EstadoSolicitud | undefined =>
    solicitudRepo.solicitudes.get(id)?.estado;

  // ---------------------------------------------------------------------
  describe('autenticación (JwtAuthGuard real)', () => {
    it.each([
      ['GET', '/api/solicitudes'],
      ['POST', `/api/solicitudes/${SOL_A}/aceptar`],
      ['POST', `/api/solicitudes/${SOL_A}/rechazar`],
      // El guard corre antes que ParseUUIDPipe: sin token no se valida el id.
      ['POST', '/api/solicitudes/no-es-uuid/aceptar'],
    ])('debería responder 401 sin token en %s %s', async (metodo, ruta) => {
      // Act
      const req =
        metodo === 'GET'
          ? request(server()).get(ruta)
          : request(server()).post(ruta).send(CUERPO_ACEPTAR);

      // Assert
      await req.expect(401);
      expect(estadoPersistido(SOL_A)).toBe(EstadoSolicitud.RECIBIDA);
      expect(citaRepo.citas.size).toBe(0);
    });

    it('debería responder 401 con un token firmado con otro secreto', async () => {
      // Arrange
      const falso = await jwt.signAsync(
        { sub: USUARIO_A, tenantId: TENANT_A },
        { secret: 'otro-secreto' },
      );

      // Act & Assert
      await aceptar(SOL_A, falso).expect(401);
    });
  });

  // ---------------------------------------------------------------------
  describe('validación (400)', () => {
    it.each(['aceptar', 'rechazar'])(
      'debería responder 400 cuando el id no es UUID (%s)',
      async (accion) => {
        // Act
        const res = await request(server())
          .post(`/api/solicitudes/no-es-uuid/${accion}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(CUERPO_ACEPTAR)
          .expect(400);

        // Assert
        expect((res.body as ErrorBody).statusCode).toBe(400);
      },
    );

    it('debería responder 400 con message como arreglo cuando el cuerpo está vacío', async () => {
      // Act
      const res = await aceptar(SOL_A, tokenA, {}).expect(400);

      // Assert
      const body = res.body as ErrorBody;
      expect(body.error).toBe('Bad Request');
      expect(Array.isArray(body.message)).toBe(true);
      const mensajes = (body.message as string[]).join(' | ');
      expect(mensajes).toMatch(/inicio/);
      expect(mensajes).toMatch(/duracionMin/);
      expect(mensajes).toMatch(/tipoConsulta/);
    });

    it('debería responder 400 cuando inicio no trae zona horaria explícita', async () => {
      // Act
      const res = await aceptar(SOL_A, tokenA, {
        ...CUERPO_ACEPTAR,
        inicio: '2026-09-18T10:00:00',
      }).expect(400);

      // Assert
      expect((res.body as ErrorBody).message).toEqual([
        'inicio debe incluir la zona horaria explícita (Z o ±HH:MM), p. ej. 2026-09-18T10:00:00-03:00',
      ]);
    });

    it('debería responder 400 cuando duracionMin supera 1440', async () => {
      // Act
      const res = await aceptar(SOL_A, tokenA, {
        ...CUERPO_ACEPTAR,
        duracionMin: 1441,
      }).expect(400);

      // Assert
      expect((res.body as ErrorBody).message).toEqual([
        'duracionMin must not be greater than 1440',
      ]);
    });

    it('no debería tocar nada cuando el cuerpo es inválido', async () => {
      // Act
      await aceptar(SOL_A, tokenA, { ...CUERPO_ACEPTAR, tipoConsulta: '' });

      // Assert
      expect(estadoPersistido(SOL_A)).toBe(EstadoSolicitud.RECIBIDA);
      expect(citaRepo.citas.size).toBe(0);
      expect(eventos.eventos).toEqual([]);
      expect(tx.abiertas).toBe(0);
    });

    it('debería responder 400 cuando el estado de la bandeja no es válido', async () => {
      await request(server())
        .get('/api/solicitudes?estado=pendiente')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/solicitudes', () => {
    it('debería listar por defecto las recibidas del tenant del token, la que más espera primero', async () => {
      // Act
      const res = await request(server())
        .get('/api/solicitudes')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert — incluye la vieja (la ventana anti-spam no oculta la bandeja)
      const body = res.body as SolicitudBody[];
      expect(body.map((s) => s.id)).toEqual([
        SOL_A_VIEJA,
        SOL_A,
        SOL_A_RUT_CONOCIDO,
      ]);
      expect(body.every((s) => s.estado === 'recibida')).toBe(true);
      expect(res.text).not.toContain(SOL_B);
    });

    it('debería devolver la forma de SolicitudBandejaDto, sin tenantId/usuarioId y con RUT formateado', async () => {
      // Act
      const res = await request(server())
        .get('/api/solicitudes')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      const item = (res.body as SolicitudBody[]).find((s) => s.id === SOL_A);
      expect(item).toEqual({
        id: SOL_A,
        estado: 'recibida',
        rut: '11.111.111-1',
        nombrePaciente: 'Paciente Público',
        telefono: '+56 9 5555 5555',
        correo: 'publico@mail.com',
        motivo: 'Dolor de muela desde el lunes',
        preferenciaHoraria: 'viernes, 18 de septiembre a las 10:00',
        consentimiento: true,
        recibidaEn: RECIBIDA_EN,
        resueltaEn: null,
        citaId: null,
      });
      expect(res.text).not.toMatch(/tenantId|usuarioId/);
      expect(res.text).not.toContain('"111111111"');
    });

    it('debería listar las resueltas con estado=aceptada', async () => {
      // Act
      const res = await request(server())
        .get('/api/solicitudes?estado=aceptada')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      expect((res.body as SolicitudBody[]).map((s) => s.id)).toEqual([
        SOL_A_ACEPTADA,
      ]);
    });
  });

  // ---------------------------------------------------------------------
  describe('POST /api/solicitudes/:id/aceptar', () => {
    it('debería responder 201 con la forma exacta del contrato { solicitud, cita }', async () => {
      // Act
      const res = await aceptar(SOL_A, tokenA).expect(201);

      // Assert
      const body = res.body as AceptadaBody;
      expect(Object.keys(body).sort()).toEqual(['cita', 'solicitud']);

      const cita = body.cita;
      expect(cita.id).toMatch(UUID);
      expect(cita.pacienteId).toMatch(UUID);
      expect(Object.keys(cita).sort()).toEqual(
        [
          'avisos',
          'duracionMin',
          'estado',
          'id',
          'inicio',
          'paciente',
          'pacienteId',
          'tipoConsulta',
        ].sort(),
      );
      expect(cita).toEqual({
        id: cita.id,
        inicio: '2026-09-18T13:00:00.000Z',
        duracionMin: 50,
        tipoConsulta: 'Dolor de muela desde el lunes',
        estado: 'pendiente',
        pacienteId: cita.pacienteId,
        paciente: {
          id: cita.pacienteId,
          rut: '11.111.111-1',
          nombre: 'Paciente Público',
          telefono: '+56 9 5555 5555',
          correo: 'publico@mail.com',
          consentimiento: true,
          tenantId: TENANT_A,
        },
        avisos: { solapamientos: [] },
      });

      const sol = body.solicitud;
      expect(Object.keys(sol).sort()).toEqual(
        [
          'citaId',
          'consentimiento',
          'correo',
          'estado',
          'id',
          'motivo',
          'nombrePaciente',
          'preferenciaHoraria',
          'recibidaEn',
          'resueltaEn',
          'rut',
          'telefono',
        ].sort(),
      );
      expect(sol).toEqual({
        id: SOL_A,
        estado: 'aceptada',
        rut: '11.111.111-1',
        nombrePaciente: 'Paciente Público',
        telefono: '+56 9 5555 5555',
        correo: 'publico@mail.com',
        motivo: 'Dolor de muela desde el lunes',
        preferenciaHoraria: 'viernes, 18 de septiembre a las 10:00',
        consentimiento: true,
        recibidaEn: RECIBIDA_EN,
        resueltaEn: UN_INSTANTE_ISO,
        citaId: cita.id,
      });
    });

    it('debería persistir la solicitud aceptada con el profesional del token como dueño de solicitud y cita', async () => {
      // Act — acepta un colega del mismo tenant (la bandeja es de la organización)
      const res = await aceptar(SOL_A, tokenColegaA).expect(201);

      // Assert
      const body = res.body as AceptadaBody;
      const persistida = solicitudRepo.solicitudes.get(SOL_A);
      expect(persistida?.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(persistida?.usuarioId).toBe(COLEGA_A);
      expect(persistida?.citaId).toBe(body.cita.id);
      expect(persistida?.resueltaEn).toBeInstanceOf(Date);

      const cita = citaRepo.citas.get(body.cita.id);
      expect(cita?.tenantId).toBe(TENANT_A);
      expect(cita?.usuarioId).toBe(COLEGA_A);
      expect(cita?.estado).toBe(EstadoCita.PENDIENTE);
    });

    it('debería hacerlo todo en UNA transacción, cargando con bloqueo', async () => {
      // Act
      await aceptar(SOL_A, tokenA).expect(201);

      // Assert
      expect(tx.abiertas).toBe(1);
      expect(solicitudRepo.cargasConBloqueo).toHaveLength(1);
      // Bitácora de la cita: "creada" por el profesional
      expect(cambioRepo.cambios.map((c) => c.tipo)).toEqual(['creada']);
    });

    it('debería vincular al paciente existente por RUT sin crear otro ni tocar su ficha', async () => {
      // Act
      const res = await aceptar(SOL_A_RUT_CONOCIDO, tokenA).expect(201);

      // Assert
      const body = res.body as AceptadaBody;
      expect(body.cita.pacienteId).toBe(PACIENTE_CONOCIDO);
      expect(body.cita.paciente.nombre).toBe('Ana Pérez (ficha)');
      expect(pacienteRepo.pacientes.size).toBe(1);
    });

    it('debería crear el paciente con el consentimiento que marcó el paciente', async () => {
      // Arrange — solicitud sin consentimiento y con RUT no conocido
      solicitudRepo.sembrar(
        solicitud(SOL_A, TENANT_A, { rut: '111111111', consentimiento: false }),
      );

      // Act
      const res = await aceptar(SOL_A, tokenA).expect(201);

      // Assert
      const body = res.body as AceptadaBody;
      expect(body.cita.paciente.consentimiento).toBe(false);
      expect(
        pacienteRepo.pacientes.get(body.cita.pacienteId)?.consentimiento,
      ).toBe(false);
    });

    it('debería informar solapamientos en cita.avisos sin bloquear (sigue 201)', async () => {
      // Arrange — el profesional ya tiene una cita confirmada a esa hora
      citaRepo.sembrar(
        Cita.reconstituir({
          id: CITA_EXISTENTE,
          inicio: new Date('2026-09-18T13:30:00.000Z'),
          duracionMin: 50,
          tipoConsulta: 'Control',
          estado: EstadoCita.CONFIRMADA,
          tenantId: TENANT_A,
          pacienteId: PACIENTE_CONOCIDO,
          usuarioId: USUARIO_A,
          creadoEn: new Date('2026-09-01T00:00:00Z'),
          actualizadoEn: new Date('2026-09-01T00:00:00Z'),
        }),
      );

      // Act
      const res = await aceptar(SOL_A, tokenA).expect(201);

      // Assert
      const avisos = (res.body as AceptadaBody).cita.avisos;
      expect(avisos.solapamientos).toEqual([
        {
          id: CITA_EXISTENTE,
          pacienteNombre: 'Ana Pérez (ficha)',
          fecha: '2026-09-18',
          hora: '10:30',
          inicio: '2026-09-18T13:30:00.000Z',
          duracionMin: 50,
          tipoConsulta: 'Control',
          estado: 'confirmada',
        },
      ]);
    });

    it('debería publicar CitaCreada y SolicitudCitaAceptada sin RUT ni nombre en el payload', async () => {
      // Act
      const res = await aceptar(SOL_A, tokenA).expect(201);

      // Assert
      const citaId = (res.body as AceptadaBody).cita.id;
      expect(eventos.eventos.map((e) => e.nombre)).toEqual([
        'CitaCreada',
        'SolicitudCitaAceptada',
      ]);
      expect(eventos.eventos[1].payload).toEqual({
        solicitudId: SOL_A,
        citaId,
        usuarioId: USUARIO_A,
      });
      const json = JSON.stringify(eventos.eventos);
      expect(json).not.toContain('111111111');
      expect(json).not.toContain('11.111.111-1');
      expect(json).not.toContain('Paciente Público');
    });

    it('debería ignorar tenantId/usuarioId en el cuerpo (whitelist): mandan los del token', async () => {
      // Act
      const res = await aceptar(SOL_A, tokenA, {
        ...CUERPO_ACEPTAR,
        tenantId: TENANT_B,
        usuarioId: USUARIO_B,
      }).expect(201);

      // Assert
      const cita = citaRepo.citas.get((res.body as AceptadaBody).cita.id);
      expect(cita?.tenantId).toBe(TENANT_A);
      expect(cita?.usuarioId).toBe(USUARIO_A);
    });

    it('debería responder 409 al aceptar dos veces SIN crear una segunda cita ni paciente', async () => {
      // Arrange
      await aceptar(SOL_A, tokenA).expect(201);
      const eventosAntes = eventos.eventos.length;

      // Act — un segundo profesional llega tarde
      const res = await aceptar(SOL_A, tokenColegaA).expect(409);

      // Assert
      expect(res.body).toEqual({
        statusCode: 409,
        message:
          'Transición inválida: no se puede aplicar "aceptar" a una solicitud "aceptada"',
        error: 'Conflict',
      });
      expect(citaRepo.citas.size).toBe(1);
      expect(pacienteRepo.pacientes.size).toBe(2); // el conocido + el creado
      expect(eventos.eventos).toHaveLength(eventosAntes);
      // Sigue siendo del primero
      expect(solicitudRepo.solicitudes.get(SOL_A)?.usuarioId).toBe(USUARIO_A);
    });

    it('debería responder 409 al aceptar una solicitud ya rechazada', async () => {
      // Act
      const res = await aceptar(SOL_A_RECHAZADA, tokenA).expect(409);

      // Assert
      expect((res.body as ErrorBody).message).toBe(
        'Transición inválida: no se puede aplicar "aceptar" a una solicitud "rechazada"',
      );
      expect(citaRepo.citas.size).toBe(0);
    });

    it('debería responder 404 con cuerpo idéntico para otro tenant y para una inexistente', async () => {
      // Arrange — la solicitud existe de verdad para su dueño
      const deB = await request(server())
        .get('/api/solicitudes')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect((deB.body as SolicitudBody[]).map((s) => s.id)).toEqual([SOL_B]);

      // Act 1 — A intenta aceptar la de B
      const otroTenant = await aceptar(SOL_B, tokenA).expect(404);

      // Act 2 — misma URL cuando ya no existe en ningún tenant
      solicitudRepo.solicitudes.delete(SOL_B);
      const inexistente = await aceptar(SOL_B, tokenA).expect(404);

      // Assert
      expect(otroTenant.body).toEqual({
        statusCode: 404,
        message: `Solicitud "${SOL_B}" no encontrada`,
        error: 'Not Found',
      });
      expect(otroTenant.text).toBe(inexistente.text);
      expect(otroTenant.text).not.toContain(TENANT_B);
      expect(citaRepo.citas.size).toBe(0);
    });

    it('debería responder 404 para un UUID que no existe', async () => {
      await aceptar(INEXISTENTE, tokenA).expect(404);
    });
  });

  // ---------------------------------------------------------------------
  describe('POST /api/solicitudes/:id/rechazar', () => {
    it('debería responder 200 con SolicitudBandejaDto rechazada, sin crear cita ni paciente', async () => {
      // Act
      const res = await rechazar(SOL_A, tokenA).expect(200);

      // Assert
      expect(res.body).toEqual({
        id: SOL_A,
        estado: 'rechazada',
        rut: '11.111.111-1',
        nombrePaciente: 'Paciente Público',
        telefono: '+56 9 5555 5555',
        correo: 'publico@mail.com',
        motivo: 'Dolor de muela desde el lunes',
        preferenciaHoraria: 'viernes, 18 de septiembre a las 10:00',
        consentimiento: true,
        recibidaEn: RECIBIDA_EN,
        resueltaEn: UN_INSTANTE_ISO,
        citaId: null,
      });
      expect(citaRepo.citas.size).toBe(0);
      expect(pacienteRepo.pacientes.size).toBe(1);
      const persistida = solicitudRepo.solicitudes.get(SOL_A);
      expect(persistida?.estado).toBe(EstadoSolicitud.RECHAZADA);
      expect(persistida?.usuarioId).toBe(USUARIO_A);
      expect(tx.abiertas).toBe(1);
      expect(solicitudRepo.cargasConBloqueo).toHaveLength(1);
    });

    it('debería descartar un cuerpo si llega (no se guarda motivo)', async () => {
      // Act
      await request(server())
        .post(`/api/solicitudes/${SOL_A}/rechazar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ motivo: 'no atiendo esto' })
        .expect(200);

      // Assert
      expect(
        JSON.stringify(solicitudRepo.solicitudes.get(SOL_A)),
      ).not.toContain('no atiendo esto');
    });

    it('debería publicar SolicitudCitaRechazada con solo ids', async () => {
      // Act
      await rechazar(SOL_A, tokenA).expect(200);

      // Assert
      expect(eventos.eventos).toHaveLength(1);
      expect(eventos.eventos[0].nombre).toBe('SolicitudCitaRechazada');
      expect(eventos.eventos[0].payload).toEqual({
        solicitudId: SOL_A,
        usuarioId: USUARIO_A,
      });
    });

    it('debería responder 409 al rechazar dos veces', async () => {
      // Arrange
      await rechazar(SOL_A, tokenA).expect(200);

      // Act
      const res = await rechazar(SOL_A, tokenA).expect(409);

      // Assert
      expect((res.body as ErrorBody).message).toBe(
        'Transición inválida: no se puede aplicar "rechazar" a una solicitud "rechazada"',
      );
      expect(eventos.eventos).toHaveLength(1);
    });

    it('debería responder 409 al rechazar una solicitud ya aceptada (no deja una cita huérfana)', async () => {
      // Arrange
      const aceptada = await aceptar(SOL_A, tokenA).expect(201);

      // Act
      await rechazar(SOL_A, tokenColegaA).expect(409);

      // Assert
      const persistida = solicitudRepo.solicitudes.get(SOL_A);
      expect(persistida?.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(persistida?.citaId).toBe((aceptada.body as AceptadaBody).cita.id);
    });

    it('debería responder 404 para una solicitud de otro tenant', async () => {
      // Act
      await rechazar(SOL_B, tokenA).expect(404);

      // Assert
      expect(estadoPersistido(SOL_B)).toBe(EstadoSolicitud.RECIBIDA);
    });
  });
});
