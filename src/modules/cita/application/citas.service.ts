import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacientesService } from '../../paciente/application/pacientes.service';
import { Paciente } from '../../paciente/domain/paciente.entity';
import { PacienteRepository } from '../../paciente/domain/paciente.repository';
import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import { formatearHoraEnZona } from '../../../shared/domain/timezone';
import {
  ActorCambio,
  CambioCita,
  CrearCambioCitaProps,
  TipoCambio,
} from '../domain/cambio-cita.entity';
import { CambioCitaRepository } from '../domain/cambio-cita.repository';
import { Cita, EstadoCita } from '../domain/cita.entity';
import { CitaRepository } from '../domain/cita.repository';
import { CitaDashboardDto } from '../presentation/dto/cita-dashboard.dto';
import { CitaResponseDto } from '../presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';
import { EditarCitaDto } from '../presentation/dto/editar-cita.dto';
import { ReagendarCitaDto } from '../presentation/dto/reagendar-cita.dto';
import { CitaNoEncontradaError } from './cita-no-encontrada.error';
import { DatosPacienteRequeridosError } from './datos-paciente-requeridos.error';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';

// Props del cambio que el caso de uso decide; el resto (cita, tenant, actor)
// lo rellena `mutar`, que es quien conoce el contexto de la peticion.
type DetalleCambio = Omit<
  CrearCambioCitaProps,
  'citaId' | 'tenantId' | 'actorTipo' | 'actorId'
>;

export class CitasService {
  constructor(
    private readonly citaRepository: CitaRepository,
    private readonly cambioCitaRepository: CambioCitaRepository,
    private readonly pacienteRepository: PacienteRepository,
    private readonly pacientesService: PacientesService,
    private readonly tx: TransactionRunner,
    private readonly eventos: PublicadorEventos,
    // Zona horaria de la clínica (ej. 'America/Santiago'). El "día" y la "hora"
    // se calculan en esta zona, no en la del servidor (contenedor en UTC).
    private readonly tz: string,
  ) {}

  // ---------------------------------------------------------------------
  // Crear
  // ---------------------------------------------------------------------

  /**
   * US-02: agenda una cita desde el formulario "nueva cita" del profesional.
   *
   * Resolver el paciente, crear la cita y registrar el cambio van en UNA
   * transaccion (ADR-06): si algo falla, no queda un paciente creado a medias
   * ni una cita sin rastro en la bitacora.
   *
   * tenantId y usuarioId vienen SIEMPRE del token, nunca del body.
   */
  async crearCita(
    dto: CrearCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.tx.run(async (tx) => {
      const paciente = await this.resolverPaciente(dto, usuario.tenantId, tx);

      const cita = Cita.crear({
        inicio: new Date(dto.inicio),
        duracionMin: dto.duracionMin,
        tipoConsulta: dto.tipoConsulta,
        tenantId: usuario.tenantId,
        pacienteId: paciente.id,
        usuarioId: usuario.userId,
      });

      const guardada = await this.citaRepository.guardar(cita, tx);

      await this.registrarCambio(
        guardada,
        usuario,
        {
          tipo: TipoCambio.CREADA,
          estadoNuevo: guardada.estado,
          inicioNuevo: guardada.inicio,
        },
        tx,
      );

      await this.publicar('CitaCreada', guardada, usuario);

      return this.aResponse(guardada, paciente);
    });
  }

  // ---------------------------------------------------------------------
  // Transiciones de estado (ADR-04 §1: la regla vive en la entidad)
  // ---------------------------------------------------------------------

  async confirmar(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutar(citaId, usuario, 'CitaConfirmada', (cita) => {
      cita.confirmar();
      return { tipo: TipoCambio.CONFIRMADA };
    });
  }

  async cancelar(
    citaId: string,
    usuario: AuthenticatedUser,
    motivo?: string,
  ): Promise<CitaResponseDto> {
    return this.mutar(citaId, usuario, 'CitaCancelada', (cita) => {
      cita.cancelar();
      return { tipo: TipoCambio.CANCELADA, motivo };
    });
  }

  async marcarAsistencia(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutar(citaId, usuario, 'CitaAsistida', (cita) => {
      cita.marcarAsistencia();
      return { tipo: TipoCambio.ASISTIO };
    });
  }

  async marcarInasistencia(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutar(citaId, usuario, 'CitaNoAsistida', (cita) => {
      cita.marcarInasistencia();
      return { tipo: TipoCambio.NO_ASISTIO };
    });
  }

  // ---------------------------------------------------------------------
  // Reagendar y editar (ADR-09 §4 y §5)
  // ---------------------------------------------------------------------

  /**
   * Mueve la cita conservando su identidad y la devuelve a `pendiente`: la
   * confirmacion anterior era para otra hora. Deja el antes/despues en la
   * bitacora, que es lo que RF-08 necesita para contar reagendamientos.
   */
  async reagendar(
    citaId: string,
    dto: ReagendarCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    const nuevoInicio = new Date(dto.inicio);

    return this.mutar(citaId, usuario, 'CitaReagendada', (cita) => {
      const inicioAnterior = cita.inicio;
      cita.reagendar(nuevoInicio);
      return {
        tipo: TipoCambio.REAGENDADA,
        inicioAnterior,
        inicioNuevo: nuevoInicio,
        motivo: dto.motivo,
      };
    });
  }

