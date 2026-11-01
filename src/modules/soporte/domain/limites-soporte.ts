import type { PoliticaReintentoSalida } from '../../../shared/application/politica-reintento-salida';

/**
 * Límites del mensaje a soporte (US-10, P7). El mismo número está en el CHECK
 * `CHK_mensajes_soporte_mensaje` (migración 1750000020000) y en el DTO.
 */
export const LARGO_MAXIMO_MENSAJE_SOPORTE = 2000;

/**
 * Tope de mensajes a soporte por ORGANIZACIÓN en las últimas 24 horas (T11,
 * ADR-15 §7). Con 5 o más, el sexto recibe 429. Es blando a propósito: dos
 * peticiones simultáneas pueden dejar 6 (no hay bloqueo por organización).
 * No es un cubo del límite de tasa: cuenta filas de `mensajes_soporte`.
 */
export const TOPE_MENSAJES_SOPORTE_24H = 5;

/** Ventana del tope por organización. */
export const VENTANA_TOPE_SOPORTE_MS = 24 * 60 * 60 * 1000;

/**
 * Reintentos del correo a soporte tras un error transitorio (ADR-15 §7, con
 * `calcularEsperaReintentoMs` de ADR-12): espera 1, 2, 4, 8, 16, 32 y 60 min
 * (acortada al azar hasta un 20 %) y `fallido` al OCTAVO fallo, unas 2 horas
 * después del primero. Constante de dominio, sin variable de entorno.
 */
export const POLITICA_REINTENTO_SOPORTE: Readonly<PoliticaReintentoSalida> =
  Object.freeze({
    maxIntentos: 8,
    esperaBaseMs: 60_000,
    esperaMaximaMs: 3_600_000,
    variacion: 0.2,
  });

/**
 * `cuota_agotada` del proveedor: el mensaje se vuelve a intentar en 1 hora,
 * SIN gastar un intento (ADR-15 §7).
 */
export const ESPERA_CUOTA_AGOTADA_MS = 3_600_000;
