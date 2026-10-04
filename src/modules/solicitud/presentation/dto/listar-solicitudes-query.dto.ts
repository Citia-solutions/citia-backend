import { IsEnum, IsOptional } from 'class-validator';

import { EstadoSolicitud } from '../../domain/solicitud-cita.entity';

/** Query de `GET /solicitudes?estado=`. Sin `estado` => `recibida`. */
export class ListarSolicitudesQueryDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;
}
