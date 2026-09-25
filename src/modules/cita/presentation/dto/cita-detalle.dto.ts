import { AccionCita, EstadoCita } from '../../domain/cita.entity';

// Paciente tal como lo muestra el voucher. Sin `consentimiento` ni `tenantId`:
// el voucher no los usa (US-02.08 §1). Menos campos, menos superficie.
export class CitaDetallePacienteDto {
  id: string;
  nombre: string;
  // Formateado para mostrar (12.345.678-5); en BD vive canonico. Nunca viaja
  // en la URL (ADR-09 §3 regla 5): la ruta usa el id de la cita.
  rut: string | null;
  telefono: string;
  correo: string | null;

  constructor(partial: CitaDetallePacienteDto) {
    Object.assign(this, partial);
  }
}

/**
 * Detalle de una cita para el voucher del profesional (US-02.08).
 *
 * Una sola llamada basta para pintar la tarjeta: datos de la cita, del paciente
 * y que acciones son legales en su estado actual. NO incluye `tenantId`,
 * `usuarioId` ni `consentimiento`.
 *
 * Pensado para crecer sin romperse: US-02.07 le sumara campos (peticion de
 * reagendamiento abierta, etc.) sin tocar los existentes.
 */
export class CitaDetalleDto {
  id: string;
  estado: EstadoCita;
  inicio: Date;
  // Hora derivada de `inicio` (HH:mm) en la zona de la clinica (ADR-07).
  hora: string;
  duracionMin: number;
  tipoConsulta: string;
  paciente: CitaDetallePacienteDto;
  // Calculado por la entidad con las mismas guardas que las transiciones. Es
  // una pista para la interfaz: el 409 de la transicion sigue siendo el
  // guardian real si el estado cambio entre la lectura y el clic.
  accionesPermitidas: AccionCita[];

  constructor(partial: CitaDetalleDto) {
    Object.assign(this, partial);
  }
}
