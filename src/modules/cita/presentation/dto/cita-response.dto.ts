import { PacienteResponseDto } from '../../../paciente/presentation/dto/paciente-response.dto';
import { EstadoCita } from '../../domain/cita.entity';

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

  constructor(partial: CitaResponseDto) {
    Object.assign(this, partial);
  }
}
