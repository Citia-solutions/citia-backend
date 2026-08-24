import { IsOptional, IsString } from 'class-validator';

// Cuerpo opcional de las transiciones que admiten justificacion (cancelar).
export class MotivoCitaDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
