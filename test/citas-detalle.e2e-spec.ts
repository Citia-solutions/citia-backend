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
import { CambioCita } from '../src/modules/cita/domain/cambio-cita.entity';
import { CambioCitaRepository } from '../src/modules/cita/domain/cambio-cita.repository';
import { Cita, EstadoCita } from '../src/modules/cita/domain/cita.entity';
import { CitaRepository } from '../src/modules/cita/domain/cita.repository';
import { CitasController } from '../src/modules/cita/presentation/citas.controller';
import { PacientesService } from '../src/modules/paciente/application/pacientes.service';
import { Paciente } from '../src/modules/paciente/domain/paciente.entity';
import { PacienteRepository } from '../src/modules/paciente/domain/paciente.repository';
import { RolUsuario } from '../src/modules/usuario/domain/usuario.entity';
import { rangoDelDiaEnZona } from '../src/shared/domain/timezone';

/**
 * E2E de GET /api/citas/:id (US-02.08) SIN base de datos.
 *
 * El resto de suites e2e necesitan Postgres y hoy no corren en ningun entorno
 * (DT-20). Esta monta la pila HTTP real —prefijo `api`, ValidationPipe global,
 * JwtAuthGuard con passport-jwt y JwtStrategy reales, ParseUUIDPipe,
 * CitasController y CitasService reales— y sustituye SOLO la persistencia por
 * repositorios en memoria que respetan el contrato del puerto (filtran por
 * tenant). Asi se observa el comportamiento HTTP (401/400/404/200, orden de
 * rutas) sin levantar infraestructura.
 *
 * Lo que NO cubre (sigue siendo DT-20): el filtro por tenant del adaptador
 * TypeORM real, fronteras del dia en SQL, indices.
 */

// JwtStrategy lee el secreto via ConfigService.getOrThrow. El firmante de abajo
// lee del MISMO ConfigService, asi que no importa si el .env define otro.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';

const TZ = 'America/Santiago';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USUARIO_A = 'usuario-a';
const USUARIO_B = 'usuario-b';

const CITA_A = '11111111-1111-4111-8111-111111111111';
const CITA_B = '22222222-2222-4222-8222-222222222222';
const PACIENTE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACIENTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// --- Dobles de persistencia (contrato del puerto, sin BD) --------------------

class InMemoryCitaRepository extends CitaRepository {
  readonly citas = new Map<string, Cita>();

  guardar(cita: Cita): Promise<Cita> {
    this.citas.set(cita.id, cita);
    return Promise.resolve(cita);
  }

  // Igual que el adaptador real: una cita de otro tenant es invisible.
  buscarPorId(id: string, tenantId: string): Promise<Cita | null> {
    const cita = this.citas.get(id);
    return Promise.resolve(cita && cita.tenantId === tenantId ? cita : null);
  }

  buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
  ): Promise<Cita[]> {
    const { desde, hasta } = rangoDelDiaEnZona(dia, TZ);
    return Promise.resolve(
      [...this.citas.values()]
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.usuarioId === usuarioId &&
            c.inicio >= desde &&
            c.inicio < hasta,
        )
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime()),
    );
  }
}

class InMemoryCambioCitaRepository extends CambioCitaRepository {
  readonly cambios: CambioCita[] = [];

  registrar(cambio: CambioCita): Promise<CambioCita> {
    this.cambios.push(cambio);
    return Promise.resolve(cambio);
  }

  historialDeCita(citaId: string, tenantId: string): Promise<CambioCita[]> {
    return Promise.resolve(
      this.cambios.filter(
        (c) => c.citaId === citaId && c.tenantId === tenantId,
      ),
    );
  }
}

class InMemoryPacienteRepository extends PacienteRepository {
  readonly pacientes = new Map<string, Paciente>();

  guardar(paciente: Partial<Paciente>): Promise<Paciente> {
    const p = paciente as Paciente;
    this.pacientes.set(p.id, p);
    return Promise.resolve(p);
  }

  buscarPorId(id: string, tenantId: string): Promise<Paciente | null> {
    const p = this.pacientes.get(id);
    return Promise.resolve(p && p.tenantId === tenantId ? p : null);
  }

