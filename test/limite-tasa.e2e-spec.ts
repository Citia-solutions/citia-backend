import {
  Controller,
  DynamicModule,
  Get,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthService } from '../src/modules/auth/application/auth.service';
import { CredencialesInvalidasError } from '../src/modules/auth/domain/exceptions/credenciales-invalidas.error';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { AuthController } from '../src/modules/auth/presentation/auth.controller';
import { EnlaceCitaNoValidoError } from '../src/modules/cita/application/enlace-cita-no-valido.error';
import { EstadoCita } from '../src/modules/cita/domain/cita.entity';
import { AccionNoDisponibleError } from '../src/modules/portal-paciente/application/accion-no-disponible.error';
import { PortalPacienteService } from '../src/modules/portal-paciente/application/portal-paciente.service';
import { VistaCitaPacienteDto } from '../src/modules/portal-paciente/presentation/dto/vista-cita-paciente.dto';
import { PortalPacienteController } from '../src/modules/portal-paciente/presentation/portal-paciente.controller';
import { SolicitudesService } from '../src/modules/solicitud/application/solicitudes.service';
import { SolicitudesPublicasController } from '../src/modules/solicitud/presentation/solicitudes-publicas.controller';
import { RegistrarMensajeSoporteService } from '../src/modules/soporte/application/registrar-mensaje-soporte.service';
import {
  CategoriaSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../src/modules/soporte/domain/mensaje-soporte.entity';
import { SoporteController } from '../src/modules/soporte/presentation/soporte.controller';
import { CambiarContrasenaService } from '../src/modules/usuario/application/cambiar-contrasena.service';
import { PerfilService } from '../src/modules/usuario/application/perfil.service';
import { UsuariosService } from '../src/modules/usuario/application/usuarios.service';
import { RolUsuario } from '../src/modules/usuario/domain/usuario.entity';
import { PerfilController } from '../src/modules/usuario/presentation/perfil.controller';
import { UsuariosController } from '../src/modules/usuario/presentation/usuarios.controller';
import { validarEntorno } from '../src/shared/infrastructure/config/entorno';
import {
  crearOpcionesCors,
  crearPoliticaCors,
} from '../src/shared/infrastructure/config/origenes-cors';
import { MENSAJE_LIMITE_TASA } from '../src/shared/infrastructure/limite-tasa/opciones-limite-tasa';
import { LimiteTasaModule } from '../src/shared/limite-tasa.module';
import { SESION_VIGENTE_FALSA } from './support/sesion-vigente-falsa';

/**
 * Límite de tasa (contrato de la Fase 3 §6), cabeceras de las respuestas
 * públicas y CORS de `X-Enlace-Cita`, con peticiones HTTP reales.
 *
 * SIN base de datos: TODOS los controllers son los REALES, con sus
 * `@LimitarTasa`, `@SinCacheNiReferrer` y su traducción de errores (login,
 * registro, solicitud pública y `PortalPacienteController`); solo sus
 * servicios son dobles. El doble del portal responde como el real: 404
 * (`EnlaceCitaNoValidoError`) para todo token sin el formato de 43
 * caracteres base64url o sin cabecera, 409 (`AccionNoDisponibleError`) para
 * `TOKEN_CONFLICTO` al confirmar, y la vista en lo demás.
 *
 * US-10 (ADR-15 §8): también `PerfilController` (cubo `cambioContrasena`) y
 * `SoporteController` (cubo `soporte`), que exigen sesión: van con la
 * `JwtStrategy` REAL y el doble `SESION_VIGENTE_FALSA` (sin él, el guard
 * respondería 500 y no 401), y con tokens firmados con el secreto de prueba.
 *
 * `LIMITE_TASA_ACTIVO=true` explícito (en `NODE_ENV=test` viene apagado). Las
 * IP de cada caso son distintas (`X-Forwarded-For` + `trust proxy`, como en
 * `main.ts`), así cada caso tiene sus contadores.
 */

const ORIGEN_FRONTEND = 'https://app.citia.cl';
const JWT_SECRET_PRUEBA = 'test-secret-e2e';
const TOKEN_VALIDO = 'v'.repeat(43);
const TOKEN_CONFLICTO = 'c'.repeat(43);
const token = (n: number): string => `${n}`.padStart(43, 't');

const vista = (estado: EstadoCita): VistaCitaPacienteDto =>
  new VistaCitaPacienteDto({
    inicio: '2026-10-20T13:00:00.000Z',
    zonaHoraria: 'America/Santiago',
    duracionMin: 45,
    estado,
    profesional: 'Dra. Límite',
    organizacion: 'Clínica Límite',
    accionesPermitidas: [],
    solicitudOtraHora: null,
  });

/** El portal del paciente sin base de datos: mismas respuestas que el real. */
const portalFalso = (): Pick<
  PortalPacienteService,
  'ver' | 'confirmar' | 'cancelar' | 'pedirOtraHora'
> => {
  const enlace = (t: unknown): Promise<void> =>
    typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
      ? Promise.resolve()
      : Promise.reject(new EnlaceCitaNoValidoError());
  return {
    ver: (t) => enlace(t).then(() => vista(EstadoCita.PENDIENTE)),
    confirmar: (t) =>
      enlace(t).then(() => {
        if (t === TOKEN_CONFLICTO) throw new AccionNoDisponibleError();
        return vista(EstadoCita.CONFIRMADA);
      }),
    cancelar: (t) => enlace(t).then(() => vista(EstadoCita.CANCELADA)),
    pedirOtraHora: (t) => enlace(t).then(() => vista(EstadoCita.PENDIENTE)),
  };
};

/** El usuario de los tokens de prueba (no existe en ninguna base). */
const SESION = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'profesional@clinica.cl',
  tenantId: '22222222-2222-4222-8222-222222222222',
  rol: RolUsuario.ADMINISTRADOR,
};

