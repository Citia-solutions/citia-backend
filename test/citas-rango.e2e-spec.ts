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
import { CitasController } from '../src/modules/cita/presentation/citas.controller';
import { PacientesService } from '../src/modules/paciente/application/pacientes.service';
import { RolUsuario } from '../src/modules/usuario/domain/usuario.entity';
import {
  ContadorTransacciones,
  InMemoryCambioCitaRepository,
  InMemoryCitaRepository,
  InMemoryPacienteRepository,
  PublicadorEnMemoria,
} from './support/in-memory-repositories';

/**
 * E2E de la agenda por rango (`GET /api/citas?desde&hasta`) y de los avisos de
 * solapamiento (ADR-11) SIN base de datos.
 *
 * Pila HTTP real (prefijo, ValidationPipe global, JwtAuthGuard + JwtStrategy,
 * CitasController, CitasService, PacientesService). Solo la persistencia es en
 * memoria. Lo que NO cubre (pendiente contra Postgres, DT-20): el `IN (...)`,
 * el orden `inicio, creado_en` en SQL y el índice.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';

const TZ = 'America/Santiago';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USUARIO_A = 'usuario-a';
const COLEGA_A = 'usuario-a2';
const USUARIO_B = 'usuario-b';

const PACIENTE_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PACIENTE_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const PACIENTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Semana lun 21 .. dom 27-sep-2026. Santiago ya está en UTC-3.
const C1 = '11111111-0000-4000-8000-000000000001'; // 22-sep 10:00-10:50 confirmada
const C2 = '11111111-0000-4000-8000-000000000002'; // 22-sep 10:00-10:30 pendiente (creada después)
const C3 = '11111111-0000-4000-8000-000000000003'; // 22-sep 10:50-11:40 pendiente (pegada a C1)
const C4 = '11111111-0000-4000-8000-000000000004'; // 23-sep 09:00 cancelada
const BORDE_ANTES = '11111111-0000-4000-8000-0000000000b0'; // dom 20-sep 23:59
const BORDE_ULTIMO = '11111111-0000-4000-8000-0000000000b1'; // dom 27-sep 23:59
const BORDE_DESPUES = '11111111-0000-4000-8000-0000000000b2'; // lun 28-sep 00:00
const DEL_COLEGA = '11111111-0000-4000-8000-0000000000c0'; // 22-sep 10:00 de otro profesional
const DE_B = '11111111-0000-4000-8000-0000000000d0'; // 22-sep 10:00 de otro tenant

interface DashboardItem {
  id: string;
  pacienteNombre: string;
  fecha: string;
  hora: string;
  inicio: string;
  duracionMin: number;
  tipoConsulta: string;
  estado: string;
}

interface CitaBody {
  id: string;
  estado: string;
  avisos?: { solapamientos: DashboardItem[] };
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

describe('Agenda por rango y avisos de solapamiento (e2e sin BD)', () => {
  let app: INestApplication;
  let jwt: JwtService;

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

  const cita = (
    id: string,
    inicio: string,
    props: Partial<{
      duracionMin: number;
      estado: EstadoCita;
      tenantId: string;
      usuarioId: string;
      pacienteId: string;
      creadoEn: string;
    }> = {},
  ): Cita =>
    Cita.reconstituir({
      id,
      inicio: new Date(inicio),
      duracionMin: props.duracionMin ?? 50,
      tipoConsulta: 'Control',
      estado: props.estado ?? EstadoCita.PENDIENTE,
      tenantId: props.tenantId ?? TENANT_A,
      pacienteId: props.pacienteId ?? PACIENTE_A1,
      usuarioId: props.usuarioId ?? USUARIO_A,
      creadoEn: new Date(props.creadoEn ?? '2026-09-01T00:00:00Z'),
      actualizadoEn: new Date('2026-09-01T00:00:00Z'),
    });

  const sembrar = (): void => {
    citaRepo.citas.clear();
    cambioRepo.cambios.length = 0;
    pacienteRepo.pacientes.clear();
    eventos.eventos.length = 0;

    for (const [id, nombre, tenantId] of [
      [PACIENTE_A1, 'María González', TENANT_A],
      [PACIENTE_A2, 'Beto Soto', TENANT_A],
      [PACIENTE_B, 'Paciente de B', TENANT_B],
    ]) {
      pacienteRepo.pacientes.set(id, {
        id,
        rut: null,
        nombre,
        telefono: '+56 9 7777 7777',
        correo: 'contacto@mail.com',
        consentimiento: true,
        tenantId,
      });
    }

    citaRepo.sembrar(
      cita(C1, '2026-09-22T13:00:00Z', {
        estado: EstadoCita.CONFIRMADA,
        creadoEn: '2026-09-01T10:00:00Z',
      }),
    );
    citaRepo.sembrar(
      cita(C2, '2026-09-22T13:00:00Z', {
        duracionMin: 30,
        pacienteId: PACIENTE_A2,
        creadoEn: '2026-09-02T10:00:00Z',
      }),
    );
    citaRepo.sembrar(cita(C3, '2026-09-22T13:50:00Z'));
    citaRepo.sembrar(
      cita(C4, '2026-09-23T12:00:00Z', { estado: EstadoCita.CANCELADA }),
    );
    citaRepo.sembrar(cita(BORDE_ANTES, '2026-09-21T02:59:00Z'));
    citaRepo.sembrar(cita(BORDE_ULTIMO, '2026-09-28T02:59:00Z'));
    citaRepo.sembrar(cita(BORDE_DESPUES, '2026-09-28T03:00:00Z'));
    citaRepo.sembrar(
      cita(DEL_COLEGA, '2026-09-22T13:00:00Z', { usuarioId: COLEGA_A }),
    );
    citaRepo.sembrar(
      cita(DE_B, '2026-09-22T13:00:00Z', {
        tenantId: TENANT_B,
        usuarioId: USUARIO_B,
        pacienteId: PACIENTE_B,
      }),
    );
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
      controllers: [CitasController],
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

  const agenda = (query: string, token = tokenA) =>
    request(server())
      .get(`/api/citas${query}`)
      .set('Authorization', `Bearer ${token}`);

  // ---------------------------------------------------------------------
  describe('GET /api/citas?desde&hasta — errores', () => {
    it('debería responder 401 sin token', async () => {
      await request(server())
        .get('/api/citas?desde=2026-09-21&hasta=2026-09-27')
        .expect(401);
    });

    it.each([
      ['sin parámetros', ''],
      ['sin hasta', '?desde=2026-09-21'],
      ['sin desde', '?hasta=2026-09-27'],
      ['formato inválido', '?desde=2026-9-21&hasta=2026-09-27'],
      ['fecha inexistente', '?desde=2026-02-01&hasta=2026-02-30'],
      [
        'instante en vez de fecha',
        '?desde=2026-09-21T00:00:00Z&hasta=2026-09-27',
      ],
    ])(
      'debería responder 400 de validación (%s) con message como arreglo',
      async (_caso, query) => {
        // Act
        const res = await agenda(query).expect(400);

        // Assert
        const body = res.body as ErrorBody;
        expect(body.statusCode).toBe(400);
        expect(Array.isArray(body.message)).toBe(true);
      },
    );

    it('debería responder 400 cuando hasta es anterior a desde', async () => {
      // Act
      const res = await agenda('?desde=2026-09-27&hasta=2026-09-21').expect(
        400,
      );

      // Assert
      expect(res.body).toEqual({
        statusCode: 400,
        message: 'El parámetro "hasta" debe ser igual o posterior a "desde"',
        error: 'Bad Request',
      });
    });

    it('debería responder 400 con más de 42 días', async () => {
      // Act — 1-sep..13-oct = 43 días
      const res = await agenda('?desde=2026-09-01&hasta=2026-10-13').expect(
        400,
      );

      // Assert
      expect((res.body as ErrorBody).message).toBe(
        'El rango máximo es de 42 días',
      );
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /api/citas?desde&hasta — 200', () => {
    it('debería devolver las citas de la semana del profesional del token, todos los estados, en orden', async () => {
      // Act
      const res = await agenda('?desde=2026-09-21&hasta=2026-09-27').expect(
        200,
      );

      // Assert — C1 y C2 empiezan igual: desempata creadoEn ASC
      const items = res.body as DashboardItem[];
      expect(items.map((c) => c.id)).toEqual([C1, C2, C3, C4, BORDE_ULTIMO]);
      expect(items.find((c) => c.id === C4)?.estado).toBe('cancelada');
    });

    it('debería respetar los bordes del rango en la zona de la clínica', async () => {
      // Act
      const res = await agenda('?desde=2026-09-21&hasta=2026-09-27').expect(
        200,
      );

      // Assert — 20-sep 23:59 y 28-sep 00:00 quedan fuera; 27-sep 23:59 dentro
      const items = res.body as DashboardItem[];
      const ids = items.map((c) => c.id);
      expect(ids).not.toContain(BORDE_ANTES);
      expect(ids).not.toContain(BORDE_DESPUES);
      const ultimo = items.find((c) => c.id === BORDE_ULTIMO);
      expect(ultimo?.fecha).toBe('2026-09-27');
      expect(ultimo?.hora).toBe('23:59');
    });

    it('debería devolver la forma de /hoy con el campo fecha, sin contacto del paciente', async () => {
      // Act
      const res = await agenda('?desde=2026-09-22&hasta=2026-09-22').expect(
        200,
      );

      // Assert
      const items = res.body as DashboardItem[];
      expect(items[0]).toEqual({
        id: C1,
        pacienteNombre: 'María González',
        fecha: '2026-09-22',
        hora: '10:00',
        inicio: '2026-09-22T13:00:00.000Z',
        duracionMin: 50,
        tipoConsulta: 'Control',
        estado: 'confirmada',
      });
      expect(res.text).not.toMatch(/telefono|correo|rut|tenantId|usuarioId/);
      expect(res.text).not.toContain('7777');
    });

    it('no debería incluir citas de otro profesional del tenant ni de otro tenant', async () => {
      // Act
      const deA = await agenda('?desde=2026-09-22&hasta=2026-09-22').expect(
        200,
      );
      const deB = await agenda(
        '?desde=2026-09-22&hasta=2026-09-22',
        tokenB,
      ).expect(200);

      // Assert
      const idsA = (deA.body as DashboardItem[]).map((c) => c.id);
      expect(idsA).not.toContain(DEL_COLEGA);
      expect(idsA).not.toContain(DE_B);
      expect((deB.body as DashboardItem[]).map((c) => c.id)).toEqual([DE_B]);
    });

    it('debería aceptar el máximo de 42 días', async () => {
      // Act — 1-sep..12-oct
      const res = await agenda('?desde=2026-09-01&hasta=2026-10-12').expect(
        200,
      );

      // Assert
      expect((res.body as DashboardItem[]).length).toBeGreaterThan(0);
    });

    it('no debería colisionar con GET /api/citas/hoy, que también trae fecha', async () => {
      // Act
      const res = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert — lista (hoy no hay citas sembradas para "ahora")
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  describe('avisos en POST /api/citas', () => {
    const crear = (inicio: string, duracionMin = 20) =>
      request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inicio,
          duracionMin,
          tipoConsulta: 'Control',
          pacienteId: PACIENTE_A1,
        });

    it('debería responder 201 con avisos.solapamientos cuando se cruza (vigentes, del mismo profesional, en orden)', async () => {
      // Act — 22-sep 10:20-10:40: se cruza con C1 y C2; no con C3 (10:50),
      // ni con la del colega ni con la de otro tenant.
      const res = await crear('2026-09-22T10:20:00-03:00').expect(201);

      // Assert
      const body = res.body as CitaBody;
      expect(body.estado).toBe('pendiente');
      expect(body.avisos?.solapamientos.map((s) => s.id)).toEqual([C1, C2]);
      expect(body.avisos?.solapamientos[1]).toEqual({
        id: C2,
        pacienteNombre: 'Beto Soto',
        fecha: '2026-09-22',
        hora: '10:00',
        inicio: '2026-09-22T13:00:00.000Z',
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado: 'pendiente',
      });
      // No bloquea: la cita quedó creada
      expect(citaRepo.citas.has(body.id)).toBe(true);
    });

    it('debería responder 201 con avisos { solapamientos: [] } cuando no hay choque', async () => {
      // Act
      const res = await crear('2026-09-24T10:00:00-03:00').expect(201);

      // Assert
      expect((res.body as CitaBody).avisos).toEqual({ solapamientos: [] });
    });

    it('no debería avisar contra una cita pegada (intervalo semiabierto)', async () => {
      // Act — 22-sep 11:40-12:00 empieza justo cuando termina C3
      const res = await crear('2026-09-22T11:40:00-03:00').expect(201);

      // Assert
      expect((res.body as CitaBody).avisos).toEqual({ solapamientos: [] });
    });

    it('no debería avisar contra citas terminales', async () => {
      // Act — 23-sep 09:10, encima de C4 (cancelada)
      const res = await crear('2026-09-23T09:10:00-03:00').expect(201);

      // Assert
      expect((res.body as CitaBody).avisos).toEqual({ solapamientos: [] });
    });

    it('debería responder 400 cuando duracionMin supera 1440', async () => {
      await crear('2026-09-24T10:00:00-03:00', 1441).expect(400);
    });
  });

  // ---------------------------------------------------------------------
  describe('avisos en PATCH (reagendar / editar / transiciones)', () => {
    it('debería incluir avisos al reagendar, sin contar la propia cita', async () => {
      // Act — C3 pasa a 22-sep 10:10-11:00
      const res = await request(server())
        .patch(`/api/citas/${C3}/reagendar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inicio: '2026-09-22T10:10:00-03:00' })
        .expect(200);

      // Assert
      const body = res.body as CitaBody;
      expect(body.id).toBe(C3);
      expect(body.avisos?.solapamientos.map((s) => s.id)).toEqual([C1, C2]);
    });

    it('debería incluir avisos vacíos al reagendar a un hueco libre', async () => {
      // Act
      const res = await request(server())
        .patch(`/api/citas/${C3}/reagendar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inicio: '2026-09-25T10:00:00-03:00' })
        .expect(200);

      // Assert
      expect((res.body as CitaBody).avisos).toEqual({ solapamientos: [] });
    });

    it('debería comparar contra la agenda del DUEÑO cuando reagenda un colega', async () => {
      // Act — el colega mueve C3 (de USUARIO_A) encima de C1/C2 y de su propia
      // cita DEL_COLEGA; solo cuentan las del dueño.
      const res = await request(server())
        .patch(`/api/citas/${C3}/reagendar`)
        .set('Authorization', `Bearer ${tokenColegaA}`)
        .send({ inicio: '2026-09-22T10:10:00-03:00' })
        .expect(200);

      // Assert
      const ids = (res.body as CitaBody).avisos?.solapamientos.map((s) => s.id);
      expect(ids).toEqual([C1, C2]);
      expect(ids).not.toContain(DEL_COLEGA);
    });

    it('debería incluir avisos al editar la duración', async () => {
      // Act — C2 (10:00) pasa de 30 a 60 min: ahora pisa C1 y C3
      const res = await request(server())
        .patch(`/api/citas/${C2}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ duracionMin: 60 })
        .expect(200);

      // Assert
      expect(
        (res.body as CitaBody).avisos?.solapamientos.map((s) => s.id),
      ).toEqual([C1, C3]);
    });

    it('debería responder 400 al editar con duracionMin mayor a 1440', async () => {
      await request(server())
        .patch(`/api/citas/${C2}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ duracionMin: 1441 })
        .expect(400);
    });

    it.each([
      ['confirmar', C3, undefined],
      ['cancelar', C3, { motivo: 'Paciente avisó' }],
      ['asistencia', C1, undefined],
      ['inasistencia', C1, undefined],
    ])(
      'NO debería incluir avisos en PATCH …/%s',
      async (accion, id, cuerpo) => {
        // Act
        const res = await request(server())
          .patch(`/api/citas/${id}/${accion}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send(cuerpo ?? {})
          .expect(200);

        // Assert — la clave no viaja
        expect(res.body).not.toHaveProperty('avisos');
        expect(res.text).not.toContain('avisos');
      },
    );
  });
});
