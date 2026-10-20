import { CORTE_GHOSTING, limiteCierreGhosting } from './cierre-ghosting';

// Octubre en Chile: horario de verano, UTC-3.
const TZ = 'America/Santiago';

describe('cierre-ghosting (job G1, US-07.01)', () => {
  it('CORTE_GHOSTING es 2026-10-17 03:22 UTC (DT-11)', () => {
    expect(CORTE_GHOSTING.toISOString()).toBe('2026-10-17T03:22:00.000Z');
  });

  it.each([
    // 23:59 del 19 de octubre en Chile: el límite es la medianoche de ESE día.
    ['2026-10-20T02:59:00.000Z', '2026-10-19T03:00:00.000Z'],
    // 00:01 del 20 de octubre en Chile: ya empezó otro día local.
    ['2026-10-20T03:01:00.000Z', '2026-10-20T03:00:00.000Z'],
  ])(
    'a las %s el límite es las 00:00 de hoy en APP_TZ (%s)',
    (ahora, esperado) => {
      expect(limiteCierreGhosting(new Date(ahora), TZ).toISOString()).toBe(
        esperado,
      );
    },
  );

  it('es pura: no cambia el instante recibido', () => {
    const ahora = new Date('2026-10-20T15:00:00.000Z');

    limiteCierreGhosting(ahora, TZ);

    expect(ahora.toISOString()).toBe('2026-10-20T15:00:00.000Z');
  });
});
