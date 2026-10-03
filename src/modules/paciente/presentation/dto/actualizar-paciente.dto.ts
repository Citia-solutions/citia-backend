import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { NormalizarCorreo } from '../../../../shared/presentation/normalizar-correo.decorator';

/**
 * Cuerpo de `PATCH /pacientes/:id` (ADR-13 §14): completar o corregir el
 * contacto. Solo `telefono` y `correo`; el resto lo descarta el `whitelist`.
 *
 * Cada campo es opcional, pero si viaja se valida igual que al crear
 * (`CrearPacienteDto`). `@ValidateIf(!== undefined)` en vez de
 * `@IsOptional()` a propósito: `null` también se valida, y falla. El PATCH no
 * borra datos.
 *
 * "Al menos uno" no se puede expresar aquí (class-validator no tiene reglas de
 * clase y `@ValidateIf` apaga todas las de la propiedad): lo exige el dominio
 * (`Paciente.prepararCambioContacto`) y el controller lo traduce a 400.
 */
export class ActualizarPacienteDto {
  @ValidateIf((o: ActualizarPacienteDto) => o.telefono !== undefined)
  @IsString()
  @IsNotEmpty()
  telefono?: string;

  @ValidateIf((o: ActualizarPacienteDto) => o.correo !== undefined)
  @NormalizarCorreo()
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo?: string;
}
