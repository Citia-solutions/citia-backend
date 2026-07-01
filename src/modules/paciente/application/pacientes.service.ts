import { Paciente } from '../domain/paciente.entity';
import { PacienteRepository } from '../domain/paciente.repository';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacienteResponseDto } from '../presentation/dto/paciente-response.dto';

export class PacientesService {
  constructor(private readonly pacienteRepository: PacienteRepository) {}

  // Crea un paciente asociado al tenant del usuario autenticado.
  // El tenantId proviene SIEMPRE del token, nunca del body.
  async crearPaciente(
    dto: CrearPacienteDto,
    tenantId: string,
  ): Promise<PacienteResponseDto> {
    const saved = await this.pacienteRepository.guardar({
      nombre: dto.nombre,
      contacto: dto.contacto,
      consentimiento: dto.consentimiento,
      tenantId,
    });

    return this.aResponse(saved);
  }

  private aResponse(paciente: Paciente): PacienteResponseDto {
    return new PacienteResponseDto({
      id: paciente.id,
      nombre: paciente.nombre,
      contacto: paciente.contacto,
      consentimiento: paciente.consentimiento,
      tenantId: paciente.tenantId,
    });
  }
}
