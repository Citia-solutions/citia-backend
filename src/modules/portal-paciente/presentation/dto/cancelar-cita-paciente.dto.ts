import { IsOptional, IsString, MaxLength } from 'class-validator';

import { Recortar } from './recortar.decorator';

/** Largo máximo de los textos libres del portal (contrato §3.4). */
export const LARGO_MAXIMO_TEXTO_PORTAL = 300;

/**
 * Cuerpo de `POST /publico/cita/cancelar`. El motivo es opcional y queda en la
 * bitácora append-only de la cita (mismo tope que el del profesional,
 * `MotivoCitaDto`). En blanco cuenta como ausente.
 */
export class CancelarCitaPacienteDto {
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(LARGO_MAXIMO_TEXTO_PORTAL)
  motivo?: string;
}
