import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import { AuthModule } from '../auth/auth.module';
import { ConsultarSuscripcionService } from '../tenant/application/consultar-suscripcion.service';
import { Tenant, TipoTenant } from '../tenant/domain/tenant.entity';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { CambiarContrasenaService } from './application/cambiar-contrasena.service';
import { PerfilService } from './application/perfil.service';
import { EmisorSesion } from './domain/emisor-sesion';
import { RolUsuario, Usuario } from './domain/usuario.entity';
import {
  CambioContrasena,
  CambiosPerfil,
  EstadoSesionUsuario,
  IUsuarioRepository,
} from './domain/usuario.repository';

/**
 * Cableado de US-10 SIN base (ADR-15 §6 y §9): arma el `AuthModule` real, que
 * importa `UsuariosModule`, `TenantModule` y `FirmaJwtModule`, con un
 * `DataSource` falso y los puertos en memoria. Comprueba que no hay ciclo ni
 * proveedores faltantes, y el contrato HTTP de las cuatro rutas con el guard,
 * la estrategia asíncrona, el `ValidationPipe` global, bcrypt y el JWT reales.
 *
 * Las e2e con Postgres (`test/perfil-usuario`, `test/cambio-contrasena`) son
 * del paso 5; esto no las reemplaza.
 */

const SECRETO = 'secreto-de-prueba-us10';
const ACTUAL = 'actual-segura';
const NUEVA = 'nueva-segura';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';

/** El `DataSource` mínimo para que `TypeOrmModule.forFeature` arme sus repos. */
@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken(),
      useValue: {
        entityMetadatas: [],
        options: { type: 'postgres' },
        getRepository: () => ({}),
      },
    },
  ],
  exports: [getDataSourceToken()],
})
class BaseFalsaModule {}

class UsuariosEnMemoria extends IUsuarioRepository {
  readonly filas = new Map<string, Usuario>();

  findByEmailAndTenant(): Promise<Usuario | null> {
    return Promise.resolve(null);
  }

  guardar(): Promise<Usuario> {
    return Promise.reject(new Error('no se usa'));
  }

  findById(id: string, tenantId: string): Promise<Usuario | null> {
    const u = this.filas.get(id);
    return Promise.resolve(u && u.tenantId === tenantId ? copia(u) : null);
  }

  actualizarPerfil(
    id: string,
    tenantId: string,
    cambios: CambiosPerfil,
  ): Promise<Usuario | null> {
    const u = this.filas.get(id);
    if (!u || u.tenantId !== tenantId) return Promise.resolve(null);
    if (cambios.nombreCompleto !== undefined)
      u.nombreCompleto = cambios.nombreCompleto;
    if (cambios.especialidad !== undefined)
      u.especialidad = cambios.especialidad;
    return Promise.resolve(copia(u));
  }

  cambiarContrasena(
    id: string,
    tenantId: string,
    cambio: CambioContrasena,
  ): Promise<boolean> {
    const u = this.filas.get(id);
    if (!u || u.tenantId !== tenantId) return Promise.resolve(false);
    if (u.passwordHash !== cambio.hashAnterior) return Promise.resolve(false);
    u.passwordHash = cambio.hashNuevo;
    u.sesionesValidasDesde = cambio.sesionesValidasDesde;
    return Promise.resolve(true);
  }

  estadoSesion(
    id: string,
    tenantId: string,
  ): Promise<EstadoSesionUsuario | null> {
    const u = this.filas.get(id);
    return Promise.resolve(
      u && u.tenantId === tenantId
        ? { sesionesValidasDesde: u.sesionesValidasDesde }
        : null,
    );
  }
}

function copia(u: Usuario): Usuario {
  const c = new Usuario();
  Object.assign(c, u);
  c.passwordHash = u.passwordHash;
  return c;
}

function usuario(rol: RolUsuario, hash: string): Usuario {
  const u = new Usuario();
  u.id = USUARIO_ID;
  u.email = 'ana@clinica.cl';
  u.passwordHash = hash;
  u.nombreCompleto = 'Ana Pérez';
  u.especialidad = null;
  u.rol = rol;
  u.tenantId = TENANT_ID;
  u.sesionesValidasDesde = null;
  u.creadoEn = new Date('2026-06-22T12:00:00Z');
  u.actualizadoEn = new Date('2026-06-22T12:00:00Z');
  return u;
}

