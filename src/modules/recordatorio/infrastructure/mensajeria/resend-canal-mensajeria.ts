import type { CreateEmailResponse, Resend } from 'resend';

import {
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
  TipoResultadoEnvio,
} from '../../domain/canal-mensajeria';
import { MotivoRecordatorio } from '../../domain/recordatorio.entity';

export const PROVEEDOR_RESEND = 'resend';
/** ADR-13 §7.4: la llamada al proveedor no espera más de 10 s. */
export const TIEMPO_LIMITE_RESEND_MS = 10_000;

/** Lo único del SDK que usa el adaptador (los tests lo arman con `new Resend`). */
export interface ClienteResend {
  emails: Pick<Resend['emails'], 'send'>;
}

export interface OpcionesResendCanal {
  /** `CORREO_REMITENTE`, p. ej. `Citia <recordatorios@notificaciones.citia.cl>`. */
  remitente: string;
  tiempoLimiteMs?: number;
}

/** Forma del error que devuelve el SDK (`ErrorResponse`), sin fiarse del tipo. */
export interface ErrorResend {
  name?: unknown;
  statusCode?: unknown;
  message?: unknown;
}

/**
 * Nombres de error de Resend verificados el 2026-10-03 contra
 * https://resend.com/docs/api-reference/errors y los tipos del SDK `resend`
 * 6.32 (`RESEND_ERROR_CODE_KEY`).
 */
const ERRORES_CONFIGURACION: ReadonlySet<string> = new Set([
  'missing_api_key', // 401
  'invalid_api_key', // 403 (SDK)
  'restricted_api_key', // 401 / 403
  'suspended_api_key', // 403
  'invalid_access', // SDK
  'invalid_permission', // 403
  'security_error', // SDK
  'invalid_from_address', // remitente mal formado (SDK)
  'invalid_region', // SDK
  'invalid_idempotency_key', // 400: nuestra clave; afectaría a todos
  'not_found', // 404: ruta de la API equivocada
  'method_not_allowed', // 405
]);

const ERRORES_TRANSITORIOS: ReadonlySet<string> = new Set([
  'rate_limit_exceeded', // 429 por ritmo
  'concurrent_idempotent_requests', // 409: otra petición con la misma clave en curso
  'resource_locked', // 409
  'application_error', // 500, o respuesta sin JSON / sin red (SDK)
  'internal_server_error', // 500 (SDK)
  'service_unavailable', // 503
]);

const NOMBRE_SEGURO = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Adaptador de `CanalMensajeria` para Resend (ADR-13 §8, §9.3, §10, §13) con el
 * SDK oficial.
 *
 * - `Idempotency-Key` = `mensaje.claveIdempotencia` (`recordatorio/<id>`):
 *   Resend la recuerda 24 h, de sobra para el calendario de reintentos.
 * - Etiqueta `recordatorio_id` (llega en `data.tags` de cada webhook).
 * - `reply_to` solo si el profesional configuró un correo de respuesta.
 * - Tiempo límite propio (`AbortSignal.timeout`, 10 s): un tiempo agotado es
 *   `transitorio`.
 * - **No lanza** por errores del proveedor: los traduce con
 *   `clasificarErrorResend`. Nunca registra el destinatario ni el cuerpo.
 *
 * Nota: fuera de `NODE_ENV=production` el SDK escribe sus errores con
 * `console.error` (el código y el mensaje de Resend, sin el cuerpo enviado).
 */
export class ResendCanalMensajeria extends CanalMensajeria {
  private readonly tiempoLimiteMs: number;

  constructor(
    private readonly cliente: ClienteResend,
    private readonly opciones: OpcionesResendCanal,
  ) {
    super();
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_RESEND_MS;
  }

  async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    const senal = AbortSignal.timeout(this.tiempoLimiteMs);
    let respuesta: CreateEmailResponse;
    try {
      respuesta = await this.cliente.emails.send(
        {
          from: this.opciones.remitente,
          to: [mensaje.destinatario],
          subject: mensaje.asunto,
          html: mensaje.html,
          text: mensaje.texto,
          ...(mensaje.responderA ? { replyTo: mensaje.responderA } : {}),
          tags: Object.entries(mensaje.etiquetas).map(([name, value]) => ({
            name,
            value,
          })),
        },
        { idempotencyKey: mensaje.claveIdempotencia, signal: senal },
      );
    } catch {
      // El SDK devuelve los errores de red como `application_error`; solo
      // lanza si el tiempo se agota mientras lee el cuerpo de un error.
      return transitorio(senal.aborted ? 'tiempo_agotado' : 'error_red');
    }

    if (respuesta.error === null) {
      const id: unknown = respuesta.data?.id;
      return typeof id === 'string' && id !== ''
        ? {
            tipo: TipoResultadoEnvio.ACEPTADO,
            proveedor: PROVEEDOR_RESEND,
            proveedorMensajeId: id,
          }
        : // 2xx sin id: lo aceptó, pero no sabemos cuál es. El webhook
          // `email.sent` completa el id (como un posible duplicado).
          {
            tipo: TipoResultadoEnvio.POSIBLE_DUPLICADO,
            proveedor: PROVEEDOR_RESEND,
            codigo: 'respuesta_sin_id',
          };
    }
    return clasificarErrorResend(respuesta.error, senal.aborted);
  }
}

