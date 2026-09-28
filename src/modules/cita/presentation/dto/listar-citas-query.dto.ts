import { IsISO8601, Matches } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query de `GET /citas?desde&hasta` (agenda por rango).
 *
 * Son FECHAS de calendario de la clínica, no instantes: el backend resuelve
 * las medianoches en APP_TZ (ADR-07). `@Matches` fija la forma exacta
 * `YYYY-MM-DD` (sin hora ni zona) e `@IsISO8601({ strict: true })` rechaza
 * fechas inexistentes como `2026-02-30`. Las reglas entre ambos campos
 * (orden, tope de días) viven en `CitasService.listarEnRango`.
 */
export class ListarCitasQueryDto {
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  desde: string;

  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  hasta: string;
}
