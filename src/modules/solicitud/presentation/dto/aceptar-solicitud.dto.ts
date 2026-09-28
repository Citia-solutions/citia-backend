import { IsInt, IsNotEmpty, IsPositive, IsString, Max } from 'class-validator';

import { IsInstanteConZona } from '../../../../shared/presentation/is-instante-con-zona.decorator';
import { DURACION_MAXIMA_MIN } from '../../../cita/domain/cita.entity';

/**
 * Cuerpo de `POST /solicitudes/:id/aceptar`: lo que el profesional decide. Los
 * datos del paciente NO viajan: salen de la solicitud (lo que escribió el
 * paciente), y `tenantId`/`usuarioId` salen del token.
 */
export class AceptarSolicitudDto {
  // Ruta nueva: nace sin DT-14. Exige `Z` o `±HH:MM` para que el servidor no
  // tenga que adivinar la zona de la hora que eligió el profesional.
  @IsInstanteConZona()
  inicio: string;

  // ADR-11 §2: mismo tope que al crear o editar una cita.
  @IsInt()
  @IsPositive()
  @Max(DURACION_MAXIMA_MIN)
  duracionMin: number;

  // El frontend lo precarga con el `motivo` de la solicitud (ADR-09 §10) y el
  // profesional lo ajusta.
  @IsString()
  @IsNotEmpty()
  tipoConsulta: string;
}
