import { OrigenCorsInvalidoError, normalizarOrigen } from './origenes-cors';

/**
 * Variables de entorno de la aplicación, validadas y con sus tipos y valores
 * por defecto. Es la ÚNICA fuente de verdad de la configuración: el resto del
 * código la lee con `ConfigService<Entorno, true>` (`get(..., { infer: true })`)
 * y no toca `process.env`.
 *
 * `validarEntorno` se pasa como `validate` a `ConfigModule.forRoot` (sin
 * librerías: ni Joi ni class-validator). Si algo no cuadra, el arranque falla
 * con TODOS los errores juntos y sin mostrar el valor de ningún secreto.
 *
 * Reglas generales:
 *  - Fuera de producción todo tiene un valor por defecto que deja arrancar la
 *    app y correr los tests sin configurar nada nuevo. Solo `JWT_SECRET` es
 *    obligatoria siempre, como ya lo era.
 *  - En producción (`NODE_ENV=production`) no hay defaults para la base de
 *    datos ni para `FRONTEND_URL`, y `JWT_SECRET` debe ser fuerte.
 *  - En producción `MENSAJERIA_ADAPTADOR` es obligatoria (sin default), para
 *    que nunca quede en `registro` por omisión.
 *  - Las variables de Resend solo se exigen con `MENSAJERIA_ADAPTADOR=resend`.
 *  - Un valor vacío (`VAR=`) cuenta como no definido.
 *
 * Fuentes: ADR-13 §18 (recordatorios, Resend, Better Stack), ADR-12 §3 y §5
 * (outbox y planificador), US-03 paso 4 (CORS), ADR-07 (`APP_TZ`).
 */

export const ENTORNOS_EJECUCION = [
  'development',
  'production',
  'test',
] as const;
export type EntornoEjecucion = (typeof ENTORNOS_EJECUCION)[number];

export const NIVELES_LOG = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type NivelLog = (typeof NIVELES_LOG)[number];

export const FORMATOS_LOG = ['json', 'pretty'] as const;
export type FormatoLog = (typeof FORMATOS_LOG)[number];

export const ADAPTADORES_MENSAJERIA = ['registro', 'resend'] as const;
export type AdaptadorMensajeria = (typeof ADAPTADORES_MENSAJERIA)[number];

export interface Entorno {
  NODE_ENV: EntornoEjecucion;
  PORT: number;

  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASS: string;
  DB_NAME: string;

  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;

  /** Origen canónico del frontend, normalizado (sin barra final). */
  FRONTEND_URL: string;
  /** Orígenes exactos y comodines de vistas previas, ya normalizados. */
  CORS_ORIGENES_EXTRA: readonly string[];

  APP_TZ: string;
  SOLICITUD_VENTANA_HORAS: number;

  // Observabilidad (ADR-13 §16)
  LOG_NIVEL: NivelLog;
  LOG_FORMATO: FormatoLog;
  BETTERSTACK_SOURCE_TOKEN?: string;
  BETTERSTACK_INGESTING_HOST?: string;
  BETTERSTACK_HEARTBEAT_SALIDA_URL?: string;
  BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL?: string;

  // Outbox y planificador (ADR-12)
  PLANIFICADOR_ACTIVO: boolean;
  EVENTOS_SALIDA_INTERVALO_SEG: number;
  EVENTOS_SALIDA_LOTE: number;
  EVENTOS_SALIDA_MAX_INTENTOS: number;
  EVENTOS_SALIDA_RETENCION_DIAS: number;

  // Mensajería (ADR-13 §8, §13, §18)
  MENSAJERIA_ADAPTADOR: AdaptadorMensajeria;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  CORREO_DOMINIO?: string;
  CORREO_REMITENTE: string;
  RESEND_CUOTA_DIARIA: number;
  RESEND_CUOTA_MENSUAL: number;
  CUOTA_UMBRAL_AVISO: number;

