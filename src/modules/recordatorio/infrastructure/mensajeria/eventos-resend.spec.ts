import { TipoEventoEntrega } from '../../domain/recordatorio.repository';
import { MotivoSupresion } from '../../domain/supresion-correo.repository';
import { traducirEventoResend } from './eventos-resend';

const RECIBIDO = new Date('2026-10-10T15:10:00Z');
const RECORDATORIO = '0e5a0000-0000-4000-8000-000000000001';

/** Payload como el de la documentación de Resend (2026-10-03). */
function payload(
  type: string,
  extraData: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    created_at: '2026-10-10T15:00:05.000Z',
    data: {
      created_at: '2026-10-10T15:00:00.000Z',
      email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
      from: 'Citia <recordatorios@notificaciones.citia.cl>',
      to: ['paciente@correo.cl'],
      subject: 'Recordatorio de tu hora',
      tags: { recordatorio_id: RECORDATORIO },
      ...extraData,
    },
  };
}

describe('traducirEventoResend (ADR-13 §10)', () => {
  it.each([
    ['email.sent', TipoEventoEntrega.ENVIADO, undefined],
    ['email.delivered', TipoEventoEntrega.ENTREGADO, undefined],
    ['email.complained', TipoEventoEntrega.QUEJA, MotivoSupresion.QUEJA],
    ['email.failed', TipoEventoEntrega.RECHAZADO, undefined],
    ['email.suppressed', TipoEventoEntrega.REBOTADO, MotivoSupresion.REBOTE],
  ])('%s → %s', (tipoResend, tipo, motivoSupresion) => {
    // Act
    const t = traducirEventoResend(payload(tipoResend), RECIBIDO);

    // Assert
    expect(t).toEqual({
      tipo: 'procesar',
      tipoResend,
      evento: {
        tipo,
        proveedor: 'resend',
        recordatorioId: RECORDATORIO,
        proveedorMensajeId: '56761188-7520-42d8-8898-ff6fc54ce618',
        ocurridoEn: new Date('2026-10-10T15:00:05.000Z'),
        destinatarios: ['paciente@correo.cl'],
        ...(motivoSupresion ? { motivoSupresion } : {}),
      },
    });
  });

  it('rebote Permanent → rebotado con supresión', () => {
    // Act
    const t = traducirEventoResend(
      payload('email.bounced', {
        bounce: { type: 'Permanent', subType: 'General', message: 'x' },
      }),
      RECIBIDO,
    );

    // Assert
    expect(t).toMatchObject({
      tipo: 'procesar',
      evento: {
        tipo: TipoEventoEntrega.REBOTADO,
        motivoSupresion: MotivoSupresion.REBOTE,
      },
    });
  });

  it.each(['Transient', 'Temporary', 'Undetermined'])(
    'rebote %s → se ignora (solo log), sin tocar el repositorio',
    (tipoRebote) => {
      expect(
        traducirEventoResend(
          payload('email.bounced', { bounce: { type: tipoRebote } }),
          RECIBIDO,
        ),
      ).toEqual({
        tipo: 'ignorar',
        tipoResend: 'email.bounced',
        motivo: 'rebote_no_permanente',
        tipoRebote,
      });
    },
  );

  it('rebote sin tipo → se ignora', () => {
    expect(
      traducirEventoResend(payload('email.bounced'), RECIBIDO),
    ).toMatchObject({ tipo: 'ignorar', motivo: 'rebote_no_permanente' });
  });

  it('email.delivery_delayed → se ignora (retraso)', () => {
    expect(
      traducirEventoResend(payload('email.delivery_delayed'), RECIBIDO),
    ).toEqual({
      tipo: 'ignorar',
      tipoResend: 'email.delivery_delayed',
      motivo: 'retraso',
    });
  });

  it.each([
    'email.opened',
    'email.clicked',
    'email.scheduled',
    'domain.updated',
  ])('%s → se ignora (sin efecto)', (tipoResend) => {
    expect(traducirEventoResend(payload(tipoResend), RECIBIDO)).toEqual({
      tipo: 'ignorar',
      tipoResend,
      motivo: 'sin_efecto',
    });
  });

  it.each([[null], ['texto'], [{ data: {} }], [{ type: 'email.sent' }]])(
    'forma inválida %p → se ignora',
    (cuerpo) => {
      expect(traducirEventoResend(cuerpo, RECIBIDO)).toMatchObject({
        tipo: 'ignorar',
        motivo: 'forma_invalida',
      });
    },
  );

  it('acepta las etiquetas como lista [{ name, value }]', () => {
    // Act
    const t = traducirEventoResend(
      payload('email.delivered', {
        tags: [
          { name: 'otra', value: 'x' },
          { name: 'recordatorio_id', value: RECORDATORIO },
        ],
      }),
      RECIBIDO,
    );

    // Assert
    expect(t).toMatchObject({ evento: { recordatorioId: RECORDATORIO } });
  });

  it('sin etiqueta ni email_id: localizador vacío (el servicio lo tratará como desconocido)', () => {
    // Act
    const t = traducirEventoResend(
      payload('email.delivered', { tags: undefined, email_id: undefined }),
      RECIBIDO,
    );

    // Assert
    expect(t).toMatchObject({
      evento: { recordatorioId: null, proveedorMensajeId: null },
    });
  });

  it('sin created_at válido usa la hora de recepción', () => {
    // Arrange
    const p = payload('email.delivered');
    p.created_at = 'no-es-fecha';

    // Act & Assert
    expect(traducirEventoResend(p, RECIBIDO)).toMatchObject({
      evento: { ocurridoEn: RECIBIDO },
    });
  });

  it('extrae la dirección de "Nombre <correo>" y descarta vacíos', () => {
    // Act
    const t = traducirEventoResend(
      payload('email.complained', {
        to: ['Ana <Ana@Correo.cl>', '', 42, 'otro@correo.cl'],
      }),
      RECIBIDO,
    );

    // Assert
    expect(t).toMatchObject({
      evento: { destinatarios: ['Ana@Correo.cl', 'otro@correo.cl'] },
    });
  });
});
