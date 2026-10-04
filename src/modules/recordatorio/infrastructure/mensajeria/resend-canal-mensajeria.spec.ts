import { Resend } from 'resend';

import {
  MensajeSaliente,
  ResultadoEnvio,
  TipoResultadoEnvio,
  claveIdempotencia,
} from '../../domain/canal-mensajeria';
import { MotivoRecordatorio } from '../../domain/recordatorio.entity';
import {
  ResendCanalMensajeria,
  clasificarErrorResend,
} from './resend-canal-mensajeria';

/**
 * Adaptador de Resend con RESPUESTAS GRABADAS (DoD de US-03, "Proveedor, cuota
 * y webhooks"). Se usa el SDK oficial de verdad y se sustituye solo `fetch`:
 * así también se prueba cómo el SDK traduce cada respuesta HTTP.
 *
 * Cuerpos según https://resend.com/docs/api-reference/errors (2026-10-03):
 * `{ statusCode, name, message }`.
 */

const ID = '0e5a0000-0000-4000-8000-000000000001';

const MENSAJE: MensajeSaliente = {
  destinatario: 'paciente@correo.cl',
  asunto: 'Recordatorio de tu hora: martes 14 de octubre, 10:30',
  html: '<p>hola</p>',
  texto: 'hola',
  responderA: 'consulta@ana.cl',
  claveIdempotencia: claveIdempotencia(ID),
  etiquetas: { recordatorio_id: ID },
};

type Grabada =
  | { status: number; cuerpo: unknown }
  | { status: number; texto: string };

