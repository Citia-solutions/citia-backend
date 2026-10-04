import { randomUUID } from 'node:crypto';

import { ParametrosPlanificacion } from './planificacion';
import {
  CitaAReconciliar,
  ConfiguracionAplicable,
  DecisionReconciliacion,
  EntradaReconciliacion,
  reconciliar,
} from './reconciliacion';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from './recordatorio.entity';
import {
  DatosRecordatorio,
  NuevoRecordatorio,
} from './recordatorio.repository';

const PARAMETROS: ParametrosPlanificacion = {
  tz: 'America/Santiago',
  silencio: { desde: '21:00', hasta: '08:00' },
  margenMinimoMin: 30,
  antelacionMinimaTardiaMin: 60,
};
const d = (iso: string): Date => new Date(iso);

// Miércoles 2026-10-14 15:00 en Santiago.
const INICIO = d('2026-10-14T18:00:00Z');
const AHORA = d('2026-10-10T12:00:00Z');
const CITA: CitaAReconciliar = {
  id: '22222222-2222-4222-8222-222222222222',
  tenantId: '33333333-3333-4333-8333-333333333333',
  inicio: INICIO,
  vigente: true,
};
const CONFIG: ConfiguracionAplicable = {
  activo: true,
  canal: CanalRecordatorio.EMAIL,
  antelacionesMin: [1440, 120],
};

function decidir(
  cambios: Partial<EntradaReconciliacion> = {},
): DecisionReconciliacion {
  return reconciliar({
    cita: CITA,
    configuracion: CONFIG,
    existentes: [],
    ahora: AHORA,
    parametros: PARAMETROS,
    ...cambios,
  });
}

/** Lo que haría la base con lo insertado: filas con id. */
function comoFilas(nuevos: NuevoRecordatorio[]): DatosRecordatorio[] {
  return nuevos.map((n) => ({
    ...n,
    id: randomUUID(),
    intentos: 0,
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    entregadoEn: null,
    quejaEn: null,
    creadoEn: AHORA,
    actualizadoEn: AHORA,
  }));
}