/**
 * Traduce un error de Resend a un `ResultadoEnvio` (tabla de ADR-13 §8),
 * ajustada a la documentación oficial:
 *
 * | Respuesta                                               | Resultado            |
 * |---------------------------------------------------------|----------------------|
 * | sin respuesta (red) / tiempo agotado                    | transitorio          |
 * | 429 `daily_quota_exceeded`                              | cuota_agotada (día)  |
 * | 429 `monthly_quota_exceeded`                            | cuota_agotada (mes)  |
 * | 409 `invalid_idempotent_request`                        | posible_duplicado    |
 * | 401 / 403 (cualquier nombre: también `validation_error` de dominio no verificado o "solo a tu correo") | configuracion |
 * | claves, remitente, región, 404, 405, `invalid_idempotency_key` | configuracion |
 * | 429 `rate_limit_exceeded`, 409 concurrente, 5xx         | transitorio          |
 * | 400 / 422 sobre `to`                                    | permanente (`correo_invalido`) |
 * | 400 / 422 sobre `from`                                  | configuracion        |
 * | otro 400 / 422 / 4xx                                    | permanente (`rechazado`) |
 *
 * `codigo` es el nombre del error de Resend (o `http_<status>`), nunca su
 * mensaje: puede traer direcciones.
 */
export function clasificarErrorResend(
  error: ErrorResend,
  tiempoAgotado = false,
): ResultadoEnvio {
  const nombre =
    typeof error.name === 'string' && NOMBRE_SEGURO.test(error.name)
      ? error.name
      : null;
  const status =
    typeof error.statusCode === 'number' && Number.isInteger(error.statusCode)
      ? error.statusCode
      : null;
  const mensaje = typeof error.message === 'string' ? error.message : '';
  const codigo = nombre ?? (status !== null ? `http_${status}` : 'desconocido');

  if (status === null) {
    // El SDK no obtuvo respuesta: red caída o tiempo agotado.
    return transitorio(tiempoAgotado ? 'tiempo_agotado' : 'error_red');
  }
  if (nombre === 'daily_quota_exceeded') {
    return cuotaAgotada(codigo, 'dia');
  }
  if (nombre === 'monthly_quota_exceeded') {
    return cuotaAgotada(codigo, 'mes');
  }
  if (nombre === 'invalid_idempotent_request') {
    return {
      tipo: TipoResultadoEnvio.POSIBLE_DUPLICADO,
      proveedor: PROVEEDOR_RESEND,
      codigo,
    };
  }
  if (
    status === 401 ||
    status === 403 ||
    // 404 / 405 en POST /emails: la URL o el método de la API están mal.
    status === 404 ||
    status === 405 ||
    (nombre !== null && ERRORES_CONFIGURACION.has(nombre))
  ) {
    return configuracion(codigo);
  }
  if (
    (nombre !== null && ERRORES_TRANSITORIOS.has(nombre)) ||
    status >= 500 ||
    status === 429 ||
    status === 408
  ) {
    return transitorio(codigo);
  }
  if (status >= 400) {
    const campo = campoDelMensaje(mensaje);
    if (campo === 'from') {
      return configuracion(`${codigo}:from`);
    }
    return {
      tipo: TipoResultadoEnvio.PERMANENTE,
      proveedor: PROVEEDOR_RESEND,
      codigo: campo ? `${codigo}:${campo}` : codigo,
      motivo:
        campo === 'to'
          ? MotivoRecordatorio.CORREO_INVALIDO
          : MotivoRecordatorio.RECHAZADO,
    };
  }
  return transitorio(codigo);
}

/**
 * El campo que nombra un error de validación de Resend ("Invalid `to`
 * field…"). Solo para elegir el motivo: el mensaje nunca se guarda.
 */
function campoDelMensaje(mensaje: string): 'to' | 'from' | 'reply_to' | null {
  const campo = /`(to|from|reply_to|replyTo)`/.exec(mensaje)?.[1];
  if (campo === 'to' || campo === 'from') return campo;
  if (campo === 'reply_to' || campo === 'replyTo') return 'reply_to';
  return null;
}

function transitorio(codigo: string): ResultadoEnvio {
  return {
    tipo: TipoResultadoEnvio.TRANSITORIO,
    proveedor: PROVEEDOR_RESEND,
    codigo,
  };
}

function cuotaAgotada(codigo: string, alcance: 'dia' | 'mes'): ResultadoEnvio {
  return {
    tipo: TipoResultadoEnvio.CUOTA_AGOTADA,
    proveedor: PROVEEDOR_RESEND,
    codigo,
    alcance,
  };
}

function configuracion(codigo: string): ResultadoEnvio {
  return {
    tipo: TipoResultadoEnvio.CONFIGURACION,
    proveedor: PROVEEDOR_RESEND,
    codigo,
  };
}
