import { AccionCita, Cita, CrearCitaProps, EstadoCita } from './cita.entity';
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

describe('Cita.reagendar', () => {
  const props = {
    inicio: new Date('2026-08-25T14:00:00Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
  };
  const NUEVA_HORA = new Date('2026-08-26T16:00:00Z');

  it('mueve el inicio conservando la identidad de la cita', () => {
    const cita = Cita.crear(props);

    cita.reagendar(NUEVA_HORA);

    expect(cita.inicio).toEqual(NUEVA_HORA);
    // NO se crea otra cita: mismos paciente, profesional y organización.
    expect(cita.pacienteId).toBe('paciente-1');
    expect(cita.usuarioId).toBe('usuario-1');
    expect(cita.tenantId).toBe('tenant-1');
  });

  it('deja en pendiente una cita que estaba pendiente', () => {
    const cita = Cita.crear(props);

    cita.reagendar(NUEVA_HORA);

    expect(cita.estado).toBe(EstadoCita.PENDIENTE);
  });

  it('DEVUELVE a pendiente una cita ya confirmada: la confirmación era para otra hora', () => {
    const cita = Cita.crear(props);
    cita.confirmar();
    expect(cita.estado).toBe(EstadoCita.CONFIRMADA);

    cita.reagendar(NUEVA_HORA);

    expect(cita.estado).toBe(EstadoCita.PENDIENTE);
  });

  it.each([
    ['cancelada', (c: Cita) => c.cancelar()],
    [
      'asistio',
      (c: Cita) => {
        c.confirmar();
        c.marcarAsistencia();
      },
    ],
    [
      'no_asistio',
      (c: Cita) => {
        c.confirmar();
        c.marcarInasistencia();
      },
    ],
    ['ghosting', (c: Cita) => c.marcarGhosting()],
  ])('rechaza reagendar desde el estado terminal %s', (_estado, llevarA) => {
    const cita = Cita.crear(props);
    llevarA(cita);

    expect(() => cita.reagendar(NUEVA_HORA)).toThrow(
      TransicionEstadoInvalidaError,
    );
  });

  it('no toca el inicio cuando la transición es ilegal', () => {
    const cita = Cita.crear(props);
    cita.cancelar();

    expect(() => cita.reagendar(NUEVA_HORA)).toThrow();
    expect(cita.inicio).toEqual(props.inicio);
  });
});

describe('Cita.editar', () => {
  const props = {
    inicio: new Date('2026-08-25T14:00:00Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
  };

  it('cambia duración y tipo sin tocar el estado ni el inicio', () => {
    const cita = Cita.crear(props);
    cita.confirmar();

    cita.editar({ duracionMin: 60, tipoConsulta: 'Primera consulta' });

    expect(cita.duracionMin).toBe(60);
    expect(cita.tipoConsulta).toBe('Primera consulta');
    // Editar NO cambia el compromiso: ni el estado ni la hora se mueven.
    expect(cita.estado).toBe(EstadoCita.CONFIRMADA);
    expect(cita.inicio).toEqual(props.inicio);
  });

  it('deja intacto lo que no se envía', () => {
    const cita = Cita.crear(props);

    cita.editar({ duracionMin: 45 });

    expect(cita.duracionMin).toBe(45);
    expect(cita.tipoConsulta).toBe('Control');
  });

  it('rechaza editar una cita terminal', () => {
    const cita = Cita.crear(props);
    cita.cancelar();

    expect(() => cita.editar({ duracionMin: 60 })).toThrow(
      TransicionEstadoInvalidaError,
    );
  });
});

describe('Cita.accionesPermitidas (US-02.08)', () => {
  const enEstado = (estado: EstadoCita): Cita =>
    Cita.reconstituir({
      id: 'cita-1',
      inicio: new Date('2026-09-25T13:00:00Z'),
      duracionMin: 30,
      tipoConsulta: 'Control',
      estado,
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      usuarioId: 'usuario-1',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

  it.each<[EstadoCita, AccionCita[]]>([
    [EstadoCita.PENDIENTE, ['confirmar', 'cancelar', 'reagendar', 'editar']],
    [
      EstadoCita.CONFIRMADA,
      ['cancelar', 'reagendar', 'asistencia', 'inasistencia', 'editar'],
    ],
    [EstadoCita.CANCELADA, []],
    [EstadoCita.ASISTIO, []],
    [EstadoCita.NO_ASISTIO, []],
    [EstadoCita.GHOSTING, []],
  ])('desde %s permite exactamente %j', (estado, esperadas) => {
    expect(enEstado(estado).accionesPermitidas()).toEqual(esperadas);
  });

  // Coherencia pregunta/transicion: lo que se anuncia como permitido NO lanza,
  // y lo que no se anuncia SI lanza. Protege contra que ambas reglas diverjan.
  const ejecutar: Record<AccionCita, (c: Cita) => void> = {
    confirmar: (c) => c.confirmar(),
    cancelar: (c) => c.cancelar(),
    reagendar: (c) => c.reagendar(new Date('2026-09-26T13:00:00Z')),
    asistencia: (c) => c.marcarAsistencia(),
    inasistencia: (c) => c.marcarInasistencia(),
    editar: (c) => c.editar({ duracionMin: 45 }),
  };
  const todas = Object.keys(ejecutar) as AccionCita[];

  it.each(Object.values(EstadoCita))(
    'en %s, accionesPermitidas coincide con las transiciones que no lanzan',
    (estado) => {
      const permitidas = enEstado(estado).accionesPermitidas();

      for (const accion of todas) {
        const cita = enEstado(estado);
        if (permitidas.includes(accion)) {
          expect(() => ejecutar[accion](cita)).not.toThrow();
        } else {
          expect(() => ejecutar[accion](cita)).toThrow(
            TransicionEstadoInvalidaError,
          );
        }
      }
    },
  );

  it('nunca anuncia ghosting', () => {
    for (const estado of Object.values(EstadoCita)) {
      expect(enEstado(estado).accionesPermitidas()).not.toContain('ghosting');
    }
  });

  // Las pruebas de arriba parten de `reconstituir`. Estas recorren transiciones
  // reales: la respuesta debe seguir al estado vivo, no a una foto inicial.
  describe('sigue al estado tras cada transición', () => {
    const accionesDePendiente = enEstado(
      EstadoCita.PENDIENTE,
    ).accionesPermitidas();

    it('debería volver a las acciones de pendiente cuando se reagenda una cita confirmada', () => {
      // Arrange
      const cita = enEstado(EstadoCita.CONFIRMADA);
      expect(cita.accionesPermitidas()).toContain('asistencia');

      // Act
      cita.reagendar(new Date('2026-09-26T13:00:00Z'));

      // Assert: la confirmación era para otra hora; se puede volver a confirmar
      // y ya no se puede marcar asistencia.
      expect(cita.accionesPermitidas()).toEqual(accionesDePendiente);
      expect(cita.accionesPermitidas()).toContain('confirmar');
      expect(cita.accionesPermitidas()).not.toContain('asistencia');
      expect(cita.accionesPermitidas()).not.toContain('inasistencia');
    });

    it('debería quedar sin acciones cuando se cancela desde el voucher', () => {
      // Arrange
      const cita = enEstado(EstadoCita.CONFIRMADA);

      // Act
      cita.cancelar();

      // Assert
      expect(cita.accionesPermitidas()).toEqual([]);
    });

    it('debería devolver un arreglo nuevo en cada llamada cuando el llamador lo muta', () => {
      // Arrange
      const cita = enEstado(EstadoCita.PENDIENTE);
      const primera = cita.accionesPermitidas();

      // Act: un consumidor descuidado altera lo que recibió.
      primera.push('asistencia');

      // Assert: la entidad no comparte estado con el llamador.
      expect(cita.accionesPermitidas()).toEqual(accionesDePendiente);
    });
  });
});
