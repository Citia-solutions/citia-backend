import {
  diasCalendarioInclusivos,
  formatearFechaEnZona,
  formatearFechaLargaEnZona,
  formatearHoraEnZona,
  instanteDeHoraLocal,
  minutoDelDiaEnZona,
  rangoDeFechasEnZona,
  rangoDelDiaEnZona,
  sumarDiasAFecha,
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
  describe('formatearFechaLargaEnZona (ADR-13 §12)', () => {
    it('debería dar "día de la semana, día de mes, hora" en es-CL', () => {
      // 2025-10-14 13:30Z = martes 10:30 en Santiago (UTC-3): el ejemplo de ADR-13.
      expect(
        formatearFechaLargaEnZona(new Date('2025-10-14T13:30:00Z'), TZ),
      ).toBe('martes 14 de octubre, 10:30');
    });

    it('debería escribir el día sin cero y los nombres en minúsculas', () => {
      // 2026-10-05 12:05Z = lunes 09:05 en Santiago.
      expect(
        formatearFechaLargaEnZona(new Date('2026-10-05T12:05:00Z'), TZ),
      ).toBe('lunes 5 de octubre, 09:05');
    });

    it('debería usar la fecha de la clínica, no la UTC', () => {
      // 2026-10-15 02:00Z = miércoles 14 a las 23:00 en Santiago.
      expect(
        formatearFechaLargaEnZona(new Date('2026-10-15T02:00:00Z'), TZ),
      ).toBe('miércoles 14 de octubre, 23:00');
    });

    it('debería respetar el horario de invierno (UTC-4)', () => {
      // 2026-07-01 14:00Z = miércoles 10:00 en Santiago (UTC-4).
      expect(
        formatearFechaLargaEnZona(new Date('2026-07-01T14:00:00Z'), TZ),
      ).toBe('miércoles 1 de julio, 10:00');
    });

    it('con conHora=false debería dar solo la fecha', () => {
      expect(
        formatearFechaLargaEnZona(new Date('2025-10-14T13:30:00Z'), TZ, {
          conHora: false,
        }),
      ).toBe('martes 14 de octubre');
    });

    it('el domingo del fin del horario de verano debería salir con la hora nueva', () => {
      // 2027-04-04 14:00Z = domingo 10:00 en Santiago, ya en UTC-4.
      expect(
        formatearFechaLargaEnZona(new Date('2027-04-04T14:00:00Z'), TZ),
      ).toBe('domingo 4 de abril, 10:00');
    });
  });

  describe('minutoDelDiaEnZona', () => {
    it('debería contar minutos del reloj de pared de la clínica', () => {
      // 00:00Z = 21:00 del día anterior en Santiago (UTC-3).
      expect(minutoDelDiaEnZona(new Date('2026-10-14T00:00:00Z'), TZ)).toBe(
        21 * 60,
      );
      expect(minutoDelDiaEnZona(new Date('2026-10-14T03:00:00Z'), TZ)).toBe(0);
    });
  });

  describe('sumarDiasAFecha', () => {
    it('debería mover la fecha de calendario en ambos sentidos', () => {
      expect(sumarDiasAFecha('2026-12-31', 1)).toBe('2027-01-01');
      expect(sumarDiasAFecha('2026-03-01', -1)).toBe('2026-02-28');
      expect(sumarDiasAFecha('2028-03-01', -1)).toBe('2028-02-29');
    });
  });

  describe('instanteDeHoraLocal', () => {
    it('debería convertir una hora local de un día normal', () => {
      // 21:00 del 14-oct en Santiago (UTC-3) = 15-oct 00:00Z.
      expect(instanteDeHoraLocal('2026-10-14', '21:00', TZ).toISOString()).toBe(
        '2026-10-15T00:00:00.000Z',
      );
      // Invierno (UTC-4).
      expect(instanteDeHoraLocal('2026-07-01', '08:00', TZ).toISOString()).toBe(
        '2026-07-01T12:00:00.000Z',
      );
    });

    it('víspera del inicio del horario de verano: 21:00 aún en UTC-4', () => {
      expect(instanteDeHoraLocal('2027-09-04', '21:00', TZ).toISOString()).toBe(
        '2027-09-05T01:00:00.000Z',
      );
      // El domingo, las 08:00 ya son UTC-3.
      expect(instanteDeHoraLocal('2027-09-05', '08:00', TZ).toISOString()).toBe(
        '2027-09-05T11:00:00.000Z',
      );
    });

    it('una hora que no existe (salto de 00:00 a 01:00) se corre hacia adelante', () => {
      // 2027-09-05 00:30 no existe en Santiago -> 01:30 (UTC-3) = 04:30Z.
      expect(instanteDeHoraLocal('2027-09-05', '00:30', TZ).toISOString()).toBe(
        '2027-09-05T04:30:00.000Z',
      );
    });

    it('una hora que existe dos veces (se atrasa el reloj) da la primera', () => {
      // 2027-04-03 23:30 ocurre en UTC-3 (02:30Z) y otra vez en UTC-4 (03:30Z).
      expect(instanteDeHoraLocal('2027-04-03', '23:30', TZ).toISOString()).toBe(
        '2027-04-04T02:30:00.000Z',
      );
      // El domingo, las 08:00 ya son UTC-4.
      expect(instanteDeHoraLocal('2027-04-04', '08:00', TZ).toISOString()).toBe(
        '2027-04-04T12:00:00.000Z',
      );
    });

    it('rechaza una hora mal formada', () => {
      expect(() => instanteDeHoraLocal('2026-10-14', '9:00', TZ)).toThrow(
        RangeError,
      );
      expect(() => instanteDeHoraLocal('2026-10-14', '24:00', TZ)).toThrow(
        RangeError,
      );
    });
  });
});
