import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import {
  LARGO_MAXIMO_ESPECIALIDAD,
  LARGO_MAXIMO_NOMBRE,
} from '../../domain/usuario.entity';

/**
 * Quita los espacios alrededor ANTES de validar (el ValidationPipe global
 * corre con `transform: true`): `'   '` no pasa `@IsNotEmpty()` y los largos
 * cuentan el texto real. Lo que no es texto pasa sin tocar, para que
 * `@IsString()` lo rechace.
 */
function Recortar(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/**
 * Cuerpo de `PATCH /api/usuarios/me` (US-10, ADR-15 §1, T6). Solo el nombre y
 * la especialidad: el correo, el rol, la organización y el slug no están aquí
 * y, si llegan, la validación global (`whitelist`) los descarta en silencio.
 * Sin ningún campo → 200 con el perfil actual, sin escribir.
 *
 * El dominio (`normalizarCambiosPerfil`) vuelve a recortar y validar.
 */
export class ActualizarPerfilDto {
  /**
   * Ausente → no cambia. Presente → texto no vacío tras recortar, hasta
   * `LARGO_MAXIMO_NOMBRE`. `null` → 400 (el nombre no se borra).
   */
  @ValidateIf((o: ActualizarPerfilDto) => o.nombreCompleto !== undefined)
  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_NOMBRE)
  nombreCompleto?: string;

  /**
   * Ausente → no cambia. `null` o `''` (tras recortar) → se borra. Hasta
   * `LARGO_MAXIMO_ESPECIALIDAD`.
   */
  @Recortar()
  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO_ESPECIALIDAD)
  especialidad?: string | null;
}
