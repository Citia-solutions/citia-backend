import { Cita, CrearCitaProps, EstadoCita } from './cita.entity';
import { TransicionEstadoInvalidaError } from './exceptions/transicion-estado-invalida.error';

describe('Cita (dominio)', () => {
  const baseProps: CrearCitaProps = {
    inicio: new Date('2026-06-30T10:30:00Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
  };

  describe('crear', () => {
    it('debería nacer en estado PENDIENTE cuando se crea una cita nueva', () => {
      // Arrange & Act
      const cita = Cita.crear(baseProps);

      // Assert
      expect(cita.estado).toBe(EstadoCita.PENDIENTE);
    });

    it('debería copiar los datos de props al crear la cita', () => {
      // Arrange & Act
      const cita = Cita.crear(baseProps);

      // Assert
      expect(cita.inicio).toBe(baseProps.inicio);
      expect(cita.duracionMin).toBe(baseProps.duracionMin);
      expect(cita.tipoConsulta).toBe(baseProps.tipoConsulta);
      expect(cita.tenantId).toBe(baseProps.tenantId);
      expect(cita.pacienteId).toBe(baseProps.pacienteId);
      expect(cita.usuarioId).toBe(baseProps.usuarioId);
    });

    it('una cita recién creada NO debe ser terminal', () => {
      // Arrange & Act
      const cita = Cita.crear(baseProps);

      // Assert
      expect(cita.esTerminal()).toBe(false);
    });
  });

  describe('transiciones válidas', () => {
    it('debería pasar de pendiente a confirmada cuando el paciente confirma', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act
      cita.confirmar();

      // Assert
      expect(cita.estado).toBe(EstadoCita.CONFIRMADA);
    });

    it('debería pasar de pendiente a cancelada cuando se cancela sin confirmar', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act
      cita.cancelar();

      // Assert
      expect(cita.estado).toBe(EstadoCita.CANCELADA);
    });

    it('debería pasar de confirmada a asistio cuando el profesional marca asistencia', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act
      cita.marcarAsistencia();

      // Assert
      expect(cita.estado).toBe(EstadoCita.ASISTIO);
    });

    it('debería pasar de confirmada a no_asistio cuando el profesional marca inasistencia', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act
      cita.marcarInasistencia();

      // Assert
      expect(cita.estado).toBe(EstadoCita.NO_ASISTIO);
    });

    it('debería pasar de confirmada a cancelada cuando se cancela una cita confirmada', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act
      cita.cancelar();

      // Assert
      expect(cita.estado).toBe(EstadoCita.CANCELADA);
    });

    it('debería pasar de pendiente a ghosting cuando llega el día sin confirmar', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act
      cita.marcarGhosting();

      // Assert
      expect(cita.estado).toBe(EstadoCita.GHOSTING);
    });
  });

  describe('transiciones ilegales (DoD: deben lanzar TransicionEstadoInvalidaError)', () => {
    it('debería lanzar TransicionEstadoInvalidaError al confirmar una cita cancelada', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.cancelar();

      // Act & Assert
      expect(() => cita.confirmar()).toThrow(TransicionEstadoInvalidaError);
    });

    it('debería lanzar TransicionEstadoInvalidaError al marcar asistencia sobre una cita pendiente (sin confirmar)', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act & Assert
      expect(() => cita.marcarAsistencia()).toThrow(
        TransicionEstadoInvalidaError,
      );
    });

    it('debería lanzar TransicionEstadoInvalidaError al marcar inasistencia sobre una cita pendiente', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act & Assert
      expect(() => cita.marcarInasistencia()).toThrow(
        TransicionEstadoInvalidaError,
      );
    });

    it('debería lanzar TransicionEstadoInvalidaError al confirmar dos veces (confirmar una ya confirmada)', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act & Assert
      expect(() => cita.confirmar()).toThrow(TransicionEstadoInvalidaError);
    });

    it('debería lanzar TransicionEstadoInvalidaError al marcar ghosting sobre una cita confirmada', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act & Assert
      expect(() => cita.marcarGhosting()).toThrow(
        TransicionEstadoInvalidaError,
      );
    });

    describe('desde un estado terminal no sale ninguna transición', () => {
      // Fábrica que devuelve una cita ya en cada estado terminal.
      const enAsistio = (): Cita => {
        const c = Cita.crear(baseProps);
        c.confirmar();
        c.marcarAsistencia();
        return c;
      };
      const enNoAsistio = (): Cita => {
        const c = Cita.crear(baseProps);
        c.confirmar();
        c.marcarInasistencia();
        return c;
      };
      const enCancelada = (): Cita => {
        const c = Cita.crear(baseProps);
        c.cancelar();
        return c;
      };
      const enGhosting = (): Cita => {
        const c = Cita.crear(baseProps);
        c.marcarGhosting();
        return c;
      };

      const terminales: Array<[string, () => Cita]> = [
        ['asistio', enAsistio],
        ['no_asistio', enNoAsistio],
        ['cancelada', enCancelada],
        ['ghosting', enGhosting],
      ];

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar confirmar()',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.confirmar()).toThrow(TransicionEstadoInvalidaError);
        },
      );

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar cancelar()',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.cancelar()).toThrow(TransicionEstadoInvalidaError);
        },
      );

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar marcarAsistencia()',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.marcarAsistencia()).toThrow(
            TransicionEstadoInvalidaError,
          );
        },
      );

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar marcarInasistencia()',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.marcarInasistencia()).toThrow(
            TransicionEstadoInvalidaError,
          );
        },
      );

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar marcarGhosting()',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.marcarGhosting()).toThrow(
            TransicionEstadoInvalidaError,
          );
        },
      );
    });

    it('el error de transición ilegal debe describir el estado origen y el evento', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.cancelar();

      // Act & Assert
      expect(() => cita.confirmar()).toThrow(
        /no se puede aplicar "confirmar" desde el estado "cancelada"/,
      );
    });
  });

  describe('esTerminal', () => {
    it('debería ser false para estados no terminales (pendiente, confirmada)', () => {
      // Arrange
      const pendiente = Cita.crear(baseProps);
      const confirmada = Cita.crear(baseProps);
      confirmada.confirmar();

      // Assert
      expect(pendiente.esTerminal()).toBe(false);
      expect(confirmada.esTerminal()).toBe(false);
    });

    it('debería ser true para estados terminales (cancelada, asistio, no_asistio, ghosting)', () => {
      // Arrange
      const cancelada = Cita.crear(baseProps);
      cancelada.cancelar();

      const asistio = Cita.crear(baseProps);
      asistio.confirmar();
      asistio.marcarAsistencia();

      const noAsistio = Cita.crear(baseProps);
      noAsistio.confirmar();
      noAsistio.marcarInasistencia();

      const ghosting = Cita.crear(baseProps);
      ghosting.marcarGhosting();

      // Assert
      expect(cancelada.esTerminal()).toBe(true);
      expect(asistio.esTerminal()).toBe(true);
      expect(noAsistio.esTerminal()).toBe(true);
      expect(ghosting.esTerminal()).toBe(true);
    });
  });
});
