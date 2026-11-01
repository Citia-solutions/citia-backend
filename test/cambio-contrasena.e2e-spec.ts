import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { TenantModule } from '../src/modules/tenant/tenant.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { typeOrmTestConfig } from './typeorm-test.config';

// AuthModule y UsuariosModule (vía FirmaJwtModule) leen JWT_SECRET con
// getOrThrow. `test/setup-env.ts` carga el `.env`; esto cubre un entorno sin él.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1d';

/**
 * Cambio de contraseña y corte de sesiones de punta a punta (US-10, ADR-15 §4
 * y §5; Definición de Terminado, `test/cambio-contrasena.e2e-spec.ts`):
 *
 *   PUT /api/usuarios/me/contrasena → 200 { accessToken } · 400 · 401
 *
 *   - la actual incorrecta → 400 (NUNCA 401) y la sesión sigue sirviendo;
 *   - misma contraseña → 400; nueva de 7 o de más de 72 bytes → 400;
 *   - dos sesiones (A y B) abiertas al menos un segundo antes del cambio: tras
 *     el cambio desde A, A recibe un token nuevo que vale, y el token viejo de
 *     A y el de B reciben 401 en su siguiente petición;
 *   - la contraseña vieja ya no entra y la nueva sí;
 *   - un usuario borrado por SQL: su token da 401.
 *
 * Con los módulos REALES: `JwtStrategy` consulta `usuarios.sesiones_validas_desde`
 * en cada petición (sin caché). Los usuarios se crean con el registro y entran
 * con el login reales.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize + dropSchema.
 */

interface RegistroBody {
  tenantSlug: string;
}

interface LoginBody {
  accessToken: string;
  usuario: { id: string; tenantId: string; tenantSlug: string };
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

interface ClaimsJwt {
  sub: string;
  email: string;
  tenantId: string;
  rol: string;
  iat: number;
  exp: number;
}

/** Los claims de un JWT, sin verificar la firma (solo para mirar `iat`). */
const claims = (token: string): ClaimsJwt =>
  JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as ClaimsJwt;

/** Espera hasta entrar en un segundo de reloj POSTERIOR al de `desdeMs`. */
const esperarOtroSegundo = async (desdeMs: number): Promise<void> => {
  const siguiente = (Math.floor(desdeMs / 1000) + 1) * 1000;
  const falta = siguiente - Date.now() + 50;
  if (falta > 0) {
    await new Promise((listo) => setTimeout(listo, falta));
  }
};

const CUENTA = {
  nombreTenant: 'Clínica Contraseña E2E',
  email: 'dra.clave@clave-e2e.cl',
  password: 'clave-vieja-1234',
  nombreCompleto: 'Dra. Clave E2E',
};
const CONTRASENA_NUEVA = 'clave-nueva-5678';

const CUENTA_BORRADA = {
  nombreTenant: 'Consulta Borrada E2E',
  email: 'borrado@clave-e2e.cl',
  password: 'password1234',
  nombreCompleto: 'Usuario Borrado',
};

describe('Cambio de contraseña y corte de sesiones: PUT /api/usuarios/me/contrasena (e2e con Postgres)', () => {
  let app: INestApplication;
  let datos: DataSource;
  let tenantSlug: string;
  let usuarioId: string;
  const server = (): App => app.getHttpServer() as App;

  const entrar = (password: string, cuenta = CUENTA, slug = tenantSlug) =>
    request(server())
      .post('/api/auth/login')
      .send({ tenantSlug: slug, email: cuenta.email, password });

  const tokenDe = async (password: string): Promise<string> =>
    ((await entrar(password).expect(200)).body as LoginBody).accessToken;

  const verPerfil = (token: string) =>
    request(server())
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

  const cambiar = (cuerpo: Record<string, unknown>, token?: string) => {
    const peticion = request(server()).put('/api/usuarios/me/contrasena');
    return (
      token ? peticion.set('Authorization', `Bearer ${token}`) : peticion
    ).send(cuerpo);
  };

  const filaCuenta = async (): Promise<{
    password_hash: string;
    sesiones_validas_desde: Date | null;
  }> => {
    const [fila] = await datos.query<
      { password_hash: string; sesiones_validas_desde: Date | null }[]
    >(
      'SELECT password_hash, sesiones_validas_desde FROM usuarios WHERE id = $1',
      [usuarioId],
    );
    return fila;
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(typeOrmTestConfig),
        AuthModule,
        UsuariosModule,
        TenantModule,
      ],
    }).compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    datos = app.get(DataSource);