  /** Corrige duracion o tipo de consulta. No avisa ni cuenta para el historial. */
  async editar(
    citaId: string,
    dto: EditarCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutar(citaId, usuario, 'CitaEditada', (cita) => {
      cita.editar({
        duracionMin: dto.duracionMin,
        tipoConsulta: dto.tipoConsulta,
      });
      return { tipo: TipoCambio.EDITADA };
    });
  }

  // ---------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------

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

  /** Historial completo de cambios de una cita, del mas antiguo al mas reciente. */
  async historial(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CambioCita[]> {
    // Verifica pertenencia al tenant antes de exponer el historial.
    await this.cargar(citaId, usuario.tenantId);
    return this.cambioCitaRepository.historialDeCita(citaId, usuario.tenantId);
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  /**
   * Esqueleto compartido por toda mutacion de una cita ya existente:
   * cargar -> aplicar la regla de dominio -> guardar -> registrar -> publicar,
   * todo dentro de una transaccion.
   *
   * La regla de que transiciones son legales NO vive aqui: vive en la entidad
   * (ADR-04 §1). Este metodo solo orquesta.
   */
  private async mutar(
    citaId: string,
    usuario: AuthenticatedUser,
    nombreEvento: string,
    operacion: (cita: Cita) => DetalleCambio,
  ): Promise<CitaResponseDto> {
    return this.tx.run(async (tx) => {
      const cita = await this.cargar(citaId, usuario.tenantId, tx);
      const estadoAnterior = cita.estado;

      const detalle = operacion(cita);

      const guardada = await this.citaRepository.guardar(cita, tx);

      await this.registrarCambio(
        guardada,
        usuario,
        { ...detalle, estadoAnterior, estadoNuevo: guardada.estado },
        tx,
      );

      await this.publicar(nombreEvento, guardada, usuario, detalle);

      return this.aResponse(guardada);
    });
  }

  private async cargar(
    citaId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Cita> {
    const cita = await this.citaRepository.buscarPorId(citaId, tenantId, tx);
    if (!cita) {
      throw new CitaNoEncontradaError(citaId);
    }
    return cita;
  }

  private async registrarCambio(
    cita: Cita,
    usuario: AuthenticatedUser,
    detalle: DetalleCambio & { estadoAnterior?: EstadoCita | null },
    tx: TransactionContext,
  ): Promise<void> {
    await this.cambioCitaRepository.registrar(
      CambioCita.registrar({
        ...detalle,
        citaId: cita.id,
        tenantId: cita.tenantId,
        // Hoy toda mutacion llega por una ruta autenticada del profesional.
        actorTipo: ActorCambio.PROFESIONAL,
        actorId: usuario.userId,
      }),
      tx,
    );
  }

  private async publicar(
    nombre: string,
    cita: Cita,
    usuario: AuthenticatedUser,
    detalle?: DetalleCambio,
  ): Promise<void> {
    await this.eventos.publicar({
      nombre,
      ocurridoEn: new Date(),
      tenantId: cita.tenantId,
      payload: {
        citaId: cita.id,
        pacienteId: cita.pacienteId,
        usuarioId: usuario.userId,
        estado: cita.estado,
        inicio: cita.inicio,
        inicioAnterior: detalle?.inicioAnterior ?? null,
      },
    });
  }

  /**
   * Dos vias de entrada, un solo resultado (ADR-09 §3):
   *
   *  - `pacienteId`: paciente ya conocido. Se valida que sea del mismo tenant.
   *  - `paciente`:   datos del formulario. Con RUT, se vincula al existente si
   *                  lo hay; sin RUT, siempre se crea uno nuevo.
   */
  private async resolverPaciente(
    dto: CrearCitaDto,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<Paciente> {
    if (dto.pacienteId) {
      // El paciente debe pertenecer al tenant del usuario (aislamiento).
      const existente = await this.pacienteRepository.buscarPorId(
        dto.pacienteId,
        tenantId,
        tx,
      );
      if (!existente) {
        throw new PacienteNoEncontradoError(dto.pacienteId);
      }
      return existente;
    }

    if (dto.paciente) {
      return this.pacientesService.resolverOCrear(dto.paciente, tenantId, tx);
    }

    throw new DatosPacienteRequeridosError();
  }

  private aResponse(cita: Cita, paciente?: Paciente): CitaResponseDto {
    return new CitaResponseDto({
      id: cita.id,
      inicio: cita.inicio,
      duracionMin: cita.duracionMin,
      tipoConsulta: cita.tipoConsulta,
      estado: cita.estado,
      pacienteId: cita.pacienteId,
      paciente: paciente ? PacientesService.aResponse(paciente) : undefined,
    });
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
