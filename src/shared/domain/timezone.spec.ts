import { formatearHoraEnZona, rangoDelDiaEnZona } from './timezone';

// Zona de la clínica por defecto. En invierno (jun-jul) Chile va en UTC-4.
const TZ = 'America/Santiago';

describe('timezone', () => {
  describe('rangoDelDiaEnZona', () => {
    it('acota el día local aunque el instante sea de otra fecha en UTC', () => {
      // 2026-07-01 02:00Z = 2026-06-30 22:00 en Santiago (UTC-4): sigue siendo
      // el 30 de junio para la clínica. Este es el caso que rompía el dashboard.
      const instante = new Date('2026-07-01T02:00:00Z');

      const { desde, hasta } = rangoDelDiaEnZona(instante, TZ);

      // 00:00 del 30-jun en Santiago = 04:00Z; 00:00 del 01-jul = 04:00Z.
      expect(desde.toISOString()).toBe('2026-06-30T04:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    });

    it('el rango es semiabierto: incluye desde, excluye hasta', () => {
      const instante = new Date('2026-06-30T12:00:00Z');
      const { desde, hasta } = rangoDelDiaEnZona(instante, TZ);

      // Una cita a las 00:00 local del día siguiente cae en `hasta`, fuera del
      // rango [desde, hasta).
      expect(hasta.getTime() - desde.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('formatearHoraEnZona', () => {
    it('formatea la hora en la zona de la clínica, no en UTC', () => {
      // 18:05Z en Santiago (UTC-4) = 14:05 local.
      const instante = new Date('2026-06-30T18:05:00Z');
      expect(formatearHoraEnZona(instante, TZ)).toBe('14:05');
    });

    it('rellena con cero a la izquierda', () => {
      // 12:07Z = 08:07 en Santiago.
      const instante = new Date('2026-06-30T12:07:00Z');
      expect(formatearHoraEnZona(instante, TZ)).toBe('08:07');
    });
  });
});
