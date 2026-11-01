import 'reflect-metadata';

/**
 * Límite de tasa por ruta (contrato de la Fase 3 §6, DT-18).
 *
 * OPT-IN: una ruta sin `@LimitarTasa(...)` no tiene límite. El guard global
 * (`LimiteTasaModule`, registrado una vez en `AppModule`) solo cuenta las
 * peticiones de las rutas marcadas, y solo con los límites marcados.
 *
 * Cada límite es un CUBO COMPARTIDO por nombre: todas las rutas marcadas con
 * el mismo nombre suman en el mismo contador para la misma clave (IP o
 * enlace). Así "30/min por IP en todo `/api/publico/cita*`" cuenta el GET y
 * los POST juntos.
 *
 * Al pasarse, 429 genérico (`{ statusCode: 429, message }`), sin cabeceras
 * que revelen el límite ni el tiempo restante. Sin bloqueo por "fallos": se
 * cuentan todas las peticiones, también las que terminan en 400 o 401.
 *
 * Uso:
 *
 *     @Controller('publico/cita')
 *     @LimitarTasa('portalPorIp')          // todas las rutas del controller
 *     export class PortalPacienteController {
 *       @Post('confirmar')
 *       @LimitarTasa('portalPorEnlace')    // además, solo esta ruta
 *       confirmar() { … }
 *     }
 *
 * Se acumulan: el de la clase y el del método aplican los dos, y varios
 * `@LimitarTasa` sobre el mismo método también.
 */

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;

/**
 * Con qué se identifica a quien pide:
 *  - `ip`: la IP del cliente (`req.ip`; con `trust proxy`, la que agrega el
 *    proxy de Railway). Las IPv6 se agrupan por /64.
 *  - `enlace`: sha256 de la cabecera `X-Enlace-Cita`; sin cabecera, la IP.
 */
export type ClaveLimiteTasa = 'ip' | 'enlace';

export interface DefinicionLimiteTasa {
  /** Peticiones permitidas dentro de la ventana. La siguiente recibe 429. */
  readonly limite: number;
  /** Ventana (y duración del bloqueo al pasarse), en milisegundos. */
  readonly ventanaMs: number;
  readonly clave: ClaveLimiteTasa;
}

/**
 * Tabla del contrato de la Fase 3 §6 (más los dos cubos de US-10, ADR-15 §8).
 * Es la única fuente de los límites.
 */
export const LIMITES_TASA = {
  /** `POST /api/auth/login`. */
  login: { limite: 5, ventanaMs: MINUTO_MS, clave: 'ip' },
  /** `POST /api/usuarios` (registro de organización). */
  registro: { limite: 5, ventanaMs: HORA_MS, clave: 'ip' },
  /** `POST /api/publico/:tenantSlug/solicitudes` (un cubo para todas las organizaciones). */
  solicitudPublica: { limite: 5, ventanaMs: HORA_MS, clave: 'ip' },
  /** Todo `/api/publico/cita*` (GET y POST): ponerlo en la CLASE del controller. */
  portalPorIp: { limite: 30, ventanaMs: MINUTO_MS, clave: 'ip' },
  /** Los POST de `/api/publico/cita/*`: ponerlo en CADA método POST. */
  portalPorEnlace: { limite: 5, ventanaMs: HORA_MS, clave: 'enlace' },
  /**
   * `PUT /api/usuarios/me/contrasena` (US-10, ADR-15 §8). Por IP y no por
   * usuario: este guard corre antes que `JwtAuthGuard` (no hay `req.user`).
   */
  cambioContrasena: { limite: 5, ventanaMs: HORA_MS, clave: 'ip' },
  /**
   * `POST /api/soporte/mensajes` (US-10, ADR-15 §8). Además, 5 por
   * organización en 24 h en el caso de uso (eso no es un cubo: cuenta filas).
   */
  soporte: { limite: 5, ventanaMs: HORA_MS, clave: 'ip' },
} as const satisfies Record<string, DefinicionLimiteTasa>;

export type NombreLimiteTasa = keyof typeof LIMITES_TASA;

/** Clave de metadatos donde `@LimitarTasa` deja los nombres. */
export const METADATA_LIMITES_TASA = 'citia:limites-tasa';

/**
 * Marca una clase (controller) o un método (ruta) con uno o más límites de
 * `LIMITES_TASA`.
 */
export function LimitarTasa(
  ...limites: [NombreLimiteTasa, ...NombreLimiteTasa[]]
): ClassDecorator & MethodDecorator {
  return (
    objetivo: object,
    _propiedad?: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void => {
    // Igual que `SetMetadata` de Nest: en un método, el metadato va en la
    // función; en una clase, en la clase. Pero ACUMULA en lugar de pisar.
    const destino: object = descriptor
      ? (descriptor.value as object)
      : objetivo;
    const previos =
      (Reflect.getMetadata(METADATA_LIMITES_TASA, destino) as
        | NombreLimiteTasa[]
        | undefined) ?? [];
    Reflect.defineMetadata(
      METADATA_LIMITES_TASA,
      [...new Set([...previos, ...limites])],
      destino,
    );
  };
}
