import {
  HORAS_SIN_ENVIO_POR_DEFECTO,
  adelantarAntesDelSilencio,
  estaEnHorasSinEnvio,
  proximoInstantePermitido,
  validarHorasSinEnvio,
  ventanaDeSilencio,
} from './horas-sin-envio';

const TZ = 'America/Santiago';
const SILENCIO = HORAS_SIN_ENVIO_POR_DEFECTO; // 21:00–08:00
const d = (iso: string): Date => new Date(iso);

describe('horas-sin-envio (ADR-13 §3, §5.c)', () => {
  describe('estaEnHorasSinEnvio', () => {
    it.each([
      // octubre: Santiago en UTC-3
      ['20:59 local', '2026-10-13T23:59:00Z', false],
      ['21:00 local (inicio, incluido)', '2026-10-14T00:00:00Z', true],
      ['medianoche', '2026-10-14T03:00:00Z', true],
      ['07:59 local', '2026-10-14T10:59:00Z', true],
      ['08:00 local (fin, excluido)', '2026-10-14T11:00:00Z', false],
      ['mediodía', '2026-10-14T15:00:00Z', false],
    ])('%s → %p', (_caso, iso, esperado) => {
      // Act & Assert
      expect(estaEnHorasSinEnvio(d(iso), SILENCIO, TZ)).toBe(esperado);
    });

    it('debería admitir una ventana que no cruza la medianoche', () => {
      // Arrange — 13:00–15:00 local
      const siesta = { desde: '13:00', hasta: '15:00' };

      // Act & Assert
      expect(estaEnHorasSinEnvio(d('2026-10-14T16:30:00Z'), siesta, TZ)).toBe(
        true,
      );
      expect(estaEnHorasSinEnvio(d('2026-10-14T18:00:00Z'), siesta, TZ)).toBe(
        false,
      );
      expect(estaEnHorasSinEnvio(d('2026-10-14T03:00:00Z'), siesta, TZ)).toBe(
        false,
      );
    });
  });

  describe('ventanaDeSilencio', () => {
    it('antes de medianoche: empezó hoy a las 21:00 y termina mañana a las 08:00', () => {
      // Act
      const v = ventanaDeSilencio(d('2026-10-14T01:30:00Z'), SILENCIO, TZ);

      // Assert — 13-oct 22:30 local
      expect(v?.desde.toISOString()).toBe('2026-10-14T00:00:00.000Z');
      expect(v?.hasta.toISOString()).toBe('2026-10-14T11:00:00.000Z');
    });

    it('después de medianoche: empezó AYER a las 21:00', () => {
      // Act
      const v = ventanaDeSilencio(d('2026-10-14T09:00:00Z'), SILENCIO, TZ);

      // Assert — 14-oct 06:00 local
      expect(v?.desde.toISOString()).toBe('2026-10-14T00:00:00.000Z');
      expect(v?.hasta.toISOString()).toBe('2026-10-14T11:00:00.000Z');
    });

    it('la noche del inicio del horario de verano dura 10 h de reloj pero 9 reales', () => {
      // Arrange — 2027-09-04 23:30 local (UTC-4); a medianoche se salta a 01:00
      const instante = d('2027-09-05T03:30:00Z');

      // Act
      const v = ventanaDeSilencio(instante, SILENCIO, TZ);

      // Assert — 21:00 UTC-4 → 08:00 UTC-3
      expect(v?.desde.toISOString()).toBe('2027-09-05T01:00:00.000Z');
      expect(v?.hasta.toISOString()).toBe('2027-09-05T11:00:00.000Z');
    });

    it('la noche del fin del horario de verano dura 10 h de reloj pero 12 reales', () => {
      // Arrange — 23:30 local repetida (la segunda vez, ya en UTC-4)
      const instante = d('2027-04-04T03:30:00Z');

      // Act
      const v = ventanaDeSilencio(instante, SILENCIO, TZ);

      // Assert — 21:00 UTC-3 → 08:00 UTC-4
      expect(v?.desde.toISOString()).toBe('2027-04-04T00:00:00.000Z');
      expect(v?.hasta.toISOString()).toBe('2027-04-04T12:00:00.000Z');
    });

    it('fuera del silencio: null', () => {
      // Act & Assert
      expect(
        ventanaDeSilencio(d('2026-10-14T15:00:00Z'), SILENCIO, TZ),
      ).toBeNull();
    });
  });

  describe('adelantarAntesDelSilencio', () => {
    it('dentro del silencio: a las 20:59 de la noche en que empezó', () => {
      // Act — 14-oct 07:00 local
      const r = adelantarAntesDelSilencio(
        d('2026-10-14T10:00:00Z'),
        SILENCIO,
        TZ,
      );

      // Assert — 13-oct 20:59 local
      expect(r.toISOString()).toBe('2026-10-13T23:59:00.000Z');
    });

    it('fuera del silencio: el mismo instante', () => {
      // Arrange
      const instante = d('2026-10-14T15:00:00Z');

      // Act & Assert
      expect(adelantarAntesDelSilencio(instante, SILENCIO, TZ)).toBe(instante);
    });
  });

  describe('proximoInstantePermitido', () => {
    it('dentro del silencio: las 08:00 siguientes', () => {
      // Act & Assert
      expect(
        proximoInstantePermitido(
          d('2026-10-14T02:00:00Z'),
          SILENCIO,
          TZ,
        ).toISOString(),
      ).toBe('2026-10-14T11:00:00.000Z');
    });

    it('fuera del silencio: ahora mismo', () => {
      // Arrange
      const ahora = d('2026-10-14T15:00:00Z');

      // Act & Assert
      expect(proximoInstantePermitido(ahora, SILENCIO, TZ)).toBe(ahora);
    });
  });

  describe('validarHorasSinEnvio', () => {
    it.each([
      [{ desde: '9:00', hasta: '08:00' }],
      [{ desde: '21:00', hasta: '24:00' }],
      [{ desde: '21:00', hasta: '21:00' }],
    ])('debería rechazar %p', (horas) => {
      // Act & Assert
      expect(() => validarHorasSinEnvio(horas)).toThrow(RangeError);
    });
  });
});