/** Lo que devolvería el registro real de un mensaje a soporte. */
const mensajeSoporte = (): MensajeSoporte =>
  MensajeSoporte.reconstituir({
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: SESION.tenantId,
    usuarioId: SESION.sub,
    categoria: CategoriaSoporte.OTRO,
    mensaje: 'Hola',
    estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
    intentos: 0,
    proximoIntentoEn: new Date('2026-11-01T12:00:00Z'),
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    creadoEn: new Date('2026-11-01T12:00:00Z'),
  });

/** `ConfigService` con el entorno validado, sin `.env` ni `process.env`. */
@Module({})
class ConfiguracionDePrueba {
  static con(limiteTasaActivo: boolean): DynamicModule {
    const entorno = validarEntorno({
      NODE_ENV: 'test',
      JWT_SECRET: JWT_SECRET_PRUEBA,
      LIMITE_TASA_ACTIVO: String(limiteTasaActivo),
    });
    return {
      module: ConfiguracionDePrueba,
      global: true,
      providers: [
        { provide: ConfigService, useValue: new ConfigService(entorno) },
      ],
      exports: [ConfigService],
    };
  }
}

/** Una ruta sin `@LimitarTasa`: el guard global no la limita. */
@Controller('libre')
class LibreController {
  @Get()
  ver(): { ok: boolean } {
    return { ok: true };
  }
}

async function crearApp(
  limiteTasaActivo: boolean,
): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionDePrueba.con(limiteTasaActivo),
      LimiteTasaModule,
      // US-10: rutas con sesión (JwtStrategy real; firma de los tokens).
      PassportModule,
      JwtModule.register({ secret: JWT_SECRET_PRUEBA }),
    ],
    controllers: [
      AuthController,
      UsuariosController,
      SolicitudesPublicasController,
      PortalPacienteController,
      PerfilController,
      SoporteController,
      LibreController,
    ],
    providers: [
      JwtStrategy,
      // La estrategia pregunta si la sesión sigue vigente: este doble dice que
      // sí (el usuario del token no existe en ninguna base).
      SESION_VIGENTE_FALSA,
      JwtAuthGuard,
      {
        provide: PerfilService,
        useValue: { obtener: () => Promise.resolve({ id: SESION.sub }) },
      },
      {
        provide: CambiarContrasenaService,
        useValue: {
          cambiar: () => Promise.resolve({ accessToken: 'token-nuevo' }),
        },
      },
      {
        provide: RegistrarMensajeSoporteService,
        useValue: { registrar: () => Promise.resolve(mensajeSoporte()) },
      },
      { provide: PortalPacienteService, useValue: portalFalso() },
      {
        provide: AuthService,
        useValue: {
          login: () => Promise.reject(new CredencialesInvalidasError()),
        },
      },
      {
        provide: UsuariosService,
        useValue: { registrar: () => Promise.resolve({ id: 'u-1' }) },
      },
      {
        provide: SolicitudesService,
        useValue: { recibir: () => Promise.resolve() },
      },
    ],
  }).compile();

  // Igual que src/main.ts.
  const app = modulo.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.enableCors(crearOpcionesCors(crearPoliticaCors(ORIGEN_FRONTEND)));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

