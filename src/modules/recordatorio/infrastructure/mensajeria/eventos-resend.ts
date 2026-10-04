// Traducción de los webhooks de Resend (ADR-13 §10) al evento de entrega del
// módulo. Pura: no verifica la firma (eso es `VerificadorWebhookResend`) ni
// toca la base.
//
// Forma verificada el 2026-10-03 en https://resend.com/docs/webhooks/event-types
// y en las páginas de cada evento:
//   { "type": "email.delivered", "created_at": "<ISO>",
//     "data": { "email_id": "<uuid>", "to": ["..."], "tags": { "k": "v" }, ... } }
// `data.tags` llega como OBJETO (no como la lista `[{ name, value }]` del
// envío); se aceptan ambas formas por si acaso.
import { EventoEntregaRecibido } from '../../application/procesar-webhook-entrega.service';
import { TipoEventoEntrega } from '../../domain/recordatorio.repository';
import { MotivoSupresion } from '../../domain/supresion-correo.repository';
import { PROVEEDOR_RESEND } from './resend-canal-mensajeria';

/** Etiqueta con la que se envía cada recordatorio (`MensajeSaliente.etiquetas`). */
export const ETIQUETA_RECORDATORIO_ID = 'recordatorio_id';

export type MotivoIgnorado =
  /** `email.delivery_delayed`: solo log. */
  | 'retraso'
  /** `email.bounced` con `bounce.type` distinto de `Permanent`. */
  | 'rebote_no_permanente'
  /** Aperturas, clics, `email.scheduled`, eventos de dominio o contactos… */
  | 'sin_efecto'
  /** Firma válida pero sin `type` o `data`. */
  | 'forma_invalida';

export type TraduccionEventoResend =
  | { tipo: 'procesar'; tipoResend: string; evento: EventoEntregaRecibido }
  | {
      tipo: 'ignorar';
      tipoResend: string;
      motivo: MotivoIgnorado;
      /** `bounce.type` de un rebote no permanente, si es un código seguro. */
      tipoRebote?: string;
    };

const CODIGO_SEGURO = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/**
 * | Evento de Resend          | Efecto                                                 |
 * |---------------------------|--------------------------------------------------------|
 * | `email.sent`              | `enviado`: completa el id del proveedor si faltaba     |
 * | `email.delivered`         | `entregado`                                            |
 * | `email.bounced` Permanent | `rebotado` (`fallido`, `rebote`) + supresión           |
 * | `email.bounced` otro tipo | ignorar (rebote transitorio o indeterminado: solo log) |
 * | `email.complained`        | `queja` (fija `queja_en`) + supresión                  |
 * | `email.failed`            | `rechazado` (`fallido`, `rechazado`)                   |
 * | `email.suppressed`        | `rebotado` + supresión: Resend no lo envió porque la dirección está en SU lista de supresión |
 * | `email.delivery_delayed`  | ignorar (solo log)                                     |
 * | resto                     | ignorar                                                |
 */
export function traducirEventoResend(
  payload: unknown,
  recibidoEn: Date,
): TraduccionEventoResend {
  if (!esObjeto(payload) || typeof payload.type !== 'string') {
    return {
      tipo: 'ignorar',
      tipoResend: 'desconocido',
      motivo: 'forma_invalida',
    };
  }
  const tipoResend = CODIGO_SEGURO.test(payload.type)
    ? payload.type
    : 'desconocido';
  const data = payload.data;
  if (!esObjeto(data)) {
    return { tipo: 'ignorar', tipoResend, motivo: 'forma_invalida' };
  }

  const procesar = (
    tipo: TipoEventoEntrega,
    motivoSupresion?: MotivoSupresion,
  ): TraduccionEventoResend => ({
    tipo: 'procesar',
    tipoResend,
    evento: {
      tipo,
      proveedor: PROVEEDOR_RESEND,
      recordatorioId: etiqueta(data.tags, ETIQUETA_RECORDATORIO_ID),
      proveedorMensajeId: texto(data.email_id),
      ocurridoEn: fecha(payload.created_at) ?? recibidoEn,
      destinatarios: direcciones(data.to),
      ...(motivoSupresion ? { motivoSupresion } : {}),
    },
  });

  switch (payload.type) {
    case 'email.sent':
      return procesar(TipoEventoEntrega.ENVIADO);
    case 'email.delivered':
      return procesar(TipoEventoEntrega.ENTREGADO);
    case 'email.bounced': {
      const rebote = esObjeto(data.bounce) ? data.bounce : {};
      const tipoRebote = texto(rebote.type);
      if (tipoRebote !== null && tipoRebote.toLowerCase() === 'permanent') {
        return procesar(TipoEventoEntrega.REBOTADO, MotivoSupresion.REBOTE);
      }
      return {
        tipo: 'ignorar',
        tipoResend,
        motivo: 'rebote_no_permanente',
        ...(tipoRebote !== null && CODIGO_SEGURO.test(tipoRebote)
          ? { tipoRebote }
          : {}),
      };
    }
    case 'email.complained':
      return procesar(TipoEventoEntrega.QUEJA, MotivoSupresion.QUEJA);
    case 'email.failed':
      return procesar(TipoEventoEntrega.RECHAZADO);
    case 'email.suppressed':
      return procesar(TipoEventoEntrega.REBOTADO, MotivoSupresion.REBOTE);
    case 'email.delivery_delayed':
      return { tipo: 'ignorar', tipoResend, motivo: 'retraso' };
    default:
      return { tipo: 'ignorar', tipoResend, motivo: 'sin_efecto' };
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

function fecha(valor: unknown): Date | null {
  if (typeof valor !== 'string') return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Valor de una etiqueta: objeto `{ k: v }` (webhook) o lista `[{ name, value }]`. */
function etiqueta(tags: unknown, nombre: string): string | null {
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (esObjeto(t) && t.name === nombre) return texto(t.value);
    }
    return null;
  }
  return esObjeto(tags) ? texto(tags[nombre]) : null;
}

/** `data.to` como lista de direcciones (sin nombre visible). */
function direcciones(to: unknown): string[] {
  const lista: unknown[] = Array.isArray(to) ? to : [to];
  const salida: string[] = [];
  for (const item of lista) {
    const valor = texto(item);
    if (valor === null) continue;
    // "Nombre <correo@x>" → "correo@x".
    const entreAngulos = /<([^<>]+)>\s*$/.exec(valor)?.[1];
    salida.push((entreAngulos ?? valor).trim());
  }
  return salida;
}
