import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { Writable } from 'node:stream';

import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';

import {
  CENSURA,
  crearOpcionesPinoHttp,
  crearParamsLogger,
  RUTA_SALUD,
  serializarError,
} from './opciones-logger';

// Datos personales y secretos de prueba: ninguno debe aparecer en los logs.
const CORREO = 'paciente.prueba@correo.cl';
const RUT = '12.345.678-5';
const TELEFONO = '+56911112222';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.token-de-prueba.firma';
const COOKIE = 'sesion=cookie-secreta';
const ENLACE = 'enlace-cita-secreto';
const FIRMA_SVIX = 'v1,firma-svix-secreta';
const PASSWORD = 'clave-super-secreta';
const NOMBRE_COMPLETO = 'Dra. Profesional Prueba';
const CUERPO_CORREO = '<p>Tu hora es el martes</p>';

const SECRETOS = [
  CORREO,
  RUT,
  TELEFONO,
  TOKEN,
  COOKIE,
  ENLACE,
  FIRMA_SVIX,
  PASSWORD,
  NOMBRE_COMPLETO,
  CUERPO_CORREO,
];

interface Linea {
  level: string;
  msg?: string;
  time?: string;
  reqId?: string;
  responseTime?: number;
  req?: {
    id?: string;
    method?: string;
    url?: string;
    query?: Record<string, string>;
    headers: Record<string, string>;
    remoteAddress?: string;
  };
  res?: { statusCode?: number };
  err?: Record<string, unknown>;
  [campo: string]: unknown;
}

function memoria(): {
  stream: Writable;
  lineas: () => Linea[];
  texto: () => string;
} {
  const trozos: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      trozos.push(chunk.toString());
      cb();
    },
  });
  const texto = (): string => trozos.join('');
  const lineas = (): Linea[] =>
    texto()
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as Linea);
  return { stream, lineas, texto };
}

function servidor(
  destino: Writable,
  manejar: (req: IncomingMessage, res: ServerResponse) => void,
): Server {
  // pino-http deja en `req.log` el logger de la petición.
  const middleware = pinoHttp(crearOpcionesPinoHttp('info', 'json'), destino);
  return createServer((req, res) => {
    middleware(req, res, () => manejar(req, res));
  });
}

