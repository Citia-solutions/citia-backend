import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

export type EstadoComponente = 'ok' | 'error';

export interface RespuestaSalud {
  estado: EstadoComponente;
  baseDatos: EstadoComponente;
}

/** Tiempo máximo del `SELECT 1`: el monitor no debe quedarse esperando. */
export const TIEMPO_LIMITE_BASE_DATOS_MS = 2_000;

class TiempoAgotadoError extends Error {
  constructor() {
    super('tiempo_agotado');
    this.name = 'TiempoAgotadoError';
  }
}

/**
 * `GET /api/health` — salud para el monitor de uptime de Better Stack
 * (ADR-13 §16, §17; DT-19).
 *
 *  - Público (sin guard), barato y sin datos sensibles: ni versión, ni
 *    entorno, ni el error de la base.
 *  - Comprueba Postgres con `SELECT 1` y tiempo límite: 200 si responde, 503
 *    si no. El monitor alerta con el código, sin leer el cuerpo.
 *  - `Cache-Control: no-store`: nunca una respuesta cacheada por un proxy.
 *  - No genera log por petición (ver `RUTA_SALUD` en `opciones-logger.ts`);
 *    solo un `warn` cuando la base falla.
 */
@Controller('health')
export class SaludController {
  private readonly logger = new Logger(SaludController.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async comprobar(
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaSalud> {
    const baseDatos = await this.comprobarBaseDatos();
    if (baseDatos !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { estado: 'error', baseDatos };
    }
    return { estado: 'ok', baseDatos };
  }

  private async comprobarBaseDatos(): Promise<EstadoComponente> {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_resolver, rechazar) => {
      temporizador = setTimeout(
        () => rechazar(new TiempoAgotadoError()),
        TIEMPO_LIMITE_BASE_DATOS_MS,
      );
      temporizador.unref();
    });
    try {
      await Promise.race([this.dataSource.query('SELECT 1'), limite]);
      return 'ok';
    } catch (e) {
      this.logger.warn({
        evento: 'salud.base_datos',
        motivo: codigoDe(e),
        msg: 'La base de datos no respondió al health check',
      });
      return 'error';
    } finally {
      clearTimeout(temporizador);
    }
  }
}

/** Solo un código (p. ej. `ECONNREFUSED`, `57P01`), nunca el mensaje. */
function codigoDe(e: unknown): string {
  if (e instanceof TiempoAgotadoError) {
    return 'tiempo_agotado';
  }
  if (typeof e === 'object' && e !== null) {
    const { code, name } = e as { code?: unknown; name?: unknown };
    if (typeof code === 'string') {
      return code;
    }
    if (typeof name === 'string') {
      return name;
    }
  }
  return 'desconocido';
}
