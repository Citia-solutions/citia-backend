import { createHash } from 'node:crypto';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  normalizeIp,
  type ThrottlerGetTrackerFunction,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from '@nestjs/throttler';

import { CABECERA_ENLACE_CITA } from '../../presentation/cabecera-enlace-cita';
import {
  type ClaveLimiteTasa,
  LIMITES_TASA,
  METADATA_LIMITES_TASA,
  type NombreLimiteTasa,
} from '../../presentation/limitar-tasa.decorator';

/**
 * Configuración de `@nestjs/throttler` para el límite de tasa (contrato de la
 * Fase 3 §6). Funciones puras: sin `process.env`; `LimiteTasaModule` les pasa
 * `LIMITE_TASA_ACTIVO` del entorno validado.
 *
 *  - Un throttler con nombre por cada entrada de `LIMITES_TASA`.
 *  - OPT-IN: cada throttler se salta en las rutas que no lo piden con
 *    `@LimitarTasa(...)` (y todos, con `LIMITE_TASA_ACTIVO=false`).
 *  - Clave del contador = nombre del límite + quién pide (IP o enlace), SIN la
 *    ruta: el cubo es compartido entre las rutas que usan el mismo límite.
 *  - Almacén en memoria (el de la librería): una sola réplica en Railway
 *    (decisión L2). Con varias réplicas cada una contaría por su lado.
 *  - 429 genérico y sin cabeceras `X-RateLimit-*` / `Retry-After`.
 */

/** Cuerpo del 429: `{ statusCode: 429, message: MENSAJE_LIMITE_TASA }`. */
export const MENSAJE_LIMITE_TASA =
  'Demasiados intentos, prueba en unos minutos';

/** Las IPv6 se agrupan por /64 (lo que suele recibir un mismo cliente). */
const PREFIJO_SUBRED_IPV6 = 64;

interface PeticionRastreable {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * IP del cliente. Depende de `app.set('trust proxy', 1)` en `main.ts`: sin
 * eso, detrás del proxy de Railway todas las peticiones tendrían la IP del
 * proxy y compartirían un mismo contador.
 */
export function rastrearPorIp(req: PeticionRastreable): string {
  const ip = normalizeIp(req.ip ?? '', PREFIJO_SUBRED_IPV6);
  return `ip:${ip || 'desconocida'}`;
}

/**
 * Enlace del paciente: sha256 (hex) de la cabecera `X-Enlace-Cita`, así el
 * token no queda en memoria en claro. Sin cabecera (o vacía), cae a la IP.
 *
 * No valida el token: uno inventado también cuenta (contra la fuerza bruta
 * de tokens está el límite por IP del portal).
 */
export function rastrearPorEnlace(req: PeticionRastreable): string {
  const crudo = req.headers?.[CABECERA_ENLACE_CITA];
  const valor = Array.isArray(crudo) ? crudo[0] : crudo;
  if (typeof valor !== 'string' || valor === '') {
    return rastrearPorIp(req);
  }
  return `enlace:${createHash('sha256').update(valor).digest('hex')}`;
}

const RASTREADORES: Record<ClaveLimiteTasa, ThrottlerGetTrackerFunction> = {
  ip: rastrearPorIp,
  enlace: rastrearPorEnlace,
};

const reflector = new Reflector();

/** Límites que pide la ruta: los de su clase más los de su método. */
export function limitesDeRuta(
  contexto: ExecutionContext,
): readonly NombreLimiteTasa[] {
  return reflector.getAllAndMerge<NombreLimiteTasa[]>(METADATA_LIMITES_TASA, [
    contexto.getHandler(),
    contexto.getClass(),
  ]);
}

/** Clave del contador: el nombre del límite y quién pide; nunca la ruta. */
export function claveContador(
  _contexto: ExecutionContext,
  rastro: string,
  nombre: string,
): string {
  return `${nombre}:${rastro}`;
}

export interface ConfiguracionLimiteTasa {
  /** `LIMITE_TASA_ACTIVO`. Con `false` ninguna ruta se limita. */
  activo: boolean;
}

/** Opciones de `ThrottlerModule.forRoot(Async)`. */
export function crearOpcionesLimiteTasa({
  activo,
}: ConfiguracionLimiteTasa): ThrottlerModuleOptions {
  const throttlers: ThrottlerOptions[] = (
    Object.keys(LIMITES_TASA) as NombreLimiteTasa[]
  ).map((nombre) => {
    const { limite, ventanaMs, clave } = LIMITES_TASA[nombre];
    return {
      name: nombre,
      limit: limite,
      ttl: ventanaMs,
      // Al pasarse, bloqueado una ventana completa.
      blockDuration: ventanaMs,
      getTracker: RASTREADORES[clave],
      skipIf: (contexto: ExecutionContext): boolean =>
        !activo ||
        contexto.getType() !== 'http' ||
        !limitesDeRuta(contexto).includes(nombre),
    };
  });

  return {
    throttlers,
    generateKey: claveContador,
    errorMessage: MENSAJE_LIMITE_TASA,
    setHeaders: false,
  };
}