  // Recordatorios (ADR-13 §3, §5, §7, §11, §15, §16)
  RECORDATORIO_ANTELACIONES_MIN: readonly number[];
  RECORDATORIO_SILENCIO_DESDE: string;
  RECORDATORIO_SILENCIO_HASTA: string;
  RECORDATORIO_MARGEN_MINIMO_MIN: number;
  RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN: number;
  RECORDATORIO_MAX_INTENTOS: number;
  RECORDATORIO_LOTE: number;
  RECORDATORIO_INTERVALO_SEG: number;
  RECORDATORIO_MAX_DIARIO_POR_TENANT: number;
  RECORDATORIO_EXIGIR_CONSENTIMIENTO: boolean;
  RECORDATORIO_UMBRAL_TASA_FALLO: number;
  RECORDATORIO_UMBRAL_MUESTRA_MIN: number;
}

export class EntornoInvalidoError extends Error {
  constructor(readonly errores: readonly string[]) {
    super(
      `Variables de entorno inválidas (${errores.length}):\n` +
        errores.map((e) => `  - ${e}`).join('\n') +
        '\nRevisa .env (plantilla en .env.example) o las variables del servicio.',
    );
    this.name = 'EntornoInvalidoError';
  }
}

/** Valores de ejemplo que nunca deben llegar a producción como secreto. */
const SECRETOS_DE_EJEMPLO = new Set([
  'dev-only-change-me-super-secret',
  'test-secret-e2e',
  'changeme',
  'secret',
]);
const LARGO_MINIMO_JWT_SECRET_PRODUCCION = 32;

const HORA_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOMINIO =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const CORREO = '[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+';
const REMITENTE = new RegExp(`^(?:[^<>]+ <${CORREO}>|${CORREO})$`);
// Formato de `ms`/jsonwebtoken: "3600", "15m", "12h", "1d", "7 days"…
const DURACION_JWT =
  /^\d+(\.\d+)?\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)?$/i;

interface OpcionesEntero {
  defecto: number;
  min: number;
  max?: number;
}

interface OpcionesDecimal {
  defecto: number;
  /** Excluyente. */
  mayorQue: number;
  /** Incluyente. */
  max: number;
}

/**
 * Lee y convierte variables acumulando errores, para mostrarlos todos de una
 * vez en lugar de hacer arrancar la app N veces.
 */
class LectorEntorno {
  readonly errores: string[] = [];

  constructor(private readonly crudo: Record<string, unknown>) {}

  error(nombre: string, mensaje: string): void {
    this.errores.push(`${nombre}: ${mensaje}`);
  }

  /** Valor recortado, o `undefined` si no está o está vacío. */
  valor(nombre: string): string | undefined {
    const v = this.crudo[nombre];
    if (v === undefined || v === null) {
      return undefined;
    }
    if (
      typeof v !== 'string' &&
      typeof v !== 'number' &&
      typeof v !== 'boolean'
    ) {
      return undefined;
    }
    const texto = String(v).trim();
    return texto === '' ? undefined : texto;
  }

  texto(nombre: string, defecto: string): string {
    return this.valor(nombre) ?? defecto;
  }

  /** Obligatoria: registra el error y devuelve '' si falta. */
  obligatoria(nombre: string, motivo = 'es obligatoria'): string {
    const v = this.valor(nombre);
    if (v === undefined) {
      this.error(nombre, `${motivo}.`);
      return '';
    }
    return v;
  }

  entero(nombre: string, { defecto, min, max }: OpcionesEntero): number {
    const v = this.valor(nombre);
    if (v === undefined) {
      return defecto;
    }
    const n = /^-?\d+$/.test(v) ? Number(v) : NaN;
    const fueraDeRango =
      !Number.isSafeInteger(n) || n < min || (max !== undefined && n > max);
    if (fueraDeRango) {
      const rango = max === undefined ? `>= ${min}` : `entre ${min} y ${max}`;
      this.error(nombre, `debe ser un entero ${rango} (recibido "${v}").`);
      return defecto;
    }
    return n;
  }