describe('reconciliar (ADR-13 §6)', () => {
  it('cita nueva: inserta los dos programados y no anula nada', () => {
    // Act
    const decision = decidir();

    // Assert
    expect(decision.anular).toEqual([]);
    expect(
      decision.insertar.map((n) => [
        n.antelacionMin,
        n.estado,
        n.programadoPara,
      ]),
    ).toEqual([
      [1440, EstadoRecordatorio.PROGRAMADO, d('2026-10-13T18:00:00Z')],
      [120, EstadoRecordatorio.PROGRAMADO, d('2026-10-14T16:00:00Z')],
    ]);
  });

  describe('idempotencia', () => {
    it('reconciliar otra vez con lo insertado no decide nada', () => {
      // Arrange
      const existentes = comoFilas(decidir().insertar);

      // Act
      const segunda = decidir({ existentes });

      // Assert
      expect(segunda.anular).toEqual([]);
      expect(segunda.insertar).toEqual([]);
    });

    it('tampoco horas después, cuando el de 24 h ya salió', () => {
      // Arrange
      const existentes = comoFilas(decidir().insertar);
      existentes[0].estado = EstadoRecordatorio.ENVIADO;

      // Act
      const despues = decidir({ existentes, ahora: d('2026-10-13T19:00:00Z') });

      // Assert
      expect(despues).toMatchObject({ anular: [], insertar: [] });
    });

    it('ni con un tardío ya insertado, aunque ahora haya cambiado', () => {
      // Arrange — creada 90 min antes: sale un tardío
      const primera = decidir({ ahora: d('2026-10-14T16:30:00Z') });
      const existentes = comoFilas(primera.insertar);

      // Act
      const segunda = decidir({ existentes, ahora: d('2026-10-14T16:40:00Z') });

      // Assert
      expect(primera.insertar).toHaveLength(2);
      expect(segunda).toMatchObject({ anular: [], insertar: [] });
    });
  });

  it('reagendada: anula los del inicio anterior (reprogramado) y programa los del nuevo', () => {
    // Arrange
    const existentes = comoFilas(decidir().insertar);
    const nuevoInicio = d('2026-10-15T18:00:00Z');

    // Act
    const decision = decidir({
      cita: { ...CITA, inicio: nuevoInicio },
      existentes,
    });

    // Assert
    expect(decision.motivoAnulacion).toBe(MotivoRecordatorio.REPROGRAMADO);
    expect(decision.anular.sort()).toEqual(existentes.map((e) => e.id).sort());
    expect(decision.insertar.map((n) => n.inicioCita)).toEqual([
      nuevoInicio,
      nuevoInicio,
    ]);
  });

  it('reagendada a una hora que el silencio adelanta a la misma programadoPara: igual se reprograma', () => {
    // Arrange — 12 h antes de 09:00 y de 09:30 caen ambas a las 20:59
    const config = { ...CONFIG, antelacionesMin: [720] };
    const cita = { ...CITA, inicio: d('2026-10-14T12:00:00Z') };
    const existentes = comoFilas(
      decidir({ cita, configuracion: config }).insertar,
    );
    const movida = { ...cita, inicio: d('2026-10-14T12:30:00Z') };

    // Act
    const decision = decidir({
      cita: movida,
      configuracion: config,
      existentes,
    });

    // Assert
    expect(decision.insertar[0].programadoPara).toEqual(
      existentes[0].programadoPara,
    );
    expect(decision.anular).toEqual([existentes[0].id]);
    expect(decision.insertar[0].inicioCita).toEqual(movida.inicio);
  });

  it.each([
    ['cancelada (no vigente)', { ...CITA, vigente: false }],
    ['inexistente en el tenant', null],
  ])(
    'cita %s: anula los programados (cita_terminal) y no toca los enviados',
    (_caso, cita) => {
      // Arrange
      const existentes = comoFilas(decidir().insertar);
      existentes[0].estado = EstadoRecordatorio.ENVIADO;

      // Act
      const decision = decidir({ cita, existentes });

      // Assert
      expect(decision).toEqual({
        anular: [existentes[1].id],
        motivoAnulacion: MotivoRecordatorio.CITA_TERMINAL,
        insertar: [],
      });
    },
  );

  it('configuración apagada: anula los programados (desactivado)', () => {
    // Arrange
    const existentes = comoFilas(decidir().insertar);

    // Act
    const decision = decidir({
      configuracion: { ...CONFIG, activo: false },
      existentes,
    });

    // Assert
    expect(decision.motivoAnulacion).toBe(MotivoRecordatorio.DESACTIVADO);
    expect(decision.anular).toHaveLength(2);
    expect(decision.insertar).toEqual([]);
  });

  it('cambian los momentos: conserva el que sigue, anula el que sobra e inserta el nuevo', () => {
    // Arrange
    const existentes = comoFilas(decidir().insertar); // 1440 y 120

    // Act
    const decision = decidir({
      configuracion: { ...CONFIG, antelacionesMin: [1440, 60] },
      existentes,
    });

    // Assert
    expect(decision.anular).toEqual([existentes[1].id]); // el de 120
    expect(decision.insertar.map((n) => n.antelacionMin)).toEqual([60]);
  });

  it('dentro del margen: solo anula los de un inicio anterior; los del actual siguen su curso', () => {
    // Arrange
    const delInicioActual = comoFilas(decidir().insertar);
    const deOtroInicio = comoFilas(
      decidir({ cita: { ...CITA, inicio: d('2026-10-14T15:00:00Z') } })
        .insertar,
    );

    // Act — 20 min antes de la cita
    const decision = decidir({
      existentes: [...delInicioActual, ...deOtroInicio],
      ahora: d('2026-10-14T17:40:00Z'),
    });

    // Assert
    expect(decision.anular.sort()).toEqual(
      deOtroInicio.map((e) => e.id).sort(),
    );
    expect(decision.insertar).toEqual([]);
  });

  it('un tipo ya resuelto con otra hora planificada no se vuelve a insertar', () => {
    // Arrange — el de 2 h salió a otra hora (p. ej. con otro silencio global)
    const [r24, r2] = comoFilas(decidir().insertar);
    r2.programadoPara = d('2026-10-14T15:30:00Z');
    r2.estado = EstadoRecordatorio.ENTREGADO;

    // Act
    const decision = decidir({ existentes: [r24, r2] });

    // Assert
    expect(decision).toMatchObject({ anular: [], insertar: [] });
  });

  it('un programado del mismo tipo con otra hora planificada se reemplaza', () => {
    // Arrange
    const [r24, r2] = comoFilas(decidir().insertar);
    r2.programadoPara = d('2026-10-14T15:30:00Z');

    // Act
    const decision = decidir({ existentes: [r24, r2] });

    // Assert
    expect(decision.anular).toEqual([r2.id]);
    expect(decision.insertar.map((n) => n.programadoPara)).toEqual([
      d('2026-10-14T16:00:00Z'),
    ]);
  });

  it('los cancelados no se ven (listarVigentesDeCita no los trae): volver a la hora original reinserta', () => {
    // Arrange — sin existentes vivos para este inicio
    // Act
    const decision = decidir({ existentes: [] });

    // Assert
    expect(decision.insertar).toHaveLength(2);
  });
});
