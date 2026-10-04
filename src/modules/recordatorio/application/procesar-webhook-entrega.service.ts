import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { calcularHashCorreo } from '../domain/hash-correo';
import { EstadoRecordatorio } from '../domain/recordatorio.entity';
import {
  RecordatorioRepository,
  TipoEventoEntrega,
} from '../domain/recordatorio.repository';
import {
  MotivoSupresion,
  SupresionCorreoRepository,
} from '../domain/supresion-correo.repository';
import { BitacoraRecordatorios } from './bitacora-recordatorios';

/**
 * Un evento de entrega ya VERIFICADO (firma) y TRADUCIDO desde el formato del
 * proveedor (`traducirEventoResend`). Los eventos que no cambian nada
 * (`delivery_delayed`, rebotes transitorios, aperturas, clics) no llegan aquí.
 */
export interface EventoEntregaRecibido {
  tipo: TipoEventoEntrega;
  /** p. ej. `'resend'`. */
  proveedor: string;
  /** Etiqueta `recordatorio_id` del correo; `null` si no vino. */
  recordatorioId: string | null;
  /** Id del mensaje en el proveedor (`data.email_id`). */
  proveedorMensajeId: string | null;
  /** Hora del evento según el proveedor (o la de recepción). */
  ocurridoEn: Date;
  /**
   * Direcciones afectadas (`data.to`). SOLO para el hash de la supresión:
   * nunca se registran ni se guardan en claro.
   */
  destinatarios: readonly string[];
  /** Para un rebote o una supresión del proveedor: por qué se suprime. */
  motivoSupresion?: MotivoSupresion;
}

export type ResultadoWebhookEntrega =
  /** Ningún recordatorio con ese id (p. ej. un correo de prueba): se ignora. */
  | { resultado: 'desconocido' }
  | {
      /** `aplicado`: cambió la fila; `sin_cambios`: repetido o fuera de orden. */
      resultado: 'aplicado' | 'sin_cambios';
      recordatorioId: string;
      tenantId: string;
      estado: EstadoRecordatorio;
      /** Direcciones NUEVAS en `supresiones_correo` (0 si ya estaban). */
      supresionesAgregadas: number;
    };

/** Eventos que suprimen la dirección (ADR-13 §10). */
const MOTIVO_SUPRESION_POR_EVENTO: Partial<
  Record<TipoEventoEntrega, MotivoSupresion>
> = {
  [TipoEventoEntrega.REBOTADO]: MotivoSupresion.REBOTE,
  [TipoEventoEntrega.QUEJA]: MotivoSupresion.QUEJA,
};

/**
 * Webhook de entrega (ADR-13 §9.4, §10). Efectos MONÓTONOS en una
 * transacción:
 *
 *  - `RecordatorioRepository.registrarEventoEntrega` bloquea la fila (espera
 *    a un envío en curso) y la avanza solo si el evento la hace avanzar. Un
 *    evento repetido o fuera de orden no cambia nada.
 *  - Rebote o queja → la dirección pasa a `supresiones_correo` (por hash;
 *    idempotente: la segunda vez no agrega nada). También si la fila ya no
 *    cambia de estado (una queja sobre un `entregado`, un rebote tardío): la
 *    dirección rebotó o se quejó igual.
 *  - Id desconocido → no se toca nada (ni supresión): el correo no es nuestro.
 *
 * ROMPE EL PATRÓN DE TENANT a propósito (ADR-12 §6): el proveedor no sabe de
 * qué organización es el correo; se deduce de la fila.
 */
export class ProcesarWebhookEntregaService {
  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly recordatorios: RecordatorioRepository,
    private readonly supresiones: SupresionCorreoRepository,
    private readonly bitacora: BitacoraRecordatorios,
  ) {}

  async procesar(
    evento: EventoEntregaRecibido,
  ): Promise<ResultadoWebhookEntrega> {
    const resultado = await this.transacciones.run(async (tx) => {
      const { recordatorio, aplicado } =
        await this.recordatorios.registrarEventoEntrega(
          {
            recordatorioId: evento.recordatorioId,
            proveedorMensajeId: evento.proveedorMensajeId,
          },
          {
            tipo: evento.tipo,
            proveedor: evento.proveedor,
            proveedorMensajeId: evento.proveedorMensajeId,
            ocurridoEn: evento.ocurridoEn,
          },
          tx,
        );
      if (!recordatorio) {
        return { resultado: 'desconocido' } as const;
      }

      let supresionesAgregadas = 0;
      const motivo =
        evento.motivoSupresion ?? MOTIVO_SUPRESION_POR_EVENTO[evento.tipo];
      if (motivo) {
        for (const correoHash of hashesDe(evento.destinatarios)) {
          const agregada = await this.supresiones.agregar(
            { correoHash, motivo, origenRecordatorioId: recordatorio.id },
            tx,
          );
          if (agregada) supresionesAgregadas++;
        }
      }

      return {
        resultado: aplicado ? 'aplicado' : 'sin_cambios',
        recordatorioId: recordatorio.id,
        tenantId: recordatorio.tenantId,
        estado: recordatorio.estado,
        supresionesAgregadas,
      } as const;
    });

    if (resultado.resultado === 'desconocido') {
      this.bitacora.registrar({
        nivel: 'info',
        evento: 'recordatorios.webhook_desconocido',
        campos: {
          tipo: evento.tipo,
          proveedor: evento.proveedor,
          conEtiqueta: evento.recordatorioId !== null,
        },
        msg: 'Evento de entrega de un correo que no es un recordatorio conocido: se ignora',
      });
    } else {
      this.bitacora.registrar({
        nivel: evento.tipo === TipoEventoEntrega.ENTREGADO ? 'info' : 'warn',
        evento: 'recordatorio.entrega',
        campos: {
          recordatorioId: resultado.recordatorioId,
          tenantId: resultado.tenantId,
          tipo: evento.tipo,
          aplicado: resultado.resultado === 'aplicado',
          estado: resultado.estado,
          supresionesAgregadas: resultado.supresionesAgregadas,
        },
        msg: 'Evento de entrega registrado',
      });
    }
    return resultado;
  }
}

/** Hashes únicos de las direcciones no vacías (nunca las direcciones). */
function hashesDe(destinatarios: readonly string[]): string[] {
  const hashes = new Set<string>();
  for (const destinatario of destinatarios) {
    if (typeof destinatario === 'string' && destinatario.trim() !== '') {
      hashes.add(calcularHashCorreo(destinatario));
    }
  }
  return [...hashes];
}
