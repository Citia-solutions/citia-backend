import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import request from 'supertest';

import { AuthModule } from '../src/modules/auth/auth.module';
import { CitaModule } from '../src/modules/cita/cita.module';
import { CitaOrmEntity } from '../src/modules/cita/infrastructure/persistence/cita.orm-entity';
import { PacienteModule } from '../src/modules/paciente/paciente.module';
import { PacienteOrmEntity } from '../src/modules/paciente/infrastructure/persistence/paciente.orm-entity';
import { TenantOrmEntity } from '../src/modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { UsuarioOrmEntity } from '../src/modules/usuario/infrastructure/persistence/usuario.orm-entity';

// AuthModule lee JWT_SECRET vía ConfigService (getOrThrow). Garantizamos un
// secreto de test antes de construir el módulo.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1d';

// Config TypeORM de test que incluye TODAS las entidades que tocan las citas
// (Tenant, Usuario, Paciente, Cita). La config compartida en
// test/typeorm-test.config.ts solo registra Tenant+Usuario; aquí ampliamos.
const typeOrmCitasTestConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.TEST_DB_HOST ?? 'localhost',
  port: parseInt(process.env.TEST_DB_PORT ?? '5432'),
  username: process.env.TEST_DB_USER ?? 'postgres',
  password: process.env.TEST_DB_PASS ?? 'postgres',
  database: process.env.TEST_DB_NAME ?? 'citia_test',
  entities: [
    TenantOrmEntity,
    UsuarioOrmEntity,
    PacienteOrmEntity,
    CitaOrmEntity,
  ],
  synchronize: true, // SOLO aquí: BD efímera de test, nunca dev/prod
  dropSchema: true, // Limpia el schema en cada run de test
};

interface RegistroBody {
  tenantSlug: string;
}
interface LoginBody {
  accessToken: string;
}
interface PacienteBody {
  id: string;
}
interface CitaBody {
  id: string;
}
interface DashboardItem {
  id: string;
  pacienteNombre: string;
  hora: string;
  duracionMin: number;
  tipoConsulta: string;
  estado: string;
  tenantId?: string;
  usuarioId?: string;
}

/**
 * E2E del dashboard de citas del día — US-06 (RF-03).
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*) con synchronize/dropSchema.
 * Si no hay BD disponible, esta suite falla en el bootstrap (beforeAll) por
 * conexión, NO por la lógica de negocio.
 *
 * Estrena el JwtAuthGuard en un endpoint protegido y valida:
 *  - rechazo de token ausente/corrupto (401),
 *  - aislamiento por tenant y por profesional,
 *  - 400 para paciente inexistente / de otro tenant,
 *  - whitelist del ValidationPipe (ignora tenantId/usuarioId/estado del body).
 */