function tenant(): Tenant {
  const t = new Tenant();
  t.id = TENANT_ID;
  t.nombre = 'Clínica Demo';
  t.slug = 'clinica-demo';
  t.tipo = TipoTenant.CLINICA;
  t.plan = 'free';
  t.creadoEn = new Date('2026-06-22T11:00:00Z');
  return t;
}

interface PerfilBody {
  id: string;
  email: string;
  nombreCompleto: string;
  especialidad: string | null;
  tenantSlug: string;
  tenantNombre: string;
}

describe('UsuariosModule + TenantModule: cableado y contrato HTTP de US-10 (sin base)', () => {
  let app: INestApplication;
  let usuarios: UsuariosEnMemoria;
  let hashActual: string;
  const server = (): App => app.getHttpServer() as App;

  /** Token de una sesión emitida hace `segundos` (antes de cualquier corte). */
  const tokenDeHace = (segundos: number, rol = RolUsuario.ADMINISTRADOR) =>
    app
      .get(EmisorSesion)
      .emitir(
        { id: USUARIO_ID, email: 'ana@clinica.cl', tenantId: TENANT_ID, rol },
        new Date(Math.floor(Date.now() / 1000 - segundos) * 1000),
      );

  beforeAll(async () => {
    hashActual = await bcrypt.hash(ACTUAL, 4);
  });

  beforeEach(async () => {
    usuarios = new UsuariosEnMemoria();
    usuarios.filas.set(
      USUARIO_ID,
      usuario(RolUsuario.ADMINISTRADOR, hashActual),
    );
    const tenants = {
      guardar: jest.fn(),
      findBySlug: jest.fn(),
      findById: jest.fn((id: string) =>
        Promise.resolve(id === TENANT_ID ? tenant() : null),
      ),
    };

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: SECRETO, JWT_EXPIRES_IN: '1h' })],
        }),
        BaseFalsaModule,
        AuthModule,
      ],
    })
      .overrideProvider(IUsuarioRepository)
      .useValue(usuarios)
      .overrideProvider(ITenantRepository)
      .useValue(tenants)
      .overrideProvider(TransactionRunner)
      .useValue({
        run: (work: (tx: unknown) => Promise<unknown>) => work(undefined),
      })
      .compile();

    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('resuelve los casos de uso nuevos sin ciclo (AuthModule → UsuariosModule → FirmaJwtModule)', () => {
    expect(app.get(PerfilService)).toBeInstanceOf(PerfilService);
    expect(app.get(CambiarContrasenaService)).toBeInstanceOf(
      CambiarContrasenaService,
    );
    expect(app.get(ConsultarSuscripcionService)).toBeInstanceOf(
      ConsultarSuscripcionService,
    );
  });

  describe('GET /api/usuarios/me', () => {
    it('sin token → 401', async () => {
      await request(server()).get('/api/usuarios/me').expect(401);
    });

    it('con token → 200 con la organización, sin el hash', async () => {
      // Act
      const res = await request(server())
        .get('/api/usuarios/me')
        .set('Authorization', `Bearer ${tokenDeHace(5)}`)
        .expect(200);

      // Assert
      const body = res.body as PerfilBody;
      expect(body).toMatchObject({
        id: USUARIO_ID,
        email: 'ana@clinica.cl',
        nombreCompleto: 'Ana Pérez',
        especialidad: null,
        rol: 'ADMINISTRADOR',
        tenantId: TENANT_ID,
        tenantSlug: 'clinica-demo',
        tenantNombre: 'Clínica Demo',
      });
      expect(JSON.stringify(body)).not.toContain(hashActual);
      expect(body).not.toHaveProperty('sesionesValidasDesde');
    });
  });

  describe('PATCH /api/usuarios/me', () => {
    it('cambia nombre y especialidad; el correo del cuerpo se ignora', async () => {
      // Act
      const res = await request(server())
        .patch('/api/usuarios/me')
        .set('Authorization', `Bearer ${tokenDeHace(5)}`)
        .send({
          nombreCompleto: '  Ana María Pérez  ',
          especialidad: ' Kinesiología ',
          email: 'otro@correo.cl',
          rol: 'PROFESIONAL',
        })
        .expect(200);

      // Assert
      expect(res.body).toMatchObject({
        nombreCompleto: 'Ana María Pérez',
        especialidad: 'Kinesiología',
        email: 'ana@clinica.cl',
        rol: 'ADMINISTRADOR',
      });
    });

    it("especialidad '' la borra (null)", async () => {
      // Arrange
      usuarios.filas.get(USUARIO_ID)!.especialidad = 'Kinesiología';

      // Act
      const res = await request(server())
        .patch('/api/usuarios/me')
        .set('Authorization', `Bearer ${tokenDeHace(5)}`)
        .send({ especialidad: '' })
        .expect(200);

      // Assert
      expect((res.body as PerfilBody).especialidad).toBeNull();
    });

    it.each([
      { nombreCompleto: '   ' },
      { nombreCompleto: null },
      { especialidad: 'e'.repeat(101) },
    ])('%p → 400', async (cuerpo) => {
      await request(server())
        .patch('/api/usuarios/me')
        .set('Authorization', `Bearer ${tokenDeHace(5)}`)
        .send(cuerpo)
        .expect(400);
    });
  });

  describe('PUT /api/usuarios/me/contrasena', () => {
    it('actual incorrecta → 400 (no 401) y la sesión sigue sirviendo', async () => {
      // Arrange
      const token = tokenDeHace(5);

      // Act
      const res = await request(server())
        .put('/api/usuarios/me/contrasena')
        .set('Authorization', `Bearer ${token}`)
        .send({ contrasenaActual: 'no-es-esta', contrasenaNueva: NUEVA })
        .expect(400);

      // Assert
      expect((res.body as { message: string }).message).toBe(
        'La contraseña actual no es correcta',
      );
      await request(server())
        .get('/api/usuarios/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it.each([
      [{ contrasenaActual: ACTUAL, contrasenaNueva: '1234567' }],
      [{ contrasenaActual: ACTUAL, contrasenaNueva: ACTUAL }],
      [{ contrasenaActual: ACTUAL, contrasenaNueva: 'ñ'.repeat(37) }],
    ])('%p → 400', async (cuerpo) => {
      await request(server())
        .put('/api/usuarios/me/contrasena')
        .set('Authorization', `Bearer ${tokenDeHace(5)}`)
        .send(cuerpo)
        .expect(400);
    });

    it('200 con un token nuevo: el viejo (y el de otra sesión) da 401 y el nuevo 200', async () => {
      // Arrange — dos sesiones anteriores al cambio
      const sesionA = tokenDeHace(5);
      const sesionB = tokenDeHace(10);

      // Act
      const res = await request(server())
        .put('/api/usuarios/me/contrasena')
        .set('Authorization', `Bearer ${sesionA}`)
        .send({ contrasenaActual: ACTUAL, contrasenaNueva: NUEVA })
        .expect(200);

      // Assert
      const { accessToken } = res.body as { accessToken: string };
      expect(typeof accessToken).toBe('string');
      for (const viejo of [sesionA, sesionB]) {
        await request(server())
          .get('/api/usuarios/me')
          .set('Authorization', `Bearer ${viejo}`)
          .expect(401);
      }
      await request(server())
        .get('/api/usuarios/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const guardado = usuarios.filas.get(USUARIO_ID)!;
      expect(await bcrypt.compare(NUEVA, guardado.passwordHash)).toBe(true);
      expect(guardado.sesionesValidasDesde!.getTime() % 1000).toBe(0);
    });
  });

  describe('GET /api/organizacion/suscripcion', () => {
    it('ADMINISTRADOR → 200 con el plan legible', async () => {
      // Act
      const res = await request(server())
        .get('/api/organizacion/suscripcion')
        .set('Authorization', `Bearer ${tokenDeHace(5)}`)
        .expect(200);

      // Assert
      expect(res.body).toEqual({
        plan: 'free',
        planNombre: 'Plan piloto',
        descripcion: 'Sin cobro durante el piloto',
        altaEn: '2026-06-22T11:00:00.000Z',
        renovacionEn: null,
        metodoPago: null,
      });
    });

    it('PROFESIONAL → 403', async () => {
      await request(server())
        .get('/api/organizacion/suscripcion')
        .set(
          'Authorization',
          `Bearer ${tokenDeHace(5, RolUsuario.PROFESIONAL)}`,
        )
        .expect(403);
    });

    it('sin token → 401', async () => {
      await request(server()).get('/api/organizacion/suscripcion').expect(401);
    });
  });
});
