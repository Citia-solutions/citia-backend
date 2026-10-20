import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacienteNoEncontradoError } from '../../paciente/application/paciente-no-encontrado.error';
import { PacientesService } from '../../paciente/application/pacientes.service';
import { Paciente } from '../../paciente/domain/paciente.entity';
import { PacienteRepository } from '../../paciente/domain/paciente.repository';
import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import {
  diasCalendarioInclusivos,
  formatearFechaEnZona,
  formatearHoraEnZona,
  rangoDeFechasEnZona,
} from '../../../shared/domain/timezone';
import {
  ACTOR_SISTEMA,
  Actor,
  actorCambioDe,
  actorDelHecho,
  actorPaciente,
  actorProfesional,
  idDelActor,
} from '../domain/actor';
import {
  ActorCambio,
  CambioCita,
  CrearCambioCitaProps,
  PedidoPor,
  TipoCambio,
} from '../domain/cambio-cita.entity';
import {
  CambioCitaRepository,
  UltimoCambio,
} from '../domain/cambio-cita.repository';
import {
  Cita,
  DURACION_MAXIMA_MIN,
  ESTADOS_VIGENTES,
  EstadoCita,
  OrigenCita,
} from '../domain/cita.entity';
import { CitaRepository } from '../domain/cita.repository';
import { EnlaceCita } from '../domain/enlace-cita.entity';
import { AvisosCitaDto } from '../presentation/dto/avisos-cita.dto';
import { CitaDashboardDto } from '../presentation/dto/cita-dashboard.dto';
import {
  CitaDetalleDto,
  CitaDetallePacienteDto,
} from '../presentation/dto/cita-detalle.dto';
import { CitaResponseDto } from '../presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';
import { EditarCitaDto } from '../presentation/dto/editar-cita.dto';
import { ReagendarCitaDto } from '../presentation/dto/reagendar-cita.dto';
import { CitaNoEncontradaError } from './cita-no-encontrada.error';
import { DatosPacienteRequeridosError } from './datos-paciente-requeridos.error';
import { EnlaceCitaNoValidoError } from './enlace-cita-no-valido.error';
import { RangoFechasInvalidoError } from './rango-fechas-invalido.error';

/**
 * Tope de la agenda por rango, en dias calendario INCLUSIVOS: seis semanas, lo
 * que ocupa la grilla de un mes (la vista semanal usa 7). Acota el volumen sin
 * necesidad de paginar.
 */
export const MAX_DIAS_RANGO = 42;

// Props del cambio que el caso de uso decide; el resto (cita, tenant, actor)
// lo rellena el esqueleto (`aplicar`), que es quien conoce el contexto.
type DetalleCambio = Omit<
  CrearCambioCitaProps,
  'citaId' | 'tenantId' | 'actorTipo' | 'actorId'
>;

/**
 * Una operacion de dominio sobre una cita ya cargada: aplica la transicion
 * (la regla vive en la entidad, ADR-04 §1) y devuelve el detalle del cambio
 * para la bitacora. La misma operacion sirve al profesional y al paciente.
 */
type OperacionCita = (cita: Cita) => DetalleCambio;

const confirmarCita: OperacionCita = (cita) => {
  cita.confirmar();
  return { tipo: TipoCambio.CONFIRMADA };
};

// `pedidoPor` (US-07.01, H3): quién pidió el cambio. Sin dato (`undefined` o
// `null`) queda `null` en la bitácora = cuenta como del profesional.
const cancelarCita =
  (motivo?: string, pedidoPor?: PedidoPor | null): OperacionCita =>
  (cita) => {
    cita.cancelar();
    return { tipo: TipoCambio.CANCELADA, motivo, pedidoPor: pedidoPor ?? null };
  };

const reagendarCita =
  (
    nuevoInicio: Date,
    motivo?: string,
    pedidoPor?: PedidoPor | null,
  ): OperacionCita =>
  (cita) => {
    const inicioAnterior = cita.inicio;
    cita.reagendar(nuevoInicio);
    return {
      tipo: TipoCambio.REAGENDADA,
      inicioAnterior,
      inicioNuevo: nuevoInicio,
      motivo,
      pedidoPor: pedidoPor ?? null,
    };
  };

/**
 * Lo minimo de una cita para un modulo que solo la MUESTRA (la bandeja de
 * solicitudes: la hora original de una peticion de otra hora). Sin paciente
 * ni tipo de consulta.
 */
