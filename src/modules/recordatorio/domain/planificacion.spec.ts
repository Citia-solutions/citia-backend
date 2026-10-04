import {
  formatearFechaEnZona,
  formatearHoraEnZona,
} from '../../../shared/domain/timezone';
import {
  EntradaPlanificacion,
  ParametrosPlanificacion,
  RecordatorioPlanificado,
  fueraDeMargen,
  planificar,
  resolverTardios,
} from './planificacion';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from './recordatorio.entity';
import {
  DatosRecordatorio,
  NuevoRecordatorio,
} from './recordatorio.repository';

/**
 * Planificación pura (ADR-13 §5) — Definición de Terminado de US-03,
 * "Planificación (unitarios, sin base ni reloj)".
 */
const TZ = 'America/Santiago';
const PARAMETROS: ParametrosPlanificacion = {
  tz: TZ,
  silencio: { desde: '21:00', hasta: '08:00' },
  margenMinimoMin: 30,
  antelacionMinimaTardiaMin: 60,
};
const CITA_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';

const d = (iso: string): Date => new Date(iso);
/** "YYYY-MM-DD HH:mm" en la hora de la clínica. */
const local = (instante: Date): string =>
  `${formatearFechaEnZona(instante, TZ)} ${formatearHoraEnZona(instante, TZ)}`;

function plan(
  inicio: string,
  ahora: string,
  antelacionesMin: readonly number[] = [1440, 120],
  cambios: Partial<EntradaPlanificacion> = {},
): RecordatorioPlanificado[] {
  return planificar({
    inicio: d(inicio),
    antelacionesMin,
    activo: true,
    vigente: true,
    ahora: d(ahora),
    parametros: PARAMETROS,
    ...cambios,
  });
}

function resolver(
  planificados: RecordatorioPlanificado[],
  inicio: string,
  ahora: string,
  existentes: Pick<DatosRecordatorio, 'inicioCita' | 'estado'>[] = [],
): NuevoRecordatorio[] {
  return resolverTardios(planificados, {
    citaId: CITA_ID,
    tenantId: TENANT_ID,
    canal: CanalRecordatorio.EMAIL,
    inicio: d(inicio),
    ahora: d(ahora),
    existentes,
    parametros: PARAMETROS,
  });
}

/** Resumen legible de una fila: antelación, hora local planificada, estado, motivo. */
const resumen = (n: NuevoRecordatorio) => ({
  antelacionMin: n.antelacionMin,
  programadoPara: local(n.programadoPara),
  estado: n.estado,
  motivo: n.motivo,
});