const LOGIN = {
  tenantSlug: 'clinica',
  email: 'profesional@clinica.cl',
  password: 'clave-equivocada',
};
const REGISTRO = {
  nombreTenant: 'Clínica Límite',
  email: 'nueva@clinica.cl',
  password: 'clave-larga-123',
  nombreCompleto: 'Dra. Límite',
};
const SOLICITUD = {
  rut: '11.111.111-1',
  nombrePaciente: 'Paciente Prueba',
  telefono: '+56 9 1111 1111',
  correo: 'paciente@correo.cl',
  motivo: 'Control',
  preferenciaHoraria: 'mañanas',
  consentimiento: true,
};

/** Cabeceras que contarían el límite o el tiempo restante. */
const cabecerasDeLimite = (res: request.Response): string[] =>
  Object.keys(res.headers).filter((h) => /ratelimit|retry-after/i.test(h));

describe('Límite de tasa, cabeceras públicas y CORS (e2e sin BD)', () => {
  describe('con LIMITE_TASA_ACTIVO=true', () => {
    let app: NestExpressApplication;
    const server = (): App => app.getHttpServer();
    const desde = (ip: string) => ({
      get: (ruta: string) =>
        request(server()).get(ruta).set('X-Forwarded-For', ip),
      post: (ruta: string) =>
        request(server()).post(ruta).set('X-Forwarded-For', ip),
    });

    beforeAll(async () => {
      app = await crearApp(true);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('POST /api/auth/login: 5 por minuto por IP, también fallidos; el 6.º recibe 429 genérico', async () => {
      // Arrange
      const cliente = desde('203.0.113.1');

      // Act — 5 intentos fallidos pasan (401)…
      for (let i = 0; i < 5; i++) {
        await cliente.post('/api/auth/login').send(LOGIN).expect(401);
      }
      // …y el 6.º ya no llega al controller
      const bloqueado = await cliente
        .post('/api/auth/login')
        .send(LOGIN)
        .expect(429);

      // Assert — sin detalles: ni el límite, ni cuánto falta, ni de qué regla
      expect(bloqueado.body).toEqual({
        statusCode: 429,
        message: MENSAJE_LIMITE_TASA,
      });
      expect(cabecerasDeLimite(bloqueado)).toEqual([]);
      // Otra IP tiene su propio contador
      await desde('203.0.113.2')
        .post('/api/auth/login')
        .send(LOGIN)
        .expect(401);
    });

    it('trust proxy = 1: cuenta la IP que agrega el proxy (la última de X-Forwarded-For); falsificar las anteriores no evade el límite', async () => {
      // Arrange — el cliente inventa una IP distinta en cada intento; el proxy
      // de Railway agrega la real al final
      const intento = (falsa: string) =>
        request(server())
          .post('/api/auth/login')
          .set('X-Forwarded-For', `${falsa}, 203.0.113.77`)
          .send(LOGIN);

      // Act
      for (let i = 0; i < 5; i++) {
        await intento(`10.0.0.${i}`).expect(401);
      }

      // Assert
      await intento('10.9.9.9').expect(429);
    });

    it('POST /api/usuarios: 5 por hora por IP', async () => {
      const cliente = desde('203.0.113.10');
      for (let i = 0; i < 5; i++) {
        await cliente.post('/api/usuarios').send(REGISTRO).expect(201);
      }
      await cliente.post('/api/usuarios').send(REGISTRO).expect(429);
    });

    it('POST /api/publico/:tenantSlug/solicitudes: 5 por hora por IP, un contador para todas las organizaciones', async () => {
      const cliente = desde('203.0.113.20');
      for (const slug of ['clinica-a', 'clinica-b', 'clinica-a', 'otra', 'x']) {
        await cliente
          .post(`/api/publico/${slug}/solicitudes`)
          .send(SOLICITUD)
          .expect(202);
      }
      await cliente
        .post('/api/publico/clinica-nueva/solicitudes')
        .send(SOLICITUD)
        .expect(429);
    });

    describe('portal del paciente (PortalPacienteController real)', () => {
      /** Las tres acciones, con un cuerpo válido para cada una. */
      const ACCIONES: [string, object, number][] = [
        ['confirmar', {}, 200],
        ['cancelar', { motivo: 'no puedo' }, 200],
        ['otra-hora', { preferencia: 'tardes' }, 201],
      ];

      it('POST: 5 por hora POR ENLACE, sumando las TRES acciones; el 6.º recibe 429 genérico', async () => {
        // Arrange
        const cliente = desde('198.51.100.1');
        const accion = (i: number, enlace: string) => {
          const [ruta, cuerpo] = ACCIONES[i % ACCIONES.length];
          return cliente
            .post(`/api/publico/cita/${ruta}`)
            .set('X-Enlace-Cita', enlace)
            .send(cuerpo);
        };

        // Act — confirmar, cancelar, otra-hora, confirmar, cancelar: un contador
        for (let i = 0; i < 5; i++) {
          await accion(i, token(1)).expect(ACCIONES[i % ACCIONES.length][2]);
        }

        // Assert — la 6.ª (otra-hora) ya no llega al controller
        const bloqueado = await accion(5, token(1)).expect(429);
        expect(bloqueado.body).toEqual({
          statusCode: 429,
          message: MENSAJE_LIMITE_TASA,
        });
        expect(cabecerasDeLimite(bloqueado)).toEqual([]);
        // Las tres rutas quedan bloqueadas para ese enlace
        for (let i = 0; i < ACCIONES.length; i++) {
          await accion(i, token(1)).expect(429);
        }
        // Otro enlace desde la misma IP: su propio contador
        await accion(0, token(2)).expect(200);
        // El GET no lleva el límite por enlace
        await cliente
          .get('/api/publico/cita')
          .set('X-Enlace-Cita', token(1))
          .expect(200);
      });

      it('el mismo enlace desde otra IP sigue bloqueado (la clave es el enlace)', async () => {
        const conEnlace = (ip: string) =>
          desde(ip)
            .post('/api/publico/cita/confirmar')
            .set('X-Enlace-Cita', token(3));
        for (let i = 0; i < 5; i++) {
          await conEnlace(`198.51.100.${10 + i}`).expect(200);
        }
        await conEnlace('198.51.100.20').expect(429);
      });

      it('POST sin X-Enlace-Cita: 404 uniforme, y el contador por enlace cae a la IP', async () => {
        const cliente = desde('198.51.100.30');
        for (let i = 0; i < 5; i++) {
          const res = await cliente
            .post('/api/publico/cita/confirmar')
            .expect(404);
          expect(res.body).toEqual({
            statusCode: 404,
            message: 'Enlace no válido o vencido',
          });
        }
        await cliente.post('/api/publico/cita/confirmar').expect(429);
        await cliente
          .post('/api/publico/cita/confirmar')
          .set('X-Enlace-Cita', token(4))
          .expect(200);
      });

      it('un enlace con formato inválido cuenta igual: 5 intentos y 429 (sin bloqueo por fallos, solo por peticiones)', async () => {
        const cliente = desde('198.51.100.31');
        for (let i = 0; i < 5; i++) {
          await cliente
            .post('/api/publico/cita/cancelar')
            .set('X-Enlace-Cita', 'no-es-un-token')
            .send({})
            .expect(404);
        }
        await cliente
          .post('/api/publico/cita/cancelar')
          .set('X-Enlace-Cita', 'no-es-un-token')
          .send({})
          .expect(429);
      });

      it('todo /api/publico/cita*: 30 por minuto por IP, GET y POST juntos, también los 404', async () => {
        // Arrange
        const cliente = desde('198.51.100.40');

        // Act — 20 GET válidos, 5 GET con enlace inválido (404) y 5 POST con
        // enlaces distintos (sin tocar el límite por enlace): 30 en total
        for (let i = 0; i < 20; i++) {
          await cliente
            .get('/api/publico/cita')
            .set('X-Enlace-Cita', TOKEN_VALIDO)
            .expect(200);
        }
        for (let i = 0; i < 5; i++) {
          await cliente.get('/api/publico/cita').expect(404);
        }
        for (let i = 0; i < 5; i++) {
          await cliente
            .post('/api/publico/cita/confirmar')
            .set('X-Enlace-Cita', token(100 + i))
            .expect(200);
        }

        // Assert
        const bloqueado = await cliente
          .get('/api/publico/cita')
          .set('X-Enlace-Cita', TOKEN_VALIDO)
          .expect(429);
        expect(bloqueado.body).toEqual({
          statusCode: 429,
          message: MENSAJE_LIMITE_TASA,
        });
        for (const [ruta, cuerpo] of ACCIONES) {
          await cliente
            .post(`/api/publico/cita/${ruta}`)
            .set('X-Enlace-Cita', token(200))
            .send(cuerpo)
            .expect(429);
        }
        await desde('198.51.100.41')
          .get('/api/publico/cita')
          .set('X-Enlace-Cita', TOKEN_VALIDO)
          .expect(200);
      });

      it('respuestas con Cache-Control: no-store y Referrer-Policy: no-referrer: 200, 201, 400, 404 y 409', async () => {
        const cliente = desde('198.51.100.50');
        const conEnlace = (ruta: string, enlace: string, cuerpo: object = {}) =>
          cliente
            .post(`/api/publico/cita/${ruta}`)
            .set('X-Enlace-Cita', enlace)
            .send(cuerpo);

        const respuestas = [
          await cliente
            .get('/api/publico/cita')
            .set('X-Enlace-Cita', TOKEN_VALIDO)
            .expect(200),
          await cliente.get('/api/publico/cita').expect(404),
          await conEnlace('confirmar', token(300)).expect(200),
          await conEnlace('cancelar', token(301), { motivo: 'x' }).expect(200),
          await conEnlace('otra-hora', token(302), {
            preferencia: 'tardes',
          }).expect(201),
          await conEnlace('otra-hora', token(303), { preferencia: '' }).expect(
            400,
          ),
          await conEnlace('confirmar', 'corto').expect(404),
          await conEnlace('confirmar', TOKEN_CONFLICTO).expect(409),
        ];

        for (const res of respuestas) {
          expect(res.headers['cache-control']).toBe('no-store');
          expect(res.headers['referrer-policy']).toBe('no-referrer');
        }
        // Cuerpos fijos del controller real
        expect(respuestas[1].body).toEqual({
          statusCode: 404,
          message: 'Enlace no válido o vencido',
        });
        expect(respuestas[6].text).toBe(respuestas[1].text);
        expect(respuestas[7].body).toEqual({
          statusCode: 409,
          message: 'Esta acción ya no está disponible',
        });
      });

      it('CORS: el preflight del frontend permite X-Enlace-Cita y no consume el límite', async () => {
        const cliente = desde('198.51.100.60');

        for (let i = 0; i < 35; i++) {
          const res = await request(server())
            .options('/api/publico/cita/confirmar')
            .set('X-Forwarded-For', '198.51.100.60')
            .set('Origin', ORIGEN_FRONTEND)
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,x-enlace-cita')
            .expect(204);
          expect(res.headers['access-control-allow-origin']).toBe(
            ORIGEN_FRONTEND,
          );
          expect(
            res.headers['access-control-allow-headers']
              ?.toLowerCase()
              .split(','),
          ).toContain('x-enlace-cita');
        }

        await cliente
          .post('/api/publico/cita/confirmar')
          .set('Origin', ORIGEN_FRONTEND)
          .set('X-Enlace-Cita', token(400))
          .expect(200);
      });
    });

    describe('rutas con sesión de US-10 (JwtStrategy real con SESION_VIGENTE_FALSA)', () => {
      const CAMBIO = {
        contrasenaActual: 'clave-actual-123',
        contrasenaNueva: 'clave-nueva-456',
      };
      let token: string;

      beforeAll(async () => {
        token = await app.get(JwtService).signAsync(SESION);
      });

      const conSesion = (ip: string) => ({
        cambiarContrasena: () =>
          request(server())
            .put('/api/usuarios/me/contrasena')
            .set('X-Forwarded-For', ip)
            .set('Authorization', `Bearer ${token}`)
            .send(CAMBIO),
        escribirSoporte: () =>
          request(server())
            .post('/api/soporte/mensajes')
            .set('X-Forwarded-For', ip)
            .set('Authorization', `Bearer ${token}`)
            .send({ mensaje: 'Hola' }),
      });

      it('PUT /api/usuarios/me/contrasena: 5 por hora por IP; el 6.º recibe 429 genérico (cubo cambioContrasena)', async () => {
        // Arrange
        const cliente = conSesion('203.0.113.30');

        // Act — 5 llegan al controller (200)…
        for (let i = 0; i < 5; i++) {
          await cliente.cambiarContrasena().expect(200);
        }
        // …y el 6.º no
        const bloqueado = await cliente.cambiarContrasena().expect(429);

        // Assert
        expect(bloqueado.body).toEqual({
          statusCode: 429,
          message: MENSAJE_LIMITE_TASA,
        });
        expect(cabecerasDeLimite(bloqueado)).toEqual([]);
        // Otra IP, su propio contador
        await conSesion('203.0.113.31').cambiarContrasena().expect(200);
      });

      it('POST /api/soporte/mensajes: 5 por hora por IP; el 6.º recibe 429 genérico (cubo soporte, distinto de cambioContrasena)', async () => {
        // Arrange
        const cliente = conSesion('203.0.113.40');

        // Act
        for (let i = 0; i < 5; i++) {
          await cliente.escribirSoporte().expect(201);
        }
        const bloqueado = await cliente.escribirSoporte().expect(429);

        // Assert — el genérico del límite (no el del tope por organización)
        expect(bloqueado.body).toEqual({
          statusCode: 429,
          message: MENSAJE_LIMITE_TASA,
        });
        expect(cabecerasDeLimite(bloqueado)).toEqual([]);
        // Cubos separados: la misma IP todavía puede cambiar su contraseña
        await cliente.cambiarContrasena().expect(200);
      });

      it('sin token: 401 de JwtAuthGuard mientras quede cupo y 429 ANTES que el 401 al pasarse (el guard global corre primero)', async () => {
        // Arrange
        const ip = '203.0.113.50';
        const sinSesion = () =>
          request(server())
            .post('/api/soporte/mensajes')
            .set('X-Forwarded-For', ip)
            .send({ mensaje: 'Hola' });

        // Act / Assert — 401 (y no 500: la estrategia está bien armada)
        for (let i = 0; i < 5; i++) {
          await sinSesion().expect(401);
        }
        await sinSesion().expect(429);
      });

      it('GET /api/usuarios/me no lleva cubo', async () => {
        const cliente = desde('203.0.113.60');
        for (let i = 0; i < 8; i++) {
          await cliente
            .get('/api/usuarios/me')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        }
      });
    });

    it('una ruta sin @LimitarTasa no se limita', async () => {
      const cliente = desde('192.0.2.1');
      for (let i = 0; i < 40; i++) {
        await cliente.get('/api/libre').expect(200);
      }
    });
  });

  describe('con LIMITE_TASA_ACTIVO=false (default en NODE_ENV=test)', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await crearApp(false);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('no limita nada, aunque las rutas estén marcadas', async () => {
      const server = app.getHttpServer() as App;
      for (let i = 0; i < 10; i++) {
        await request(server)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '203.0.113.99')
          .send(LOGIN)
          .expect(401);
      }
    });
  });
});
