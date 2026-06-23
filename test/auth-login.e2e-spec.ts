import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import request from 'supertest';

import { AuthModule } from '../src/modules/auth/auth.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { typeOrmTestConfig } from './typeorm-test.config';

// AuthModule lee JWT_SECRET vía ConfigService (getOrThrow). Garantizamos un
// secreto de test antes de construir el módulo.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1d';

interface RegistroBody {
  tenantSlug: string;
}

interface LoginBody {
  accessToken: string;
  usuario: {
    email: string;
    tenantId: string;
    passwordHash?: string;
  };
}

interface ErrorBody {
  message: string;
}

/**
 * E2E del login multi-tenant: POST /api/auth/login.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*) y synchronize/dropSchema activo
 * (config en test/typeorm-test.config.ts). Si no hay BD disponible en el
 * entorno de CI/local, esta suite fallará en el bootstrap (beforeAll) por
 * conexión, NO por la lógica de negocio.
 *
 * Se registra un tenant + admin vía POST /api/usuarios para luego ejercer el
 * login contra credenciales reales (password hasheado por el flujo de registro).
 */
describe('Auth login (e2e)', () => {
  let app: INestApplication;
  const server = (): App => app.getHttpServer() as App;

  const tenantSlugRegistrado = 'clinica-login-e2e';
  const credenciales = {
    nombreTenant: 'Clínica Login E2E',
    email: 'admin@login-e2e.com',
    password: 'password1234',
    nombreCompleto: 'Admin Login E2E',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(typeOrmTestConfig),
        UsuariosModule,
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Sembrar un tenant + usuario admin mediante el endpoint de registro.
    const res = await request(server())
      .post('/api/usuarios')
      .send(credenciales)
      .expect(201);

    // El slug generado debería coincidir con el esperado (nombre slugificado).
    expect((res.body as RegistroBody).tenantSlug).toBe(tenantSlugRegistrado);
  });

  afterAll(async () => {
    await app.close();
  });

  it('debería devolver 200 y un accessToken cuando las credenciales son válidas', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug: tenantSlugRegistrado,
        email: credenciales.email,
        password: credenciales.password,
      })
      .expect(200);

    const body = res.body as LoginBody;
    expect(body.accessToken).toBeDefined();
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);
    expect(body.usuario).toBeDefined();
    expect(body.usuario.email).toBe(credenciales.email);
    expect(body.usuario.tenantId).toBeDefined();
    // Nunca debe filtrarse el hash de la contraseña.
    expect(body.usuario.passwordHash).toBeUndefined();
  });

  it('debería devolver 401 genérico cuando el tenantSlug no existe', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug: 'tenant-inexistente',
        email: credenciales.email,
        password: credenciales.password,
      })
      .expect(401);

    expect((res.body as ErrorBody).message).toBe('Credenciales inválidas');
  });

  it('debería devolver 401 genérico cuando el usuario no existe en el tenant', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug: tenantSlugRegistrado,
        email: 'noexiste@login-e2e.com',
        password: credenciales.password,
      })
      .expect(401);

    expect((res.body as ErrorBody).message).toBe('Credenciales inválidas');
  });

  it('debería devolver 401 genérico cuando la contraseña es incorrecta', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug: tenantSlugRegistrado,
        email: credenciales.email,
        password: 'password-incorrecta',
      })
      .expect(401);

    expect((res.body as ErrorBody).message).toBe('Credenciales inválidas');
  });

  it('debería devolver 400 cuando falta tenantSlug', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({
        email: credenciales.email,
        password: credenciales.password,
      })
      .expect(400);
  });

  it('debería devolver 400 cuando el email no es un email válido', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug: tenantSlugRegistrado,
        email: 'no-es-un-email',
        password: credenciales.password,
      })
      .expect(400);
  });

  it('debería devolver 400 cuando la contraseña está vacía', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug: tenantSlugRegistrado,
        email: credenciales.email,
        password: '',
      })
      .expect(400);
  });
});