export interface ResumenCita {
  id: string;
  inicio: Date;
  duracionMin: number;
  estado: EstadoCita;
}

// Opciones de una mutacion del profesional. `conAvisos`: la operacion fija o
// mueve la ventana de la cita y la respuesta debe llevar `avisos` (ADR-11 §3).
interface OpcionesMutacion {
  conAvisos?: boolean;
}

/**
 * Estados en los que puede haber una confirmacion VIGENTE para
 * `confirmadaPor` (G3). Tras reagendar, la cita vuelve a `pendiente`: una
 * confirmacion vieja era para otra hora y no se muestra. Desde US-07.01 una
 * `pendiente` puede ir directo a `asistio`, asi que en estos estados ademas se
 * exige que la confirmacion sea posterior al ultimo reagendamiento (H9).
 */
const ESTADOS_CON_CONFIRMACION: readonly EstadoCita[] = [
  EstadoCita.CONFIRMADA,
  EstadoCita.ASISTIO,
  EstadoCita.NO_ASISTIO,
];

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
    // Reloj del dominio: la validez del enlace en las acciones del paciente
    // (`ahora < inicio`) y, desde US-07.01, la hora de las marcas del
    // profesional y del job G1 (`ahora ≥ inicio`) y las `accionesPermitidas`
    // del voucher.
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------------
  // Crear
  // ---------------------------------------------------------------------

  /**
   * US-02: agenda una cita desde el formulario "nueva cita" del profesional.
   *
   * Abre la transaccion y delega en `agendar`. Quien ya tiene una transaccion
   * abierta (aceptar una solicitud) llama a `agendar` directamente: llamar
   * aqui abriria una segunda.
   */
  async crearCita(
    dto: CrearCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.tx.run((tx) =>
      this.agendar(dto, usuario, tx, OrigenCita.MANUAL),
    );
  }

  /**
   * Cuerpo del alta de una cita, DENTRO de una transaccion que abre quien
   * llama (ADR-06): resolver-o-crear el paciente, crear la cita en
   * `pendiente`, registrar el cambio `creada`, publicar `CitaCreada` y
   * calcular los avisos de solapamiento. Si algo falla, no queda un paciente
   * creado a medias ni una cita sin rastro en la bitacora.
   *
   * Publico para que la bandeja de solicitudes (modulo `solicitud`) cree la
   * cita con EXACTAMENTE este flujo y en SU transaccion, junto con la
   * resolucion de la solicitud. La dependencia es solicitud -> cita, nunca al
   * reves.
   *
   * tenantId y usuarioId vienen SIEMPRE del token, nunca del body.
   *
   * `origen` (US-07.01, H4) lo decide quien llama y es obligatorio a
   * propósito: `crearCita` pasa `MANUAL` y la bandeja, al aceptar una
   * solicitud pública `nueva`, `SOLICITUD_PUBLICA`.
   */
  async agendar(
    dto: CrearCitaDto,
    usuario: AuthenticatedUser,
    tx: TransactionContext,
    origen: OrigenCita,
  ): Promise<CitaResponseDto> {
    const paciente = await this.resolverPaciente(dto, usuario.tenantId, tx);

    const cita = Cita.crear({
      inicio: new Date(dto.inicio),
      duracionMin: dto.duracionMin,
      tipoConsulta: dto.tipoConsulta,
      tenantId: usuario.tenantId,
      pacienteId: paciente.id,
      usuarioId: usuario.userId,
      origen,
    });

    const guardada = await this.citaRepository.guardar(cita, tx);
    const actor = actorProfesional(usuario.userId);

    await this.registrarCambio(
      guardada,
      actor,
      {
        tipo: TipoCambio.CREADA,
        estadoNuevo: guardada.estado,
        inicioNuevo: guardada.inicio,
      },
      tx,
    );

    // Dentro del `tx` de quien llama: el hecho se confirma con la cita o no
    // existe (ADR-12 §2).
    await this.publicar('CitaCreada', guardada, actor, tx);

    const avisos = await this.calcularAvisos(guardada, tx);

    return this.aResponse(guardada, paciente, avisos);
  }

  // ---------------------------------------------------------------------
  // Transiciones de estado (ADR-04 §1: la regla vive en la entidad)
  // No mueven la ventana de la cita: su respuesta NO lleva `avisos`.
  // ---------------------------------------------------------------------

  async confirmar(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutarComoProfesional(
      citaId,
      usuario,
      'CitaConfirmada',
      confirmarCita,
    );
  }

  /**
   * `pendiente | confirmada → cancelada` por el profesional. `pedidoPor`
   * (US-07.01, H3) es quién lo pidió: opcional en la API, sin dato = `null` en
   * la bitácora (cuenta como del profesional). No viaja en el hecho.
   */
  async cancelar(
    citaId: string,
    usuario: AuthenticatedUser,
    motivo?: string,
    pedidoPor?: PedidoPor | null,
  ): Promise<CitaResponseDto> {
    return this.mutarComoProfesional(
      citaId,
      usuario,
      'CitaCancelada',
      cancelarCita(motivo, pedidoPor),
    );
  }

  /**
   * `pendiente | confirmada → asistio` (US-07.01, ADR-14 §9), desde la hora
   * de inicio con el reloj del servicio. Antes de la hora →
   * `CitaAunNoComienzaError` (409). Publica `CitaAsistida` (H8).
   */
  async marcarAsistencia(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutarComoProfesional(
      citaId,
      usuario,
      'CitaAsistida',
      (cita) => {
        cita.marcarAsistencia(this.reloj());
        return { tipo: TipoCambio.ASISTIO };
      },
    );
  }

  /**
   * Inasistencia (US-07.01, ADR-14 §9): el destino lo decide el dominio,
   * `confirmada → no_asistio` o `pendiente → ghosting`. La bitácora anota el
   * tipo del destino (`no_asistio` o `ghosting`, actor `profesional`) y el
   * hecho es SIEMPRE `CitaNoAsistida` (H8): los suscriptores anulan los
   * recordatorios y descartan la petición de otra hora sin distinguir; el
   * `estado` del payload dice cómo se materializó. La respuesta trae el
   * estado real de destino.
   */
  async marcarInasistencia(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutarComoProfesional(
      citaId,
      usuario,
      'CitaNoAsistida',
      (cita) => {
        const destino = cita.marcarInasistencia(this.reloj());
        return {
          tipo:
            destino === EstadoCita.GHOSTING
              ? TipoCambio.GHOSTING
              : TipoCambio.NO_ASISTIO,
        };
      },
    );
  }

  // ---------------------------------------------------------------------
  // Reagendar y editar (ADR-09 §4 y §5). Mueven la ventana: llevan `avisos`.
  // ---------------------------------------------------------------------

  /**
   * Mueve la cita conservando su identidad y la devuelve a `pendiente`: la
   * confirmacion anterior era para otra hora. Deja el antes/despues en la
   * bitacora, que es lo que RF-08 necesita para contar reagendamientos, y
   * quién lo pidió (`dto.pedidoPor`, US-07.01; sin dato = `null`).
   */
  async reagendar(
    citaId: string,
    dto: ReagendarCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutarComoProfesional(
      citaId,
      usuario,
      'CitaReagendada',
      reagendarCita(new Date(dto.inicio), dto.motivo, dto.pedidoPor),
      { conAvisos: true },
    );
  }

  /**
   * `reagendar` DENTRO de una transaccion que abre quien llama: la bandeja de
   * solicitudes, al aceptar una peticion de otra hora (Fase 3, R2), mueve la
   * cita de origen en la MISMA transaccion en que resuelve la solicitud.
   *
   * Mismo flujo que `PATCH /citas/:id/reagendar` (carga con `FOR NO KEY UPDATE`,
   * vuelve a `pendiente`, bitacora con el profesional del token, hecho
   * `CitaReagendada` y avisos). Cita inexistente u otro tenant →
   * `CitaNoEncontradaError`; cita terminal → `TransicionEstadoInvalidaError`.
   *
   * `nuevoInicio` admite el texto ISO del DTO (con zona) o un `Date`.
   *
   * `pedidoPor` es OBLIGATORIO a propósito (US-07.01, H3): su único llamador,
   * la bandeja al aceptar una petición de otra hora, anota `PACIENTE` de forma
   * explícita (el paciente la pidió por su enlace).
   */
  async reagendarEnTx(
    citaId: string,
    nuevoInicio: Date | string,
    usuario: AuthenticatedUser,
    tx: TransactionContext,
    pedidoPor: PedidoPor,
  ): Promise<CitaResponseDto> {
    return this.responderComoProfesional(
      citaId,
      usuario,
      'CitaReagendada',
      reagendarCita(new Date(nuevoInicio), undefined, pedidoPor),
      { conAvisos: true },
      tx,
    );
  }

  /**
   * Corrige duracion o tipo de consulta. No avisa al paciente ni cuenta para
   * el historial, pero SI calcula avisos: cambiar `duracionMin` mueve el fin.
   */
  async editar(
    citaId: string,
    dto: EditarCitaDto,
    usuario: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.mutarComoProfesional(
      citaId,
      usuario,
      'CitaEditada',
      (cita) => {
        cita.editar({
          duracionMin: dto.duracionMin,
          tipoConsulta: dto.tipoConsulta,
        });
        return { tipo: TipoCambio.EDITADA };
      },
      { conAvisos: true },
    );
  }

  // ---------------------------------------------------------------------
  // Acciones del paciente por su enlace (Fase 3, ADR-10 §3)
  //
  // Corren DENTRO del `tx` que abre el portal y reciben la cita YA BLOQUEADA
  // por `EnlacesCitaService.resolver` (`FOR NO KEY UPDATE`): no la recargan. Mismo
  // esqueleto que el profesional; cambia el actor (`paciente`, id = enlace).
  // ---------------------------------------------------------------------

  /**
   * `pendiente → confirmada` por el paciente. Bitacora con
   * `actor_tipo = paciente` y `actor_id` = id del enlace; hecho
   * `CitaConfirmada` con `actor: { tipo: 'paciente', id: enlaceId }`.
   *
   * @throws EnlaceCitaNoValidoError si el enlace ya no permite actuar sobre
   *   la cita (defensa en profundidad; el portal responde el mismo 404).
   * @throws TransicionEstadoInvalidaError si la cita no esta `pendiente` (409).
   */
  async confirmarComoPaciente(
    cita: Cita,
    enlace: EnlaceCita,
    tx: TransactionContext,
  ): Promise<Cita> {
    this.exigirEnlaceValido(cita, enlace);
    return this.aplicar(
      cita,
      actorPaciente(enlace.id),
      'CitaConfirmada',
      confirmarCita,
      tx,
    );
  }

  /**
   * `pendiente | confirmada → cancelada` por el paciente, con `motivo`
   * opcional (≤ 300, lo valida el DTO del portal). Mismos errores que
   * `confirmarComoPaciente`. La bitácora anota `pedido_por = paciente`
   * (US-07.01, H3): lo pidió quien lo hizo, sin preguntar.
   */
  async cancelarComoPaciente(
    cita: Cita,
    enlace: EnlaceCita,
    motivo: string | undefined,
    tx: TransactionContext,
  ): Promise<Cita> {
    this.exigirEnlaceValido(cita, enlace);
    return this.aplicar(
      cita,
      actorPaciente(enlace.id),
      'CitaCancelada',
      cancelarCita(motivo, PedidoPor.PACIENTE),
      tx,
    );
  }

  // ---------------------------------------------------------------------
  // Cierre por el sistema (US-07.01, job G1, DT-11)
  // ---------------------------------------------------------------------

  /**
   * `pendiente → ghosting` por el SISTEMA: lo llama solo el job G1
   * (`CierreGhostingService`), DENTRO de su transacción y con la cita YA
   * bloqueada por el reclamo (`FOR NO KEY UPDATE … SKIP LOCKED`): no la
   * recarga. Mismo esqueleto que el resto (`aplicar`): bitácora `ghosting` con
   * `actor_tipo = sistema` y `actor_id` nulo, y hecho `CitaNoAsistida` (H8) con
   * `actor: { tipo: 'sistema', id: null }`. Sin respuesta HTTP ni avisos.
   *
   * @throws TransicionEstadoInvalidaError si la cita ya no está `pendiente`
   *   (una lectura vieja: de un terminal no se sale).
   * @throws CitaAunNoComienzaError si todavía no llega su hora (defensa: el
   *   job solo reclama citas de días ya terminados).
   */
  async cerrarPorGhostingEnTx(
    cita: Cita,
    tx: TransactionContext,
  ): Promise<Cita> {
    return this.aplicar(
      cita,
      ACTOR_SISTEMA,
      'CitaNoAsistida',
      (c) => {
        c.marcarGhosting(this.reloj());
        return { tipo: TipoCambio.GHOSTING };
      },
      tx,
    );
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

    return this.aDashboard(citas, usuario.tenantId);
  }

  /**
   * Agenda por rango (`GET /citas?desde&hasta`): citas del profesional del
   * token cuyo `inicio` cae entre las 00:00 de `desde` y las 00:00 del dia
   * siguiente a `hasta`, en la zona de la clinica (ADR-07). Todos los estados,
   * orden `inicio ASC` + `creadoEn ASC` (lo garantiza el repositorio).
   *
   * `desde`/`hasta` llegan ya validados como fechas `YYYY-MM-DD` reales; aqui
   * solo se comprueban las reglas entre ambos.
   */
  async listarEnRango(
    desde: string,
    hasta: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaDashboardDto[]> {
    const dias = diasCalendarioInclusivos(desde, hasta);
    if (dias < 1) {
      throw new RangoFechasInvalidoError(
        'El parámetro "hasta" debe ser igual o posterior a "desde"',
      );
    }
    if (dias > MAX_DIAS_RANGO) {
      throw new RangoFechasInvalidoError(
        `El rango máximo es de ${MAX_DIAS_RANGO} días`,
      );
    }

    const rango = rangoDeFechasEnZona(desde, hasta, this.tz);
    const citas = await this.citaRepository.buscarPorProfesionalEnRango(
      usuario.tenantId,
      usuario.userId,
      rango.desde,
      rango.hasta,
    );

    return this.aDashboard(citas, usuario.tenantId);
  }

  /**
   * US-02.08: detalle de una cita para el voucher del profesional.
   *
   * Filtra SOLO por el tenant del token, igual que las transiciones (plan
   * US-02.08 §1): no se agrega aqui una regla "solo del profesional" distinta
   * a la del resto del recurso; eso se decide para todas a la vez con Q3.
   * Cita inexistente u otro tenant -> CitaNoEncontradaError (mismo 404).
   */
  async detalle(
    citaId: string,
    usuario: AuthenticatedUser,
  ): Promise<CitaDetalleDto> {
    const cita = await this.cargar(citaId, usuario.tenantId);

    const paciente = await this.pacienteRepository.buscarPorId(
      cita.pacienteId,
      usuario.tenantId,
    );
    if (!paciente) {
      // Invariante rota: toda cita apunta a un paciente de su mismo tenant (FK).
      // No es un 404 de la cita (si existe) ni un error del cliente: es un 500.
      throw new Error(
        `Integridad: el paciente "${cita.pacienteId}" de la cita "${cita.id}" no existe en su tenant`,
      );
    }

    // Reutiliza el formateo del modulo paciente (RUT para mostrar, correo null).
    const datosPaciente = PacientesService.aResponse(paciente);

    const { confirmadaPor, canceladaPor } = await this.quienConfirmoYCancelo(
      cita,
      usuario.tenantId,
    );

    return new CitaDetalleDto({
      id: cita.id,
      estado: cita.estado,
      inicio: cita.inicio,
      hora: formatearHoraEnZona(cita.inicio, this.tz),
      duracionMin: cita.duracionMin,
      tipoConsulta: cita.tipoConsulta,
      paciente: new CitaDetallePacienteDto({
        id: datosPaciente.id,
        nombre: datosPaciente.nombre,
        rut: datosPaciente.rut,
        telefono: datosPaciente.telefono,
        correo: datosPaciente.correo,
      }),
      // La regla vive en la entidad (ADR-04 §1); el service solo la transporta.
      // Con el reloj del servicio: `asistencia` e `inasistencia` solo desde la
      // hora de inicio (US-07.01).
      accionesPermitidas: cita.accionesPermitidas(this.reloj()),
      confirmadaPor,
      canceladaPor,
    });
  }

  /**
   * Resumen de varias citas del tenant en UNA lectura (sin N+1), indexado por
   * id. Sin bloqueo. Los ids de otro tenant o inexistentes no aparecen en el
   * mapa. Con `ids` vacio no consulta.
   *
   * Lo usa la bandeja de solicitudes (modulo `solicitud`) para mostrar la
   * hora original de cada peticion de otra hora (`citaOrigen`, Fase 3 R4).
   * Solo datos de la cita: ni paciente ni tipo de consulta.
   */
  async resumenesPorIds(
    ids: readonly string[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Map<string, ResumenCita>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();

    const citas = await this.citaRepository.buscarPorIds(unicos, tenantId, tx);

    return new Map(
      citas.map((cita) => [
        cita.id,
        {
          id: cita.id,
          inicio: cita.inicio,
          duracionMin: cita.duracionMin,
          estado: cita.estado,
        },
      ]),
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
   * Mutacion del profesional por una ruta HTTP: abre la transaccion y delega
   * en `responderComoProfesional`. Quien ya tiene una transaccion (la bandeja)
   * usa la variante `...EnTx`.
   */
  private async mutarComoProfesional(
    citaId: string,
    usuario: AuthenticatedUser,
    nombreEvento: string,
    operacion: OperacionCita,
    opciones: OpcionesMutacion = {},
  ): Promise<CitaResponseDto> {
    return this.tx.run((tx) =>
      this.responderComoProfesional(
        citaId,
        usuario,
        nombreEvento,
        operacion,
        opciones,
        tx,
      ),
    );
  }

  /**
   * Mutacion del profesional dentro de `tx`: `mutar` con el actor del token
   * y el tenant del token, mas avisos si la operacion mueve la ventana, y la
   * respuesta HTTP.
   */
  private async responderComoProfesional(
    citaId: string,
    usuario: AuthenticatedUser,
    nombreEvento: string,
    operacion: OperacionCita,
    opciones: OpcionesMutacion,
    tx: TransactionContext,
  ): Promise<CitaResponseDto> {
    const guardada = await this.mutar(
      citaId,
      usuario.tenantId,
      actorProfesional(usuario.userId),
      nombreEvento,
      operacion,
      tx,
    );

    const avisos = opciones.conAvisos
      ? await this.calcularAvisos(guardada, tx)
      : undefined;

    return this.aResponse(guardada, undefined, avisos);
  }

  /**
   * Carga la cita del `tenantId` BLOQUEANDO su fila (`SELECT … FOR NO KEY UPDATE`)
   * y le aplica la operacion con el esqueleto comun. Serializa las
   * mutaciones concurrentes de una misma cita (profesional, paciente, bandeja):
   * la segunda espera y relee el estado ya confirmado.
   */
  private async mutar(
    citaId: string,
    tenantId: string,
    actor: Actor,
    nombreEvento: string,
    operacion: OperacionCita,
    tx: TransactionContext,
  ): Promise<Cita> {
    const cita = await this.citaRepository.buscarPorIdParaActualizar(
      citaId,
      tenantId,
      tx,
    );
    if (!cita) {
      throw new CitaNoEncontradaError(citaId);
    }
    return this.aplicar(cita, actor, nombreEvento, operacion, tx);
  }

  /**
   * UNICO esqueleto de toda mutacion de una cita ya existente, sea quien sea
   * el actor (profesional, paciente o el sistema, `cerrarPorGhostingEnTx`):
   * aplicar la regla de dominio -> guardar -> registrar en la bitacora ->
   * publicar el hecho, todo en `tx`. La cita debe llegar ya bloqueada.
   *
   * La regla de que transiciones son legales NO vive aqui: vive en la entidad
   * (ADR-04 §1). Si la entidad lanza, no se escribe nada.
   */
  private async aplicar(
    cita: Cita,
    actor: Actor,
    nombreEvento: string,
    operacion: OperacionCita,
    tx: TransactionContext,
  ): Promise<Cita> {
    const estadoAnterior = cita.estado;

    const detalle = operacion(cita);

    const guardada = await this.citaRepository.guardar(cita, tx);

    await this.registrarCambio(
      guardada,
      actor,
      { ...detalle, estadoAnterior, estadoNuevo: guardada.estado },
      tx,
    );

    await this.publicar(nombreEvento, guardada, actor, tx, detalle);

    return guardada;
  }

  /**
   * El enlace debe seguir permitiendo actuar sobre ESTA cita en este momento
   * (ADR-10 §1 regla 4). `resolver` ya lo comprobo en el mismo tx; aqui se
   * repite para no depender de que quien llama lo hizo.
   */
  private exigirEnlaceValido(cita: Cita, enlace: EnlaceCita): void {
    if (
      enlace.id === undefined ||
      !enlace.permiteActuarSobre(cita, this.reloj())
    ) {
      throw new EnlaceCitaNoValidoError();
    }
  }

  // Lectura sin bloqueo (detalle, historial).
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

  /**
   * Bitacora: `actor_tipo` + `actor_id` segun el actor (usuario si
   * `profesional`, enlace si `paciente`, nulo si `sistema`).
   */
  private async registrarCambio(
    cita: Cita,
    actor: Actor,
    detalle: DetalleCambio & { estadoAnterior?: EstadoCita | null },
    tx: TransactionContext,
  ): Promise<void> {
    await this.cambioCitaRepository.registrar(
      CambioCita.registrar({
        ...detalle,
        citaId: cita.id,
        tenantId: cita.tenantId,
        actorTipo: actorCambioDe(actor),
        actorId: idDelActor(actor),
      }),
      tx,
    );
  }

  /**
   * Publica el hecho de una cita en la transaccion `tx` de la operacion
   * (ADR-12 §2). Se invoca DENTRO de la transaccion, despues de guardar la
   * cita y la bitacora: si algo falla despues (p. ej. `calcularAvisos`), el
   * hecho se revierte junto con el cambio.
   *
   * `usuarioId` es el DUEÑO de la cita (`cita.usuarioId`), no quien hizo la
   * peticion: eso lo dice `actor` (`{ tipo, id }`, id nulo para `sistema`).
   * Nunca lleva el token del enlace ni su hash.
   */
  private async publicar(
    nombre: string,
    cita: Cita,
    actor: Actor,
    tx: TransactionContext,
    detalle?: DetalleCambio,
  ): Promise<void> {
    await this.eventos.publicar(
      {
        nombre,
        ocurridoEn: new Date(),
        tenantId: cita.tenantId,
        payload: {
          citaId: cita.id,
          pacienteId: cita.pacienteId,
          usuarioId: cita.usuarioId,
          estado: cita.estado,
          inicio: cita.inicio,
          inicioAnterior: detalle?.inicioAnterior ?? null,
          actor: actorDelHecho(actor),
        },
      },
      tx,
    );
  }

  /**
   * G3: quien provoco la confirmacion y la cancelacion VIGENTES, segun la
   * bitacora. Sin consulta si el estado no lo necesita.
   *
   *  - `confirmadaPor` (H9, US-07.01): solo con estado `confirmada`,
   *    `asistio` o `no_asistio`, y solo si la ultima confirmacion es
   *    POSTERIOR al ultimo reagendamiento (o no hubo reagendamiento). Desde
   *    US-07.01 una `pendiente` puede pasar directo a `asistio`: sin esta
   *    regla, una cita confirmada, despues reagendada y por ultimo marcada
   *    `asistio` diria "Confirmada por ti" con una confirmacion de otra hora.
   *  - `canceladaPor`: solo con estado `cancelada`.
   */
  private async quienConfirmoYCancelo(
    cita: Cita,
    tenantId: string,
  ): Promise<{
    confirmadaPor: ActorCambio | null;
    canceladaPor: ActorCambio | null;
  }> {
    const conConfirmacion = ESTADOS_CON_CONFIRMACION.includes(cita.estado);
    const cancelada = cita.estado === EstadoCita.CANCELADA;

    const tipos: TipoCambio[] = [];
    if (conConfirmacion) {
      tipos.push(TipoCambio.CONFIRMADA, TipoCambio.REAGENDADA);
    }
    if (cancelada) {
      tipos.push(TipoCambio.CANCELADA);
    }
    if (tipos.length === 0) {
      return { confirmadaPor: null, canceladaPor: null };
    }

    const ultimos = await this.cambioCitaRepository.ultimosCambiosPorTipo(
      cita.id,
      tenantId,
      tipos,
    );
    return {
      confirmadaPor: conConfirmacion
        ? CitasService.confirmacionVigente(
            ultimos[TipoCambio.CONFIRMADA],
            ultimos[TipoCambio.REAGENDADA],
          )
        : null,
      canceladaPor: cancelada
        ? (ultimos[TipoCambio.CANCELADA]?.actor ?? null)
        : null,
    };
  }

  /**
   * H9: el actor de la ultima confirmacion si es ESTRICTAMENTE posterior al
   * ultimo reagendamiento; si no, `null`. A igual instante no cuenta (a favor
   * de no mostrar una confirmacion que podria ser de la hora anterior).
   */
  private static confirmacionVigente(
    confirmacion: UltimoCambio | undefined,
    reagendamiento: UltimoCambio | undefined,
  ): ActorCambio | null {
    if (!confirmacion) return null;
    if (
      reagendamiento &&
      reagendamiento.ocurridoEn.getTime() >= confirmacion.ocurridoEn.getTime()
    ) {
      return null;
    }
    return confirmacion.actor;
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

  /**
   * Solapamientos de `cita` en la agenda de su profesional DUEÑO (ADR-11).
   *
   * Se llama dentro de la transaccion de la operacion y DESPUES de guardar,
   * para comparar contra el estado ya escrito. El repositorio solo pre-filtra
   * (citas vigentes del mismo profesional con `inicio` en
   * `[cita.inicio - DURACION_MAXIMA_MIN, cita.fin)`, que cubre toda cita que
   * pueda cruzarse porque ninguna dura mas); la decision fina es de
   * `Cita.chocaCon`, unica fuente de la regla. La propia cita vuelve en el
   * pre-filtro y `chocaCon` la descarta por id.
   *
   * Es informacion, no validacion: nunca lanza ni cambia el codigo de estado.
   */
  private async calcularAvisos(
    cita: Cita,
    tx: TransactionContext,
  ): Promise<AvisosCitaDto> {
    const candidatas = await this.citaRepository.buscarPorProfesionalEnRango(
      cita.tenantId,
      cita.usuarioId,
      new Date(cita.inicio.getTime() - DURACION_MAXIMA_MIN * 60_000),
      cita.fin,
      { estados: ESTADOS_VIGENTES },
      tx,
    );

    // `filter` conserva el orden `inicio ASC` que entrega el repositorio.
    const choques = candidatas.filter((otra) => cita.chocaCon(otra));

    return new AvisosCitaDto({
      solapamientos: await this.aDashboard(choques, cita.tenantId, tx),
    });
  }

  private aResponse(
    cita: Cita,
    paciente?: Paciente,
    avisos?: AvisosCitaDto,
  ): CitaResponseDto {
    const response = new CitaResponseDto({
      id: cita.id,
      inicio: cita.inicio,
      duracionMin: cita.duracionMin,
      tipoConsulta: cita.tipoConsulta,
      estado: cita.estado,
      pacienteId: cita.pacienteId,
      paciente: paciente ? PacientesService.aResponse(paciente) : undefined,
    });
    // Solo se asigna cuando se calculo: en confirmar/cancelar/asistencia/
    // inasistencia la clave no debe existir (ADR-11 §3).
    if (avisos) response.avisos = avisos;
    return response;
  }

  /**
   * Proyeccion comun de `/hoy`, de la agenda por rango y de los avisos:
   * `fecha` y `hora` en la zona de la clinica (ADR-07) y solo el nombre del
   * paciente, nunca su contacto.
   */
  private async aDashboard(
    citas: Cita[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<CitaDashboardDto[]> {
    const nombresPorPaciente = await this.resolverNombresPaciente(
      citas,
      tenantId,
      tx,
    );

    return citas.map(
      (cita) =>
        new CitaDashboardDto({
          id: cita.id,
          pacienteNombre: nombresPorPaciente.get(cita.pacienteId) ?? 'Paciente',
          fecha: formatearFechaEnZona(cita.inicio, this.tz),
          hora: formatearHoraEnZona(cita.inicio, this.tz),
          inicio: cita.inicio,
          duracionMin: cita.duracionMin,
          tipoConsulta: cita.tipoConsulta,
          estado: cita.estado,
        }),
    );
  }

  // Resuelve los nombres de TODOS los pacientes de `citas` en UNA consulta
  // (sin N+1), con los ids deduplicados. Un id que no vuelve (inexistente u
  // otro tenant) cae en el nombre por defecto "Paciente".
  private async resolverNombresPaciente(
    citas: Cita[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Map<string, string>> {
    const idsUnicos = [...new Set(citas.map((c) => c.pacienteId))];
    if (idsUnicos.length === 0) return new Map();

    const pacientes = await this.pacienteRepository.buscarPorIds(
      idsUnicos,
      tenantId,
      tx,
    );

    return new Map(pacientes.map((p) => [p.id, p.nombre]));
  }
}
