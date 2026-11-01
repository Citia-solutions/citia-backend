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
 * Perfil y suscripción de punta a punta (US-10, ADR-15 §1–§3; Definición de
 * Terminado, `test/perfil-usuario.e2e-spec.ts`):
 *
 *   GET   /api/usuarios/me              → 200 PerfilDto · 401
 *   PATCH /api/usuarios/me              → 200 PerfilDto · 400 · 401
 *   GET   /api/organizacion/suscripcion → 200 SuscripcionDto · 401 · 403
 *
 * Con los módulos REALES (`AuthModule` con su `JwtStrategy`, que consulta la
 * base en cada petición; `UsuariosModule`; `TenantModule`). Los usuarios se
 * crean con el registro y entran con el login reales.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize + dropSchema.
 */

interface RegistroBody {
  tenantSlug: string;
}

interface LoginBody {
  accessToken: string;
  usuario: {
    id: string;
    email: string;
    nombreCompleto: string;
    rol: string;
    tenantId: string;
    tenantSlug: string;
    tenantNombre: string;
  };
}

interface PerfilBody {
  id: string;
  email: string;
  nombreCompleto: string;
  especialidad: string | null;
  rol: string;
  tenantId: string;
  tenantSlug: string;
  tenantNombre: string;
  creadoEn: string;
}

