import { CitaDashboardDto } from './cita-dashboard.dto';

/**
 * Avisos informativos de una cita recién creada o movida (ADR-11 §3).
 *
 * Nunca cambian el código de estado ni son un error: la decisión sigue en el
 * profesional. `solapamientos` usa la forma de `/citas/hoy` a propósito (el
 * frontend ya sabe pintarla) y va ordenada por `inicio ASC`. Vacía = se
 * calculó y no hay choque.
 */
export class AvisosCitaDto {
  solapamientos: CitaDashboardDto[];

  constructor(partial: AvisosCitaDto) {
    Object.assign(this, partial);
  }
}
