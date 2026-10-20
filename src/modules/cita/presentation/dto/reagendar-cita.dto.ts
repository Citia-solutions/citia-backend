import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PedidoPor } from '../../domain/cambio-cita.entity';

export class ReagendarCitaDto {
  // Nueva fecha-hora de inicio, ISO 8601. Ver DT-14: conviene enviar siempre
  // el desfase horario explicito.
  @IsISO8601()
  @IsNotEmpty()
  inicio: string;

  // Queda en la bitacora. Opcional, pero es lo que da valor al historial.
  // Mismo limite que `MotivoCitaDto` y que el voucher del frontend (DTF-06).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  // US-07.01 (H3): quién pidió el cambio de hora. Igual que en MotivoCitaDto:
  // opcional en la API, obligatorio en la pantalla; ausente o null = sin dato
  // = cuenta como del profesional.
  @IsOptional()
  @IsEnum(PedidoPor, {
    message: 'pedidoPor debe ser "paciente" o "profesional"',
  })
  pedidoPor?: PedidoPor;
}
