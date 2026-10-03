import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';

import {
  Entorno,
  validarEntorno,
} from '../src/shared/infrastructure/config/entorno';
import {
  crearOpcionesCors,
  crearPoliticaCors,
} from '../src/shared/infrastructure/config/origenes-cors';
import { ObservabilidadModule } from '../src/shared/observabilidad.module';
import { typeOrmTestConfig } from './typeorm-test.config';

// validarEntorno exige JWT_SECRET (como AuthModule).
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';
// CORS: la política sale del entorno validado, como en main.ts. FRONTEND_URL
// con barra final y mayúsculas para ejercer la normalización; un extra exacto
// y el comodín de vistas previas, con espacios alrededor de la coma.
process.env.FRONTEND_URL = 'https://App.Citia.cl/';
process.env.CORS_ORIGENES_EXTRA =
  'https://staging.citia.cl , https://*.citia-frontend.pages.dev';

/**
 * E2E de `GET /api/health` (ADR-13 §16) y del CORS de `main.ts` (US-03 paso 4).
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*). Sin BD, la suite falla en el
 * bootstrap (beforeAll) por conexión, no por la lógica.
 */
describe('Salud y CORS (e2e)', () => {
  let app: INestApplication;
  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
        // Solo hace falta la conexion (SELECT 1): sin entidades, sin
        // synchronize y SIN dropSchema (no hace falta tocar el esquema que
        // dejan las otras suites e2e sobre citia_test).
        TypeOrmModule.forRoot({
          ...typeOrmTestConfig,
          entities: [],
          synchronize: false,
          dropSchema: false,
        }),
        ObservabilidadModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    // Igual que main.ts: FRONTEND_URL + CORS_ORIGENES_EXTRA del entorno
    // validado por validarEntorno.
    const config = app.get<ConfigService<Entorno, true>>(ConfigService);
    app.enableCors(
      crearOpcionesCors(
        crearPoliticaCors(
          config.get('FRONTEND_URL', { infer: true }),
          config.get('CORS_ORIGENES_EXTRA', { infer: true }),
        ),
      ),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('200 con la base arriba, sin autenticación y sin caché', async () => {
      const res = await request(server()).get('/api/health').expect(200);

      expect(res.body).toEqual({ estado: 'ok', baseDatos: 'ok' });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('503 si la base no responde, sin detalles del error', async () => {
      const dataSource = app.get(DataSource);
      const query = jest.spyOn(dataSource, 'query').mockRejectedValueOnce(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
          code: 'ECONNREFUSED',
        }),
      );

      const res = await request(server()).get('/api/health').expect(503);

      expect(res.body).toEqual({ estado: 'error', baseDatos: 'error' });
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
      query.mockRestore();
    });
  });

  describe('CORS', () => {
    it('origen permitido: refleja el origen con credenciales', async () => {
      const res = await request(server())
        .get('/api/health')
        .set('Origin', 'https://app.citia.cl')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://app.citia.cl',
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-expose-headers']).toBe('X-Request-Id');
    });

    it('vista previa de Pages: preflight aceptado', async () => {
      const origen = 'https://a1b2c3.citia-frontend.pages.dev';
      const res = await request(server())
        .options('/api/citas')
        .set('Origin', origen)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(origen);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('origen exacto de CORS_ORIGENES_EXTRA: aceptado', async () => {
      const res = await request(server())
        .get('/api/health')
        .set('Origin', 'https://staging.citia.cl')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://staging.citia.cl',
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('origen ajeno: el preflight no recibe ninguna cabecera CORS', async () => {
      const res = await request(server())
        .options('/api/citas')
        .set('Origin', 'https://evil.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(res.headers['access-control-allow-methods']).toBeUndefined();
      expect(res.headers['access-control-allow-headers']).toBeUndefined();
    });

    it.each([
      'https://evil.com',
      'https://x.y.citia-frontend.pages.dev',
      'https://citia-frontend.pages.dev.evil.com',
      'http://a1b2c3.citia-frontend.pages.dev',
    ])('origen ajeno %s: sin cabeceras CORS', async (origen) => {
      const res = await request(server())
        .get('/api/health')
        .set('Origin', origen)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