  decimal(nombre: string, { defecto, mayorQue, max }: OpcionesDecimal): number {
    const v = this.valor(nombre);
    if (v === undefined) {
      return defecto;
    }
    const n = /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= mayorQue || n > max) {
      this.error(
        nombre,
        `debe ser un número mayor que ${mayorQue} y como mucho ${max} (recibido "${v}").`,
      );
      return defecto;
    }
    return n;
  }

  booleano(nombre: string, defecto: boolean): boolean {
    const v = this.valor(nombre)?.toLowerCase();
    if (v === undefined) {
      return defecto;
    }
    if (v === 'true' || v === '1') {
      return true;
    }
    if (v === 'false' || v === '0') {
      return false;
    }
    this.error(nombre, `debe ser true o false (recibido "${v}").`);
    return defecto;
  }

  enumerado<T extends string>(
    nombre: string,
    valores: readonly T[],
    defecto: T,
  ): T {
    const v = this.valor(nombre);
    if (v === undefined) {
      return defecto;
    }
    if ((valores as readonly string[]).includes(v)) {
      return v as T;
    }
    this.error(
      nombre,
      `debe ser uno de: ${valores.join(', ')} (recibido "${v}").`,
    );
    return defecto;
  }

  hora(nombre: string, defecto: string): string {
    const v = this.valor(nombre);
    if (v === undefined) {
      return defecto;
    }
    if (!HORA_HH_MM.test(v)) {
      this.error(nombre, `debe tener formato HH:mm de 24 h (recibido "${v}").`);
      return defecto;
    }
    return v;
  }

  zonaHoraria(nombre: string, defecto: string): string {
    const v = this.valor(nombre) ?? defecto;
    try {
      new Intl.DateTimeFormat('es-CL', { timeZone: v });
      return v;
    } catch {
      this.error(
        nombre,
        `no es una zona horaria IANA válida, p. ej. America/Santiago (recibido "${v}").`,
      );
      return defecto;
    }
  }

  /** URL https opcional. Es un secreto (lleva el token): no se muestra. */
  urlSecretaHttps(nombre: string): string | undefined {
    const v = this.valor(nombre);
    if (v === undefined) {
      return undefined;
    }
    try {
      const url = new URL(v);
      if (url.protocol === 'https:') {
        return v;
      }
    } catch {
      // cae al error de abajo
    }
    this.error(nombre, 'debe ser una URL https completa (valor oculto).');
    return undefined;
  }

  listaAntelaciones(nombre: string, defecto: readonly number[]): number[] {
    const v = this.valor(nombre);
    if (v === undefined) {
      return [...defecto];
    }
    const partes = v.split(',').map((p) => p.trim());
    const numeros = partes.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
    const validos =
      numeros.length >= 1 &&
      numeros.length <= 3 &&
      numeros.every((n) => Number.isInteger(n) && n >= 30 && n <= 10_080) &&
      new Set(numeros).size === numeros.length;
    if (!validos) {
      this.error(
        nombre,
        `debe ser una lista de 1 a 3 enteros distintos entre 30 y 10080, separados por comas (recibido "${v}").`,
      );
      return [...defecto];
    }
    return numeros;
  }
}

/**
 * `validate` de `ConfigModule.forRoot`. Recibe el `.env` mezclado con
 * `process.env` y devuelve lo mismo más las variables conocidas ya
 * convertidas (números, booleanos, listas) y con sus valores por defecto.
 * Las variables desconocidas pasan sin tocar.
 */
