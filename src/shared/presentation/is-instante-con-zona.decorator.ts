import { IsISO8601, Matches, ValidationOptions } from 'class-validator';

// Termina en `Z` o en un desfase `±HH:MM` / `±HHMM`.
const ZONA_EXPLICITA = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Instante ISO 8601 con zona horaria EXPLÍCITA (cierra DT-14 en la ruta que lo
 * use).
 *
 * `@IsISO8601()` a secas acepta `2026-09-18T10:00:00`, que el servidor
 * interpreta en SU zona (el contenedor corre en UTC): el profesional elegiría
 * las 10:00 y la cita quedaría a las 07:00 de Santiago. Exigir `Z` o `±HH:MM`
 * elimina la ambigüedad sin que el backend tenga que adivinar.
 *
 * Hoy solo lo usa `AceptarSolicitudDto` (ruta nueva, nace sin DT-14). Aplicarlo
 * a `CrearCitaDto` / `ReagendarCitaDto` es una decisión aparte del orquestador.
 */
export function IsInstanteConZona(
  opciones?: ValidationOptions,
): PropertyDecorator {
  const esIso = IsISO8601({}, opciones);
  const conZona = Matches(ZONA_EXPLICITA, {
    message:
      '$property debe incluir la zona horaria explícita (Z o ±HH:MM), p. ej. 2026-09-18T10:00:00-03:00',
    ...opciones,
  });
  return (target: object, propiedad: string | symbol): void => {
    esIso(target, propiedad);
    conZona(target, propiedad);
  };
}
