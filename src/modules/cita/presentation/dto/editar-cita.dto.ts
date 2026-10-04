import {
  IsInt,
  IsOptional,
  IsPositive,
  Max,
  IsString,
  IsNotEmpty,
} from 'class-validator';

import { DURACION_MAXIMA_MIN } from '../../domain/cita.entity';

// Corrige datos que NO cambian el compromiso. Reagendar y cancelar tienen sus
// propias rutas porque si lo cambian (ADR-09 §4).
export class EditarCitaDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  // ADR-11 §2: tope de un dia; da la cota inferior de la consulta de
  // solapamientos (`inicio - DURACION_MAXIMA_MIN`).
  @Max(DURACION_MAXIMA_MIN)
  duracionMin?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tipoConsulta?: string;
}
