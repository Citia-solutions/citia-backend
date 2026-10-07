import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Orígenes que el navegador puede usar contra la API con credenciales
 * (US-03, PR 1, paso 4; stack-tecnologico.md §7.3).
 *
 *  - `FRONTEND_URL` es el origen canónico (producción).
 *  - `CORS_ORIGENES_EXTRA` (separado por comas) suma orígenes exactos y, como
 *    único comodín, el de las vistas previas de Cloudflare Pages:
 *    `https://*.<proyecto>.pages.dev`. Se traduce a una expresión ANCLADA que
 *    admite exactamente UN nivel de subdominio, solo por https y sin puerto.
 *
 * Funciones puras: sin `process.env` ni Nest. `validarEntorno` las usa al
 * arrancar (un origen mal escrito tumba el arranque con un mensaje claro) y
 * `main.ts` arma con ellas las opciones de `enableCors`.
 */

export class OrigenCorsInvalidoError extends Error {
  constructor(valor: string, motivo: string) {
    super(`"${valor}" no es un origen CORS válido: ${motivo}`);
    this.name = 'OrigenCorsInvalidoError';
  }
}

export interface PoliticaCors {
  readonly exactos: ReadonlySet<string>;
  readonly patrones: readonly RegExp[];
}

// Una etiqueta DNS: letras, dígitos y guiones, sin guion al inicio ni al final.
const ETIQUETA = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';

// `https://*.<proyecto>.pages.dev`, con `<proyecto>` de una sola etiqueta. Un
// `https://*.pages.dev` a secas NO entra: aceptaría cualquier proyecto de
// Pages, también el de un tercero.
const COMODIN_VISTAS_PREVIAS = new RegExp(
  `^https://\\*\\.(${ETIQUETA})\\.pages\\.dev$`,
);

/**
 * Devuelve el origen en su forma canónica (`esquema://host[:puerto]`, en
 * minúsculas, sin barra final) o, si es el comodín de vistas previas, el
 * comodín en minúsculas. Lanza `OrigenCorsInvalidoError` si no es ninguna de
 * las dos cosas.
 */
export function normalizarOrigen(valor: string): string {
  const limpio = valor.trim();
  if (limpio === '') {
    throw new OrigenCorsInvalidoError(valor, 'está vacío');
  }

  if (limpio.includes('*')) {
    const minusculas = limpio.toLowerCase();
    if (!COMODIN_VISTAS_PREVIAS.test(minusculas)) {
      throw new OrigenCorsInvalidoError(
        valor,
        'el único comodín admitido es el de las vistas previas de Cloudflare Pages, "https://*.<proyecto>.pages.dev"',
      );
    }
    return minusculas;
  }

  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    throw new OrigenCorsInvalidoError(
      valor,
      'debe ser una URL absoluta, p. ej. "https://app.ejemplo.cl"',
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new OrigenCorsInvalidoError(
      valor,
      'el esquema debe ser http o https',
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new OrigenCorsInvalidoError(valor, 'no puede llevar credenciales');
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new OrigenCorsInvalidoError(
      valor,
      'un origen no lleva ruta, query ni fragmento (solo esquema://host[:puerto])',
    );
  }
  return url.origin;
}

/** Separa por comas, ignora los vacíos y normaliza cada entrada. */
export function parsearListaOrigenes(valor: string | undefined): string[] {
  if (valor === undefined) {
    return [];
  }
  return valor
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')
    .map(normalizarOrigen);
}

function comodinARegExp(comodin: string): RegExp {
  const coincidencia = COMODIN_VISTAS_PREVIAS.exec(comodin);
  if (!coincidencia) {
    throw new OrigenCorsInvalidoError(comodin, 'comodín no admitido');
  }
  // La etiqueta del proyecto solo tiene [a-z0-9-]: no hay nada que escapar.
  const proyecto = coincidencia[1];
  return new RegExp(`^https://${ETIQUETA}\\.${proyecto}\\.pages\\.dev$`);
}

/**
 * Compila la política a partir de `FRONTEND_URL` y `CORS_ORIGENES_EXTRA`. Las
 * entradas pueden venir crudas o ya normalizadas: se normalizan otra vez.
 */
export function crearPoliticaCors(
  frontendUrl: string,
  origenesExtra: readonly string[] = [],
): PoliticaCors {
  const exactos = new Set<string>([normalizarOrigen(frontendUrl)]);
  const patrones: RegExp[] = [];
  for (const entrada of origenesExtra.map(normalizarOrigen)) {
    if (entrada.includes('*')) {
      patrones.push(comodinARegExp(entrada));
    } else {
      exactos.add(entrada);
    }
  }
  return { exactos, patrones };
}

/**
 * `true` si el valor de la cabecera `Origin` está permitido. Sin cabecera, o
 * con un `Origin` vacío o `null` (iframes aislados, `file://`), devuelve
 * `false`: la petición se atiende igual (CORS no es control de acceso en el
 * servidor), pero sin cabeceras CORS, así que ningún navegador lee la
 * respuesta desde otro origen.
 */
export function esOrigenPermitido(
  origen: string | undefined,
  politica: PoliticaCors,
): boolean {
  if (!origen) {
    return false;
  }
  if (politica.exactos.has(origen)) {
    return true;
  }
  return politica.patrones.some((patron) => patron.test(origen));
}

/**
 * Opciones para `app.enableCors`. Se mantiene `credentials: true`. Se expone
 * `X-Request-Id` para que el frontend pueda citar el id de una petición
 * fallida al reportarla (es el mismo id que va en los logs).
 */
export function crearOpcionesCors(politica: PoliticaCors): CorsOptions {
  return {
    origin: (origen, responder) =>
      responder(null, esOrigenPermitido(origen, politica)),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  };
}