const GRABADAS = {
  ok: { status: 200, cuerpo: { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' } },
  validacion422To: {
    status: 422,
    cuerpo: {
      statusCode: 422,
      name: 'validation_error',
      message:
        'Invalid `to` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.',
    },
  },
  validacion400To: {
    status: 400,
    cuerpo: {
      statusCode: 400,
      name: 'validation_error',
      message:
        'Invalid `to` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.',
    },
  },
  validacion400From: {
    status: 400,
    cuerpo: {
      statusCode: 400,
      name: 'validation_error',
      message: 'Invalid `from` field. The email address needs to follow …',
    },
  },
  parametroInvalido422: {
    status: 422,
    cuerpo: {
      statusCode: 422,
      name: 'invalid_parameter',
      message: 'The `parameter` must be a valid UUID.',
    },
  },
  ritmo429: {
    status: 429,
    cuerpo: {
      statusCode: 429,
      name: 'rate_limit_exceeded',
      message:
        'Too many requests. Please limit the number of requests per second.',
    },
  },
  cuotaDiaria429: {
    status: 429,
    cuerpo: {
      statusCode: 429,
      name: 'daily_quota_exceeded',
      message: 'You have exceeded your daily email sending quota.',
    },
  },
  cuotaMensual429: {
    status: 429,
    cuerpo: {
      statusCode: 429,
      name: 'monthly_quota_exceeded',
      message: 'You have exceeded your monthly email sending quota.',
    },
  },
  sinClave401: {
    status: 401,
    cuerpo: {
      statusCode: 401,
      name: 'missing_api_key',
      message: 'Missing API key in the authorization header.',
    },
  },
  restringida401: {
    status: 401,
    cuerpo: {
      statusCode: 401,
      name: 'restricted_api_key',
      message: 'This API key is restricted to only send emails.',
    },
  },
  suspendida403: {
    status: 403,
    cuerpo: {
      statusCode: 403,
      name: 'suspended_api_key',
      message: 'This API key is suspended',
    },
  },
  dominioNoVerificado403: {
    status: 403,
    cuerpo: {
      statusCode: 403,
      name: 'validation_error',
      message:
        'The `citia.cl` domain is not verified. Please, add and verify your domain.',
    },
  },
  soloTuCorreo403: {
    status: 403,
    cuerpo: {
      statusCode: 403,
      name: 'validation_error',
      message:
        'You can only send testing emails to your own email address (`dueno@correo.cl`).',
    },
  },
  interno500: {
    status: 500,
    cuerpo: {
      statusCode: 500,
      name: 'application_error',
      message: 'An unexpected error occurred.',
    },
  },
  noDisponible503: {
    status: 503,
    cuerpo: {
      statusCode: 503,
      name: 'service_unavailable',
      message: 'API is temporarily unavailable',
    },
  },
  proxyHtml502: { status: 502, texto: '<html>Bad Gateway</html>' },
  idempotenciaDistinta409: {
    status: 409,
    cuerpo: {
      statusCode: 409,
      name: 'invalid_idempotent_request',
      message:
        "This idempotency key has been used with this HTTP method and endpoint within the last 24 hours, but the request body was modified and doesn't match the original request.",
    },
  },
  idempotenciaConcurrente409: {
    status: 409,
    cuerpo: {
      statusCode: 409,
      name: 'concurrent_idempotent_requests',
      message:
        'There is another request in progress with the same idempotency key.',
    },
  },
  claveIdempotenciaInvalida400: {
    status: 400,
    cuerpo: {
      statusCode: 400,
      name: 'invalid_idempotency_key',
      message:
        'Idempotency keys, if present, must have between 1 and 256 characters.',
    },
  },
} satisfies Record<string, Grabada>;

function respuesta(grabada: Grabada): Response {
  return 'cuerpo' in grabada
    ? new Response(JSON.stringify(grabada.cuerpo), {
        status: grabada.status,
        headers: { 'content-type': 'application/json' },
      })
    : new Response(grabada.texto, {
        status: grabada.status,
        headers: { 'content-type': 'text/html' },
      });
}

describe('ResendCanalMensajeria (respuestas grabadas)', () => {
  let fetchMock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;
  let canal: ResendCanalMensajeria;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    // El SDK escribe sus errores con console.error fuera de producción.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    canal = new ResendCanalMensajeria(new Resend('re_test_123'), {
      remitente: 'Citia <recordatorios@notificaciones.citia.cl>',
      tiempoLimiteMs: 50,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const enviarCon = (grabada: Grabada): Promise<ResultadoEnvio> => {
    fetchMock.mockResolvedValueOnce(respuesta(grabada));
    return canal.enviar(MENSAJE);
  };

  describe('petición', () => {
    it('POST /emails con Idempotency-Key, etiqueta recordatorio_id, reply_to y ambos cuerpos', async () => {
      // Act
      await enviarCon(GRABADAS.ok);

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      const cabeceras = new Headers(init?.headers);
      expect(cabeceras.get('Idempotency-Key')).toBe(`recordatorio/${ID}`);
      expect(cabeceras.get('Authorization')).toBe('Bearer re_test_123');
      expect(JSON.parse(init?.body as string)).toEqual({
        from: 'Citia <recordatorios@notificaciones.citia.cl>',
        to: ['paciente@correo.cl'],
        subject: MENSAJE.asunto,
        html: '<p>hola</p>',
        text: 'hola',
        reply_to: 'consulta@ana.cl',
        tags: [{ name: 'recordatorio_id', value: ID }],
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('sin correo de respuesta no manda reply_to', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(respuesta(GRABADAS.ok));

      // Act
      await canal.enviar({ ...MENSAJE, responderA: null });

      // Assert
      const cuerpo = JSON.parse(
        fetchMock.mock.calls[0][1]?.body as string,
      ) as Record<string, unknown>;
      expect(cuerpo).not.toHaveProperty('reply_to');
    });
  });

  describe('clasificación (DoD)', () => {
    it('200 → aceptado con el id', async () => {
      expect(await enviarCon(GRABADAS.ok)).toEqual({
        tipo: TipoResultadoEnvio.ACEPTADO,
        proveedor: 'resend',
        proveedorMensajeId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
      });
    });

    it('200 sin id → posible duplicado (el webhook completa el id)', async () => {
      expect(await enviarCon({ status: 200, cuerpo: {} })).toEqual({
        tipo: TipoResultadoEnvio.POSIBLE_DUPLICADO,
        proveedor: 'resend',
        codigo: 'respuesta_sin_id',
      });
    });

    it.each([
      ['422 validation_error sobre `to`', GRABADAS.validacion422To],
      ['400 validation_error sobre `to`', GRABADAS.validacion400To],
    ])('%s → permanente (correo_invalido)', async (_caso, grabada) => {
      expect(await enviarCon(grabada)).toEqual({
        tipo: TipoResultadoEnvio.PERMANENTE,
        proveedor: 'resend',
        codigo: 'validation_error:to',
        motivo: MotivoRecordatorio.CORREO_INVALIDO,
      });
    });

    it('422 invalid_parameter → permanente (rechazado)', async () => {
      expect(await enviarCon(GRABADAS.parametroInvalido422)).toEqual({
        tipo: TipoResultadoEnvio.PERMANENTE,
        proveedor: 'resend',
        codigo: 'invalid_parameter',
        motivo: MotivoRecordatorio.RECHAZADO,
      });
    });

    it('400 validation_error sobre `from` → configuración (remitente)', async () => {
      expect(await enviarCon(GRABADAS.validacion400From)).toEqual({
        tipo: TipoResultadoEnvio.CONFIGURACION,
        proveedor: 'resend',
        codigo: 'validation_error:from',
      });
    });

    it('429 rate_limit_exceeded (ritmo) → transitorio', async () => {
      expect(await enviarCon(GRABADAS.ritmo429)).toEqual({
        tipo: TipoResultadoEnvio.TRANSITORIO,
        proveedor: 'resend',
        codigo: 'rate_limit_exceeded',
      });
    });

    it('429 daily_quota_exceeded → cuota agotada (día)', async () => {
      expect(await enviarCon(GRABADAS.cuotaDiaria429)).toEqual({
        tipo: TipoResultadoEnvio.CUOTA_AGOTADA,
        proveedor: 'resend',
        codigo: 'daily_quota_exceeded',
        alcance: 'dia',
      });
    });

    it('429 monthly_quota_exceeded → cuota agotada (mes)', async () => {
      expect(await enviarCon(GRABADAS.cuotaMensual429)).toMatchObject({
        tipo: TipoResultadoEnvio.CUOTA_AGOTADA,
        alcance: 'mes',
      });
    });

    it.each([
      ['401 missing_api_key', GRABADAS.sinClave401, 'missing_api_key'],
      ['401 restricted_api_key', GRABADAS.restringida401, 'restricted_api_key'],
      ['403 suspended_api_key', GRABADAS.suspendida403, 'suspended_api_key'],
      [
        '403 dominio no verificado',
        GRABADAS.dominioNoVerificado403,
        'validation_error',
      ],
      [
        '403 solo a tu propio correo (remitente de pruebas)',
        GRABADAS.soloTuCorreo403,
        'validation_error',
      ],
      [
        '400 invalid_idempotency_key',
        GRABADAS.claveIdempotenciaInvalida400,
        'invalid_idempotency_key',
      ],
    ])('%s → configuración', async (_caso, grabada, codigo) => {
      expect(await enviarCon(grabada)).toEqual({
        tipo: TipoResultadoEnvio.CONFIGURACION,
        proveedor: 'resend',
        codigo,
      });
    });

    it.each([
      ['500 application_error', GRABADAS.interno500, 'application_error'],
      [
        '503 service_unavailable',
        GRABADAS.noDisponible503,
        'service_unavailable',
      ],
      ['502 sin JSON (proxy)', GRABADAS.proxyHtml502, 'application_error'],
      [
        '409 concurrent_idempotent_requests',
        GRABADAS.idempotenciaConcurrente409,
        'concurrent_idempotent_requests',
      ],
    ])('%s → transitorio', async (_caso, grabada, codigo) => {
      expect(await enviarCon(grabada)).toEqual({
        tipo: TipoResultadoEnvio.TRANSITORIO,
        proveedor: 'resend',
        codigo,
      });
    });

    it('409 invalid_idempotent_request → posible duplicado', async () => {
      expect(await enviarCon(GRABADAS.idempotenciaDistinta409)).toEqual({
        tipo: TipoResultadoEnvio.POSIBLE_DUPLICADO,
        proveedor: 'resend',
        codigo: 'invalid_idempotent_request',
      });
    });

    it('tiempo agotado → transitorio (tiempo_agotado)', async () => {
      // Arrange — no responde hasta que se aborta la señal
      fetchMock.mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_, rechazar) => {
            init?.signal?.addEventListener('abort', () =>
              rechazar(init.signal?.reason as Error),
            );
          }),
      );

      // Act
      const resultado = await canal.enviar(MENSAJE);

      // Assert
      expect(resultado).toEqual({
        tipo: TipoResultadoEnvio.TRANSITORIO,
        proveedor: 'resend',
        codigo: 'tiempo_agotado',
      });
    });

    it('error de red → transitorio (error_red)', async () => {
      // Arrange
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      // Act & Assert
      expect(await canal.enviar(MENSAJE)).toEqual({
        tipo: TipoResultadoEnvio.TRANSITORIO,
        proveedor: 'resend',
        codigo: 'error_red',
      });
    });

    it('nunca usa el mensaje del error como código (puede traer direcciones)', async () => {
      // Act
      const resultado = await enviarCon(GRABADAS.soloTuCorreo403);

      // Assert
      expect(JSON.stringify(resultado)).not.toContain('@');
    });
  });
});

describe('clasificarErrorResend', () => {
  it.each([
    [{ name: 'otro_raro', statusCode: 404 }, TipoResultadoEnvio.CONFIGURACION],
    [{ name: 'not_found', statusCode: 404 }, TipoResultadoEnvio.CONFIGURACION],
    [{ name: 'x', statusCode: 413 }, TipoResultadoEnvio.PERMANENTE],
    [{ name: 'x', statusCode: 429 }, TipoResultadoEnvio.TRANSITORIO],
    [{ name: 'x', statusCode: 408 }, TipoResultadoEnvio.TRANSITORIO],
    [{ statusCode: null }, TipoResultadoEnvio.TRANSITORIO],
    [
      { name: 'Nombre Con Espacios', statusCode: 400 },
      TipoResultadoEnvio.PERMANENTE,
    ],
  ])('%p → %s', (error, tipo) => {
    expect(clasificarErrorResend(error).tipo).toBe(tipo);
  });

  it('un nombre no seguro se reemplaza por http_<status>', () => {
    expect(
      clasificarErrorResend({ name: 'a@b.cl', statusCode: 400 }),
    ).toMatchObject({ codigo: 'http_400' });
  });
});
