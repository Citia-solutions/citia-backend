import { CitaResponseDto } from '../../../cita/presentation/dto/cita-response.dto';
import { SolicitudBandejaDto } from './solicitud-bandeja.dto';

/**
 * Respuesta de `POST /solicitudes/:id/aceptar`: la solicitud ya resuelta y la
 * cita creada. `cita` es EXACTAMENTE la respuesta de `POST /citas` (con
 * `paciente` y `avisos`).
 */
export class SolicitudAceptadaDto {
  solicitud: SolicitudBandejaDto;
  cita: CitaResponseDto;

  constructor(partial: SolicitudAceptadaDto) {
    Object.assign(this, partial);
  }
}
