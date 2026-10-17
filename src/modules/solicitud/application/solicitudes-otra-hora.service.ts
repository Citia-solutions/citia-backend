import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import { TransactionContext } from '../../../shared/application/transaction-runner';
import { actorDelHecho, actorPaciente } from '../../cita/domain/actor';
import { Paciente } from '../../paciente/domain/paciente.entity';
import { PacienteRepository } from '../../paciente/domain/paciente.repository';
import { SolicitudCita } from '../domain/solicitud-cita.entity';
import { SolicitudCitaRepository } from '../domain/solicitud-cita.repository';

/** Nombre del hecho que publica `pedir` (ADR-10 §7; RF-05 lo lista). */
export const REAGENDAMIENTO_SOLICITADO = 'ReagendamientoSolicitado';

/**
 * Lo que este servicio necesita de la cita de origen. La entidad `Cita` del
 * módulo `cita` cumple esta forma; se pide solo esto para no acoplarse a más.
 */
export interface CitaOrigen {
  id: string;
  tenantId: string;
  /** Dueño de la cita: la solicitud nace asignada a él. */
  usuarioId: string;
  pacienteId: string;
}

/** Lo que este servicio necesita del enlace con el que se pidió. */
export interface EnlaceOrigen {
  id: string;
}

/** Lo que escribió el paciente en el portal (ya validado por el DTO). */
export interface PeticionOtraHora {
  /** 1..300 caracteres, sin espacios alrededor. */
  preferencia: string;
  /** Opcional, ≤ 300. Ausente o en blanco se guarda como `''`. */
  motivo?: string;
}

/**
 * "Pedir otra hora" desde el enlace del paciente (Fase 3, US-02.07; R1, R2,
 * R5, R6). Caso de uso del módulo `solicitud`, EXPORTADO para que el portal
 * del paciente lo llame DENTRO de su transacción, con la cita ya bloqueada
 * por `EnlacesCitaService.resolver` (orden de bloqueo: la cita primero).
 *
 * No valida el enlace ni las acciones permitidas: eso lo hace el portal en
 * el mismo tx (es quien compone `cita` y `solicitud`). Este servicio no toca
 * la cita (R1).
 */
export class SolicitudesOtraHoraService {
  constructor(
    private readonly solicitudes: SolicitudCitaRepository,
    // Solo lectura de la ficha: los datos del paciente se COPIAN a la
    // solicitud para que la bandeja la muestre como a las demás.
    private readonly pacientes: PacienteRepository,
    private readonly eventos: PublicadorEventos,
  ) {}

  /**
   * La solicitud de otra hora `recibida` de esa cita, o `null`. SIN bloqueo:
   * el portal ya tiene la cita bloqueada y solo necesita LEERLA (R6: con una
   * abierta, solo se puede cancelar).
   */
  abierta(
    cita: Pick<CitaOrigen, 'id' | 'tenantId'>,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null> {
    return this.solicitudes.buscarReagendamientoAbierto(
      cita.id,
      cita.tenantId,
      tx,
    );
  }

  /**
   * Crea la solicitud de `reagendamiento` (`recibida`, `usuarioId` = dueño de
   * la cita, datos del paciente copiados de su ficha) y publica
   * `ReagendamientoSolicitado`, todo en `tx`.
   *
   * @throws ReagendamientoYaSolicitadoError si ya hay una abierta para la
   *   cita (23505 del índice parcial, R5). La transacción queda abortada:
   *   quien llama debe dejar que el error la revierta (el portal → 409).
   */
  async pedir(
    cita: CitaOrigen,
    enlace: EnlaceOrigen,
    peticion: PeticionOtraHora,
    tx: TransactionContext,
  ): Promise<SolicitudCita> {
    const paciente = await this.pacientes.buscarPorId(
      cita.pacienteId,
      cita.tenantId,
      tx,
    );
    if (!paciente) {
      // Invariante rota: toda cita apunta a un paciente de su tenant (FK).
      // Solo ids en el mensaje.
      throw new Error(
        `Integridad: el paciente "${cita.pacienteId}" de la cita "${cita.id}" no existe en su tenant`,
      );
    }

    const motivo = peticion.motivo?.trim();
    const solicitud = SolicitudCita.pedirOtraHora({
      tenantId: cita.tenantId,
      citaOrigenId: cita.id,
      enlaceId: enlace.id,
      usuarioId: cita.usuarioId,
      rut: paciente.rut ?? null,
      nombrePaciente: paciente.nombre,
      telefono: paciente.telefono,
      // Una ficha vieja puede tener el correo vacío: se guarda como ausente.
      correo: Paciente.tieneCorreo(paciente) ? (paciente.correo ?? null) : null,
      consentimiento: paciente.consentimiento,
      preferenciaHoraria: peticion.preferencia.trim(),
      motivo: motivo === '' ? undefined : motivo,
    });

    const guardada = await this.solicitudes.guardar(solicitud, tx);

    // Mismo tx que la solicitud (ADR-12 §2). Solo ids: ni datos del
    // paciente, ni preferencia, ni motivo, ni token (ADR-09 §3 regla 5).
    await this.eventos.publicar(
      {
        nombre: REAGENDAMIENTO_SOLICITADO,
        ocurridoEn: new Date(),
        tenantId: cita.tenantId,
        payload: {
          citaId: cita.id,
          usuarioId: cita.usuarioId,
          solicitudId: guardada.id,
          actor: actorDelHecho(actorPaciente(enlace.id)),
        },
      },
      tx,
    );

    return guardada;
  }
}
