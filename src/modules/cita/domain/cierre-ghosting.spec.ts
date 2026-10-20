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

  describe('bordes del día local', () => {
    it('debería devolver el mismo instante cuando ahora es exactamente las 00:00 locales', () => {
      // Arrange — 00:00:00.000 del 20 de octubre en Chile (UTC-3)
      const medianoche = new Date('2026-10-20T03:00:00.000Z');

      // Act & Assert — a esa hora ya empezó el día nuevo
      expect(limiteCierreGhosting(medianoche, TZ)).toEqual(medianoche);
    });

    it('debería seguir en el día anterior un milisegundo antes de las 00:00 locales', () => {
      // Arrange
      const casi = new Date('2026-10-20T02:59:59.999Z');

      // Act & Assert
      expect(limiteCierreGhosting(casi, TZ).toISOString()).toBe(
        '2026-10-19T03:00:00.000Z',
      );
    });

    it.each([
      // Invierno (UTC-4): 23:59 del 14 de julio y 00:01 del 15.
      ['2026-07-15T03:59:00.000Z', '2026-07-14T04:00:00.000Z'],
      ['2026-07-15T04:01:00.000Z', '2026-07-15T04:00:00.000Z'],
    ])(
      'debería usar el desfase de invierno cuando ahora es %s (límite %s)',
      (ahora, esperado) => {
        expect(limiteCierreGhosting(new Date(ahora), TZ).toISOString()).toBe(
          esperado,
        );
      },
    );
  });

  // ADR-07: el "fin del día" sale de shared/domain/timezone.ts, que resuelve
  // los días de 25 y de 23 horas. En Chile el reloj cambia a medianoche:
  //  - 2026-04-05 00:00 (UTC-3) se atrasa a 2026-04-04 23:00 (UTC-4): el
  //    sábado 4 de abril dura 25 horas y sus 23:xx ocurren DOS veces;
  //  - 2026-09-06 00:00 (UTC-4) salta a 01:00 (UTC-3): el domingo 6 de
  //    septiembre dura 23 horas y empieza a las 01:00 (las 00:xx no existen).
  describe('días de cambio de horario en Chile (ADR-07)', () => {
    it.each([
      // Sábado 4 de abril (25 h): empieza a las 00:00 UTC-3 = 03:00Z.
      [
        '00:01 del sábado 4 (UTC-3)',
        '2026-04-04T03:01:00.000Z',
        '2026-04-04T03:00:00.000Z',
      ],
      [
        '23:30 del sábado 4, la PRIMERA vez (UTC-3)',
        '2026-04-05T02:30:00.000Z',
        '2026-04-04T03:00:00.000Z',
      ],
      [
        '23:30 del sábado 4, la SEGUNDA vez (UTC-4)',
        '2026-04-05T03:30:00.000Z',
        '2026-04-04T03:00:00.000Z',
      ],
      [
        '23:59 del sábado 4, la SEGUNDA vez (UTC-4)',
        '2026-04-05T03:59:00.000Z',
        '2026-04-04T03:00:00.000Z',
      ],
      // Domingo 5 de abril: empieza a las 00:00 UTC-4 = 04:00Z.
      [
        '00:00 del domingo 5 (UTC-4)',
        '2026-04-05T04:00:00.000Z',
        '2026-04-05T04:00:00.000Z',
      ],
      [
        '00:01 del domingo 5 (UTC-4)',
        '2026-04-05T04:01:00.000Z',
        '2026-04-05T04:00:00.000Z',
      ],
    ])(
      'día de 25 horas: a las %s (%s) el límite es %s',
      (_momento, ahora, esperado) => {
        expect(limiteCierreGhosting(new Date(ahora), TZ).toISOString()).toBe(
          esperado,
        );
      },
    );

    it.each([
      // Sábado 5 de septiembre (UTC-4): empieza a las 04:00Z.
      [
        '23:59 del sábado 5 (UTC-4)',
        '2026-09-06T03:59:00.000Z',
        '2026-09-05T04:00:00.000Z',
      ],
      // Domingo 6 (23 h): el primer instante es las 01:00 UTC-3 = 04:00Z.
      [
        '01:00 del domingo 6, su primer instante (UTC-3)',
        '2026-09-06T04:00:00.000Z',
        '2026-09-06T04:00:00.000Z',
      ],
      [
        '01:01 del domingo 6 (UTC-3)',
        '2026-09-06T04:01:00.000Z',
        '2026-09-06T04:00:00.000Z',
      ],
      [
        '23:59 del domingo 6 (UTC-3)',
        '2026-09-07T02:59:00.000Z',
        '2026-09-06T04:00:00.000Z',
      ],
      // Lunes 7: ya a las 00:00 UTC-3 = 03:00Z.
      [
        '00:01 del lunes 7 (UTC-3)',
        '2026-09-07T03:01:00.000Z',
        '2026-09-07T03:00:00.000Z',
      ],
    ])(
      'día de 23 horas: a las %s (%s) el límite es %s',
      (_momento, ahora, esperado) => {
        expect(limiteCierreGhosting(new Date(ahora), TZ).toISOString()).toBe(
          esperado,
        );
      },
    );

    it('una cita de las 23:30 de la SEGUNDA vez del sábado 4 de abril entra recién desde las 00:00 del domingo', () => {
      // Arrange — la regla es `inicio < limite`
      const inicio = new Date('2026-04-05T03:30:00.000Z');
      const unMinutoAntesDeMedianoche = new Date('2026-04-05T03:59:00.000Z');
      const medianoche = new Date('2026-04-05T04:00:00.000Z');

      // Act
      const antes = limiteCierreGhosting(unMinutoAntesDeMedianoche, TZ);
      const despues = limiteCierreGhosting(medianoche, TZ);

      // Assert — todavía es su día: no la cierra antes de que termine
      expect(inicio.getTime() < antes.getTime()).toBe(false);
      expect(inicio.getTime() < despues.getTime()).toBe(true);
    });

    it('una cita de las 01:30 del domingo 6 de septiembre (día de 23 horas) entra desde las 00:00 del lunes 7, no antes', () => {
      // Arrange
      const inicio = new Date('2026-09-06T04:30:00.000Z');

      // Act
      const a2359 = limiteCierreGhosting(
        new Date('2026-09-07T02:59:00.000Z'),
        TZ,
      );
      const a0000 = limiteCierreGhosting(
        new Date('2026-09-07T03:00:00.000Z'),
        TZ,
      );

      // Assert
      expect(inicio.getTime() < a2359.getTime()).toBe(false);
      expect(inicio.getTime() < a0000.getTime()).toBe(true);
    });

    it('en 2027 también (abril 3–4 y septiembre 5)', () => {
      // 2027-04-04 00:00 UTC-3 se atrasa: el sábado 3 termina a las 04:00Z.
      expect(
        limiteCierreGhosting(new Date('2027-04-04T03:30:00.000Z'), TZ),
      ).toEqual(new Date('2027-04-03T03:00:00.000Z'));
      expect(
        limiteCierreGhosting(new Date('2027-04-04T04:00:00.000Z'), TZ),
      ).toEqual(new Date('2027-04-04T04:00:00.000Z'));
      // 2027-09-05 empieza a las 01:00 UTC-3 = 04:00Z.
      expect(
        limiteCierreGhosting(new Date('2027-09-05T12:00:00.000Z'), TZ),
      ).toEqual(new Date('2027-09-05T04:00:00.000Z'));
    });
  });
});
