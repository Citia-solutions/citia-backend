import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { NormalizarCorreo } from '../../../../shared/presentation/normalizar-correo.decorator';

/**
 * Datos de un paciente nuevo. Lo usan DOS rutas: `POST /pacientes` y el
 * paciente en línea de `POST /citas` (`CrearCitaDto.paciente`).
 */
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

  // Obligatorio desde la Fase 2: sin correo no hay recordatorios (ADR-13 §14).
  // Se normaliza (trim + minúsculas) antes de validar. 254 es el máximo de
  // una dirección (RFC 5321).
  @NormalizarCorreo()
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;

  @IsBoolean()
  consentimiento: boolean;
}
