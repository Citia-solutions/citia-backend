import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { ProcesarWebhookEntregaService } from '../application/procesar-webhook-entrega.service';
import { traducirEventoResend } from '../infrastructure/mensajeria/eventos-resend';
import {
  CabecerasSvix,
  FirmaWebhookInvalidaError,
  VerificadorWebhookResend,
} from '../infrastructure/mensajeria/verificador-webhook-resend';

/** Respuesta a Resend: cualquier 2xx confirma la entrega del webhook. */
export interface RespuestaWebhook {
  recibido: true;
}

/** Mensaje uniforme de rechazo: no dice qué falló. */
export const MENSAJE_FIRMA_INVALIDA = 'Firma de webhook inválida';

/**
 * `POST /api/webhooks/resend` (ADR-13 §10, §17). PÚBLICO (sin JWT):
 * autenticado por la firma Svix sobre el cuerpo crudo.
 *
 * - Firma inválida, vieja (> 5 min) o ausente → 400 uniforme, sin tocar nada.
 * - Evento que no cambia nada (retraso, rebote transitorio, aperturas…) → 200.
 * - Id desconocido → 200 (lo ignora el servicio).
 * - Evento repetido → 200 sin cambios (efectos monótonos).
 * - Si la base falla → 500 y Resend reintenta.
 *
 * Nunca registra el cuerpo ni las cabeceras: solo tipo, causa e ids.
 */
@Controller('webhooks/resend')
export class WebhooksResendController {
  private readonly logger = new Logger(WebhooksResendController.name);

  constructor(
    private readonly verificador: VerificadorWebhookResend,
    private readonly entregas: ProcesarWebhookEntregaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async recibir(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<RespuestaWebhook> {
    let payload: unknown;
    try {
      payload = this.verificador.verificar(req.rawBody, cabecerasSvix(req));
    } catch (error: unknown) {
      this.logger.warn({
        evento: 'recordatorios.webhook_rechazado',
        causa:
          error instanceof FirmaWebhookInvalidaError ? error.causa : 'otra',
        msg: 'Webhook de Resend rechazado (firma)',
      });
      throw new BadRequestException(MENSAJE_FIRMA_INVALIDA);
    }

    const traduccion = traducirEventoResend(payload, new Date());
    if (traduccion.tipo === 'ignorar') {
      this.logger.log({
        evento: 'recordatorios.webhook_ignorado',
        tipo: traduccion.tipoResend,
        motivo: traduccion.motivo,
        ...(traduccion.tipoRebote ? { tipoRebote: traduccion.tipoRebote } : {}),
      });
      return { recibido: true };
    }

    await this.entregas.procesar(traduccion.evento);
    return { recibido: true };
  }
}

function cabecerasSvix(req: Request): CabecerasSvix {
  const una = (nombre: string): string | undefined => {
    const valor = req.headers[nombre];
    return Array.isArray(valor) ? valor[0] : valor;
  };
  return {
    'svix-id': una('svix-id'),
    'svix-timestamp': una('svix-timestamp'),
    'svix-signature': una('svix-signature'),
  };
}
