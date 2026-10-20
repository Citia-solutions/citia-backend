import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PedidoPor } from '../../domain/cambio-cita.entity';

/**
 * Cuerpo opcional de `PATCH /citas/:id/cancelar`: la justificación (motivo) y,
 * desde US-07.01, quién pidió la cancelación (`pedidoPor`).
 */
export class MotivoCitaDto {
  // Acotado: queda para siempre en la bitacora append-only. El voucher del
  // frontend corta en el mismo numero (DTF-06): si cambia aqui, cambiar alla.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  // US-07.01 (H3): quién pidió la cancelación. Opcional en la API; la pantalla
  // lo exige. Ausente o null = sin dato = cuenta como del profesional (a favor
  // del paciente). Distingue mayúsculas: 'PACIENTE' o 'sistema' → 400.
  @IsOptional()
  @IsEnum(PedidoPor, {
    message: 'pedidoPor debe ser "paciente" o "profesional"',
  })
  pedidoPor?: PedidoPor;
}
