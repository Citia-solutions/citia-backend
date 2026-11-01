import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { LARGO_MINIMO_CONTRASENA } from '../../domain/contrasena';

/** Tope del cuerpo, no de la política: corta cuerpos absurdos antes de bcrypt. */
const LARGO_MAXIMO_CUERPO = 1024;

/**
 * Cuerpo de `PUT /api/usuarios/me/contrasena` (US-10, ADR-15 §4). Las
 * contraseñas no se recortan nunca.
 *
 * `contrasenaNueva` exige aquí al menos 8; el tope de 72 bytes en UTF-8 lo
 * valida el dominio (`validarContrasenaNueva`), porque class-validator cuenta
 * caracteres y no bytes.
 */
export class CambiarContrasenaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_CUERPO)
  contrasenaActual: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CONTRASENA)
  @MaxLength(LARGO_MAXIMO_CUERPO)
  contrasenaNueva: string;
}
