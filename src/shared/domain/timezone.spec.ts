import {
  diasCalendarioInclusivos,
  formatearFechaEnZona,
  formatearHoraEnZona,
  rangoDeFechasEnZona,
  rangoDelDiaEnZona,
} from './timezone';

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

  describe('rangoDelDiaEnZona en cambios de horario (Chile)', () => {
    it('día de inicio del horario de verano: empieza a las 01:00 locales', () => {
      // 2026-09-06: a las 00:00 (UTC-4) se salta a 01:00 (UTC-3). Las 00:00
      // no existen; el día empieza en 04:00Z y dura 23h.
      const { desde, hasta } = rangoDelDiaEnZona(
        new Date('2026-09-06T15:00:00Z'),
        TZ,
      );
      expect(desde.toISOString()).toBe('2026-09-06T04:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-09-07T03:00:00.000Z');
    });

    it('la víspera del salto conserva su última hora (23:00–24:00)', () => {
      const { hasta } = rangoDelDiaEnZona(new Date('2026-09-05T15:00:00Z'), TZ);
      expect(hasta.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    });

    it('día de fin del horario de verano: el sábado dura 25h', () => {
      // 2026-04-04 24:00 (UTC-3) vuelve a 23:00 (UTC-4).
      const { desde, hasta } = rangoDelDiaEnZona(
        new Date('2026-04-04T15:00:00Z'),
        TZ,
      );
      expect(desde.toISOString()).toBe('2026-04-04T03:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-04-05T04:00:00.000Z');
    });
  });

  describe('formatearFechaEnZona', () => {
    it('usa la fecha de la clínica, no la UTC', () => {
      // 02:00Z del 01-jul = 22:00 del 30-jun en Santiago.
      expect(formatearFechaEnZona(new Date('2026-07-01T02:00:00Z'), TZ)).toBe(
        '2026-06-30',
      );
      expect(formatearFechaEnZona(new Date('2026-07-01T04:00:00Z'), TZ)).toBe(
        '2026-07-01',
      );
    });
  });

  describe('rangoDeFechasEnZona', () => {
    it('convierte [00:00 de desde, 00:00 de hasta+1) a instantes UTC', () => {
      const { desde, hasta } = rangoDeFechasEnZona(
        '2026-06-29',
        '2026-07-05',
        TZ,
      );
      expect(desde.toISOString()).toBe('2026-06-29T04:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-07-06T04:00:00.000Z');
    });

    it('un solo día equivale a rangoDelDiaEnZona', () => {
      expect(rangoDeFechasEnZona('2026-06-30', '2026-06-30', TZ)).toEqual(
        rangoDelDiaEnZona(new Date('2026-06-30T12:00:00Z'), TZ),
      );
    });

    it('cruza el inicio del horario de verano (día de 23h)', () => {
      const { desde, hasta } = rangoDeFechasEnZona(
        '2026-09-05',
        '2026-09-06',
        TZ,
      );
      expect(desde.toISOString()).toBe('2026-09-05T04:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-09-07T03:00:00.000Z');
    });

    it('cruza fin de mes y de año', () => {
      const { hasta } = rangoDeFechasEnZona('2026-12-28', '2026-12-31', TZ);
      // Enero en Santiago es verano (UTC-3).
      expect(hasta.toISOString()).toBe('2027-01-01T03:00:00.000Z');
    });

    it('rechaza un formato que no sea YYYY-MM-DD', () => {
      expect(() => rangoDeFechasEnZona('2026-9-1', '2026-09-02', TZ)).toThrow(
        RangeError,
      );
    });
  });

  describe('diasCalendarioInclusivos', () => {
    it('cuenta ambos extremos', () => {
      expect(diasCalendarioInclusivos('2026-09-21', '2026-09-21')).toBe(1);
      expect(diasCalendarioInclusivos('2026-09-21', '2026-09-27')).toBe(7);
      expect(diasCalendarioInclusivos('2026-09-01', '2026-10-12')).toBe(42);
    });

    it('no le afectan los cambios de horario ni los años bisiestos', () => {
      expect(diasCalendarioInclusivos('2026-09-05', '2026-09-07')).toBe(3);
      expect(diasCalendarioInclusivos('2028-02-28', '2028-03-01')).toBe(3);
    });

    it('es <= 0 si hasta es anterior a desde', () => {
      expect(diasCalendarioInclusivos('2026-09-27', '2026-09-21')).toBe(-5);
    });
  });
});
