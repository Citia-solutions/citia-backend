import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { CrearPacienteDto } from '../../../paciente/presentation/dto/crear-paciente.dto';

/**
 * Cuerpo del formulario "nueva cita" que rellena el profesional.
 *
 * El paciente se indica de UNA de estas dos formas (ADR-09 §3):
 *
 *  - `pacienteId`: cuando ya se conoce (p. ej. elegido de una busqueda).
 *  - `paciente`:   los datos del formulario. Si trae RUT y ese RUT ya existe
 *                  en la organizacion, se vincula al paciente existente en
 *                  vez de duplicarlo; si no existe, se crea.
 *
 * `tenantId` y `usuarioId` NO viajan en el cuerpo: salen del token (ADR-01 §2).
 */
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

  @IsOptional()
  @IsUUID()
  pacienteId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrearPacienteDto)
  paciente?: CrearPacienteDto;
}
