import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import { formatearRut } from '../../../shared/domain/rut';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CitasService } from '../../cita/application/citas.service';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../domain/solicitud-cita.entity';
import { SolicitudCitaRepository } from '../domain/solicitud-cita.repository';
import { AceptarSolicitudDto } from '../presentation/dto/aceptar-solicitud.dto';
import { SolicitudAceptadaDto } from '../presentation/dto/solicitud-aceptada.dto';
import { SolicitudBandejaDto } from '../presentation/dto/solicitud-bandeja.dto';
import { SolicitudNoEncontradaError } from './solicitud-no-encontrada.error';

/** Tope fijo de la bandeja en la v1 (sin paginación; se añade de forma aditiva). */
export const LIMITE_BANDEJA = 100;

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
 */
export class BandejaSolicitudesService {
  constructor(
    private readonly solicitudRepository: SolicitudCitaRepository,
    // Dependencia solicitud -> cita (nunca al revés): la bandeja PRODUCE citas
    // con el mismo flujo que `POST /citas`.
    private readonly citasService: CitasService,
    private readonly tx: TransactionRunner,
    private readonly eventos: PublicadorEventos,
  ) {}

  /**
   * Solicitudes de la organización en `estado`, con tope `LIMITE_BANDEJA`.
   * El orden (recibidas: la que más espera primero; resueltas: la más reciente
   * primero) lo garantiza el repositorio. No aplica la ventana anti-spam: las
   * solicitudes viejas no se ocultan (ADR-09 §11.c).
   */
  async listar(
    estado: EstadoSolicitud,
    usuario: AuthenticatedUser,
  ): Promise<SolicitudBandejaDto[]> {
    const solicitudes = await this.solicitudRepository.listarPorEstado(
      usuario.tenantId,
      estado,
      LIMITE_BANDEJA,
    );
    return solicitudes.map((s) => BandejaSolicitudesService.aBandeja(s));
  }

  /**
   * Acepta una solicitud y crea su cita, en UNA transacción (ADR-06):
   *
   *  1. Carga la solicitud con bloqueo de fila (FOR UPDATE): dos aceptaciones
   *     concurrentes se serializan y la segunda ve el estado ya resuelto.
   *  2. Si ya no está `recibida` -> 409 ANTES de crear nada.
   *  3. Crea la cita con `CitasService.agendar` (mismo flujo que `POST /citas`:
   *     resolver-o-crear paciente por RUT —completando su correo si lo tenía
   *     vacío—, cita, bitácora, `CitaCreada`, avisos) dentro de ESTA
   *     transacción.
   *  4. Resuelve la solicitud y publica `SolicitudCitaAceptada`.
   *
   * Los dos hechos (`CitaCreada` y `SolicitudCitaAceptada`) se publican con el
   * `tx` de esta transaccion (ADR-12 §2).
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

      const cita = await this.citasService.agendar(
        {
          inicio: dto.inicio,
          duracionMin: dto.duracionMin,
          tipoConsulta: dto.tipoConsulta,
          // Los datos del paciente son los que escribió el paciente, incluido
          // SU consentimiento. Si el RUT ya existe en la organización se
          // vincula al paciente existente sin tocar su ficha, salvo una cosa
          // (ADR-13 §14): si su correo está vacío, se completa con este, en
          // esta misma transacción. Un correo ya guardado nunca se reemplaza.
          paciente: {
            rut: solicitud.rut,
            nombre: solicitud.nombrePaciente,
            telefono: solicitud.telefono,
            correo: solicitud.correo,
            consentimiento: solicitud.consentimiento,
          },
        },
        usuario,
        tx,
      );

      solicitud.aceptar(usuario.userId, cita.id);
      await this.solicitudRepository.guardar(solicitud, tx);

      // En ESTE tx, como `CitaCreada` dentro de `agendar`: los dos hechos se
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

      return new SolicitudAceptadaDto({
        solicitud: BandejaSolicitudesService.aBandeja(solicitud),
        cita,
      });
    });
  }

  /**
   * Rechaza una solicitud. Misma transacción con bloqueo que aceptar: sin él,
   * un rechazo concurrente podría pisar una aceptación y dejar una cita
   * huérfana de su solicitud. No crea cita ni paciente ni toca el historial
   * del paciente (ADR-09 §1), y no guarda motivo (DT-26).
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

      return BandejaSolicitudesService.aBandeja(solicitud);
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

  /**
   * Se proyecta desde la entidad cargada (y mutada), no desde lo que devuelve
   * `guardar`: el `save` de TypeORM en un UPDATE no relee columnas que no se
   * escribieron, como `recibidaEn`.
   */
  static aBandeja(solicitud: SolicitudCita): SolicitudBandejaDto {
    return new SolicitudBandejaDto({
      id: solicitud.id,
      estado: solicitud.estado,
      rut: formatearRut(solicitud.rut),
      nombrePaciente: solicitud.nombrePaciente,
      telefono: solicitud.telefono,
      correo: solicitud.correo,
      motivo: solicitud.motivo,
      preferenciaHoraria: solicitud.preferenciaHoraria,
      consentimiento: solicitud.consentimiento,
      recibidaEn: solicitud.recibidaEn,
      resueltaEn: solicitud.resueltaEn,
      citaId: solicitud.citaId,
    });
  }
}
