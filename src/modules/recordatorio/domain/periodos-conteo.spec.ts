import {
  periodoDiaEnZona,
  periodoDiaUtc,
  periodoMesUtc,
} from './periodos-conteo';

describe('periodos-conteo (ADR-13 §11)', () => {
  describe('periodoDiaUtc', () => {
    it('debería cubrir el día calendario UTC del instante', () => {
      // Act
      const periodo = periodoDiaUtc(new Date('2026-10-03T23:59:59.999Z'));

      // Assert
      expect(periodo).toEqual({
        desde: new Date('2026-10-03T00:00:00.000Z'),
        hasta: new Date('2026-10-04T00:00:00.000Z'),
      });
    });

    it('debería incluir la medianoche exacta como inicio del día', () => {
      // Act
      const periodo = periodoDiaUtc(new Date('2026-10-04T00:00:00.000Z'));

      // Assert
      expect(periodo.desde).toEqual(new Date('2026-10-04T00:00:00.000Z'));
    });

    it('debería cruzar el fin de mes y de año', () => {
      // Act & Assert
      expect(periodoDiaUtc(new Date('2026-12-31T12:00:00Z')).hasta).toEqual(
        new Date('2027-01-01T00:00:00.000Z'),
      );
    });
  });

  describe('periodoMesUtc', () => {
    it('debería cubrir el mes calendario UTC del instante', () => {
      // Act
      const periodo = periodoMesUtc(new Date('2026-10-15T10:00:00Z'));

      // Assert
      expect(periodo).toEqual({
        desde: new Date('2026-10-01T00:00:00.000Z'),
        hasta: new Date('2026-11-01T00:00:00.000Z'),
      });
    });

    it('debería pasar de diciembre a enero del año siguiente', () => {
      // Act & Assert
      expect(periodoMesUtc(new Date('2026-12-20T00:00:00Z'))).toEqual({
        desde: new Date('2026-12-01T00:00:00.000Z'),
        hasta: new Date('2027-01-01T00:00:00.000Z'),
      });
    });

    it('debería respetar febrero bisiesto', () => {
      // Act & Assert
      expect(periodoMesUtc(new Date('2028-02-29T23:00:00Z')).hasta).toEqual(
        new Date('2028-03-01T00:00:00.000Z'),
      );
    });

    it('debería usar el mes UTC aunque en Santiago siga siendo el mes anterior', () => {
      // Arrange — 31-oct 23:30 en Santiago (UTC-3) = 01-nov 02:30 UTC
      const ahora = new Date('2026-11-01T02:30:00Z');

      // Act & Assert
      expect(periodoMesUtc(ahora).desde).toEqual(
        new Date('2026-11-01T00:00:00.000Z'),
      );
    });
  });

  describe('periodoDiaEnZona', () => {
    it('debería usar el día de la clínica, no el UTC', () => {
      // Arrange — 22:00 del 2-oct en Santiago (UTC-3) = 3-oct 01:00 UTC
      const ahora = new Date('2026-10-03T01:00:00Z');

      // Act
      const periodo = periodoDiaEnZona(ahora, 'America/Santiago');

      // Assert
      expect(periodo).toEqual({
        desde: new Date('2026-10-02T03:00:00.000Z'),
        hasta: new Date('2026-10-03T03:00:00.000Z'),
      });
    });
  });
});