interface SuscripcionBody {
  plan: string;
  planNombre: string;
  descripcion: string | null;
  altaEn: string;
  renovacionEn: string | null;
  metodoPago: string | null;
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

interface FilaUsuario {
  email: string;
  nombre_completo: string;
  especialidad: string | null;
  rol: string;
  tenant_id: string;
  actualizado_en: Date;
}

const CAMPOS_PERFIL = [
  'creadoEn',
  'email',
  'especialidad',
  'id',
  'nombreCompleto',
  'rol',
  'tenantId',
  'tenantNombre',
  'tenantSlug',
];

const CLINICA_A = {
  nombreTenant: 'Clínica Perfil E2E',
  email: 'dra.perfil@perfil-e2e.cl',
  password: 'password1234',
  nombreCompleto: 'Dra. Perfil E2E',
};
const CLINICA_B = {
  nombreTenant: 'Centro Otro Perfil E2E',
  email: 'dr.otro@perfil-e2e.cl',
  password: 'password5678',
  nombreCompleto: 'Dr. Otro Perfil',
};
const CLINICA_PROFESIONAL = {
  nombreTenant: 'Consulta Profesional E2E',
  email: 'profesional@perfil-e2e.cl',
  password: 'password9012',
  nombreCompleto: 'Profesional Sin Admin',
};

describe('Perfil y suscripción: /api/usuarios/me y /api/organizacion/suscripcion (e2e con Postgres)', () => {
  let app: INestApplication;
  let datos: DataSource;
  const server = (): App => app.getHttpServer() as App;

  /** Registra la organización y entra: devuelve el cuerpo del login. */
  const registrarYEntrar = async (
    cuenta: typeof CLINICA_A,
  ): Promise<LoginBody> => {
    const registro = await request(server())
      .post('/api/usuarios')
      .send(cuenta)
      .expect(201);
    const { tenantSlug } = registro.body as RegistroBody;
    return entrar(tenantSlug, cuenta);
  };

  const entrar = async (
    tenantSlug: string,
    cuenta: typeof CLINICA_A,
  ): Promise<LoginBody> => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ tenantSlug, email: cuenta.email, password: cuenta.password })
      .expect(200);
    return login.body as LoginBody;
  };

  const verPerfil = (token?: string) => {
    const peticion = request(server()).get('/api/usuarios/me');
    return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };

  const editarPerfil = (cuerpo: Record<string, unknown>, token?: string) => {
    const peticion = request(server()).patch('/api/usuarios/me');
    return (
      token ? peticion.set('Authorization', `Bearer ${token}`) : peticion
    ).send(cuerpo);
  };

  const verSuscripcion = (token?: string) => {
    const peticion = request(server()).get('/api/organizacion/suscripcion');
    return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };

  const filaUsuario = async (id: string): Promise<FilaUsuario> => {
    const [fila] = await datos.query<FilaUsuario[]>(
      `SELECT email, nombre_completo, especialidad, rol, tenant_id, actualizado_en
         FROM usuarios WHERE id = $1`,
      [id],
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
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET y PATCH /api/usuarios/me', () => {
    let sesionA: LoginBody;
    let sesionB: LoginBody;

    beforeAll(async () => {
      sesionA = await registrarYEntrar(CLINICA_A);
      sesionB = await registrarYEntrar(CLINICA_B);
    });

    it('debería devolver 200 con el perfil (los campos del login, especialidad null y creadoEn) cuando hay sesión', async () => {
      // Act
      const res = await verPerfil(sesionA.accessToken).expect(200);

      // Assert — exactamente estos campos: ni el hash ni el corte de sesiones
      const perfil = res.body as PerfilBody;
      expect(Object.keys(perfil).sort()).toEqual(CAMPOS_PERFIL);
      expect(perfil).toMatchObject({
        ...sesionA.usuario,
        especialidad: null,
        rol: 'ADMINISTRADOR',
        tenantSlug: 'clinica-perfil-e2e',
        tenantNombre: CLINICA_A.nombreTenant,
      });
      expect(new Date(perfil.creadoEn).toString()).not.toBe('Invalid Date');
    });

    it('debería devolver 401 cuando no hay token o el token no es válido', async () => {
      await verPerfil().expect(401);
      await verPerfil('no-es-un-jwt').expect(401);
      await editarPerfil({ nombreCompleto: 'Intruso' }).expect(401);
    });

    it('debería guardar nombre y especialidad recortados y el GET siguiente debería traerlos cuando el PATCH es válido', async () => {
      // Act
      const res = await editarPerfil(
        {
          nombreCompleto: '  Dra. Perfil Corregida  ',
          especialidad: '  Kinesiología  ',
        },
        sesionA.accessToken,
      ).expect(200);

      // Assert — la respuesta ya trae el perfil completo actualizado
      const perfil = res.body as PerfilBody;
      expect(Object.keys(perfil).sort()).toEqual(CAMPOS_PERFIL);
      expect(perfil).toMatchObject({
        nombreCompleto: 'Dra. Perfil Corregida',
        especialidad: 'Kinesiología',
        email: CLINICA_A.email,
        tenantSlug: 'clinica-perfil-e2e',
      });
      const siguiente = await verPerfil(sesionA.accessToken).expect(200);
      expect(siguiente.body).toEqual(perfil);
    });

    it('debería mostrar el nombre nuevo en el login siguiente (el sidebar lo toma de ahí)', async () => {
      const login = await entrar('clinica-perfil-e2e', CLINICA_A);

      expect(login.usuario.nombreCompleto).toBe('Dra. Perfil Corregida');
    });

    it('debería ignorar en silencio email, rol, tenantId y tenantSlug del cuerpo cuando llegan en el PATCH', async () => {
      // Act
      const res = await editarPerfil(
        {
          nombreCompleto: 'Dra. Perfil Corregida',
          email: 'otro@correo.cl',
          rol: 'PROFESIONAL',
          tenantId: sesionB.usuario.tenantId,
          tenantSlug: 'otro-slug',
          passwordHash: 'x',
        },
        sesionA.accessToken,
      ).expect(200);

      // Assert — ni la respuesta ni la base cambian esos campos
      const perfil = res.body as PerfilBody;
      expect(perfil).toMatchObject({
        email: CLINICA_A.email,
        rol: 'ADMINISTRADOR',
        tenantId: sesionA.usuario.tenantId,
        tenantSlug: 'clinica-perfil-e2e',
      });
      const fila = await filaUsuario(sesionA.usuario.id);
      expect(fila).toMatchObject({
        email: CLINICA_A.email,
        rol: 'ADMINISTRADOR',
        tenant_id: sesionA.usuario.tenantId,
      });
    });

    it.each<[string, Record<string, unknown>]>([
      ['un nombre en blanco', { nombreCompleto: '   ' }],
      ['un nombre null (no se borra)', { nombreCompleto: null }],
      ['un nombre de 121 caracteres', { nombreCompleto: 'n'.repeat(121) }],
      ['un nombre que no es texto', { nombreCompleto: 42 }],
      ['una especialidad de 101 caracteres', { especialidad: 'e'.repeat(101) }],
      [
        'un nombre válido con una especialidad de 101',
        { nombreCompleto: 'Otro Nombre', especialidad: 'e'.repeat(101) },
      ],
    ])(
      'debería responder 400 sin escribir nada cuando llega %s',
      async (_caso, cuerpo) => {
        // Arrange
        const antes = await filaUsuario(sesionA.usuario.id);

        // Act
        const res = await editarPerfil(cuerpo, sesionA.accessToken).expect(400);

        // Assert
        expect((res.body as ErrorBody).statusCode).toBe(400);
        expect(await filaUsuario(sesionA.usuario.id)).toEqual(antes);
      },
    );

    it('debería aceptar un nombre de 120 caracteres y una especialidad de 100', async () => {
      const res = await editarPerfil(
        { nombreCompleto: 'n'.repeat(120), especialidad: 'e'.repeat(100) },
        sesionA.accessToken,
      ).expect(200);

      expect(res.body).toMatchObject({
        nombreCompleto: 'n'.repeat(120),
        especialidad: 'e'.repeat(100),
      });
    });

    it.each<[string, unknown]>([
      ["''", ''],
      ['en blanco', '   '],
      ['null', null],
    ])(
      'debería borrar la especialidad (null) cuando llega %s',
      async (_caso, especialidad) => {
        // Arrange — con una especialidad puesta
        await editarPerfil(
          { especialidad: 'Fonoaudiología' },
          sesionA.accessToken,
        ).expect(200);

        // Act
        const res = await editarPerfil(
          { especialidad },
          sesionA.accessToken,
        ).expect(200);

        // Assert — en la respuesta y en la base (nunca '' por el CHECK)
        expect((res.body as PerfilBody).especialidad).toBeNull();
        expect((await filaUsuario(sesionA.usuario.id)).especialidad).toBeNull();
      },
    );

    it('debería cambiar solo la especialidad y no tocar el nombre cuando el nombre no viene', async () => {
      // Arrange
      await editarPerfil(
        { nombreCompleto: 'Dra. Solo Nombre' },
        sesionA.accessToken,
      ).expect(200);

      // Act
      const res = await editarPerfil(
        { especialidad: 'Nutrición' },
        sesionA.accessToken,
      ).expect(200);

      // Assert
      expect(res.body).toMatchObject({
        nombreCompleto: 'Dra. Solo Nombre',
        especialidad: 'Nutrición',
      });
    });

    it('debería responder 200 con el perfil actual sin escribir cuando el PATCH viene vacío', async () => {
      // Arrange
      const antes = await filaUsuario(sesionA.usuario.id);
      const perfilAntes = (await verPerfil(sesionA.accessToken).expect(200))
        .body as PerfilBody;

      // Act — vacío, o solo con campos que el whitelist descarta
      const vacio = await editarPerfil({}, sesionA.accessToken).expect(200);
      const soloDescartados = await editarPerfil(
        { email: 'x@y.cl' },
        sesionA.accessToken,
      ).expect(200);

      // Assert — mismo perfil y `actualizado_en` intacto (no hubo UPDATE)
      expect(vacio.body).toEqual(perfilAntes);
      expect(soloDescartados.body).toEqual(perfilAntes);
      expect(await filaUsuario(sesionA.usuario.id)).toEqual(antes);
    });

    it('debería devolver a cada sesión su propio perfil y no tocar el de otra organización', async () => {
      // Act
      await editarPerfil(
        { nombreCompleto: 'Dr. Otro Editado', especialidad: 'Pediatría' },
        sesionB.accessToken,
      ).expect(200);
      const perfilA = (await verPerfil(sesionA.accessToken).expect(200))
        .body as PerfilBody;
      const perfilB = (await verPerfil(sesionB.accessToken).expect(200))
        .body as PerfilBody;

      // Assert
      expect(perfilB).toMatchObject({
        id: sesionB.usuario.id,
        email: CLINICA_B.email,
        nombreCompleto: 'Dr. Otro Editado',
        especialidad: 'Pediatría',
        tenantNombre: CLINICA_B.nombreTenant,
      });
      expect(perfilA).toMatchObject({
        id: sesionA.usuario.id,
        nombreCompleto: 'Dra. Solo Nombre',
        especialidad: 'Nutrición',
        tenantNombre: CLINICA_A.nombreTenant,
      });
    });
  });

  describe('GET /api/organizacion/suscripcion', () => {
    it('debería devolver 200 al ADMINISTRADOR con el plan piloto, su alta y renovación y método de pago en null', async () => {
      // Arrange
      const sesion = await entrar('clinica-perfil-e2e', CLINICA_A);
      const [tenant] = await datos.query<{ creado_en: Date }[]>(
        'SELECT creado_en FROM tenants WHERE id = $1',
        [sesion.usuario.tenantId],
      );

      // Act
      const res = await verSuscripcion(sesion.accessToken).expect(200);

      // Assert
      const suscripcion = res.body as SuscripcionBody;
      expect(Object.keys(suscripcion).sort()).toEqual([
        'altaEn',
        'descripcion',
        'metodoPago',
        'plan',
        'planNombre',
        'renovacionEn',
      ]);
      expect(suscripcion).toEqual({
        plan: 'free',
        planNombre: 'Plan piloto',
        descripcion: 'Sin cobro durante el piloto',
        altaEn: new Date(tenant.creado_en).toISOString(),
        renovacionEn: null,
        metodoPago: null,
      });
    });

    it('debería devolver 401 sin token', async () => {
      await verSuscripcion().expect(401);
    });

    it('debería devolver 403 a un usuario pasado a PROFESIONAL por SQL que inicia sesión de nuevo', async () => {
      // Arrange — todo usuario nace ADMINISTRADOR (DT-07): se baja por SQL
      const admin = await registrarYEntrar(CLINICA_PROFESIONAL);
      await datos.query(
        `UPDATE usuarios SET rol = 'PROFESIONAL' WHERE id = $1`,
        [admin.usuario.id],
      );
      const profesional = await entrar(
        admin.usuario.tenantSlug,
        CLINICA_PROFESIONAL,
      );
      expect(profesional.usuario.rol).toBe('PROFESIONAL');

      // Act
      const res = await verSuscripcion(profesional.accessToken).expect(403);

      // Assert — con su mensaje, y el perfil le sigue sirviendo
      expect(res.body).toMatchObject({
        statusCode: 403,
        message:
          'Solo el administrador de la organización puede ver la suscripción',
      });
      const perfil = await verPerfil(profesional.accessToken).expect(200);
      expect((perfil.body as PerfilBody).rol).toBe('PROFESIONAL');
      // El rol sale del TOKEN (ADR-15, Consecuencias): el token emitido antes
      // del cambio de rol todavía dice ADMINISTRADOR.
      await verSuscripcion(admin.accessToken).expect(200);
    });
  });
});
