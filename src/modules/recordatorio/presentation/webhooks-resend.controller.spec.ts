import { randomBytes, randomUUID } from 'node:crypto';

import { BadRequestException, Logger, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';

import { ContadorTransacciones } from '../../../../test/support/in-memory-repositories';
import { BitacoraEnMemoria } from '../../../../test/support/mensajeria-falsa';
import {
  RecordatorioRepositoryEnMemoria,
  SupresionCorreoRepositoryEnMemoria,
} from '../../../../test/support/recordatorios-en-memoria';
import { ProcesarWebhookEntregaService } from '../application/procesar-webhook-entrega.service';
import { calcularHashCorreo } from '../domain/hash-correo';
import {
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import { DatosRecordatorio } from '../domain/recordatorio.repository';
import { MotivoSupresion } from '../domain/supresion-correo.repository';
import { VerificadorWebhookResend } from '../infrastructure/mensajeria/verificador-webhook-resend';
import {
  MENSAJE_FIRMA_INVALIDA,
  WebhooksResendController,
} from './webhooks-resend.controller';

/**
 * Webhook de Resend (DoD de US-03): verificador Svix y servicio REALES, sobre
 * los dobles en memoria de los repositorios. Las peticiones se firman como las
 * firma Resend.
 */

const SECRETO = `whsec_${randomBytes(24).toString('base64')}`;
const CORREO = 'paciente@correo.cl';

describe('WebhooksResendController (POST /api/webhooks/resend)', () => {
  let recordatorios: RecordatorioRepositoryEnMemoria;
  let supresiones: SupresionCorreoRepositoryEnMemoria;
  let controller: WebhooksResendController;
  let enviado: DatosRecordatorio;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  function peticion(
    cuerpo: string,
    opciones: { cuando?: Date; secreto?: string; cabeceras?: boolean } = {},
  ): RawBodyRequest<Request> {
    const id = `msg_${randomBytes(8).toString('hex')}`;
    const cuando = opciones.cuando ?? new Date();
    const headers =
      opciones.cabeceras === false
        ? {}
        : {
            'svix-id': id,
            'svix-timestamp': String(Math.floor(cuando.getTime() / 1000)),
            'svix-signature': new Webhook(opciones.secreto ?? SECRETO).sign(
              id,
              cuando,
              cuerpo,
            ),
          };
    return {
      headers,
      rawBody: Buffer.from(cuerpo),
    } as unknown as RawBodyRequest<Request>;
  }

  const evento = (type: string, data: Record<string, unknown> = {}): string =>
    JSON.stringify({
      type,
      created_at: '2026-10-10T15:00:05.000Z',
      data: {
        email_id: 're_1',
        to: [CORREO],
        tags: { recordatorio_id: enviado.id },
        ...data,
      },
    });

  const fila = (): DatosRecordatorio =>
    recordatorios.buscar(enviado.id) as DatosRecordatorio;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    recordatorios = new RecordatorioRepositoryEnMemoria();
    supresiones = new SupresionCorreoRepositoryEnMemoria();
    controller = new WebhooksResendController(
      new VerificadorWebhookResend(SECRETO),
      new ProcesarWebhookEntregaService(
        new ContadorTransacciones(),
        recordatorios,
        supresiones,
        new BitacoraEnMemoria(),
      ),
    );
    enviado = recordatorios.sembrar({
      tenantId: randomUUID(),
      citaId: randomUUID(),
      antelacionMin: 120,
      inicioCita: new Date('2026-10-10T17:00:00Z'),
      programadoPara: new Date('2026-10-10T15:00:00Z'),
      estado: EstadoRecordatorio.ENVIADO,
      enviadoEn: new Date('2026-10-10T15:00:00Z'),
      proveedor: 'resend',
      proveedorMensajeId: 're_1',
      intentos: 1,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('firma válida → 200 y estado actualizado (entregado)', async () => {
    // Act
    const respuesta = await controller.recibir(
      peticion(evento('email.delivered')),
    );

    // Assert
    expect(respuesta).toEqual({ recibido: true });
    expect(fila()).toMatchObject({
      estado: EstadoRecordatorio.ENTREGADO,
      entregadoEn: new Date('2026-10-10T15:00:05.000Z'),
    });
  });

  it('firma inválida → 400 uniforme y sin cambios', async () => {
    // Arrange
    const antes = fila();
    const otroSecreto = `whsec_${randomBytes(24).toString('base64')}`;

    // Act & Assert
    await expect(
      controller.recibir(
        peticion(evento('email.delivered'), { secreto: otroSecreto }),
      ),
    ).rejects.toThrow(new BadRequestException(MENSAJE_FIRMA_INVALIDA));
    expect(fila()).toEqual(antes);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'recordatorios.webhook_rechazado',
        causa: 'firma',
      }),
    );
  });

  it('firma vieja (sello de hace 6 min) → 400 y sin cambios', async () => {
    // Arrange
    const antes = fila();

    // Act & Assert
    await expect(
      controller.recibir(
        peticion(evento('email.delivered'), {
          cuando: new Date(Date.now() - 6 * 60_000),
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(fila()).toEqual(antes);
  });

  it('sin cabeceras svix → 400', async () => {
    await expect(
      controller.recibir(
        peticion(evento('email.delivered'), { cabeceras: false }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('evento repetido → 200 sin cambios', async () => {
    // Arrange
    await controller.recibir(peticion(evento('email.delivered')));
    const antes = fila();

    // Act
    const respuesta = await controller.recibir(
      peticion(
        evento('email.delivered').replace(
          '2026-10-10T15:00:05.000Z',
          '2026-10-10T16:00:00.000Z',
        ),
      ),
    );

    // Assert
    expect(respuesta).toEqual({ recibido: true });
    expect(fila()).toEqual(antes);
  });

  it('id desconocido → 200 y nada cambia', async () => {
    // Arrange
    const antes = recordatorios.todos();

    // Act
    const respuesta = await controller.recibir(
      peticion(
        evento('email.bounced', {
          email_id: 're_desconocido',
          tags: { recordatorio_id: randomUUID() },
          bounce: { type: 'Permanent' },
        }),
      ),
    );

    // Assert
    expect(respuesta).toEqual({ recibido: true });
    expect(recordatorios.todos()).toEqual(antes);
    expect(supresiones.supresiones.size).toBe(0);
  });

  it('rebote permanente → fallido (rebote) y supresión', async () => {
    // Act
    await controller.recibir(
      peticion(
        evento('email.bounced', {
          bounce: { type: 'Permanent', subType: 'General' },
        }),
      ),
    );

    // Assert
    expect(fila()).toMatchObject({
      estado: EstadoRecordatorio.FALLIDO,
      motivo: MotivoRecordatorio.REBOTE,
    });
    expect(
      supresiones.supresiones.get(calcularHashCorreo(CORREO))?.motivo,
    ).toBe(MotivoSupresion.REBOTE);
  });

  it('rebote transitorio → 200, solo log: no toca el repositorio', async () => {
    // Arrange
    const antes = fila();

    // Act
    await controller.recibir(
      peticion(
        evento('email.bounced', {
          bounce: { type: 'Transient', subType: 'MailboxFull' },
        }),
      ),
    );

    // Assert
    expect(fila()).toEqual(antes);
    expect(supresiones.supresiones.size).toBe(0);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'recordatorios.webhook_ignorado',
        motivo: 'rebote_no_permanente',
        tipoRebote: 'Transient',
      }),
    );
  });

  it('queja → queja_en y supresión (queja), sin cambiar el estado', async () => {
    // Act
    await controller.recibir(peticion(evento('email.complained')));

    // Assert
    expect(fila()).toMatchObject({
      estado: EstadoRecordatorio.ENVIADO,
      quejaEn: new Date('2026-10-10T15:00:05.000Z'),
    });
    expect(
      supresiones.supresiones.get(calcularHashCorreo(CORREO))?.motivo,
    ).toBe(MotivoSupresion.QUEJA);
  });

  it('nunca registra el cuerpo ni el correo', async () => {
    // Act
    await controller.recibir(peticion(evento('email.delivery_delayed')));
    await controller
      .recibir(peticion(evento('email.delivered'), { cabeceras: false }))
      .catch(() => undefined);

    // Assert
    const registrado = JSON.stringify([log.mock.calls, warn.mock.calls]);
    expect(registrado).not.toContain(CORREO);
    expect(registrado).not.toContain('re_1');
  });
});
