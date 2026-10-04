import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostname } from 'node:os';

import type { Params } from 'nestjs-pino';
import {
  destination,
  multistream,
  stdSerializers,
  stdTimeFunctions,
  transport,
  type DestinationStream,
} from 'pino';
import type { Options } from 'pino-http';

import type { Entorno, FormatoLog, NivelLog } from '../config/entorno';

/**
 * Logs estructurados con pino (ADR-13 §16, DT-19).
 *
 *  - JSON por la salida estándar en producción (Railway los muestra); legibles
 *    con `pino-pretty` en desarrollo (`LOG_FORMATO`).
 *  - Un id por petición (`reqId`), que también se devuelve en `X-Request-Id`.
 *    Se reutiliza el `X-Request-Id` entrante si es seguro; si no, un UUID.
 *  - Redacción de credenciales y datos personales: nunca el destinatario, el
 *    cuerpo ni el contacto del paciente (ADR-13 §12).
 *  - Si hay `BETTERSTACK_SOURCE_TOKEN`, una copia va a Better Stack; sin token,
 *    nada cambia.
 *
 * Defensa en dos capas:
 *  1. Lista blanca en los serializadores: de la petición solo se registra
 *     método, ruta (sin query), query y unas pocas cabeceras inocuas; de la
 *     respuesta, el código; de un error, tipo, mensaje, pila y código (sin
 *     `parameters` ni `driverError` de TypeORM, que traen los valores de la
 *     consulta).
 *  2. Redacción por nombre de campo sobre TODO lo que se registre, también lo
 *     que escriba el código de la app (`logger.warn({ ... })`).
 *
 * Lo que la redacción NO cubre: datos interpolados en el texto del mensaje.
 * Convención: los datos van en campos, nunca dentro del string, y solo ids,
 * estados y códigos (ADR-13 §12).
 */

export const CENSURA = '[REDACTADO]';

/** Ruta del health check: no genera log por petición (la consulta cada minuto el monitor). */
export const RUTA_SALUD = '/api/health';

/** Cabeceras que nunca se registran (ADR-13 §16, DT-19). */
export const CABECERAS_SENSIBLES = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-enlace-cita',
  'svix-id',
  'svix-timestamp',
  'svix-signature',
  'x-api-key',
] as const;

/**
 * Campos que se redactan en cualquier objeto registrado, hasta dos niveles de
 * anidación (`campo`, `*.campo`, `*.*.campo`). Cubre los de ADR-13 §12 y §16
 * (correo, RUT, teléfono, destinatario, cuerpo del mensaje), las credenciales
 * y los cuerpos de petición y respuesta (`body`).
 *
 * `nombre` NO está: lo usan los hechos de dominio (`CitaCreada`). El nombre
 * del paciente nunca debe registrarse; los cuerpos ya se redactan enteros.
 */
export const CAMPOS_SENSIBLES = [
  // Datos personales del paciente y del profesional
  'correo',
  'email',
  'rut',
  'telefono',
  'nombreCompleto',
  'nombrePaciente',
  'pacienteNombre',
  'telefonoContacto',
  'correoRespuesta',
  // Credenciales y secretos
  'password',
  'passwordHash',
  'contrasena',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'apiKey',
  'secret',
  // Mensaje saliente (ADR-13 §8, §12): destinatario y contenido
  'destinatario',
  'responderA',
  'asunto',
  'html',
  'texto',
  'cuerpo',
  // Cuerpos HTTP
  'body',
] as const;

/** Cabeceras de la petición que sí se registran: no identifican a nadie. */
const CABECERAS_REGISTRABLES = [
  'user-agent',
  'content-type',
  'content-length',
  'origin',
  'x-request-id',
] as const;

// Id entrante aceptable: sin espacios ni saltos de línea (evita inyectar
// líneas en los logs) y de largo acotado.
const ID_PETICION_VALIDO = /^[A-Za-z0-9._:-]{8,128}$/;

export function rutasRedaccion(): string[] {
  const rutas: string[] = [];
  for (const cabecera of CABECERAS_SENSIBLES) {
    rutas.push(
      `req.headers["${cabecera}"]`,
      `res.headers["${cabecera}"]`,
      `headers["${cabecera}"]`,
    );
  }
  for (const campo of CAMPOS_SENSIBLES) {
    rutas.push(campo, `*.${campo}`, `*.*.${campo}`);
  }
  return rutas;
}

function rutaSinQuery(url: string | undefined): string {
  return (url ?? '').split('?')[0];
}

/** Ruta original (Express quita el prefijo de montaje de `req.url`). */
function rutaDe(req: IncomingMessage): string {
  const original = (req as IncomingMessage & { originalUrl?: string })
    .originalUrl;
  return rutaSinQuery(original ?? req.url);
}

interface PeticionSerializada {
  id?: unknown;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
}

/** Parámetros de la query como objeto plano, leídos de la URL. */
function queryDe(url: string | undefined): Record<string, string> | undefined {
  const inicio = (url ?? '').indexOf('?');
  if (inicio < 0) {
    return undefined;
  }
  const parametros = Object.fromEntries(
    new URLSearchParams((url ?? '').slice(inicio + 1)),
  );
  return Object.keys(parametros).length > 0 ? parametros : undefined;
}

