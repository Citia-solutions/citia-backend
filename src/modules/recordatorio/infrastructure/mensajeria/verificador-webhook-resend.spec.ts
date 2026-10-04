import { randomBytes } from 'node:crypto';

import { Webhook } from 'svix';

import {
  CabecerasSvix,
  FirmaWebhookInvalidaError,
  VerificadorWebhookResend,
} from './verificador-webhook-resend';

const SECRETO = `whsec_${randomBytes(24).toString('base64')}`;
const CUERPO = JSON.stringify({ type: 'email.delivered', data: { a: 1 } });

/** Cabeceras firmadas como las firma Resend (Svix), en el instante `cuando`. */
function firmar(
  cuerpo: string,
  cuando = new Date(),
  secreto = SECRETO,
): CabecerasSvix {
  const id = `msg_${randomBytes(8).toString('hex')}`;
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(cuando.getTime() / 1000)),
    'svix-signature': new Webhook(secreto).sign(id, cuando, cuerpo),
  };
}

function causa(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof FirmaWebhookInvalidaError) return e.causa;
    throw e;
  }
  throw new Error('se esperaba FirmaWebhookInvalidaError');
}

describe('VerificadorWebhookResend (Svix, ADR-13 §10)', () => {
  const verificador = new VerificadorWebhookResend(SECRETO);

  it('firma válida sobre el cuerpo crudo → devuelve el payload parseado', () => {
    expect(verificador.verificar(Buffer.from(CUERPO), firmar(CUERPO))).toEqual({
      type: 'email.delivered',
      data: { a: 1 },
    });
  });

  it('firma con otro secreto → firma', () => {
    const otro = `whsec_${randomBytes(24).toString('base64')}`;
    expect(
      causa(() =>
        verificador.verificar(CUERPO, firmar(CUERPO, new Date(), otro)),
      ),
    ).toBe('firma');
  });

  it('cuerpo alterado (p. ej. re-serializado) → firma', () => {
    const cabeceras = firmar(CUERPO);
    expect(
      causa(() =>
        verificador.verificar(
          JSON.stringify(JSON.parse(CUERPO), null, 2),
          cabeceras,
        ),
      ),
    ).toBe('firma');
  });

  it('sello de más de 5 minutos → firma (vieja)', () => {
    const hace6Min = new Date(Date.now() - 6 * 60_000);
    expect(
      causa(() => verificador.verificar(CUERPO, firmar(CUERPO, hace6Min))),
    ).toBe('firma');
  });

  it('sello de hace 4 minutos todavía se acepta (tolerancia)', () => {
    const hace4Min = new Date(Date.now() - 4 * 60_000);
    expect(() =>
      verificador.verificar(CUERPO, firmar(CUERPO, hace4Min)),
    ).not.toThrow();
  });

  it('sello del futuro (> 5 min) → firma', () => {
    const en6Min = new Date(Date.now() + 6 * 60_000);
    expect(
      causa(() => verificador.verificar(CUERPO, firmar(CUERPO, en6Min))),
    ).toBe('firma');
  });

  it('sin cabeceras → sin_cabeceras', () => {
    expect(causa(() => verificador.verificar(CUERPO, {}))).toBe(
      'sin_cabeceras',
    );
  });

  it('sin cuerpo (no llegó como JSON) → sin_cuerpo', () => {
    expect(causa(() => verificador.verificar(undefined, firmar(CUERPO)))).toBe(
      'sin_cuerpo',
    );
  });

  it('sin secreto configurado → rechaza todo', () => {
    const sinSecreto = new VerificadorWebhookResend(undefined);
    expect(sinSecreto.configurado).toBe(false);
    expect(causa(() => sinSecreto.verificar(CUERPO, firmar(CUERPO)))).toBe(
      'sin_secreto',
    );
  });

  it('un secreto mal formado se trata como ausente (no rompe el arranque)', () => {
    expect(
      new VerificadorWebhookResend('whsec_***no base64***').configurado,
    ).toBe(false);
  });
});
