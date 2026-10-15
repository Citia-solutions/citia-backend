import { CitaResponseDto } from '../../../cita/presentation/dto/cita-response.dto';
import { SolicitudBandejaDto } from './solicitud-bandeja.dto';

/**
 * Respuesta de `POST /solicitudes/:id/aceptar`: la solicitud ya resuelta y la
 * cita.
 *
 *  - `nueva`: `cita` es EXACTAMENTE la respuesta de `POST /citas` (con
 *    `paciente` y `avisos`).
 *  - `reagendamiento` (Fase 3): `cita` es la cita de origen YA MOVIDA, con la
 *    forma de `PATCH /citas/:id/reagendar` (con `avisos`, sin `paciente`: el
 *    paciente no cambia).
 */
export class SolicitudAceptadaDto {
  solicitud: SolicitudBandejaDto;
  cita: CitaResponseDto;

  constructor(partial: SolicitudAceptadaDto) {
    Object.assign(this, partial);
  }
}
