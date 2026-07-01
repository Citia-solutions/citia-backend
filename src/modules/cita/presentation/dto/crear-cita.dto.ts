import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CrearCitaDto {
  // Fecha-hora de inicio en formato ISO 8601 (datetime unico).
  @IsISO8601()
  @IsNotEmpty()
  inicio: string;

  @IsInt()
  @IsPositive()
  duracionMin: number;

  @IsString()
  @IsNotEmpty()
  tipoConsulta: string;

  @IsUUID()
  @IsNotEmpty()
  pacienteId: string;
}
