import {
  EventoEntregado,
  SuscriptorEventos,
} from '../../../shared/application/suscriptor-eventos';
import { TransactionContext } from '../../../shared/application/transaction-runner';
import { EventoRecordatorioInvalidoError } from './evento-recordatorio-invalido.error';
import { ReconciliarRecordatoriosService } from './reconciliar-recordatorios.service';

/**
 * Hechos de cita que disparan la reconciliación de SU cita (ADR-13 §6):
 *
 * | Hecho                                          | Efecto habitual            |
 * |------------------------------------------------|----------------------------|
 * | `CitaCreada` (también al aceptar una solicitud) | programa                  |
 * | `CitaReagendada`                               | anula los del inicio anterior y programa los del nuevo |
 * | `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida` | anula los `programado` (`cita_terminal`) |
 * | `CitaConfirmada`, `CitaEditada`                | nada (ADR-09 §4: no mueven la hora) |
 *
 * Todos hacen LO MISMO (reconciliar); el efecto sale del estado actual de la
 * cita, no del nombre del hecho. Confirmar y editar se escuchan igual, como
 * pide ADR-13 §6: si algo quedó desalineado, se corrige.
 *
 * `SolicitudCitaAceptada` / `SolicitudCitaRechazada` no se escuchan: la cita
 * llega por su propio `CitaCreada`.
 */
export const HECHOS_DE_CITA: readonly string[] = [
  'CitaCreada',
  'CitaReagendada',
  'CitaCancelada',
  'CitaAsistida',
  'CitaNoAsistida',
  'CitaConfirmada',
  'CitaEditada',
];

/**
 * Lo publica `PUT /recordatorios/configuracion` (paso 12) en la misma
 * transacción que guarda. Payload: `{ usuarioId }` = el profesional dueño de
 * la configuración. Reconcilia sus citas futuras vigentes.
 */
export const CONFIGURACION_RECORDATORIO_ACTUALIZADA =
  'ConfiguracionRecordatorioActualizada';

/**
 * Primer suscriptor del outbox (ADR-12 §4, ADR-13 §6). Cumple las cuatro
 * reglas: es idempotente (reconcilia), no depende del orden (relee el estado
 * actual), solo escribe en la base con el `tx` que recibe y no tiene efectos
 * externos (el correo lo manda otro job, desde la tabla `recordatorios`).
 *
 * Del payload solo usa ids: `citaId` en los hechos de cita y `usuarioId` en el
 * de configuración. En los de cita NO usa `usuarioId`: es quien hizo la
 * petición, no el dueño de la cita (ADR-13, "Lo que hay hoy").
 *
 * Si lanza, el despachador revierte todo y reintenta con espera; el código
 * que queda en `eventos_salida.ultimo_error` es `SuscriptorRecordatorios:<name>`
 * (p. ej. `EventoRecordatorioInvalidoError`).
 */
export class SuscriptorRecordatorios extends SuscriptorEventos {
  readonly eventos: readonly string[] = [
    ...HECHOS_DE_CITA,
    CONFIGURACION_RECORDATORIO_ACTUALIZADA,
  ];

  constructor(
    private readonly reconciliacion: ReconciliarRecordatoriosService,
  ) {
    super();
  }

  async manejar(
    evento: EventoEntregado,
    tx: TransactionContext,
  ): Promise<void> {
    const tenantId = texto(evento.tenantId);
    if (tenantId === null) {
      throw new EventoRecordatorioInvalidoError(evento.nombre, 'tenantId');
    }

    if (evento.nombre === CONFIGURACION_RECORDATORIO_ACTUALIZADA) {
      await this.reconciliacion.reconciliarFuturasDeProfesional(
        tenantId,
        campo(evento, 'usuarioId'),
        tx,
      );
      return;
    }

    if (HECHOS_DE_CITA.includes(evento.nombre)) {
      await this.reconciliacion.reconciliarCita(
        campo(evento, 'citaId'),
        tenantId,
        tx,
      );
    }
    // Cualquier otro nombre no es de este suscriptor: el registro no se lo
    // entrega, y si llegara no hay nada que hacer.
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

function campo(evento: EventoEntregado, nombre: string): string {
  const valor = texto(evento.payload?.[nombre]);
  if (valor === null) {
    throw new EventoRecordatorioInvalidoError(evento.nombre, nombre);
  }
  return valor;
}
