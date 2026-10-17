import { Cita, EstadoCita } from '../../cita/domain/cita.entity';
import { accionesPermitidasPaciente } from './acciones-paciente';

describe('accionesPermitidasPaciente (portal del paciente, Fase 3)', () => {
  const INICIO = new Date('2026-10-20T13:00:00.000Z');
  const ANTES = new Date('2026-10-20T12:59:59.999Z');

  const cita = (estado: EstadoCita, inicio: Date = INICIO): Cita =>
    Cita.reconstituir({
      id: 'cita-1',
      inicio,
      duracionMin: 45,
      tipoConsulta: 'Control',
      estado,
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      usuarioId: 'usuario-1',
      creadoEn: new Date('2026-10-01T00:00:00Z'),
      actualizadoEn: new Date('2026-10-01T00:00:00Z'),
    });

  describe('sin petición de otra hora abierta', () => {
    it('pendiente → confirmar, cancelar y pedirOtraHora (en ese orden)', () => {
      expect(
        accionesPermitidasPaciente(cita(EstadoCita.PENDIENTE), false, ANTES),
      ).toEqual(['confirmar', 'cancelar', 'pedirOtraHora']);
    });

    it('confirmada → cancelar y pedirOtraHora (ya no se confirma)', () => {
      expect(
        accionesPermitidasPaciente(cita(EstadoCita.CONFIRMADA), false, ANTES),
      ).toEqual(['cancelar', 'pedirOtraHora']);
    });
  });

  describe('con una petición de otra hora abierta (R6)', () => {
    it.each([EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA])(
      '%s → solo cancelar',
      (estado) => {
        expect(accionesPermitidasPaciente(cita(estado), true, ANTES)).toEqual([
          'cancelar',
        ]);
      },
    );
  });

  describe.each([true, false])('terminal (petición abierta: %s)', (abierta) => {
    it.each([
      EstadoCita.CANCELADA,
      EstadoCita.ASISTIO,
      EstadoCita.NO_ASISTIO,
      EstadoCita.GHOSTING,
    ])('%s → ninguna', (estado) => {
      expect(accionesPermitidasPaciente(cita(estado), abierta, ANTES)).toEqual(
        [],
      );
    });
  });

  describe('nada desde el inicio (ahora < inicio estricto)', () => {
    it.each([
      ['exactamente en el inicio', INICIO],
      ['después del inicio', new Date('2026-10-20T14:00:00.000Z')],
    ])('%s → ninguna, aunque esté pendiente', (_caso, ahora) => {
      expect(
        accionesPermitidasPaciente(cita(EstadoCita.PENDIENTE), false, ahora),
      ).toEqual([]);
    });

    it('usa el inicio VIGENTE: una cita reagendada más tarde vuelve a permitir', () => {
      // Arrange — reagendada de las 13:00 a las 18:00
      const reagendada = cita(EstadoCita.PENDIENTE);
      reagendada.reagendar(new Date('2026-10-20T18:00:00.000Z'));

      // Assert
      expect(
        accionesPermitidasPaciente(
          reagendada,
          false,
          new Date('2026-10-20T14:00:00.000Z'),
        ),
      ).toEqual(['confirmar', 'cancelar', 'pedirOtraHora']);
    });
  });

  it('es pura: no cambia la cita', () => {
    // Arrange
    const c = cita(EstadoCita.PENDIENTE);

    // Act
    accionesPermitidasPaciente(c, false, ANTES);

    // Assert
    expect(c.estado).toBe(EstadoCita.PENDIENTE);
    expect(c.inicio).toEqual(INICIO);
  });
});