describe('opciones-logger', () => {
  describe('petición HTTP con datos personales y credenciales', () => {
    it('no registra cabeceras sensibles, query sensible, cuerpos ni datos personales', async () => {
      const { stream, lineas, texto } = memoria();
      const app = servidor(stream, (req, res) => {
        // Lo que podría escribir el código de la app, en distintos niveles.
        req.log.info(
          {
            correo: CORREO,
            paciente: { rut: RUT, telefono: TELEFONO, correo: CORREO },
            solicitud: { paciente: { email: CORREO } },
            body: { correo: CORREO, password: PASSWORD },
            mensaje: {
              destinatario: CORREO,
              html: CUERPO_CORREO,
              texto: CUERPO_CORREO,
            },
            usuario: { nombreCompleto: NOMBRE_COMPLETO },
            citaId: 'cita-1',
          },
          'procesando',
        );
        res.statusCode = 200;
        res.end(JSON.stringify({ correo: CORREO }));
      });

      const respuesta = await request(app)
        .post(
          `/api/citas?correo=${encodeURIComponent(CORREO)}&estado=pendiente`,
        )
        .set('Authorization', `Bearer ${TOKEN}`)
        .set('Cookie', COOKIE)
        .set('X-Enlace-Cita', ENLACE)
        .set('Svix-Signature', FIRMA_SVIX)
        .set('User-Agent', 'jest')
        .send({ correo: CORREO, rut: RUT, password: PASSWORD })
        .expect(200);

      const salida = texto();
      for (const secreto of SECRETOS) {
        expect(salida).not.toContain(secreto);
      }

      const [logApp, logRespuesta] = lineas();

      // Los campos se reemplazan por la censura, no desaparecen sin rastro.
      expect(logApp.correo).toBe(CENSURA);
      expect(logApp.paciente).toEqual({
        rut: CENSURA,
        telefono: CENSURA,
        correo: CENSURA,
      });
      expect(logApp).toMatchObject({
        solicitud: { paciente: { email: CENSURA } },
      });
      expect(logApp.body).toBe(CENSURA);
      expect(logApp.mensaje).toEqual({
        destinatario: CENSURA,
        html: CENSURA,
        texto: CENSURA,
      });
      expect(logApp).toMatchObject({ usuario: { nombreCompleto: CENSURA } });
      // Los ids sí quedan.
      expect(logApp.citaId).toBe('cita-1');
      expect(logApp.msg).toBe('procesando');
      // Logs de la app dentro de la petición: solo el reqId, sin el objeto req.
      expect(logApp.req).toBeUndefined();
      expect(logApp.reqId).toEqual(expect.any(String));

      // Log de la respuesta: lista blanca de la petición.
      expect(logRespuesta.msg).toBe('POST /api/citas 200');
      expect(logRespuesta.level).toBe('info');
      expect(logRespuesta.req?.method).toBe('POST');
      expect(logRespuesta.req?.url).toBe('/api/citas');
      expect(logRespuesta.req?.query).toEqual({
        correo: CENSURA,
        estado: 'pendiente',
      });
      // Solo las cabeceras de la lista blanca.
      expect(Object.keys(logRespuesta.req?.headers ?? {}).sort()).toEqual([
        'content-length',
        'content-type',
        'user-agent',
      ]);
      expect(logRespuesta.req?.headers['user-agent']).toBe('jest');
      expect(logRespuesta.req?.headers.authorization).toBeUndefined();
      expect(logRespuesta.req?.headers.cookie).toBeUndefined();
      expect(logRespuesta.req?.remoteAddress).toBeUndefined();
      expect(logRespuesta.res).toEqual({ statusCode: 200 });
      expect(logRespuesta.responseTime).toEqual(expect.any(Number));

      // El id de la petición se devuelve y es el mismo de los logs.
      const id = respuesta.headers['x-request-id'];
      expect(id).toEqual(expect.any(String));
      expect(logApp.reqId).toBe(id);
      expect(logRespuesta.req?.id).toBe(id);
    });
  });

  describe('identificador por petición', () => {
    it('reutiliza un X-Request-Id entrante seguro', async () => {
      const { stream, lineas } = memoria();
      const app = servidor(stream, (_req, res) => res.end());
      await request(app)
        .get('/api/x')
        .set('X-Request-Id', 'abc-123_def.456')
        .expect(200);
      expect(lineas()[0].req?.id).toBe('abc-123_def.456');
    });

    it('reemplaza por un UUID un X-Request-Id con caracteres no permitidos', async () => {
      const { stream, lineas } = memoria();
      const app = servidor(stream, (_req, res) => res.end());
      const r = await request(app)
        .get('/api/x')
        .set('X-Request-Id', 'id con espacios {"level":"fatal"}')
        .expect(200);
      const id = r.headers['x-request-id'];
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(lineas()[0].req?.id).toBe(id);
    });

    it('genera ids distintos por petición', async () => {
      const { stream } = memoria();
      const app = servidor(stream, (_req, res) => res.end());
      const a = await request(app).get('/api/x');
      const b = await request(app).get('/api/x');
      expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
    });
  });

  describe('nivel según el código de respuesta', () => {
    it.each([
      [200, 'info'],
      [404, 'warn'],
      [500, 'error'],
    ])('%i → %s', async (codigo, nivel) => {
      const { stream, lineas } = memoria();
      const app = servidor(stream, (_req, res) => {
        res.statusCode = codigo;
        res.end();
      });
      await request(app).get('/api/x').expect(codigo);
      expect(lineas()[0].level).toBe(nivel);
    });
  });

  it('no registra las peticiones al health check', async () => {
    const { stream, lineas } = memoria();
    const app = servidor(stream, (_req, res) => res.end());
    await request(app).get(RUTA_SALUD).expect(200);
    await request(app).get('/api/otra').expect(200);
    expect(lineas().map((l) => l.msg)).toEqual(['GET /api/otra 200']);
  });

  describe('errores', () => {
    it('registra tipo, mensaje, pila y código, sin los valores de la consulta', () => {
      const { stream, lineas, texto } = memoria();
      const logger = pino(crearOpcionesPinoHttp('info', 'json'), stream);

      // Forma de un QueryFailedError de TypeORM por clave duplicada.
      const err = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "uq_paciente_rut"',
        ),
        {
          code: '23505',
          query: 'INSERT INTO "pacientes" ("rut", "correo") VALUES ($1, $2)',
          parameters: [RUT, CORREO],
          driverError: { detail: `Key (rut)=(${RUT}) already exists.` },
        },
      );
      logger.error({ err }, 'fallo al guardar');

      expect(texto()).not.toContain(RUT);
      expect(texto()).not.toContain(CORREO);
      const [linea] = lineas();
      expect(Object.keys(linea.err ?? {}).sort()).toEqual([
        'code',
        'message',
        'stack',
        'type',
      ]);
      expect(linea.err?.code).toBe('23505');
      expect(linea.err?.message).toEqual(
        expect.stringContaining('uq_paciente_rut'),
      );
    });

    it('deja pasar valores que no son errores', () => {
      expect(serializarError('texto')).toBe('texto');
      expect(serializarError(undefined)).toBeUndefined();
    });
  });

  it('en JSON el nivel va como texto y el instante en ISO 8601', () => {
    const { stream, lineas } = memoria();
    const logger = pino(crearOpcionesPinoHttp('info', 'json'), stream);
    logger.warn({ alerta: 'recordatorios.cuota_80' }, 'cuota');
    const [linea] = lineas();
    expect(linea.level).toBe('warn');
    expect(linea.alerta).toBe('recordatorios.cuota_80');
    expect(linea.servicio).toBe('citia-backend');
    expect(new Date(linea.time ?? '').toISOString()).toBe(linea.time);
  });

  describe('crearParamsLogger', () => {
    const base = {
      LOG_NIVEL: 'info' as const,
      BETTERSTACK_SOURCE_TOKEN: undefined,
      BETTERSTACK_INGESTING_HOST: undefined,
    };

    it('JSON sin token: salida estándar, sin transportes', () => {
      const params = crearParamsLogger({ ...base, LOG_FORMATO: 'json' });
      expect(Array.isArray(params.pinoHttp)).toBe(false);
      expect(
        (params.pinoHttp as { transport?: unknown }).transport,
      ).toBeUndefined();
    });

    it('pretty sin token: un solo transporte, pino-pretty', () => {
      const params = crearParamsLogger({ ...base, LOG_FORMATO: 'pretty' });
      const opciones = params.pinoHttp as {
        transport?: { target?: string };
        formatters?: unknown;
      };
      expect(opciones.transport?.target).toBe('pino-pretty');
      // pino-pretty necesita el nivel numérico.
      expect(opciones.formatters).toBeUndefined();
    });

    it('pretty con token: pino-pretty y Better Stack con su host de ingesta', () => {
      const params = crearParamsLogger({
        ...base,
        LOG_FORMATO: 'pretty',
        BETTERSTACK_SOURCE_TOKEN: 'token-fuente',
        BETTERSTACK_INGESTING_HOST: 's123.eu-nbg-2.betterstackdata.com',
      });
      const opciones = params.pinoHttp as {
        transport?: { targets?: { target: string; options: unknown }[] };
      };
      expect(opciones.transport?.targets?.map((t) => t.target)).toEqual([
        'pino-pretty',
        '@logtail/pino',
      ]);
      expect(opciones.transport?.targets?.[1].options).toEqual({
        sourceToken: 'token-fuente',
        options: { endpoint: 'https://s123.eu-nbg-2.betterstackdata.com' },
      });
    });

    it('nivel silent: sin transportes aunque haya token', () => {
      const params = crearParamsLogger({
        ...base,
        LOG_NIVEL: 'silent',
        LOG_FORMATO: 'json',
        BETTERSTACK_SOURCE_TOKEN: 'token-fuente',
      });
      expect(Array.isArray(params.pinoHttp)).toBe(false);
    });
  });
});
