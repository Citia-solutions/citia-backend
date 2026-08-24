import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReagendarCitaDto {
  // Nueva fecha-hora de inicio, ISO 8601. Ver DT-14: conviene enviar siempre
  // el desfase horario explicito.
  @IsISO8601()
  @IsNotEmpty()
  inicio: string;

  // Queda en la bitacora. Opcional, pero es lo que da valor al historial.
  @IsOptional()
  @IsString()
  motivo?: string;
}
