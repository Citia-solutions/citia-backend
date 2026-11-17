import { IsIn, IsString } from 'class-validator';

import { versionesQueRecibenAceptaciones } from '../../domain/terminos-paciente';

/**
 * Mensaje FIJO de una versión de los términos que no se acepta (US-11,
 * ADR-16 §2). El frontend lo busca por su texto en `message` (sea un texto o
 * una lista) para pedir recargar: tiene un espejo exacto en
 * `citia-frontend/src/shared/config/terminosPaciente.ts`. Si cambia aquí,
 * cambia allá en el mismo cambio.
 *
 * Es el mismo en el DTO (400 del `ValidationPipe`) y en la traducción de
 * `VersionTerminosNoVigenteError` en los controllers.
 */
export const MENSAJE_VERSION_TERMINOS_NO_VIGENTE =
  'La versión de los términos ya no está vigente. Recarga la página.';

/**
 * `terminosVersion` obligatoria y del catálogo, con versiones que RECIBEN
 * aceptaciones (`versionesQueRecibenAceptaciones()`): `@IsString` +
 * `@IsIn`, los dos con el mensaje fijo. **Sin `@IsOptional`**: ausente, `null`
 * o `''` → 400.
 *
 * La lista se lee al cargar el módulo: el catálogo es una constante del
 * código, y cambiarlo exige un despliegue.
 */
export function VersionTerminosVigente(): PropertyDecorator {
  const opciones = { message: MENSAJE_VERSION_TERMINOS_NO_VIGENTE };
  const decoradores: PropertyDecorator[] = [
    IsString(opciones),
    IsIn(versionesQueRecibenAceptaciones(), opciones),
  ];
  return (objetivo, propiedad) => {
    for (const decorar of decoradores) decorar(objetivo, propiedad);
  };
}
