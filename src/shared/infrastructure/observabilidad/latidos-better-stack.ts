import { Logger } from '@nestjs/common';

import { Latidos, NombreLatido } from '../../application/latidos';

export interface OpcionesLatidosBetterStack {
  /** Tiempo máximo de cada aviso. Por defecto, 5 s. */
  tiempoLimiteMs?: number;
  /**
   * Separación mínima entre dos avisos del mismo tipo para un mismo job. Por
   * defecto, 50 s: "como mucho uno por minuto" (ADR-13 §16) sin saltarse el
   * de un job que corre exactamente cada 60 s.
   */
  intervaloMinimoMs?: number;
  /** Inyectables para los tests. */
  fetch?: typeof fetch;
  ahora?: () => number;
}

type TipoAviso = 'latido' | 'fallo';

/**
 * Adaptador de `Latidos` para los heartbeats de Better Stack: un GET a la URL
 * del heartbeat (`https://uptime.betterstack.com/api/v1/heartbeat/<token>`) y
 * `<url>/fail` para informar un fallo.
 *
 * La URL lleva el token del heartbeat: es un secreto y nunca se registra. Los
 * logs solo dicen qué job y por qué falló el aviso.
 */
export class LatidosBetterStack extends Latidos {
  private readonly logger = new Logger(LatidosBetterStack.name);
  private readonly tiempoLimiteMs: number;
  private readonly intervaloMinimoMs: number;
  private readonly hacerFetch: typeof fetch;
  private readonly ahora: () => number;
  private readonly ultimoAviso = new Map<string, number>();

  constructor(
    private readonly urls: Partial<Record<NombreLatido, string>>,
    opciones: OpcionesLatidosBetterStack = {},
  ) {
    super();
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? 5_000;
    this.intervaloMinimoMs = opciones.intervaloMinimoMs ?? 50_000;
    this.hacerFetch = opciones.fetch ?? fetch;
    this.ahora = opciones.ahora ?? Date.now;
  }

  latir(nombre: NombreLatido): Promise<void> {
    return this.avisar(nombre, 'latido');
  }

  informarFallo(nombre: NombreLatido): Promise<void> {
    return this.avisar(nombre, 'fallo');
  }

  private async avisar(nombre: NombreLatido, tipo: TipoAviso): Promise<void> {
    try {
      const base = this.urls[nombre];
      if (!base) {
        return;
      }
      const clave = `${nombre}:${tipo}`;
      const ahora = this.ahora();
      const anterior = this.ultimoAviso.get(clave);
      if (anterior !== undefined && ahora - anterior < this.intervaloMinimoMs) {
        return;
      }
      // Se marca al intentar, no al lograrlo: si Better Stack no responde, no
      // se le insiste en cada tick.
      this.ultimoAviso.set(clave, ahora);

      const url = tipo === 'fallo' ? `${base.replace(/\/+$/, '')}/fail` : base;
      const respuesta = await this.hacerFetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.tiempoLimiteMs),
      });
      if (!respuesta.ok) {
        this.registrarFallo(nombre, tipo, `http_${respuesta.status}`);
      }
    } catch (e) {
      this.registrarFallo(nombre, tipo, motivoDe(e));
    }
  }

  private registrarFallo(
    nombre: NombreLatido,
    tipo: TipoAviso,
    motivo: string,
  ): void {
    try {
      this.logger.warn({
        evento: 'latido.fallido',
        latido: nombre,
        tipo,
        motivo,
        msg: `No se pudo enviar el ${tipo} "${nombre}" a Better Stack (${motivo})`,
      });
    } catch {
      // Ni el log puede romper el job.
    }
  }
}

/**
 * Código corto del fallo, nunca el mensaje (podría traer la URL). Por forma y
 * no con `instanceof`: el `DOMException` del tiempo agotado no siempre hereda
 * del `Error` del mismo realm.
 */
function motivoDe(e: unknown): string {
  if (typeof e !== 'object' || e === null) {
    return 'desconocido';
  }
  const { name, cause } = e as { name?: unknown; cause?: { code?: unknown } };
  if (name === 'TimeoutError' || name === 'AbortError') {
    return 'tiempo_agotado';
  }
  if (cause && typeof cause.code === 'string') {
    return cause.code;
  }
  return typeof name === 'string' ? name : 'desconocido';
}
