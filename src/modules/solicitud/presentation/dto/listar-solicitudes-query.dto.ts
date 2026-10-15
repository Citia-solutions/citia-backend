import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { EstadoSolicitud } from '../../domain/solicitud-cita.entity';

/**
 * Query de `GET /solicitudes?estado=&citaOrigenId=`. Sin `estado` =>
 * `recibida` (admite `descartada` desde la Fase 3).
 *
 * `citaOrigenId` (Fase 3, R4): solo las solicitudes de reagendamiento de esa
 * cita; el voucher pregunta `?citaOrigenId=<id>&estado=recibida` para la nota
 * "El paciente pidió otra hora". Sigue filtrando por el tenant del token: una
 * cita de otro tenant da la lista vacía.
 */
export class ListarSolicitudesQueryDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsUUID()
  citaOrigenId?: string;
}