function serializarPeticion(req: PeticionSerializada): Record<string, unknown> {
  const cabeceras: Record<string, unknown> = {};
  for (const nombre of CABECERAS_REGISTRABLES) {
    const valor = req.headers?.[nombre];
    if (valor !== undefined) {
      cabeceras[nombre] = valor;
    }
  }
  const salida: Record<string, unknown> = {
    id: req.id,
    method: req.method,
    url: rutaSinQuery(req.url),
    headers: cabeceras,
  };
  // Pasa por la redacción (`*.*.correo` alcanza a `req.query.correo`).
  const query = queryDe(req.url);
  if (query) {
    salida.query = query;
  }
  return salida;
}

function serializarRespuesta(res: { statusCode?: number }): {
  statusCode?: number;
} {
  return { statusCode: res.statusCode };
}

/**
 * Solo tipo, mensaje, pila y código. Deja fuera las propiedades extra de los
 * errores (p. ej. `parameters` y `driverError.detail` de TypeORM, que traen los
 * valores de la consulta: un RUT o un correo).
 */
export function serializarError(err: unknown): unknown {
  const serializado: unknown =
    err instanceof Error ? stdSerializers.err(err) : err;
  if (typeof serializado !== 'object' || serializado === null) {
    return serializado;
  }
  const e = serializado as Record<string, unknown>;
  const salida: Record<string, unknown> = {
    type: e.type,
    message: e.message,
    stack: e.stack,
  };
  if (typeof e.code === 'string' || typeof e.code === 'number') {
    salida.code = e.code;
  }
  return salida;
}

/** `pino-pretty` es devDependency: en la imagen de producción no existe. */
function hayPinoPretty(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/** Opciones de pino / pino-http, sin destino. Puras: se prueban sin red ni Nest. */
export function crearOpcionesPinoHttp(
  nivel: NivelLog,
  formato: FormatoLog,
): Options<IncomingMessage, ServerResponse> {
  const opciones: Options<IncomingMessage, ServerResponse> = {
    level: nivel,
    base: { pid: process.pid, hostname: hostname(), servicio: 'citia-backend' },
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: rutasRedaccion(), censor: CENSURA },
    serializers: {
      req: serializarPeticion,
      res: serializarRespuesta,
      err: serializarError,
    },
    genReqId: (req, res) => {
      const entrante = req.headers['x-request-id'];
      const id =
        typeof entrante === 'string' && ID_PETICION_VALIDO.test(entrante)
          ? entrante
          : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // Los logs de la app dentro de una petición llevan solo `reqId`; el
    // objeto `req` completo va una vez, en el log de la respuesta.
    quietReqLogger: true,
    autoLogging: { ignore: (req) => rutaDe(req) === RUTA_SALUD },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${rutaDe(req)} ${res.statusCode}`,
    customErrorMessage: (req, res) =>
      `${req.method} ${rutaDe(req)} ${res.statusCode}`,
  };

  if (formato === 'json') {
    // Nivel como texto ("info", "error"): Railway y Better Stack lo filtran
    // así. pino-pretty, en cambio, necesita el número.
    opciones.formatters = { level: (etiqueta) => ({ level: etiqueta }) };
  }
  return opciones;
}

export type ConfiguracionLogger = Pick<
  Entorno,
  | 'LOG_NIVEL'
  | 'LOG_FORMATO'
  | 'BETTERSTACK_SOURCE_TOKEN'
  | 'BETTERSTACK_INGESTING_HOST'
>;

const OPCIONES_PRETTY = {
  colorize: true,
  translateTime: 'SYS:HH:MM:ss.l',
  ignore: 'pid,hostname,servicio,context,req,res',
  messageFormat: '{if context}[{context}] {end}{msg}',
};

/**
 * Parámetros de `LoggerModule` (nestjs-pino).
 *
 * `destino` solo para tests: escribe ahí en lugar de la salida estándar.
 */
export function crearParamsLogger(
  config: ConfiguracionLogger,
  destino?: DestinationStream,
): Params {
  const formato: FormatoLog =
    config.LOG_FORMATO === 'pretty' && hayPinoPretty() ? 'pretty' : 'json';
  const nivel = config.LOG_NIVEL;
  const opciones = crearOpcionesPinoHttp(nivel, formato);

  if (destino) {
    return { pinoHttp: [opciones, destino] };
  }
  if (nivel === 'silent') {
    // Nada que escribir: sin transportes ni workers (p. ej. en los tests).
    return { pinoHttp: opciones };
  }

  const token = config.BETTERSTACK_SOURCE_TOKEN;
  const host = config.BETTERSTACK_INGESTING_HOST?.replace(/^https:\/\//, '');
  const betterStack = token
    ? {
        target: '@logtail/pino',
        level: nivel,
        options: {
          sourceToken: token,
          options: host ? { endpoint: `https://${host}` } : {},
        },
      }
    : undefined;

  if (formato === 'pretty') {
    opciones.transport = betterStack
      ? {
          targets: [
            { target: 'pino-pretty', level: nivel, options: OPCIONES_PRETTY },
            betterStack,
          ],
        }
      : { target: 'pino-pretty', options: OPCIONES_PRETTY };
    return { pinoHttp: opciones };
  }

  if (!betterStack) {
    // Salida estándar, síncrona (la de pino por defecto).
    return { pinoHttp: opciones };
  }

  // JSON a la salida estándar y copia a Better Stack (en un worker, sin
  // bloquear). `multistream` en vez de `transport.targets` porque pino no
  // admite el nivel como texto (`formatters.level`) con `targets`.
  const salida = multistream([
    { level: nivel, stream: destination(1) },
    {
      level: nivel,
      stream: transport({
        target: betterStack.target,
        options: betterStack.options,
      }),
    },
  ]);
  return { pinoHttp: [opciones, salida] };
}
