import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsNotEmpty,
} from 'class-validator';

// Corrige datos que NO cambian el compromiso. Reagendar y cancelar tienen sus
// propias rutas porque si lo cambian (ADR-09 §4).
export class EditarCitaDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  duracionMin?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tipoConsulta?: string;
}
