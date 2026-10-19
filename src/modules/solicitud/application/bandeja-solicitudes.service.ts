import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import { formatearRut } from '../../../shared/domain/rut';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import {
  CitasService,
  ResumenCita,
} from '../../cita/application/citas.service';
import { OrigenCita } from '../../cita/domain/cita.entity';
import { CitaResponseDto } from '../../cita/presentation/dto/cita-response.dto';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../domain/solicitud-cita.entity';
import {
  FiltrosListadoSolicitudes,
  SolicitudCitaRepository,
} from '../domain/solicitud-cita.repository';
import { AceptarSolicitudDto } from '../presentation/dto/aceptar-solicitud.dto';
import { SolicitudAceptadaDto } from '../presentation/dto/solicitud-aceptada.dto';
import {
  CitaOrigenDto,
  SolicitudBandejaDto,
} from '../presentation/dto/solicitud-bandeja.dto';
import { DatosAceptacionIncompletosError } from './datos-aceptacion-incompletos.error';
import { SolicitudNoEncontradaError } from './solicitud-no-encontrada.error';

/** Tope fijo de la bandeja en la v1 (sin paginación; se añade de forma aditiva). */
export const LIMITE_BANDEJA = 100;

/** Filtros opcionales de `GET /solicitudes`, además del estado. */
export interface FiltrosBandeja {
  /** Solo las de reagendamiento de esa cita (voucher, Fase 3 R4). */
  citaOrigenId?: string;
}

/**
 * Bandeja de solicitudes del profesional (US-02, cierre de Fase 1 §c): listar,
 * aceptar, rechazar. Solo la usan rutas AUTENTICADAS.
 *
 * Servicio APARTE de `SolicitudesService` a propósito: el de la ruta anónima
 * no debe ganar acceso a citas ni a transacciones. Menos superficie donde un
 * error de cableado importa.
 *
 * La bandeja es de la ORGANIZACIÓN (ADR-09 §11.a): todo filtra por el
 * `tenantId` del token, no por profesional. Quien acepta queda como dueño
 * (`usuarioId`) de la solicitud y de la cita.
 *
 * **Orden de bloqueo (Fase 3):** la SOLICITUD primero (`FOR UPDATE`) y, si
 * hace falta, después la cita (`reagendarEnTx`, `FOR NO KEY UPDATE`). El
 * portal del paciente bloquea la cita y LEE la solicitud sin bloquearla, y el
 * suscriptor del outbox solo bloquea la solicitud: ninguno toma los dos en el
 * orden inverso, así que no hay interbloqueos.
 */
export class BandejaSolicitudesService {
  constructor(
    private readonly solicitudRepository: SolicitudCitaRepository,
    // Dependencia solicitud -> cita (nunca al revés): la bandeja PRODUCE citas
    // con el mismo flujo que `POST /citas` y MUEVE la cita de origen de una
    // petición de otra hora con el mismo flujo que `PATCH .../reagendar`.
    private readonly citasService: CitasService,
    private readonly tx: TransactionRunner,
    private readonly eventos: PublicadorEventos,
  ) {}

  /**
   * Solicitudes de la organización en `estado` (y, si se pide, de una cita de
   * origen), con tope `LIMITE_BANDEJA`. El orden (recibidas: la que más espera
   * primero; resueltas: la más reciente primero) lo garantiza el repositorio.
   * No aplica la ventana anti-spam: las solicitudes viejas no se ocultan
   * (ADR-09 §11.c).
   *
   * `citaOrigen` de las de reagendamiento se resuelve con UNA lectura por
   * lote de sus citas (sin N+1). Solo lectura: sin transacción ni hechos.
   */
  async listar(
    estado: EstadoSolicitud,
    usuario: AuthenticatedUser,
    filtros: FiltrosBandeja = {},
  ): Promise<SolicitudBandejaDto[]> {
    const filtrosRepositorio: FiltrosListadoSolicitudes =
      filtros.citaOrigenId === undefined
        ? {}
        : { citaOrigenId: filtros.citaOrigenId };

    const solicitudes = await this.solicitudRepository.listarPorEstado(
      usuario.tenantId,
      estado,
      LIMITE_BANDEJA,
      filtrosRepositorio,
    );

    const citasOrigen = await this.resumirCitasOrigen(
      solicitudes,
      usuario.tenantId,
    );

    return solicitudes.map((s) =>
      BandejaSolicitudesService.aBandeja(s, citasOrigen),
    );
  }

