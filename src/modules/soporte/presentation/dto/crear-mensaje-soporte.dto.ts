import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { LARGO_MAXIMO_MENSAJE_SOPORTE } from '../../domain/limites-soporte';
import { CategoriaSoporte } from '../../domain/mensaje-soporte.entity';

/** Recorta los extremos ANTES de validar; lo que no es texto pasa sin tocar. */
function Recortar(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/**
 * Cuerpo de `POST /api/soporte/mensajes` (US-10, P7; ADR-15 §7).
 *
 * - `categoria`: opcional y cerrada (T12); ausente o `null` → `otro`.
 * - `mensaje`: de 1 a 2000 caracteres tras recortar los extremos (conserva
 *   los saltos de línea internos). `MaxLength` cuenta unidades UTF-16, que
 *   nunca son menos que los caracteres del CHECK de la tabla.
 *
 * Quién escribe sale SIEMPRE del token: un `tenantId` o `usuarioId` en el
 * cuerpo lo descarta la validación global (`whitelist`). El dominio vuelve a
 * recortar y validar. Los mensajes de error nunca repiten el texto recibido.
 */
export class CrearMensajeSoporteDto {
  @IsOptional()
  @IsEnum(CategoriaSoporte, {
    message: 'categoria debe ser problema, consulta, sugerencia u otro',
  })
  categoria?: CategoriaSoporte;

  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_MENSAJE_SOPORTE)
  mensaje: string;
}
