import { IsOptional, IsString, MaxLength } from 'class-validator';

// Cuerpo opcional de las transiciones que admiten justificacion (cancelar).
export class MotivoCitaDto {
  // Acotado: queda para siempre en la bitacora append-only. El voucher del
  // frontend corta en el mismo numero (DTF-06): si cambia aqui, cambiar alla.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