  /**
   * Acepta una solicitud en UNA transacción (ADR-06):
   *
   *  1. Carga la solicitud con bloqueo de fila (FOR UPDATE): dos aceptaciones
   *     concurrentes se serializan y la segunda ve el estado ya resuelto.
   *  2. Si ya no está `recibida` -> 409 ANTES de tocar nada.
   *  3. Según el tipo:
   *     - `nueva`: exige `duracionMin` y `tipoConsulta` (400 si faltan) y crea
   *       la cita con `CitasService.agendar` (mismo flujo que `POST /citas`:
   *       resolver-o-crear paciente por RUT —completando su correo si lo tenía
   *       vacío—, cita, bitácora, `CitaCreada`, avisos).
   *     - `reagendamiento` (Fase 3, R2): MUEVE la cita de origen con
   *       `CitasService.reagendarEnTx` (mismo id, vuelve a `pendiente`,
   *       bitácora con el profesional del token, `CitaReagendada`, avisos). No
   *       crea paciente ni cita; `duracionMin` y `tipoConsulta` se ignoran.
   *       Cita de origen terminal -> 409 (`TransicionEstadoInvalidaError`).
   *  4. Resuelve la solicitud (`citaId` = la cita creada o la de origen) y
   *     publica `SolicitudCitaAceptada`.
   *
   * Todos los hechos se publican con el `tx` de esta transacción (ADR-12 §2).
   */
  async aceptar(
    solicitudId: string,
    dto: AceptarSolicitudDto,
    usuario: AuthenticatedUser,
  ): Promise<SolicitudAceptadaDto> {
    return this.tx.run(async (tx) => {
      const solicitud = await this.cargarParaResolver(
        solicitudId,
        usuario.tenantId,
        tx,
      );
      solicitud.asegurarResolvible('aceptar');

      const cita = solicitud.esReagendamiento()
        ? await this.moverCitaOrigen(solicitud, dto, usuario, tx)
        : await this.crearCita(solicitud, dto, usuario, tx);

      solicitud.aceptar(usuario.userId, cita.id);
      await this.solicitudRepository.guardar(solicitud, tx);

      // En ESTE tx, como `CitaCreada` / `CitaReagendada`: los hechos se
      // confirman con la cita y la solicitud resuelta, o ninguno (ADR-12 §2).
      // Sin RUT ni nombre: el payload se guarda tal cual (ADR-09 §3 regla 5).
      await this.eventos.publicar(
        {
          nombre: 'SolicitudCitaAceptada',
          ocurridoEn: new Date(),
          tenantId: solicitud.tenantId,
          payload: {
            solicitudId: solicitud.id,
            citaId: cita.id,
            usuarioId: usuario.userId,
          },
        },
        tx,
      );

      // La cita de origen, ya movida, sale de la respuesta de `reagendarEnTx`
      // (sin otra lectura).
      const citasOrigen = new Map<string, CitaOrigenDto>();
      if (solicitud.esReagendamiento()) {
        citasOrigen.set(cita.id, BandejaSolicitudesService.aCitaOrigen(cita));
      }

      return new SolicitudAceptadaDto({
        solicitud: BandejaSolicitudesService.aBandeja(solicitud, citasOrigen),
        cita,
      });
    });
  }

  /**
   * Rechaza una solicitud. Misma transacción con bloqueo que aceptar: sin él,
   * un rechazo concurrente podría pisar una aceptación y dejar una cita
   * huérfana de su solicitud. No crea cita ni paciente ni toca el historial
   * del paciente (ADR-09 §1), y no guarda motivo (DT-26). Rechazar una de
   * reagendamiento NO toca la cita de origen (R3) ni avisa al paciente.
   */
  async rechazar(
    solicitudId: string,
    usuario: AuthenticatedUser,
  ): Promise<SolicitudBandejaDto> {
    return this.tx.run(async (tx) => {
      const solicitud = await this.cargarParaResolver(
        solicitudId,
        usuario.tenantId,
        tx,
      );

      solicitud.rechazar(usuario.userId);
      await this.solicitudRepository.guardar(solicitud, tx);

      // En el mismo tx que la solicitud rechazada (ADR-12 §2).
      await this.eventos.publicar(
        {
          nombre: 'SolicitudCitaRechazada',
          ocurridoEn: new Date(),
          tenantId: solicitud.tenantId,
          payload: {
            solicitudId: solicitud.id,
            usuarioId: usuario.userId,
          },
        },
        tx,
      );

      const citasOrigen = await this.resumirCitasOrigen(
        [solicitud],
        usuario.tenantId,
        tx,
      );
      return BandejaSolicitudesService.aBandeja(solicitud, citasOrigen);
    });
  }

