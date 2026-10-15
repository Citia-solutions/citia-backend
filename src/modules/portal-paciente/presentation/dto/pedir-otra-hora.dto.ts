import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { LARGO_MAXIMO_TEXTO_PORTAL } from './cancelar-cita-paciente.dto';
import { Recortar } from './recortar.decorator';

/**
 * Cuerpo de `POST /publico/cita/otra-hora` (contrato §3.4).
 *
 * Textos libres ACOTADOS a propósito: el frontend avisa que no se escriba
 * información médica, y el tope evita que una caja grande invite a hacerlo.
 * Se recortan antes de validar: una preferencia solo con espacios es vacía.
 */
export class PedirOtraHoraDto {
  /** "martes en la tarde", "después del 20". Obligatoria, 1..300. */
  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_TEXTO_PORTAL)
  preferencia: string;

  /** Opcional, ≤ 300. En blanco cuenta como ausente. */
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(LARGO_MAXIMO_TEXTO_PORTAL)
  motivo?: string;
}
