import { EstadoCita } from '../../domain/cita.entity';

// Forma que consume el dashboard de citas del dia (RF-03), la agenda por rango
// (`GET /citas?desde&hasta`) y los avisos de solapamiento (ADR-11 §3).
// NO incluye campos de dinero (fuera de alcance US-06) ni contacto del paciente.
// El "gris/tachado" de citas pasadas lo decide el frontend a partir de
// `inicio`/`estado`; el backend no aplica logica de presentacion.
export class CitaDashboardDto {
  id: string;
  pacienteNombre: string;
  // Fecha "YYYY-MM-DD" de `inicio` en la zona de la clinica (ADR-07). La vista
  // semanal agrupa por este campo sin convertir zonas en el navegador.
  fecha: string;
  // Hora derivada del datetime `inicio` (HH:mm), para mostrar en la tarjeta.
  hora: string;
  inicio: Date;
  duracionMin: number;
  tipoConsulta: string;
  estado: EstadoCita;

  constructor(partial: CitaDashboardDto) {
    Object.assign(this, partial);
  }
}
