import { Transform, TransformFnParams } from 'class-transformer';

import { normalizarCorreo } from '../domain/correo';

/**
 * Normaliza un correo de entrada (sin espacios alrededor, en minúsculas) ANTES
 * de validarlo: el ValidationPipe global (`transform: true`) aplica las
 * transformaciones de class-transformer y luego valida la instancia. Así
 * `" Ana@Mail.com "` pasa `@IsEmail()` y llega al caso de uso ya canónico.
 *
 * Lo que no es texto pasa sin tocar, para que `@IsEmail()` lo rechace con su
 * propio mensaje.
 */
export function NormalizarCorreo(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? normalizarCorreo(value) : value,
  );
}
