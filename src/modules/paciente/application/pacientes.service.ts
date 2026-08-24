import {
  esRutValido,
  formatearRut,
  normalizarRut,
} from '../../../shared/domain/rut';
import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { Paciente } from '../domain/paciente.entity';
import { PacienteRepository } from '../domain/paciente.repository';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacienteResponseDto } from '../presentation/dto/paciente-response.dto';
import { TransactionContext } from '../../../shared/application/transaction-runner';

export class PacientesService {
  constructor(private readonly pacienteRepository: PacienteRepository) {}

  // Crea un paciente asociado al tenant del usuario autenticado.
  // El tenantId proviene SIEMPRE del token, nunca del body.
  async crearPaciente(
    dto: CrearPacienteDto,
    tenantId: string,
  ): Promise<PacienteResponseDto> {
    const saved = await this.resolverOCrear(dto, tenantId);
    return PacientesService.aResponse(saved);
  }

  /**
   * Resuelve la identidad del paciente dentro del tenant (ADR-09 §3):
   * si el RUT ya existe devuelve ese paciente; si no, lo crea.
   *
   * Es el corazon compartido por las dos vias de entrada: el boton "nueva
   * cita" del profesional y (mas adelante) la aceptacion de una solicitud
   * enviada por el paciente. Por eso recibe `tx` opcional: quien lo llame
   * puede envolverlo en su propia transaccion.
   */
  async resolverOCrear(
    dto: CrearPacienteDto,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente> {
    let rutCanonico: string | null = null;

    if (dto.rut) {
      if (!esRutValido(dto.rut)) {
        throw new RutInvalidoError(dto.rut);
      }
      rutCanonico = normalizarRut(dto.rut);

      const existente = await this.pacienteRepository.buscarPorRut(
        rutCanonico,
        tenantId,
        tx,
      );
      if (existente) return existente;
    }

    return this.pacienteRepository.guardar(
      {
        rut: rutCanonico,
        nombre: dto.nombre,
        telefono: dto.telefono,
        correo: dto.correo ?? null,
        consentimiento: dto.consentimiento,
        tenantId,
      },
      tx,
    );
  }

  static aResponse(paciente: Paciente): PacienteResponseDto {
    return new PacienteResponseDto({
      id: paciente.id,
      rut: paciente.rut ? formatearRut(paciente.rut) : null,
      nombre: paciente.nombre,
      telefono: paciente.telefono,
      correo: paciente.correo ?? null,
      consentimiento: paciente.consentimiento,
      tenantId: paciente.tenantId,
    });
  }
}