describe('planificacion (ADR-13 §5)', () => {
  describe('cita normal: 24 h y 2 h antes', () => {
    // Miércoles 2026-10-14 15:00 en Santiago (UTC-3) = 18:00Z.
    const INICIO = '2026-10-14T18:00:00Z';
    const AHORA = '2026-10-10T12:00:00Z';

    it('debería planificar inicio − antelación, en instantes', () => {
      // Act
      const p = plan(INICIO, AHORA);

      // Assert
      expect(p).toEqual([
        {
          antelacionMin: 1440,
          programadoPara: d('2026-10-13T18:00:00Z'),
          venceEn: d('2026-10-14T16:00:00Z'), // cuando toca el siguiente
          fusionado: false,
        },
        {
          antelacionMin: 120,
          programadoPara: d('2026-10-14T16:00:00Z'),
          venceEn: d('2026-10-14T17:30:00Z'), // margen (30) antes del inicio
          fusionado: false,
        },
      ]);
    });

    it('debería producir dos NuevoRecordatorio programados, con la cola en su hora', () => {
      // Act
      const nuevos = resolver(plan(INICIO, AHORA), INICIO, AHORA);

      // Assert
      expect(nuevos).toEqual([
        {
          tenantId: TENANT_ID,
          citaId: CITA_ID,
          canal: CanalRecordatorio.EMAIL,
          antelacionMin: 1440,
          inicioCita: d(INICIO),
          programadoPara: d('2026-10-13T18:00:00Z'),
          venceEn: d('2026-10-14T16:00:00Z'),
          estado: EstadoRecordatorio.PROGRAMADO,
          motivo: null,
          proximoIntentoEn: d('2026-10-13T18:00:00Z'),
        },
        {
          tenantId: TENANT_ID,
          citaId: CITA_ID,
          canal: CanalRecordatorio.EMAIL,
          antelacionMin: 120,
          inicioCita: d(INICIO),
          programadoPara: d('2026-10-14T16:00:00Z'),
          venceEn: d('2026-10-14T17:30:00Z'),
          estado: EstadoRecordatorio.PROGRAMADO,
          motivo: null,
          proximoIntentoEn: d('2026-10-14T16:00:00Z'),
        },
      ]);
    });

    it('debería dar el mismo resultado sin importar el orden de la configuración', () => {
      // Act & Assert
      expect(plan(INICIO, AHORA, [120, 1440])).toEqual(plan(INICIO, AHORA));
    });

    it('con tres momentos, cada uno vence cuando toca el siguiente', () => {
      // Act
      const p = plan(INICIO, AHORA, [120, 2880, 1440]);

      // Assert
      expect(p.map((r) => [r.antelacionMin, r.venceEn.toISOString()])).toEqual([
        [2880, '2026-10-13T18:00:00.000Z'],
        [1440, '2026-10-14T16:00:00.000Z'],
        [120, '2026-10-14T17:30:00.000Z'],
      ]);
    });
  });

  describe('horas sin envío (21:00–08:00): se adelanta a las 20:59', () => {
    const AHORA = '2026-10-01T12:00:00Z';

    it('cita a las 09:00: el de 2 h (07:00) sale a las 20:59 de la víspera', () => {
      // Act — 2026-10-14 09:00 local = 12:00Z
      const p = plan('2026-10-14T12:00:00Z', AHORA);

      // Assert
      expect(p.map((r) => [r.antelacionMin, local(r.programadoPara)])).toEqual([
        [1440, '2026-10-13 09:00'],
        [120, '2026-10-13 20:59'],
      ]);
      // El de 24 h vence cuando toca el de 2 h (ya adelantado).
      expect(p[0].venceEn).toEqual(p[1].programadoPara);
    });

    it('cita a las 22:00: el de 24 h (22:00 de la víspera) sale a las 20:59', () => {
      // Act — 2026-10-14 22:00 local = 15-oct 01:00Z
      const p = plan('2026-10-15T01:00:00Z', AHORA);

      // Assert
      expect(p.map((r) => [r.antelacionMin, local(r.programadoPara)])).toEqual([
        [1440, '2026-10-13 20:59'],
        [120, '2026-10-14 20:00'],
      ]);
    });

    it('las 08:00 justas ya se pueden usar; las 21:00 justas no', () => {
      // Act — 10:00 local (2 h antes = 08:00) y 23:00 local (2 h antes = 21:00)
      const citaA10 = plan('2026-10-14T13:00:00Z', AHORA, [120]);
      const citaA23 = plan('2026-10-15T02:00:00Z', AHORA, [120]);

      // Assert
      expect(local(citaA10[0].programadoPara)).toBe('2026-10-14 08:00');
      expect(local(citaA23[0].programadoPara)).toBe('2026-10-14 20:59');
    });
  });

  describe('fusión de recordatorios cercanos', () => {
    const AHORA = '2026-10-01T12:00:00Z';

    it('3 h y 2 h antes de una cita a las 09:00: ambos caen a las 20:59 y queda el de 2 h', () => {
      // Act
      const p = plan('2026-10-14T12:00:00Z', AHORA, [180, 120]);
      const nuevos = resolver(p, '2026-10-14T12:00:00Z', AHORA);

      // Assert
      expect(nuevos.map(resumen)).toEqual([
        {
          antelacionMin: 180,
          programadoPara: '2026-10-13 20:59',
          estado: EstadoRecordatorio.OMITIDO,
          motivo: MotivoRecordatorio.FUSIONADO,
        },
        {
          antelacionMin: 120,
          programadoPara: '2026-10-13 20:59',
          estado: EstadoRecordatorio.PROGRAMADO,
          motivo: null,
        },
      ]);
      // El que queda vence margen antes del inicio; el fusionado, con él.
      expect(
        p.every((r) => r.venceEn.toISOString() === '2026-10-14T11:30:00.000Z'),
      ).toBe(true);
    });

    it('a 20 min entre sí (sin silencio) también se fusionan', () => {
      // Act — 15:00 local: 140 → 12:40, 120 → 13:00
      const p = plan('2026-10-14T18:00:00Z', AHORA, [140, 120]);

      // Assert
      expect(p.map((r) => [r.antelacionMin, r.fusionado])).toEqual([
        [140, true],
        [120, false],
      ]);
    });

    it('a 30 min justos NO se fusionan', () => {
      // Act — 150 → 12:30, 120 → 13:00
      const p = plan('2026-10-14T18:00:00Z', AHORA, [150, 120]);

      // Assert
      expect(p.map((r) => r.fusionado)).toEqual([false, false]);
      expect(p[0].venceEn).toEqual(p[1].programadoPara);
    });
  });

  describe('vencimiento del último', () => {
    const INICIO = '2026-10-14T18:00:00Z';
    const AHORA = '2026-10-01T12:00:00Z';

    it.each([
      // antelación, venceEn
      [120, '2026-10-14T17:30:00.000Z'], // inicio − margen (ADR-13)
      [60, '2026-10-14T17:30:00.000Z'],
      // Desvío anotado: siempre al menos `margen` para salir, sin pasar del inicio.
      [45, '2026-10-14T17:45:00.000Z'],
      [30, '2026-10-14T18:00:00.000Z'],
    ])('con %i min de antelación vence a las %s', (antelacion, vence) => {
      // Act
      const [r] = plan(INICIO, AHORA, [antelacion]);

      // Assert
      expect(r.venceEn.toISOString()).toBe(vence);
      expect(r.venceEn.getTime()).toBeGreaterThan(r.programadoPara.getTime());
    });
  });

  describe('cita creada tarde', () => {
    // 15:00 local = 18:00Z; el de 24 h tocaba el 13-oct, el de 2 h a las 16:00Z.
    const INICIO = '2026-10-14T18:00:00Z';

    it('si queda uno a tiempo, el que ya pasó nace omitido (creada_tarde)', () => {
      // Act — 3 h antes
      const ahora = '2026-10-14T15:00:00Z';
      const nuevos = resolver(plan(INICIO, ahora), INICIO, ahora);

      // Assert
      expect(nuevos.map((n) => [n.antelacionMin, n.estado, n.motivo])).toEqual([
        [1440, EstadoRecordatorio.OMITIDO, MotivoRecordatorio.CREADA_TARDE],
        [120, EstadoRecordatorio.PROGRAMADO, null],
      ]);
    });

    it('si ninguno queda a tiempo y faltan ≥ 60 min, sale UNO (el de menor antelación) ya', () => {
      // Act — 90 min antes, de día
      const ahora = '2026-10-14T16:30:00Z';
      const nuevos = resolver(plan(INICIO, ahora), INICIO, ahora);

      // Assert
      expect(nuevos).toEqual([
        expect.objectContaining({
          antelacionMin: 1440,
          estado: EstadoRecordatorio.OMITIDO,
          motivo: MotivoRecordatorio.CREADA_TARDE,
        }),
        expect.objectContaining({
          antelacionMin: 120,
          estado: EstadoRecordatorio.PROGRAMADO,
          motivo: null,
          // 5.f: la clave guarda la hora que le tocaba; la cola, la real.
          programadoPara: d('2026-10-14T16:00:00Z'),
          proximoIntentoEn: d(ahora),
          venceEn: d('2026-10-14T17:30:00Z'),
        }),
      ]);
    });

    it.each([
      ['60 min justos', '2026-10-14T17:00:00Z', EstadoRecordatorio.PROGRAMADO],
      ['59 min', '2026-10-14T17:01:00Z', EstadoRecordatorio.OMITIDO],
      ['45 min', '2026-10-14T17:15:00Z', EstadoRecordatorio.OMITIDO],
    ])('con %s para la cita, el de 2 h nace %s', (_caso, ahora, estado) => {
      // Act
      const nuevos = resolver(plan(INICIO, ahora), INICIO, ahora);

      // Assert
      expect(nuevos.find((n) => n.antelacionMin === 120)?.estado).toBe(estado);
      expect(nuevos.find((n) => n.antelacionMin === 1440)?.motivo).toBe(
        MotivoRecordatorio.CREADA_TARDE,
      );
    });

    it('creada de noche: el tardío espera al fin del silencio (08:00)', () => {
      // Arrange — ahora 13-oct 23:00 local; cita 14-oct 09:30 local
      const ahora = '2026-10-14T02:00:00Z';
      const inicio = '2026-10-14T12:30:00Z';

      // Act
      const nuevos = resolver(plan(inicio, ahora), inicio, ahora);

      // Assert
      const tardio = nuevos.find(
        (n) => n.estado === EstadoRecordatorio.PROGRAMADO,
      );
      expect(tardio).toMatchObject({ antelacionMin: 120 });
      expect(local(tardio!.proximoIntentoEn)).toBe('2026-10-14 08:00');
    });

    it('creada de noche y a las 08:00 faltarían < 60 min: todos omitidos', () => {
      // Arrange — cita 14-oct 08:45 local
      const ahora = '2026-10-14T02:00:00Z';
      const inicio = '2026-10-14T11:45:00Z';

      // Act
      const nuevos = resolver(plan(inicio, ahora), inicio, ahora);

      // Assert
      expect(nuevos).toHaveLength(2);
      expect(
        nuevos.every(
          (n) =>
            n.estado === EstadoRecordatorio.OMITIDO &&
            n.motivo === MotivoRecordatorio.CREADA_TARDE,
        ),
      ).toBe(true);
    });

    it('no hay tardío si ya salió un recordatorio para este inicio', () => {
      // Arrange — 90 min antes; el de 2 h ya está enviado
      const ahora = '2026-10-14T16:30:00Z';
      const existentes = [
        { inicioCita: d(INICIO), estado: EstadoRecordatorio.ENVIADO },
      ];

      // Act
      const nuevos = resolver(
        plan(INICIO, ahora, [1440, 100]),
        INICIO,
        ahora,
        existentes,
      );

      // Assert
      expect(nuevos.every((n) => n.estado === EstadoRecordatorio.OMITIDO)).toBe(
        true,
      );
    });

    it('un envío para OTRO inicio (antes de reagendar) no impide el tardío', () => {
      // Arrange
      const ahora = '2026-10-14T16:30:00Z';
      const existentes = [
        {
          inicioCita: d('2026-10-14T15:00:00Z'),
          estado: EstadoRecordatorio.ENTREGADO,
        },
      ];

      // Act
      const nuevos = resolver(plan(INICIO, ahora), INICIO, ahora, existentes);

      // Assert
      expect(nuevos.find((n) => n.antelacionMin === 120)?.estado).toBe(
        EstadoRecordatorio.PROGRAMADO,
      );
    });

    it('reconciliar más tarde da las mismas claves (programadoPara no depende de ahora)', () => {
      // Act
      const primera = resolver(
        plan(INICIO, '2026-10-14T16:30:00Z'),
        INICIO,
        '2026-10-14T16:30:00Z',
      );
      const segunda = resolver(
        plan(INICIO, '2026-10-14T16:45:00Z'),
        INICIO,
        '2026-10-14T16:45:00Z',
      );

      // Assert
      const claves = (ns: NuevoRecordatorio[]) =>
        ns.map((n) => `${n.antelacionMin}@${n.programadoPara.toISOString()}`);
      expect(claves(segunda)).toEqual(claves(primera));
    });
  });

  describe('nada que planificar (regla a)', () => {
    const INICIO = '2026-10-14T18:00:00Z';

    it.each([
      ['cita en el pasado', '2026-10-14T19:00:00Z'],
      ['cita ahora mismo', INICIO],
      ['dentro del margen (20 min antes)', '2026-10-14T17:40:00Z'],
      ['justo en el margen (30 min antes)', '2026-10-14T17:30:00Z'],
    ])('%s → []', (_caso, ahora) => {
      // Act & Assert
      expect(plan(INICIO, ahora)).toEqual([]);
      expect(fueraDeMargen(d(INICIO), d(ahora), 30)).toBe(true);
    });

    it('cita no vigente → []', () => {
      // Act & Assert
      expect(
        plan(INICIO, '2026-10-01T00:00:00Z', [1440, 120], { vigente: false }),
      ).toEqual([]);
    });

    it('configuración apagada → []', () => {
      // Act & Assert
      expect(
        plan(INICIO, '2026-10-01T00:00:00Z', [1440, 120], { activo: false }),
      ).toEqual([]);
    });

    it('31 min antes todavía se planifica', () => {
      // Act & Assert
      expect(plan(INICIO, '2026-10-14T17:29:00Z')).toHaveLength(2);
    });
  });

  describe('cambios de horario en America/Santiago (DST-safe)', () => {
    describe('inicio del horario de verano: sábado 2027-09-04 → domingo 2027-09-05 (00:00 → 01:00)', () => {
      const AHORA = '2027-09-01T12:00:00Z';

      it('24 h antes son 24 horas reales: el reloj marca las 09:00 del sábado', () => {
        // Act — domingo 10:00 local (UTC-3) = 13:00Z
        const p = plan('2027-09-05T13:00:00Z', AHORA);

        // Assert
        expect(p[0].programadoPara.toISOString()).toBe(
          '2027-09-04T13:00:00.000Z',
        );
        expect(local(p[0].programadoPara)).toBe('2027-09-04 09:00');
        expect(local(p[1].programadoPara)).toBe('2027-09-05 08:00');
      });

      it('el silencio cruza el salto: 07:00 del domingo se adelanta a las 20:59 del sábado', () => {
        // Act — domingo 09:00 local (UTC-3) = 12:00Z
        const p = plan('2027-09-05T12:00:00Z', AHORA);

        // Assert — 20:59 en UTC-4 = 00:59Z (restar 10 h de reloj daría 23:59Z)
        expect(p[1].programadoPara.toISOString()).toBe(
          '2027-09-05T00:59:00.000Z',
        );
        expect(local(p[1].programadoPara)).toBe('2027-09-04 20:59');
        expect(local(p[0].programadoPara)).toBe('2027-09-04 08:00');
      });

      it('el tardío de esa noche sale a las 08:00 del domingo, ya en UTC-3', () => {
        // Arrange — sábado 23:30 local (UTC-4); cita domingo 09:30 (UTC-3)
        const ahora = '2027-09-05T03:30:00Z';
        const inicio = '2027-09-05T12:30:00Z';

        // Act
        const nuevos = resolver(plan(inicio, ahora), inicio, ahora);

        // Assert
        const tardio = nuevos.find(
          (n) => n.estado === EstadoRecordatorio.PROGRAMADO,
        );
        expect(tardio?.proximoIntentoEn.toISOString()).toBe(
          '2027-09-05T11:00:00.000Z',
        );
        expect(local(tardio!.proximoIntentoEn)).toBe('2027-09-05 08:00');
      });
    });

    describe('fin del horario de verano: sábado 2027-04-03 → domingo 2027-04-04 (24:00 → 23:00)', () => {
      const AHORA = '2027-03-30T12:00:00Z';

      it('24 h antes son 24 horas reales: el reloj marca las 11:00 del sábado', () => {
        // Act — domingo 10:00 local (UTC-4) = 14:00Z
        const p = plan('2027-04-04T14:00:00Z', AHORA);

        // Assert
        expect(p[0].programadoPara.toISOString()).toBe(
          '2027-04-03T14:00:00.000Z',
        );
        expect(local(p[0].programadoPara)).toBe('2027-04-03 11:00');
        expect(local(p[1].programadoPara)).toBe('2027-04-04 08:00');
      });

      it('el silencio cruza el retroceso: 07:00 del domingo se adelanta a las 20:59 del sábado', () => {
        // Act — domingo 09:00 local (UTC-4) = 13:00Z
        const p = plan('2027-04-04T13:00:00Z', AHORA);

        // Assert — 20:59 en UTC-3 = 23:59Z
        expect(p[1].programadoPara.toISOString()).toBe(
          '2027-04-03T23:59:00.000Z',
        );
        expect(local(p[1].programadoPara)).toBe('2027-04-03 20:59');
      });

      it.each([
        ['la primera 23:30 (UTC-3)', '2027-04-04T02:30:00Z'],
        ['la segunda 23:30 (UTC-4)', '2027-04-04T03:30:00Z'],
      ])(
        'el tardío creado a %s sale a las 08:00 del domingo (UTC-4)',
        (_caso, ahora) => {
          // Arrange — cita domingo 09:30 local (UTC-4) = 13:30Z
          const inicio = '2027-04-04T13:30:00Z';

          // Act
          const nuevos = resolver(plan(inicio, ahora), inicio, ahora);

          // Assert
          const tardio = nuevos.find(
            (n) => n.estado === EstadoRecordatorio.PROGRAMADO,
          );
          expect(tardio?.proximoIntentoEn.toISOString()).toBe(
            '2027-04-04T12:00:00.000Z',
          );
        },
      );
    });
  });
});
