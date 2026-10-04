import {
  CALENDARIO_REINTENTOS_MIN,
  calcularReintento,
} from './reintentos-envio';

const MIN = 60_000;
const AHORA = new Date('2026-10-10T15:00:00Z');
const LEJOS = new Date('2026-10-12T15:00:00Z');
const en = (minutos: number): Date => new Date(AHORA.getTime() + minutos * MIN);

describe('calcularReintento (ADR-13 §8)', () => {
  it('el calendario es 1, 5, 15, 30 y 60 minutos', () => {
    expect(CALENDARIO_REINTENTOS_MIN).toEqual([1, 5, 15, 30, 60]);
  });

  it.each([
    [0, 1],
    [1, 5],
    [2, 15],
    [3, 30],
    [4, 60],
  ])(
    'con %i fallos previos espera %i min (5 reintentos de calendario completo)',
    (intentosPrevios, espera) => {
      expect(
        calcularReintento({
          intentosPrevios,
          ahora: AHORA,
          venceEn: LEJOS,
          maxReintentos: 5,
        }),
      ).toEqual({
        tipo: 'reintentar',
        proximoIntentoEn: en(espera),
        numeroReintento: intentosPrevios + 1,
      });
    },
  );

  it('el sexto fallo agota RECORDATORIO_MAX_INTENTOS = 5', () => {
    expect(
      calcularReintento({
        intentosPrevios: 5,
        ahora: AHORA,
        venceEn: LEJOS,
        maxReintentos: 5,
      }),
    ).toEqual({ tipo: 'agotado', causa: 'max_reintentos' });
  });

  it('con un máximo mayor que el calendario repite la última espera', () => {
    expect(
      calcularReintento({
        intentosPrevios: 6,
        ahora: AHORA,
        venceEn: LEJOS,
        maxReintentos: 10,
      }),
    ).toMatchObject({ tipo: 'reintentar', proximoIntentoEn: en(60) });
  });

  it('acotado por venceEn: la espera se adelanta a 1 min antes del vencimiento', () => {
    expect(
      calcularReintento({
        intentosPrevios: 3,
        ahora: AHORA,
        venceEn: en(20),
        maxReintentos: 5,
      }),
    ).toMatchObject({ tipo: 'reintentar', proximoIntentoEn: en(19) });
  });

  it('si ni el margen queda en el futuro, agotado por vencimiento', () => {
    expect(
      calcularReintento({
        intentosPrevios: 0,
        ahora: AHORA,
        venceEn: en(1),
        maxReintentos: 5,
      }),
    ).toEqual({ tipo: 'agotado', causa: 'vencimiento' });
  });

  it('con maxReintentos = 0 nunca reintenta', () => {
    expect(
      calcularReintento({
        intentosPrevios: 0,
        ahora: AHORA,
        venceEn: LEJOS,
        maxReintentos: 0,
      }).tipo,
    ).toBe('agotado');
  });

  it.each([
    [{ intentosPrevios: -1, maxReintentos: 5 }],
    [{ intentosPrevios: 1.5, maxReintentos: 5 }],
    [{ intentosPrevios: 0, maxReintentos: -1 }],
  ])('rechaza parámetros inválidos %p', (parametros) => {
    expect(() =>
      calcularReintento({ ...parametros, ahora: AHORA, venceEn: LEJOS }),
    ).toThrow(RangeError);
  });
});
