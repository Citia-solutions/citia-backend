import { Logger } from '@nestjs/common';

import { LatidosBetterStack } from './latidos-better-stack';

const URL_SALIDA =
  'https://uptime.betterstack.com/api/v1/heartbeat/token-salida';
const URL_RECORDATORIOS =
  'https://uptime.betterstack.com/api/v1/heartbeat/token-recordatorios/';

function respuesta(status: number): Response {
  return new Response(null, { status });
}

describe('LatidosBetterStack', () => {
  let warn: jest.SpyInstance;
  let reloj: number;
  const ahora = (): number => reloj;

  beforeEach(() => {
    reloj = 1_000_000;
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('sin URL configurada no hace nada', async () => {
    const fetch = jest.fn();
    const latidos = new LatidosBetterStack({}, { fetch, ahora });

    await latidos.latir('salida');
    await latidos.informarFallo('recordatorios');

    expect(fetch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('hace un GET a la URL del job con tiempo límite', async () => {
    const fetch = jest.fn().mockResolvedValue(respuesta(200));
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA, recordatorios: URL_RECORDATORIOS },
      { fetch, ahora },
    );

    await latidos.latir('salida');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_SALIDA);
    expect(init.method).toBe('GET');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(warn).not.toHaveBeenCalled();
  });

  it('informa un fallo en <url>/fail', async () => {
    const fetch = jest.fn().mockResolvedValue(respuesta(200));
    const latidos = new LatidosBetterStack(
      { recordatorios: URL_RECORDATORIOS },
      { fetch, ahora },
    );

    await latidos.informarFallo('recordatorios');

    expect((fetch.mock.calls[0] as [string])[0]).toBe(
      'https://uptime.betterstack.com/api/v1/heartbeat/token-recordatorios/fail',
    );
  });

  it('nunca lanza: error de red', async () => {
    const fetch = jest.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }),
    );
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA },
      { fetch, ahora },
    );

    await expect(latidos.latir('salida')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'latido.fallido',
        latido: 'salida',
        motivo: 'ECONNREFUSED',
      }),
    );
  });

  it('nunca lanza: respuesta no 2xx', async () => {
    const fetch = jest.fn().mockResolvedValue(respuesta(503));
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA },
      { fetch, ahora },
    );

    await expect(latidos.latir('salida')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'http_503' }),
    );
  });

  it('nunca lanza: tiempo agotado (corta la espera)', async () => {
    // Un fetch que solo termina cuando se aborta la señal.
    const fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason as Error),
          );
        }),
    );
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA },
      {
        fetch: fetch as unknown as typeof globalThis.fetch,
        ahora,
        tiempoLimiteMs: 20,
      },
    );

    await expect(latidos.latir('salida')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'tiempo_agotado' }),
    );
  });

  it('nunca lanza: URL inválida', async () => {
    const latidos = new LatidosBetterStack(
      { salida: 'no es una url' },
      { ahora },
    );
    await expect(latidos.latir('salida')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('nunca registra la URL (lleva el token del heartbeat)', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValue(new Error(`fallo hacia ${URL_SALIDA}`));
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA },
      { fetch, ahora },
    );

    await latidos.latir('salida');

    expect(JSON.stringify(warn.mock.calls)).not.toContain('token-salida');
  });

  it('envía como mucho un latido por intervalo y por job', async () => {
    const fetch = jest.fn().mockResolvedValue(respuesta(200));
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA, recordatorios: URL_RECORDATORIOS },
      { fetch, ahora, intervaloMinimoMs: 50_000 },
    );

    await latidos.latir('salida'); // envía
    reloj += 5_000;
    await latidos.latir('salida'); // se salta (tick de 5 s)
    await latidos.latir('recordatorios'); // otro job: envía
    await latidos.informarFallo('salida'); // otro tipo: envía
    reloj += 45_000;
    await latidos.latir('salida'); // pasaron 50 s: envía

    expect(fetch.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      URL_SALIDA,
      URL_RECORDATORIOS,
      `${URL_SALIDA}/fail`,
      URL_SALIDA,
    ]);
  });

  it('un aviso fallido también cuenta para el intervalo (no insiste en cada tick)', async () => {
    const fetch = jest.fn().mockResolvedValue(respuesta(500));
    const latidos = new LatidosBetterStack(
      { salida: URL_SALIDA },
      { fetch, ahora },
    );

    await latidos.latir('salida');
    reloj += 5_000;
    await latidos.latir('salida');

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
