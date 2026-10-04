import { Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { normalizarCorreo } from '../../../../shared/domain/correo';
import {
  ANTELACION_MAXIMA_MIN,
  ANTELACION_MINIMA_MIN,
  LARGO_MAXIMO_CORREO_RESPUESTA,
  LARGO_MAXIMO_TELEFONO_CONTACTO,
  MAX_ANTELACIONES,
} from '../../domain/configuracion-recordatorio.entity';

/** Texto recortado; vacío o en blanco → `null` ("sin teléfono"). */
function TextoOpcional(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value;
    const recortado = value.trim();
    return recortado === '' ? null : recortado;
  });
}

/** Correo normalizado (trim + minúsculas); vacío → `null` ("sin Reply-To"). */
function CorreoOpcional(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value;
    const normalizado = normalizarCorreo(value);
    return normalizado === '' ? null : normalizado;
  });
}

/**
 * Cuerpo de `PUT /api/recordatorios/configuracion` (ADR-13 §3, §17).
 *
 * PUT = reemplazo completo: lo que no viaja (o viaja `null` o vacío) queda
 * vacío. Las mismas reglas que la entidad `ConfiguracionRecordatorio`, que
 * vuelve a validar (y ordena las antelaciones de mayor a menor):
 *
 * - `activo`: booleano, obligatorio.
 * - `antelacionesMin`: de 1 a 3 enteros distintos entre 30 y 10.080 minutos.
 * - `telefonoContacto`: hasta 30 caracteres; vacío = sin teléfono.
 * - `correoRespuesta`: correo (`Reply-To`); vacío = sin `Reply-To` y el
 *   mensaje dice que no recibe respuestas.
 *
 * El canal no se recibe: en la Fase 2 solo existe `email`.
 */
export class GuardarConfiguracionRecordatoriosDto {
  @IsBoolean()
  activo: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ANTELACIONES)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(ANTELACION_MINIMA_MIN, { each: true })
  @Max(ANTELACION_MAXIMA_MIN, { each: true })
  antelacionesMin: number[];

  @TextoOpcional()
  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO_TELEFONO_CONTACTO)
  telefonoContacto?: string | null;

  @CorreoOpcional()
  @IsOptional()
  @IsEmail()
  @MaxLength(LARGO_MAXIMO_CORREO_RESPUESTA)
  correoRespuesta?: string | null;
}
