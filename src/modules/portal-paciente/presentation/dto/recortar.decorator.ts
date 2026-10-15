import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Quita los espacios alrededor de un texto ANTES de validarlo (el
 * ValidationPipe global corre con `transform: true`). Así `"   "` no pasa
 * `@IsNotEmpty()` y los límites de largo cuentan el texto real.
 *
 * Lo que no es texto pasa sin tocar, para que `@IsString()` lo rechace.
 */
export function Recortar(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );
}