  buscarPorRut(rut: string, tenantId: string): Promise<Paciente | null> {
    const p = [...this.pacientes.values()].find(
      (x) => x.rut === rut && x.tenantId === tenantId,
    );
    return Promise.resolve(p ?? null);
  }
}

// --- Formas de respuesta -----------------------------------------------------

interface DetalleBody {
  id: string;
  estado: string;
  inicio: string;
  hora: string;
  duracionMin: number;
  tipoConsulta: string;
  paciente: Record<string, unknown>;
  accionesPermitidas: string[];
}

interface DashboardItem {
  id: string;
  pacienteNombre: string;
  hora: string;
}

describe('GET /api/citas/:id — voucher (e2e sin BD, US-02.08)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const citaRepo = new InMemoryCitaRepository();
  const cambioRepo = new InMemoryCambioCitaRepository();
  const pacienteRepo = new InMemoryPacienteRepository();

  let tokenA: string;
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
    tenantId: string,
    pacienteId: string,
    usuarioId: string,
    estado: EstadoCita,
    inicio: Date,
  ): Cita =>
    Cita.reconstituir({
      id,
      inicio,
      duracionMin: 45,
      tipoConsulta: 'Control',
      estado,
      tenantId,
      pacienteId,
      usuarioId,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

  // Semilla fresca por test: el flujo de reagendar muta la cita en memoria.
  const sembrar = (): void => {
    citaRepo.citas.clear();
    cambioRepo.cambios.length = 0;
    pacienteRepo.pacientes.clear();

    pacienteRepo.pacientes.set(PACIENTE_A, {
      id: PACIENTE_A,
      rut: '123456785', // canonico, como vive en BD
      nombre: 'Ana Pérez',
      telefono: '+56 9 1111 1111',
      correo: 'ana@mail.com',
      consentimiento: true,
      tenantId: TENANT_A,
    });
    pacienteRepo.pacientes.set(PACIENTE_B, {
      id: PACIENTE_B,
      rut: '111111111',
      nombre: 'Beto Soto',
      telefono: '+56 9 2222 2222',
      correo: null,
      consentimiento: true,
      tenantId: TENANT_B,
    });

    // Cita de A para "ahora": sirve al detalle y aparece en GET /hoy.
    citaRepo.citas.set(
      CITA_A,
      cita(
        CITA_A,
        TENANT_A,
        PACIENTE_A,
        USUARIO_A,
        EstadoCita.CONFIRMADA,
        new Date(),
      ),
    );
    citaRepo.citas.set(
      CITA_B,
      cita(
        CITA_B,
        TENANT_B,
        PACIENTE_B,
        USUARIO_B,
        EstadoCita.PENDIENTE,
        new Date('2026-09-25T18:05:00Z'),
      ),
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
              // Solo lo usa crearCita, que esta suite no ejercita.
              {} as PacientesService,
              { run: (work) => work(undefined) },
              { publicar: () => Promise.resolve() },
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
    tokenB = await firmar(USUARIO_B, TENANT_B);
  });

  beforeEach(() => {
    sembrar();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('autenticación (JwtAuthGuard real)', () => {
    it('debería responder 401 cuando no se envía token', async () => {
      await request(server()).get(`/api/citas/${CITA_A}`).expect(401);
    });

    it('debería responder 401 cuando el token está firmado con otro secreto', async () => {
      // Arrange
      const falso = await jwt.signAsync(
        { sub: USUARIO_A, tenantId: TENANT_A },
        { secret: 'otro-secreto' },
      );

      // Act & Assert
      await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${falso}`)
        .expect(401);
    });

    it('debería responder 401 antes de validar el id cuando no hay token y el id no es UUID', async () => {
      // El guard corre antes que los pipes: sin credenciales no se informa
      // nada sobre el formato del recurso.
      await request(server()).get('/api/citas/no-es-uuid').expect(401);
    });
  });

  describe('validación del id', () => {
    it('debería responder 400 cuando el id no es un UUID', async () => {
      const res = await request(server())
        .get('/api/citas/no-es-uuid')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });
  });

  describe('respuesta 200', () => {
    it('debería devolver cita + paciente + acciones en una sola llamada', async () => {
      // Act
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      const body = res.body as DetalleBody;
      expect(body.id).toBe(CITA_A);
      expect(body.estado).toBe('confirmada');
      expect(body.hora).toMatch(/^\d{2}:\d{2}$/);
      expect(body.duracionMin).toBe(45);
      expect(body.tipoConsulta).toBe('Control');
      expect(body.paciente).toEqual({
        id: PACIENTE_A,
        nombre: 'Ana Pérez',
        rut: '12.345.678-5',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
      });
      expect(body.accionesPermitidas).toEqual([
        'cancelar',
        'reagendar',
        'asistencia',
        'inasistencia',
        'editar',
      ]);
    });

    it('no debería exponer tenantId, usuarioId, consentimiento ni el RUT canónico', async () => {
      // Act
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert sobre el texto crudo: lo que de verdad viaja por la red.
      expect(res.text).not.toMatch(/tenantId|usuarioId|consentimiento/);
      expect(res.text).not.toContain(TENANT_A);
      expect(res.text).not.toContain(USUARIO_A);
      expect(res.text).not.toContain('123456785');
      expect(res.text).not.toContain('ghosting');
    });
  });

  describe('aislamiento por tenant', () => {
    it('debería responder 404 con cuerpo idéntico para una cita de otro tenant y una inexistente', async () => {
      // Arrange: la cita existe de verdad para su dueño.
      await request(server())
        .get(`/api/citas/${CITA_B}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Act 1: A pide la cita de B (existe, pero en otro tenant).
      const otroTenant = await request(server())
        .get(`/api/citas/${CITA_B}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // Act 2: la misma URL cuando la cita ya no existe en ningun tenant.
      citaRepo.citas.delete(CITA_B);
      const inexistente = await request(server())
        .get(`/api/citas/${CITA_B}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // Assert: indistinguibles. Nada revela que la cita vive en otro lado.
      expect(otroTenant.body).toEqual(inexistente.body);
      expect(otroTenant.text).toBe(inexistente.text);
      expect(otroTenant.text).not.toContain(TENANT_B);
      expect(otroTenant.text).not.toContain('Beto');
    });
  });

  describe('orden de rutas', () => {
    it('debería resolver GET /api/citas/hoy al dashboard y no al detalle por id', async () => {
      // Act
      const res = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert: forma de dashboard (lista), no de voucher (objeto) ni un 400
      // del UUID pipe.
      expect(Array.isArray(res.body)).toBe(true);
      const items = res.body as DashboardItem[];
      expect(items.map((c) => c.id)).toEqual([CITA_A]);
      expect(items[0].pacienteNombre).toBe('Ana Pérez');
      expect(items[0]).not.toHaveProperty('accionesPermitidas');
    });
  });

  describe('flujo del voucher: acción y relectura', () => {
    it('debería mostrar las acciones de pendiente tras reagendar una cita confirmada', async () => {
      // Arrange
      const antes = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((antes.body as DetalleBody).accionesPermitidas).toContain(
        'asistencia',
      );

      // Act: la ruta de escritura que ya existia (no se crea ninguna nueva).
      await request(server())
        .patch(`/api/citas/${CITA_A}/reagendar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inicio: '2026-09-30T10:00:00-03:00' })
        .expect(200);

      // Assert: el frontend vuelve a pedir el detalle y ve el estado nuevo.
      const despues = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = despues.body as DetalleBody;
      expect(body.estado).toBe('pendiente');
      expect(body.hora).toBe('10:00');
      expect(body.accionesPermitidas).toEqual([
        'confirmar',
        'cancelar',
        'reagendar',
        'editar',
      ]);
    });

    it('debería mostrar el voucher sin acciones tras cancelar', async () => {
      // Act
      await request(server())
        .patch(`/api/citas/${CITA_A}/cancelar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ motivo: 'Paciente avisó' })
        .expect(200);

      // Assert
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = res.body as DetalleBody;
      expect(body.estado).toBe('cancelada');
      expect(body.accionesPermitidas).toEqual([]);
    });
  });
});