    const registro = await request(server())
      .post('/api/usuarios')
      .send(CUENTA)
      .expect(201);
    tenantSlug = (registro.body as RegistroBody).tenantSlug;
    const login = (await entrar(CUENTA.password).expect(200)).body as LoginBody;
    usuarioId = login.usuario.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('errores: la sesión sigue abierta y nada se escribe', () => {
    let token: string;
    let antes: Awaited<ReturnType<typeof filaCuenta>>;

    beforeAll(async () => {
      token = await tokenDe(CUENTA.password);
      antes = await filaCuenta();
    });

    afterEach(async () => {
      // Ningún error escribe: ni el hash ni el corte.
      expect(await filaCuenta()).toEqual(antes);
      expect(antes.sesiones_validas_desde).toBeNull();
      // …y la sesión sigue sirviendo (el frontend cierra la sesión con 401).
      await verPerfil(token).expect(200);
    });

    it('debería responder 400 (nunca 401) con su mensaje cuando la contraseña actual es incorrecta', async () => {
      const res = await cambiar(
        {
          contrasenaActual: 'no-es-la-actual',
          contrasenaNueva: CONTRASENA_NUEVA,
        },
        token,
      ).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'La contraseña actual no es correcta',
      });
    });

    it('debería responder 400 cuando la nueva es igual a la actual', async () => {
      const res = await cambiar(
        { contrasenaActual: CUENTA.password, contrasenaNueva: CUENTA.password },
        token,
      ).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'La nueva contraseña debe ser distinta de la actual',
      });
    });

    it('debería responder 400 cuando la nueva tiene 7 caracteres', async () => {
      await cambiar(
        { contrasenaActual: CUENTA.password, contrasenaNueva: '1234567' },
        token,
      ).expect(400);
    });

    it('debería responder 400 cuando la nueva pasa de 72 bytes en UTF-8 (37 ñ = 74 bytes)', async () => {
      const res = await cambiar(
        { contrasenaActual: CUENTA.password, contrasenaNueva: 'ñ'.repeat(37) },
        token,
      ).expect(400);

      expect((res.body as ErrorBody).message).toEqual(
        expect.stringContaining('72 bytes'),
      );
    });

    it.each<[string, Record<string, unknown>]>([
      ['sin la actual', { contrasenaNueva: CONTRASENA_NUEVA }],
      [
        'con la actual vacía',
        { contrasenaActual: '', contrasenaNueva: CONTRASENA_NUEVA },
      ],
      ['sin la nueva', { contrasenaActual: CUENTA.password }],
    ])(
      'debería responder 400 cuando el cuerpo llega %s',
      async (_caso, cuerpo) => {
        await cambiar(cuerpo, token).expect(400);
      },
    );

    it('debería responder 401 sin token', async () => {
      await cambiar({
        contrasenaActual: CUENTA.password,
        contrasenaNueva: CONTRASENA_NUEVA,
      }).expect(401);
    });
  });

  describe('cambio válido con dos sesiones abiertas (A y B)', () => {
    let tokenA: string;
    let tokenB: string;
    let tokenNuevo: string;

    beforeAll(async () => {
      // Arrange — dos logins y, después, un segundo de reloj distinto: el
      // corte se trunca al segundo y un token del MISMO segundo seguiría
      // valiendo (ventana aceptada, ADR-15 opción B1).
      tokenA = await tokenDe(CUENTA.password);
      tokenB = await tokenDe(CUENTA.password);
      await verPerfil(tokenA).expect(200);
      await verPerfil(tokenB).expect(200);
      const ultimoLogin = Math.max(
        claims(tokenA).iat * 1000,
        claims(tokenB).iat * 1000,
      );
      await esperarOtroSegundo(Math.max(ultimoLogin, Date.now()));

      // Act — el cambio, desde la sesión A
      const res = await cambiar(
        {
          contrasenaActual: CUENTA.password,
          contrasenaNueva: CONTRASENA_NUEVA,
        },
        tokenA,
      ).expect(200);
      expect(Object.keys(res.body as object)).toEqual(['accessToken']);
      tokenNuevo = (res.body as { accessToken: string }).accessToken;
    });

    it('debería guardar el corte truncado al segundo y firmar el token nuevo con iat = ese corte y los claims del login', async () => {
      // Arrange
      const fila = await filaCuenta();
      const nuevo = claims(tokenNuevo);
      const viejo = claims(tokenA);

      // Assert
      expect(fila.sesiones_validas_desde).toBeInstanceOf(Date);
      const corteMs = (fila.sesiones_validas_desde as Date).getTime();
      expect(corteMs % 1000).toBe(0);
      expect(nuevo.iat * 1000).toBe(corteMs);
      expect(viejo.iat * 1000).toBeLessThan(corteMs);
      expect(nuevo).toMatchObject({
        sub: viejo.sub,
        email: viejo.email,
        tenantId: viejo.tenantId,
        rol: viejo.rol,
      });
      expect(nuevo.exp).toBeGreaterThan(nuevo.iat);
      expect(tokenNuevo).not.toBe(tokenA);
    });

    it('debería responder 200 con el token nuevo (la sesión actual sigue)', async () => {
      const res = await verPerfil(tokenNuevo).expect(200);

      expect((res.body as { id: string }).id).toBe(usuarioId);
    });

    it('debería responder 401 a la otra sesión (B) en su siguiente petición', async () => {
      await verPerfil(tokenB).expect(401);
      await request(server())
        .get('/api/organizacion/suscripcion')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(401);
    });

    it('debería responder 401 al token viejo de A', async () => {
      await verPerfil(tokenA).expect(401);
    });

    it('debería responder 401 si se intenta otro cambio con un token cortado', async () => {
      await cambiar(
        {
          contrasenaActual: CONTRASENA_NUEVA,
          contrasenaNueva: 'otra-clave-999',
        },
        tokenB,
      ).expect(401);
    });

    it('debería rechazar el login con la contraseña vieja (401) y aceptar la nueva (200, con un token que vale)', async () => {
      // Act
      await entrar(CUENTA.password).expect(401);
      const conNueva = await tokenDe(CONTRASENA_NUEVA);

      // Assert
      await verPerfil(conNueva).expect(200);
    });

    it('debería seguir respondiendo 400 (no 401) con la actual incorrecta tras el cambio, con el token nuevo', async () => {
      await cambiar(
        {
          contrasenaActual: CUENTA.password,
          contrasenaNueva: 'otra-clave-999',
        },
        tokenNuevo,
      ).expect(400);
      await verPerfil(tokenNuevo).expect(200);
    });
  });

  describe('usuario borrado', () => {
    it('debería responder 401 al token de un usuario borrado por SQL', async () => {
      // Arrange
      await request(server())
        .post('/api/usuarios')
        .send(CUENTA_BORRADA)
        .expect(201);
      const login = (
        await entrar(
          CUENTA_BORRADA.password,
          CUENTA_BORRADA,
          'consulta-borrada-e2e',
        ).expect(200)
      ).body as LoginBody;
      await verPerfil(login.accessToken).expect(200);

      // Act
      await datos.query('DELETE FROM usuarios WHERE id = $1', [
        login.usuario.id,
      ]);

      // Assert — el token sigue bien firmado y sin vencer, pero apunta a nadie
      await verPerfil(login.accessToken).expect(401);
      await cambiar(
        {
          contrasenaActual: CUENTA_BORRADA.password,
          contrasenaNueva: CONTRASENA_NUEVA,
        },
        login.accessToken,
      ).expect(401);
    });
  });
});