describe('Citas dashboard (e2e)', () => {
  let app: INestApplication;
  const server = (): App => app.getHttpServer() as App;

  // Devuelve un datetime de HOY a la hora indicada (para que caiga en el rango
  // "del día" que consulta GET /api/citas/hoy).
  const hoyALas = (hora: number, minuto = 0): string => {
    const d = new Date();
    d.setHours(hora, minuto, 0, 0);
    return d.toISOString();
  };

  // --- Datos de siembra: dos tenants (A y B) para probar aislamiento ---
  const tenantA = {
    nombreTenant: 'Clinica Dashboard A',
    email: 'admin@dashboard-a.com',
    password: 'password1234',
    nombreCompleto: 'Admin A',
  };
  const tenantB = {
    nombreTenant: 'Clinica Dashboard B',
    email: 'admin@dashboard-b.com',
    password: 'password1234',
    nombreCompleto: 'Admin B',
  };

  let tokenA: string;
  let tokenB: string;
  let tenantASlug: string;
  let tenantBSlug: string;

  // Registra un tenant+admin y devuelve su slug.
  const registrar = async (cred: typeof tenantA): Promise<string> => {
    const res = await request(server())
      .post('/api/usuarios')
      .send(cred)
      .expect(201);
    return (res.body as RegistroBody).tenantSlug;
  };

  // Login → accessToken.
  const login = async (
    slug: string,
    email: string,
    password: string,
  ): Promise<string> => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ tenantSlug: slug, email, password })
      .expect(200);
    return (res.body as LoginBody).accessToken;
  };

  const crearPaciente = async (
    token: string,
    nombre: string,
  ): Promise<string> => {
    const res = await request(server())
      .post('/api/pacientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre, contacto: 'contacto@mail.com', consentimiento: true })
      .expect(201);
    return (res.body as PacienteBody).id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(typeOrmCitasTestConfig),
        UsuariosModule,
        AuthModule,
        PacienteModule,
        CitaModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Semilla: dos tenants con su admin, login para obtener JWTs reales.
    tenantASlug = await registrar(tenantA);
    tenantBSlug = await registrar(tenantB);
    tokenA = await login(tenantASlug, tenantA.email, tenantA.password);
    tokenB = await login(tenantBSlug, tenantB.email, tenantB.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('guard JWT en GET /api/citas/hoy (DoD: probado en vivo)', () => {
    it('debería devolver 401 cuando NO se envía token', async () => {
      await request(server()).get('/api/citas/hoy').expect(401);
    });

    it('debería devolver 401 cuando el token es inválido/corrupto', async () => {
      await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', 'Bearer token.corrupto.invalido')
        .expect(401);
    });

    it('debería devolver 200 cuando el token es válido', async () => {
      await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });
  });

  describe('aislamiento por tenant (DoD: test de aislamiento)', () => {
    it('un usuario del tenant A NO debe ver citas del tenant B', async () => {
      // Arrange — cada tenant crea un paciente y una cita HOY.
      const pacienteA = await crearPaciente(tokenA, 'Paciente A');
      const pacienteB = await crearPaciente(tokenB, 'Paciente B');

      await request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inicio: hoyALas(9),
          duracionMin: 30,
          tipoConsulta: 'Control A',
          pacienteId: pacienteA,
        })
        .expect(201);

      await request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          inicio: hoyALas(10),
          duracionMin: 30,
          tipoConsulta: 'Control B',
          pacienteId: pacienteB,
        })
        .expect(201);

      // Act — A consulta su dashboard.
      const resA = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert — A solo ve sus tipos de consulta, ninguno del tenant B.
      const tiposA = (resA.body as DashboardItem[]).map((c) => c.tipoConsulta);
      expect(tiposA).toContain('Control A');
      expect(tiposA).not.toContain('Control B');
    });
  });

  describe('filtro por profesional y por día', () => {
    it('el dashboard solo incluye citas del usuarioId del token', async () => {
      // El token B pertenece a otro profesional/tenant; su dashboard no debe
      // contener las citas creadas por A.
      const resB = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const tiposB = (resB.body as DashboardItem[]).map((c) => c.tipoConsulta);
      expect(tiposB).toContain('Control B');
      expect(tiposB).not.toContain('Control A');
    });

    it('cada item del dashboard expone hora "HH:mm", nombre de paciente y estado', async () => {
      const res = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const items = res.body as DashboardItem[];
      expect(items.length).toBeGreaterThan(0);
      const item = items[0];
      expect(item.hora).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof item.pacienteNombre).toBe('string');
      expect(item.estado).toBe('pendiente');
      // El dashboard NO expone identificadores internos de aislamiento.
      expect(item.tenantId).toBeUndefined();
      expect(item.usuarioId).toBeUndefined();
    });
  });

  describe('POST /api/citas — validación de paciente', () => {
    it('debería devolver 400 cuando el pacienteId no existe en el tenant', async () => {
      await request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inicio: hoyALas(11),
          duracionMin: 30,
          tipoConsulta: 'Control',
          pacienteId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(400);
    });

    it('debería devolver 400 cuando el pacienteId pertenece a OTRO tenant', async () => {
      // Creamos un paciente en el tenant B y tratamos de usarlo desde A.
      const pacienteDeB = await crearPaciente(tokenB, 'Paciente Solo B');

      await request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inicio: hoyALas(12),
          duracionMin: 30,
          tipoConsulta: 'Cross tenant',
          pacienteId: pacienteDeB,
        })
        .expect(400);
    });
  });

  describe('whitelist del ValidationPipe en POST /api/citas', () => {
    it('debería ignorar tenantId/usuarioId/estado enviados en el body', async () => {
      // Arrange — paciente válido en A.
      const pacienteA = await crearPaciente(tokenA, 'Paciente Whitelist');

      // Act — enviamos campos maliciosos que el ValidationPipe debe descartar.
      const res = await request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inicio: hoyALas(13),
          duracionMin: 30,
          tipoConsulta: 'Whitelist test',
          pacienteId: pacienteA,
          tenantId: 'tenant-ATACANTE',
          usuarioId: 'usuario-ATACANTE',
          estado: 'asistio',
        })
        .expect(201);

      const citaId = (res.body as CitaBody).id;
      expect(citaId).toBeDefined();

      // Assert — la cita nace PENDIENTE y aparece en el dashboard de A (mismo
      // tenant/usuario del token), no en el de B. El estado inyectado se ignora.
      const dash = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const creada = (dash.body as DashboardItem[]).find(
        (c) => c.id === citaId,
      );
      expect(creada).toBeDefined();
      expect(creada!.estado).toBe('pendiente');

      // La cita NO aparece para el tenant B (no se aplicó el tenantId inyectado).
      const dashB = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect((dashB.body as DashboardItem[]).some((c) => c.id === citaId)).toBe(
        false,
      );
    });
  });
});