export function validarEntorno(
  crudo: Record<string, unknown>,
): Entorno & Record<string, unknown> {
  const l = new LectorEntorno(crudo);

  const NODE_ENV = l.enumerado('NODE_ENV', ENTORNOS_EJECUCION, 'development');
  const produccion = NODE_ENV === 'production';
  const test = NODE_ENV === 'test';

  // Base de datos: defaults de desarrollo (los mismos de data-source.ts);
  // en producción, obligatorias.
  const enProduccion = 'es obligatoria en producción';
  const db = (nombre: string, defecto: string): string =>
    produccion ? l.obligatoria(nombre, enProduccion) : l.texto(nombre, defecto);

  const DB_HOST = db('DB_HOST', 'localhost');
  const DB_PORT = l.entero('DB_PORT', { defecto: 5432, min: 1, max: 65_535 });
  if (produccion && l.valor('DB_PORT') === undefined) {
    l.error('DB_PORT', `${enProduccion}.`);
  }
  const DB_USER = db('DB_USER', 'postgres');
  const DB_PASS = db('DB_PASS', 'postgres');
  const DB_NAME = db('DB_NAME', 'citia_dev');

  // JWT: obligatoria siempre (como antes). En producción, además, fuerte.
  const JWT_SECRET = l.obligatoria('JWT_SECRET');
  if (
    produccion &&
    JWT_SECRET !== '' &&
    (JWT_SECRET.length < LARGO_MINIMO_JWT_SECRET_PRODUCCION ||
      SECRETOS_DE_EJEMPLO.has(JWT_SECRET))
  ) {
    l.error(
      'JWT_SECRET',
      `en producción debe tener al menos ${LARGO_MINIMO_JWT_SECRET_PRODUCCION} caracteres y no puede ser un valor de ejemplo (valor oculto).`,
    );
  }
  const JWT_EXPIRES_IN = l.texto('JWT_EXPIRES_IN', '1d');
  if (!DURACION_JWT.test(JWT_EXPIRES_IN)) {
    l.error(
      'JWT_EXPIRES_IN',
      `debe ser una duración como "1d", "12h" o "3600" (recibido "${JWT_EXPIRES_IN}").`,
    );
  }

  // CORS (US-03 paso 4).
  let FRONTEND_URL = 'http://localhost:5173';
  const frontendCrudo = produccion
    ? l.obligatoria('FRONTEND_URL', enProduccion)
    : l.texto('FRONTEND_URL', FRONTEND_URL);
  if (frontendCrudo !== '') {
    try {
      FRONTEND_URL = normalizarOrigen(frontendCrudo);
      if (FRONTEND_URL.includes('*')) {
        l.error('FRONTEND_URL', 'debe ser un origen exacto, sin comodín.');
      }
    } catch (e) {
      l.error('FRONTEND_URL', mensajeDe(e));
    }
  }
  const CORS_ORIGENES_EXTRA: string[] = [];
  for (const entrada of (l.valor('CORS_ORIGENES_EXTRA') ?? '').split(',')) {
    if (entrada.trim() === '') {
      continue;
    }
    try {
      CORS_ORIGENES_EXTRA.push(normalizarOrigen(entrada));
    } catch (e) {
      l.error('CORS_ORIGENES_EXTRA', mensajeDe(e));
    }
  }

  const PORT = l.entero('PORT', { defecto: 3000, min: 1, max: 65_535 });
  const APP_TZ = l.zonaHoraria('APP_TZ', 'America/Santiago');
  const SOLICITUD_VENTANA_HORAS = l.entero('SOLICITUD_VENTANA_HORAS', {
    defecto: 72,
    min: 1,
  });

  // Observabilidad. En los tests, silencio por defecto.
  const LOG_NIVEL = l.enumerado(
    'LOG_NIVEL',
    NIVELES_LOG,
    test ? 'silent' : 'info',
  );
  const LOG_FORMATO = l.enumerado(
    'LOG_FORMATO',
    FORMATOS_LOG,
    NODE_ENV === 'development' ? 'pretty' : 'json',
  );
  const BETTERSTACK_SOURCE_TOKEN = l.valor('BETTERSTACK_SOURCE_TOKEN');
  const BETTERSTACK_INGESTING_HOST = l.valor('BETTERSTACK_INGESTING_HOST');
  if (
    BETTERSTACK_INGESTING_HOST !== undefined &&
    !DOMINIO.test(BETTERSTACK_INGESTING_HOST.replace(/^https:\/\//, ''))
  ) {
    l.error(
      'BETTERSTACK_INGESTING_HOST',
      `debe ser el host de ingesta de la fuente, p. ej. s1234567.eu-nbg-2.betterstackdata.com (recibido "${BETTERSTACK_INGESTING_HOST}").`,
    );
  }
  const BETTERSTACK_HEARTBEAT_SALIDA_URL = l.urlSecretaHttps(
    'BETTERSTACK_HEARTBEAT_SALIDA_URL',
  );
  const BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL = l.urlSecretaHttps(
    'BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL',
  );

  // Outbox y planificador (ADR-12 §3 y §5). En los tests, apagado por defecto.
  const PLANIFICADOR_ACTIVO = l.booleano('PLANIFICADOR_ACTIVO', !test);
  const EVENTOS_SALIDA_INTERVALO_SEG = l.entero(
    'EVENTOS_SALIDA_INTERVALO_SEG',
    {
      defecto: 5,
      min: 1,
    },
  );
  const EVENTOS_SALIDA_LOTE = l.entero('EVENTOS_SALIDA_LOTE', {
    defecto: 50,
    min: 1,
  });
  const EVENTOS_SALIDA_MAX_INTENTOS = l.entero('EVENTOS_SALIDA_MAX_INTENTOS', {
    defecto: 10,
    min: 1,
  });
  const EVENTOS_SALIDA_RETENCION_DIAS = l.entero(
    'EVENTOS_SALIDA_RETENCION_DIAS',
    { defecto: 14, min: 1 },
  );

  // Mensajería (ADR-13 §13 y §18). En producción es OBLIGATORIA y sin
  // default: nunca debe quedar en `registro` (que no envía nada) por omisión.
  // `registro` sigue permitido si se elige explícitamente (p. ej. staging).
  if (produccion && l.valor('MENSAJERIA_ADAPTADOR') === undefined) {
    l.error(
      'MENSAJERIA_ADAPTADOR',
      `${enProduccion} (${ADAPTADORES_MENSAJERIA.join(' o ')}; registro no envía correos).`,
    );
  }
  const MENSAJERIA_ADAPTADOR = l.enumerado(
    'MENSAJERIA_ADAPTADOR',
    ADAPTADORES_MENSAJERIA,
    'registro',
  );
  const resend = MENSAJERIA_ADAPTADOR === 'resend';
  const conResend = 'es obligatoria con MENSAJERIA_ADAPTADOR=resend';
  const RESEND_API_KEY = resend
    ? l.obligatoria('RESEND_API_KEY', conResend)
    : l.valor('RESEND_API_KEY');
  const RESEND_WEBHOOK_SECRET = resend
    ? l.obligatoria('RESEND_WEBHOOK_SECRET', conResend)
    : l.valor('RESEND_WEBHOOK_SECRET');
  if (
    resend &&
    RESEND_WEBHOOK_SECRET &&
    !RESEND_WEBHOOK_SECRET.startsWith('whsec_')
  ) {
    l.error(
      'RESEND_WEBHOOK_SECRET',
      'debe ser el secreto de firma del webhook, que empieza con "whsec_" (valor oculto).',
    );
  }
  const CORREO_DOMINIO = l.valor('CORREO_DOMINIO');
  if (CORREO_DOMINIO !== undefined && !DOMINIO.test(CORREO_DOMINIO)) {
    l.error(
      'CORREO_DOMINIO',
      `debe ser un dominio, p. ej. notificaciones.citia.cl (recibido "${CORREO_DOMINIO}").`,
    );
  }
  // ADR-13 §13: "Citia <recordatorios@${CORREO_DOMINIO}>"; sin dominio, el
  // remitente de pruebas de Resend (§18).
  const CORREO_REMITENTE = l.texto(
    'CORREO_REMITENTE',
    CORREO_DOMINIO && DOMINIO.test(CORREO_DOMINIO)
      ? `Citia <recordatorios@${CORREO_DOMINIO}>`
      : 'Citia <onboarding@resend.dev>',
  );
  if (!REMITENTE.test(CORREO_REMITENTE)) {
    l.error(
      'CORREO_REMITENTE',
      `debe ser "Nombre <correo@dominio>" o un correo (recibido "${CORREO_REMITENTE}").`,
    );
  }
  const RESEND_CUOTA_DIARIA = l.entero('RESEND_CUOTA_DIARIA', {
    defecto: 100,
    min: 1,
  });
  const RESEND_CUOTA_MENSUAL = l.entero('RESEND_CUOTA_MENSUAL', {
    defecto: 3000,
    min: 1,
  });
  if (RESEND_CUOTA_MENSUAL < RESEND_CUOTA_DIARIA) {
    l.error(
      'RESEND_CUOTA_MENSUAL',
      `no puede ser menor que RESEND_CUOTA_DIARIA (${RESEND_CUOTA_MENSUAL} < ${RESEND_CUOTA_DIARIA}).`,
    );
  }
  const CUOTA_UMBRAL_AVISO = l.decimal('CUOTA_UMBRAL_AVISO', {
    defecto: 0.8,
    mayorQue: 0,
    max: 1,
  });

  // Recordatorios (ADR-13 §3, §5, §7, §11, §15, §16).
  const RECORDATORIO_ANTELACIONES_MIN = l.listaAntelaciones(
    'RECORDATORIO_ANTELACIONES_MIN',
    [1440, 120],
  );
  const RECORDATORIO_SILENCIO_DESDE = l.hora(
    'RECORDATORIO_SILENCIO_DESDE',
    '21:00',
  );
  const RECORDATORIO_SILENCIO_HASTA = l.hora(
    'RECORDATORIO_SILENCIO_HASTA',
    '08:00',
  );
  if (RECORDATORIO_SILENCIO_DESDE === RECORDATORIO_SILENCIO_HASTA) {
    l.error(
      'RECORDATORIO_SILENCIO_HASTA',
      'no puede ser igual a RECORDATORIO_SILENCIO_DESDE.',
    );
  }
  const RECORDATORIO_MARGEN_MINIMO_MIN = l.entero(
    'RECORDATORIO_MARGEN_MINIMO_MIN',
    {
      defecto: 30,
      min: 0,
    },
  );
  const RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN = l.entero(
    'RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN',
    { defecto: 60, min: 0 },
  );
  const RECORDATORIO_MAX_INTENTOS = l.entero('RECORDATORIO_MAX_INTENTOS', {
    defecto: 5,
    min: 1,
  });
  const RECORDATORIO_LOTE = l.entero('RECORDATORIO_LOTE', {
    defecto: 20,
    min: 1,
  });
  const RECORDATORIO_INTERVALO_SEG = l.entero('RECORDATORIO_INTERVALO_SEG', {
    defecto: 60,
    min: 1,
  });
  const RECORDATORIO_MAX_DIARIO_POR_TENANT = l.entero(
    'RECORDATORIO_MAX_DIARIO_POR_TENANT',
    { defecto: 40, min: 1 },
  );
  const RECORDATORIO_EXIGIR_CONSENTIMIENTO = l.booleano(
    'RECORDATORIO_EXIGIR_CONSENTIMIENTO',
    false,
  );
  const RECORDATORIO_UMBRAL_TASA_FALLO = l.decimal(
    'RECORDATORIO_UMBRAL_TASA_FALLO',
    {
      defecto: 0.05,
      mayorQue: 0,
      max: 1,
    },
  );
  const RECORDATORIO_UMBRAL_MUESTRA_MIN = l.entero(
    'RECORDATORIO_UMBRAL_MUESTRA_MIN',
    { defecto: 20, min: 1 },
  );

  if (l.errores.length > 0) {
    throw new EntornoInvalidoError(l.errores);
  }

  const entorno: Entorno = {
    NODE_ENV,
    PORT,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASS,
    DB_NAME,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    FRONTEND_URL,
    CORS_ORIGENES_EXTRA,
    APP_TZ,
    SOLICITUD_VENTANA_HORAS,
    LOG_NIVEL,
    LOG_FORMATO,
    BETTERSTACK_SOURCE_TOKEN,
    BETTERSTACK_INGESTING_HOST,
    BETTERSTACK_HEARTBEAT_SALIDA_URL,
    BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL,
    PLANIFICADOR_ACTIVO,
    EVENTOS_SALIDA_INTERVALO_SEG,
    EVENTOS_SALIDA_LOTE,
    EVENTOS_SALIDA_MAX_INTENTOS,
    EVENTOS_SALIDA_RETENCION_DIAS,
    MENSAJERIA_ADAPTADOR,
    RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET,
    CORREO_DOMINIO,
    CORREO_REMITENTE,
    RESEND_CUOTA_DIARIA,
    RESEND_CUOTA_MENSUAL,
    CUOTA_UMBRAL_AVISO,
    RECORDATORIO_ANTELACIONES_MIN,
    RECORDATORIO_SILENCIO_DESDE,
    RECORDATORIO_SILENCIO_HASTA,
    RECORDATORIO_MARGEN_MINIMO_MIN,
    RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN,
    RECORDATORIO_MAX_INTENTOS,
    RECORDATORIO_LOTE,
    RECORDATORIO_INTERVALO_SEG,
    RECORDATORIO_MAX_DIARIO_POR_TENANT,
    RECORDATORIO_EXIGIR_CONSENTIMIENTO,
    RECORDATORIO_UMBRAL_TASA_FALLO,
    RECORDATORIO_UMBRAL_MUESTRA_MIN,
  };

  return { ...crudo, ...entorno };
}

function mensajeDe(e: unknown): string {
  if (e instanceof OrigenCorsInvalidoError) {
    return `${e.message}.`;
  }
  return e instanceof Error ? e.message : String(e);
}