  // Inexistente u otro tenant -> mismo 404 (no se distinguen).
  private async cargarParaResolver(
    solicitudId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita> {
    const solicitud = await this.solicitudRepository.buscarPorIdParaActualizar(
      solicitudId,
      tenantId,
      tx,
    );
    if (!solicitud) {
      throw new SolicitudNoEncontradaError(solicitudId);
    }
    return solicitud;
  }

  /** `nueva`: crea la cita con los datos que escribió el paciente. */
  private async crearCita(
    solicitud: SolicitudCita,
    dto: AceptarSolicitudDto,
    usuario: AuthenticatedUser,
    tx: TransactionContext,
  ): Promise<CitaResponseDto> {
    // Opcionales en el DTO desde la Fase 3 (los ignora un reagendamiento),
    // pero una cita nueva los necesita.
    if (dto.duracionMin === undefined || dto.tipoConsulta === undefined) {
      throw new DatosAceptacionIncompletosError();
    }

    return this.citasService.agendar(
      {
        inicio: dto.inicio,
        duracionMin: dto.duracionMin,
        tipoConsulta: dto.tipoConsulta,
        // Los datos del paciente son los que escribió el paciente, incluido
        // SU consentimiento. Si el RUT ya existe en la organización se
        // vincula al paciente existente sin tocar su ficha, salvo una cosa
        // (ADR-13 §14): si su correo está vacío, se completa con este, en
        // esta misma transacción. Un correo ya guardado nunca se reemplaza.
        // Una `nueva` siempre trae RUT y correo (CHECK
        // CHK_solicitudes_cita_nueva_datos); los `??` solo ajustan el tipo,
        // que desde la Fase 3 admite null (reagendamiento).
        paciente: {
          rut: solicitud.rut ?? undefined,
          nombre: solicitud.nombrePaciente,
          telefono: solicitud.telefono,
          correo: solicitud.correo ?? '',
          consentimiento: solicitud.consentimiento,
        },
      },
      usuario,
      tx,
      // US-07.01 (H4): la cita nace de la solicitud pública.
      OrigenCita.SOLICITUD_PUBLICA,
    );
  }

  /**
   * `reagendamiento`: mueve la cita de origen a `dto.inicio` en ESTE tx. La
   * cita se bloquea DESPUÉS de la solicitud (orden de bloqueo de la bandeja).
   */
  private async moverCitaOrigen(
    solicitud: SolicitudCita,
    dto: AceptarSolicitudDto,
    usuario: AuthenticatedUser,
    tx: TransactionContext,
  ): Promise<CitaResponseDto> {
    if (solicitud.citaOrigenId === null) {
      // Invariante rota (CHECK CHK_solicitudes_cita_reagendamiento_origen).
      throw new Error(
        `Integridad: la solicitud de reagendamiento "${solicitud.id}" no tiene cita de origen`,
      );
    }
    return this.citasService.reagendarEnTx(
      solicitud.citaOrigenId,
      dto.inicio,
      usuario,
      tx,
    );
  }

  /**
   * Resumen de las citas de origen de `solicitudes`, en UNA lectura (sin
   * N+1). Las `nueva` no aportan ids; sin ninguna de reagendamiento no se
   * consulta.
   */
  private async resumirCitasOrigen(
    solicitudes: readonly SolicitudCita[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Map<string, CitaOrigenDto>> {
    const ids = solicitudes
      .map((s) => s.citaOrigenId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return new Map();

    const resumenes = await this.citasService.resumenesPorIds(
      ids,
      tenantId,
      tx,
    );
    return new Map(
      [...resumenes].map(([id, resumen]) => [
        id,
        BandejaSolicitudesService.aCitaOrigen(resumen),
      ]),
    );
  }

  private static aCitaOrigen(
    cita: Pick<ResumenCita, 'inicio' | 'duracionMin' | 'estado'>,
  ): CitaOrigenDto {
    return new CitaOrigenDto({
      inicio: cita.inicio,
      duracionMin: cita.duracionMin,
      estado: cita.estado,
    });
  }

  /**
   * Se proyecta desde la entidad cargada (y mutada), no desde lo que devuelve
   * `guardar`: el `save` de TypeORM en un UPDATE no relee columnas que no se
   * escribieron, como `recibidaEn`.
   *
   * `citasOrigen`: las citas de origen ya resueltas, por id. Una de
   * reagendamiento cuya cita no aparezca queda con `citaOrigen: null`.
   */
  static aBandeja(
    solicitud: SolicitudCita,
    citasOrigen: ReadonlyMap<string, CitaOrigenDto> = new Map(),
  ): SolicitudBandejaDto {
    return new SolicitudBandejaDto({
      id: solicitud.id,
      estado: solicitud.estado,
      rut: solicitud.rut === null ? null : formatearRut(solicitud.rut),
      nombrePaciente: solicitud.nombrePaciente,
      telefono: solicitud.telefono,
      correo: solicitud.correo,
      motivo: solicitud.motivo,
      preferenciaHoraria: solicitud.preferenciaHoraria,
      consentimiento: solicitud.consentimiento,
      recibidaEn: solicitud.recibidaEn,
      resueltaEn: solicitud.resueltaEn,
      citaId: solicitud.citaId,
      tipo: solicitud.tipo,
      citaOrigenId: solicitud.citaOrigenId,
      citaOrigen:
        solicitud.citaOrigenId === null
          ? null
          : (citasOrigen.get(solicitud.citaOrigenId) ?? null),
    });
  }
}
