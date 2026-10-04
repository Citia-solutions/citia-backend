import { Webhook } from 'svix';

/** Por qué se rechazó un webhook. Para el log; la respuesta es siempre 400. */
export type CausaRechazoWebhook =
  | 'sin_secreto'
  | 'sin_cuerpo'
  | 'sin_cabeceras'
  | 'firma';

export class FirmaWebhookInvalidaError extends Error {
  constructor(readonly causa: CausaRechazoWebhook) {
    super(`Webhook rechazado: ${causa}`);
    this.name = 'FirmaWebhookInvalidaError';
  }
}

export interface CabecerasSvix {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
}

/**
 * Verifica la firma Svix de los webhooks de Resend (ADR-13 §10) con la
 * librería oficial `svix` sobre el CUERPO CRUDO (`rawBody: true` en
 * `main.ts`): re-serializar el JSON rompería la firma.
 *
 * - Secreto `RESEND_WEBHOOK_SECRET` (`whsec_…`).
 * - Tolerancia de tiempo: la de la librería, ±5 minutos sobre
 *   `svix-timestamp` (`standardwebhooks`, `WEBHOOK_TOLERANCE_IN_SECONDS`).
 *   Un sello más viejo o del futuro se rechaza: cubre la repetición de un
 *   webhook interceptado.
 * - Sin secreto configurado (desarrollo con `registro`), rechaza todo.
 *
 * Devuelve el payload ya parseado. Nunca registra el cuerpo ni las cabeceras
 * (las `svix-*` además se redactan en pino).
 */
export class VerificadorWebhookResend {
  private readonly webhook: Webhook | null;

  constructor(secreto: string | undefined) {
    this.webhook = crearWebhook(secreto);
  }

  get configurado(): boolean {
    return this.webhook !== null;
  }

  verificar(
    cuerpo: Buffer | string | undefined,
    cabeceras: CabecerasSvix,
  ): unknown {
    if (this.webhook === null) {
      throw new FirmaWebhookInvalidaError('sin_secreto');
    }
    if (cuerpo === undefined || cuerpo.length === 0) {
      throw new FirmaWebhookInvalidaError('sin_cuerpo');
    }
    const id = cabeceras['svix-id'];
    const sello = cabeceras['svix-timestamp'];
    const firma = cabeceras['svix-signature'];
    if (!id || !sello || !firma) {
      throw new FirmaWebhookInvalidaError('sin_cabeceras');
    }
    try {
      return this.webhook.verify(cuerpo, {
        'svix-id': id,
        'svix-timestamp': sello,
        'svix-signature': firma,
      });
    } catch {
      // Firma distinta, sello fuera de tolerancia o cuerpo que no es JSON.
      throw new FirmaWebhookInvalidaError('firma');
    }
  }
}

function crearWebhook(secreto: string | undefined): Webhook | null {
  if (!secreto) return null;
  try {
    return new Webhook(secreto);
  } catch {
    // Secreto mal formado (no base64). La validación de entorno lo exige
    // con `resend`; con `registro` se trata como ausente.
    return null;
  }
}
