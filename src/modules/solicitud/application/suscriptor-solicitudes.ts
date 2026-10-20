import {
  EventoEntregado,
  SuscriptorEventos,
} from '../../../shared/application/suscriptor-eventos';
import { TransactionContext } from '../../../shared/application/transaction-runner';
import { SolicitudCitaRepository } from '../domain/solicitud-cita.repository';
import { EventoSolicitudInvalidoError } from './evento-solicitud-invalido.error';

/**
 * Hechos de cita que dejan sin objeto una petición de otra hora: la cita de
 * origen llegó a un estado terminal y ya no hay nada que mover.
 *
 * `CitaNoAsistida` llega también con `estado = ghosting` (US-07.01, H8): la
 * inasistencia que el profesional marca sobre una `pendiente` y el cierre del
 * job G1 (actor `sistema`). El efecto es el mismo: se descarta.
 */
export const HECHOS_CITA_TERMINADA: readonly string[] = [
  'CitaCancelada',
  'CitaAsistida',
  'CitaNoAsistida',
];

/** La cita se movió: si fue el profesional, la petición queda atendida. */
export const CITA_REAGENDADA = 'CitaReagendada';

/**
 * Suscriptor del outbox del módulo `solicitud` (ADR-10 decisión 4, ADR-12 §4).
 * `solicitud` se entera así de lo que le pasa a la cita de origen, sin que
 * `cita` dependa de `solicitud` (sería un ciclo).
 *
 * | Hecho | Efecto sobre la de reagendamiento `recibida` de esa cita |
 * |---|---|
 * | `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida` (también con `estado = ghosting`, del profesional o del job G1) | `descartada` (la pone el sistema) |
 * | `CitaReagendada` con `actor.tipo = 'profesional'` | `aceptada` = **atendida** (`usuarioId` = quien reagendó, `citaId` = la cita) |
 * | `CitaReagendada` de otro actor o sin actor | nada |
 *
 * "Atendida al reagendar" (decisión del orquestador, 2026-10-15, restaura
 * ADR-10 §4): si el profesional mueve la cita desde el voucher, la petición
 * de otra hora queda respondida, igual que si la hubiera aceptado en la
 * bandeja. Si la aceptó en la bandeja, la solicitud ya está `aceptada` en el
 * mismo tx que publicó `CitaReagendada`: no hay ninguna abierta y no hace
 * nada.
 *
 * Solo atiende una petición recibida ANTES de que se reagendara
 * (`recibidaEn ≤ ocurridoEn`): el hecho llega segundos después (DT-33) y una
 * petición hecha ya con la hora nueva no debe cerrarse sola sin que nadie la
 * vea. `recibidaEn` es el inicio de la transacción del paciente, así que una
 * petición que esperó el bloqueo de la cita mientras se reagendaba (el
 * paciente pedía otra hora para la hora VIEJA) sí cuenta como atendida.
 *
 * Cumple las cuatro reglas de ADR-12 §4: idempotente (busca solo las
 * `recibida`; repetir el hecho no encuentra ninguna), no aplica deltas (relee
 * la solicitud con `FOR UPDATE`), solo escribe en la base con el `tx`
 * recibido y no tiene efectos externos. No registra nada en logs (nada de
 * datos del paciente). Bloquea SOLO la solicitud, nunca la cita: no puede
 * interbloquearse con la bandeja (solicitud → cita) ni con el portal (cita →
 * lectura sin bloqueo).
 */
export class SuscriptorSolicitudes extends SuscriptorEventos {
  readonly eventos: readonly string[] = [
    ...HECHOS_CITA_TERMINADA,
    CITA_REAGENDADA,
  ];

  constructor(
    private readonly solicitudes: SolicitudCitaRepository,
    private readonly reloj: () => Date = () => new Date(),
  ) {
    super();
  }

  async manejar(
    evento: EventoEntregado,
    tx: TransactionContext,
  ): Promise<void> {
    const tenantId = texto(evento.tenantId);
    if (tenantId === null) {
      throw new EventoSolicitudInvalidoError(evento.nombre, 'tenantId');
    }

    if (HECHOS_CITA_TERMINADA.includes(evento.nombre)) {
      await this.descartar(campo(evento, 'citaId'), tenantId, tx);
      return;
    }

    if (evento.nombre === CITA_REAGENDADA) {
      await this.atenderSiReagendoElProfesional(evento, tenantId, tx);
    }
    // Cualquier otro nombre no es de este suscriptor: el registro no se lo
    // entrega, y si llegara no hay nada que hacer.
  }

  private async descartar(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<void> {
    const abierta =
      await this.solicitudes.buscarReagendamientoAbiertoParaActualizar(
        citaId,
        tenantId,
        tx,
      );
    if (!abierta) return;

    abierta.descartar(this.reloj());
    await this.solicitudes.guardar(abierta, tx);
  }

  private async atenderSiReagendoElProfesional(
    evento: EventoEntregado,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<void> {
    const actor = actorDe(evento);
    // Sin actor (hechos anteriores a la Fase 3, cuando no podía haber
    // peticiones de otra hora) o de otro actor: nada que atender.
    if (actor?.tipo !== 'profesional') return;

    const usuarioId = texto(actor.id);
    if (usuarioId === null) {
      throw new EventoSolicitudInvalidoError(evento.nombre, 'actor.id');
    }
    const citaId = campo(evento, 'citaId');
    const reagendadaEn = instante(evento.ocurridoEn);
    if (reagendadaEn === null) {
      throw new EventoSolicitudInvalidoError(evento.nombre, 'ocurridoEn');
    }

    const abierta =
      await this.solicitudes.buscarReagendamientoAbiertoParaActualizar(
        citaId,
        tenantId,
        tx,
      );
    if (!abierta) return;
    // Pedida después de reagendar: la decide el profesional en la bandeja.
    if (abierta.recibidaEn.getTime() > reagendadaEn.getTime()) return;

    abierta.aceptar(usuarioId, citaId, this.reloj());
    await this.solicitudes.guardar(abierta, tx);
  }
}

interface ActorDelHecho {
  tipo: unknown;
  id: unknown;
}

function actorDe(evento: EventoEntregado): ActorDelHecho | null {
  const actor = evento.payload?.actor;
  if (typeof actor !== 'object' || actor === null) return null;
  const { tipo, id } = actor as Record<string, unknown>;
  return { tipo, id };
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

function instante(valor: unknown): Date | null {
  if (!(valor instanceof Date) && typeof valor !== 'string') return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function campo(evento: EventoEntregado, nombre: string): string {
  const valor = texto(evento.payload?.[nombre]);
  if (valor === null) {
    throw new EventoSolicitudInvalidoError(evento.nombre, nombre);
  }
  return valor;
}
