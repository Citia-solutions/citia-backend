/**
 * Catálogo de versiones de los términos de uso y aviso de privacidad del
 * paciente (US-11, ADR-16 §2). Dominio puro: sin variable de entorno a
 * propósito (una variable obligatoria tumbó production en la Fase 3).
 *
 * El texto de cada versión vive en el frontend (`/terminos`) y su copia
 * congelada en `context/Cumplimiento/terminos-paciente-v<versión>.md`. Un
 * cambio de texto SIEMPRE es una versión nueva: el mismo número con otro
 * texto invalida la prueba de quienes aceptaron el anterior.
 *
 * **Reglas del catálogo** (las prueba `terminos-paciente.spec.ts`):
 *
 *  1. Versiones únicas, con formato `^\d+\.\d+$` (el del CHECK de
 *     `aceptaciones_terminos.version` y `solicitudes_cita.terminos_version`).
 *  2. `recibeAceptaciones ⇒ sigueCubriendo`.
 *  3. **Ninguna entrada se borra nunca**: una solicitud vieja puede llegar a
 *     la bandeja con una versión que ya no recibe aceptaciones, y se registra
 *     igual (`AceptacionTerminos.registrar`, canal `formulario_publico`).
 *
 * **Cambiar de versión sin cortar el formulario** (p. ej. a la 1.1):
 *
 *  1. Backend: agregar la 1.1 con `recibeAceptaciones` y `sigueCubriendo`;
 *     la 1.0 sigue recibiendo.
 *  2. Frontend: publicar el texto 1.1 y enviar `'1.1'`.
 *  3. Backend, al menos un día después: la 1.0 deja de recibir; y si la 1.1
 *     es un USO NUEVO de los datos (§10 del texto), la 1.0 deja también de
 *     cubrir. Hacerlo en el paso 1 haría que `/cita` pidiera aceptar a quien
 *     solo puede enviar la 1.0.
 */
export interface VersionTerminosPaciente {
  /** `'1.0'`. */
  readonly version: string;
  /** El backend acepta una aceptación NUEVA con esta versión. */
  readonly recibeAceptaciones: boolean;
  /** Una aceptación del titular con esta versión basta para no volver a pedirla. */
  readonly sigueCubriendo: boolean;
}

export const CATALOGO_TERMINOS_PACIENTE: readonly VersionTerminosPaciente[] =
  Object.freeze([
    Object.freeze({
      version: '1.0',
      recibeAceptaciones: true,
      sigueCubriendo: true,
    }),
  ]);

/**
 * Las funciones reciben el catálogo como último parámetro, con el vigente por
 * defecto: así los tests prueban las reglas con un catálogo de varias
 * versiones sin tocar el real. El código de producción no lo pasa nunca.
 */
type Catalogo = readonly VersionTerminosPaciente[];

function entrada(
  version: string | null | undefined,
  catalogo: Catalogo,
): VersionTerminosPaciente | undefined {
  if (typeof version !== 'string') return undefined;
  return catalogo.find((e) => e.version === version);
}

/** `true` si la versión está en el catálogo (reciba o no aceptaciones). */
export function esVersionConocida(
  version: string | null | undefined,
  catalogo: Catalogo = CATALOGO_TERMINOS_PACIENTE,
): boolean {
  return entrada(version, catalogo) !== undefined;
}

/** `true` si la versión acepta una aceptación nueva. */
export function recibeAceptaciones(
  version: string | null | undefined,
  catalogo: Catalogo = CATALOGO_TERMINOS_PACIENTE,
): boolean {
  return entrada(version, catalogo)?.recibeAceptaciones === true;
}

/** Las que acepta el DTO (`@VersionTerminosVigente()`), en orden del catálogo. */
export function versionesQueRecibenAceptaciones(
  catalogo: Catalogo = CATALOGO_TERMINOS_PACIENTE,
): string[] {
  return catalogo.filter((e) => e.recibeAceptaciones).map((e) => e.version);
}

/** Las que bastan para no volver a pedir la aceptación en `/cita`. */
export function versionesQueCubren(
  catalogo: Catalogo = CATALOGO_TERMINOS_PACIENTE,
): string[] {
  return catalogo.filter((e) => e.sigueCubriendo).map((e) => e.version);
}
