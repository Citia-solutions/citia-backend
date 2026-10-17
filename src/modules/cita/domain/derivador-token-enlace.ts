/**
 * Derivación del token del enlace del paciente (Fase 3, decisión E2; ADR-10
 * §1 regla 2).
 *
 *   token = base64url(HMAC-SHA256(ENLACE_CITA_CLAVE, "enlace-cita:" + citaId + ":" + version))
 *   hash  = sha256(token) en hex
 *
 * El token NO se guarda: se recalcula a partir de (cita, versión) cada vez que
 * hace falta (todos los recordatorios de una cita llevan el mismo enlace y la
 * plantilla es determinista entre reintentos). En la base solo vive el `hash`.
 *
 * Puerto de dominio sin dependencias: el adaptador con `node:crypto` y la
 * clave de configuración vive en `infrastructure/seguridad/`.
 */
export abstract class DerivadorTokenEnlace {
  /** Token (43 caracteres base64url) del enlace `version` de la cita. */
  abstract derivar(citaId: string, version: number): string;

  /** `sha256(token)` en hexadecimal (64 caracteres en minúsculas). */
  abstract hashear(token: string): string;
}

/** Largo del token: 32 bytes del HMAC en base64url sin relleno. */
export const LARGO_TOKEN_ENLACE = 43;

/** 43 caracteres del alfabeto base64url (`A-Z a-z 0-9 - _`), sin relleno. */
export const FORMATO_TOKEN_ENLACE = /^[A-Za-z0-9_-]{43}$/;

/**
 * ¿Tiene `valor` la forma de un token de enlace? Sirve para rechazar SIN
 * tocar la base lo que nunca podría ser un token (cabecera vacía, texto
 * arbitrario, un hash, un token truncado…). No dice nada de si existe.
 */
export function esFormatoTokenEnlace(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_TOKEN_ENLACE.test(valor);
}
