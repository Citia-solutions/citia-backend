import { PacienteResponseDto } from '../../../paciente/presentation/dto/paciente-response.dto';
import { EstadoCita } from '../../domain/cita.entity';
import { AvisosCitaDto } from './avisos-cita.dto';

export class CitaResponseDto {
  id: string;
  inicio: Date;
  duracionMin: number;
  tipoConsulta: string;
  estado: EstadoCita;
  pacienteId: string;
  // Solo al crear: el cliente necesita saber con quien quedo vinculada la cita
  // (puede ser un paciente recien creado o uno existente al que se llego por
  // RUT). En las transiciones se omite: el cliente ya conoce al paciente.
  paciente?: PacienteResponseDto;
  // ADR-11 §3: SIEMPRE presente en crear, reagendar, editar y aceptar una
  // solicitud (lista vacia si no hay choque); AUSENTE en confirmar, cancelar,
  // asistencia e inasistencia, que no mueven la ventana de la cita.
  avisos?: AvisosCitaDto;

  constructor(partial: CitaResponseDto) {
    Object.assign(this, partial);
  }
}
