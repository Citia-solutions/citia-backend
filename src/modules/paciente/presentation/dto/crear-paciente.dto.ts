import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CrearPacienteDto {
  // Opcional en el alta manual: el profesional puede registrar a alguien sin
  // RUT. El formulario publico si lo exige (ADR-09 §3 regla 4).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rut?: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @IsBoolean()
  consentimiento: boolean;
}
