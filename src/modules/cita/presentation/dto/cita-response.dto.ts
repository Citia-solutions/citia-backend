import { EstadoCita } from '../../domain/cita.entity';

export class CitaResponseDto {
  id: string;
  inicio: Date;
  duracionMin: number;
  tipoConsulta: string;
  estado: EstadoCita;
  pacienteId: string;

  constructor(partial: CitaResponseDto) {
    Object.assign(this, partial);
  }
}
