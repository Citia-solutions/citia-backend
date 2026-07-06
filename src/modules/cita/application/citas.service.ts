import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacienteRepository } from '../../paciente/domain/paciente.repository';
import { formatearHoraEnZona } from '../../../shared/domain/timezone';
import { Cita } from '../domain/cita.entity';
import { CitaRepository } from '../domain/cita.repository';
import { CitaDashboardDto } from '../presentation/dto/cita-dashboard.dto';
import { CitaResponseDto } from '../presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';

export class CitasService {
  constructor(
    private readonly citaRepository: CitaRepository,
    private readonly pacienteRepository: PacienteRepository,
    // Zona horaria de la clínica (ej. 'America/Santiago'). El "día" y la "hora"
    // se calculan en esta zona, no en la del servidor (contenedor en UTC).
    private readonly tz: string,
  ) {}

  // US-02: crea una cita nueva (nace PENDIENTE via Cita.crear).
  // tenantId y usuarioId vienen SIEMPRE del token, nunca del body.
  async crearCita(
    dto: CrearCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    // El paciente debe pertenecer al tenant del usuario (aislamiento).
    const paciente = await this.pacienteRepository.buscarPorId(
      dto.pacienteId,
      usuario.tenantId,
    );
    if (!paciente) {
      throw new PacienteNoEncontradoError(dto.pacienteId);
    }

    const cita = Cita.crear({
      inicio: new Date(dto.inicio),
      duracionMin: dto.duracionMin,
      tipoConsulta: dto.tipoConsulta,
      tenantId: usuario.tenantId,
      pacienteId: dto.pacienteId,
      usuarioId: usuario.userId,
    });

    const saved = await this.citaRepository.guardar(cita);

    return new CitaResponseDto({
      id: saved.id,
      inicio: saved.inicio,
      duracionMin: saved.duracionMin,
      tipoConsulta: saved.tipoConsulta,
      estado: saved.estado,
      pacienteId: saved.pacienteId,
    });
  }

  // US-06 (RF-03): citas del dia del profesional logueado, orden ASC (lo
  // garantiza el repositorio). Resuelve el nombre del paciente de cada cita.
  async citasDeHoy(usuario: AuthenticatedUser): Promise<CitaDashboardDto[]> {
    const citas = await this.citaRepository.buscarDelDiaPorProfesional(
      usuario.tenantId,
      usuario.userId,
      new Date(),
    );

    const nombresPorPaciente = await this.resolverNombresPaciente(
      citas,
      usuario.tenantId,
    );

    return citas.map(
      (cita) =>
        new CitaDashboardDto({
          id: cita.id,
          pacienteNombre: nombresPorPaciente.get(cita.pacienteId) ?? 'Paciente',
          hora: formatearHoraEnZona(cita.inicio, this.tz),
          inicio: cita.inicio,
          duracionMin: cita.duracionMin,
          tipoConsulta: cita.tipoConsulta,
          estado: cita.estado,
        }),
    );
  }

  // Resuelve cada pacienteId unico UNA sola vez (evita N+1 cuando un mismo
  // paciente tiene varias citas en el dia). Para el volumen de citas de un dia
  // esto es aceptable; ver notas sobre un posible metodo batch en el puerto.
  private async resolverNombresPaciente(
    citas: Cita[],
    tenantId: string,
  ): Promise<Map<string, string>> {
    const idsUnicos = [...new Set(citas.map((c) => c.pacienteId))];

    const entradas = await Promise.all(
      idsUnicos.map(async (id) => {
        const paciente = await this.pacienteRepository.buscarPorId(
          id,
          tenantId,
        );
        return [id, paciente?.nombre ?? 'Paciente'] as const;
      }),
    );

    return new Map(entradas);
  }
}
