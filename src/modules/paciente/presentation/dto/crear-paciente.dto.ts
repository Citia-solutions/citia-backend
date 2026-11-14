import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { NormalizarCorreo } from '../../../../shared/presentation/normalizar-correo.decorator';
import { VersionTerminosVigente } from './version-terminos.decorator';

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

  // US-11 (ADR-16 §7, D6): la casilla es obligatoria también en la API. Si el
  // paciente no autoriza, no se registra en Citia. Al crear, el caso de uso
  // deja una aceptación de canal `profesional` a nombre del usuario del token.
  @Equals(true, { message: 'Se necesita la autorización del paciente' })
  consentimiento: boolean;

  // Versión de los términos que el profesional le leyó o envió al paciente.
  // Opcional SOLO en el tipo: la bandeja arma un CrearPacienteDto sin pasar
  // por el pipe y no lo usa. En HTTP es obligatoria (sin @IsOptional).
  @VersionTerminosVigente()
  terminosVersion?: string;
}
