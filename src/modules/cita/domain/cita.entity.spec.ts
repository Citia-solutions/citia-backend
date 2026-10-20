import {
  AccionCita,
  Cita,
  CrearCitaProps,
  DURACION_MAXIMA_MIN,
  ESTADOS_VIGENTES,
  EstadoCita,
  OrigenCita,
  ReconstituirCitaProps,
} from './cita.entity';
import { CitaAunNoComienzaError } from './exceptions/cita-aun-no-comienza.error';
import { TransicionEstadoInvalidaError } from './exceptions/transicion-estado-invalida.error';

/**
 * Reloj posterior a TODAS las citas de este archivo: las pruebas de estado no
 * dependen de la guarda de la hora (US-07.01), que tiene sus propias pruebas
 * en "guarda de la hora".
 */
const TRAS_TODO = new Date('2027-01-01T00:00:00Z');

describe('Cita (dominio)', () => {
  const baseProps: CrearCitaProps = {
    inicio: new Date('2026-06-30T10:30:00Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
    origen: OrigenCita.MANUAL,
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
      expect(cita.origen).toBe(OrigenCita.MANUAL);
    });

    it('debería conservar el origen con que se crea (US-07.01)', () => {
      // Arrange & Act
      const cita = Cita.crear({
        ...baseProps,
        origen: OrigenCita.SOLICITUD_PUBLICA,
      });

      // Assert
      expect(cita.origen).toBe(OrigenCita.SOLICITUD_PUBLICA);
    });

    it('reconstituir debería repoblar el origen guardado (US-07.01)', () => {
      // Arrange & Act
      const cita = Cita.reconstituir({
        ...baseProps,
        id: 'cita-1',
        estado: EstadoCita.CONFIRMADA,
        origen: OrigenCita.SOLICITUD_PUBLICA,
        creadoEn: new Date('2026-06-01T00:00:00Z'),
        actualizadoEn: new Date('2026-06-01T00:00:00Z'),
      });

      // Assert
      expect(cita.origen).toBe(OrigenCita.SOLICITUD_PUBLICA);
      expect(cita.estado).toBe(EstadoCita.CONFIRMADA);
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
      cita.marcarAsistencia(TRAS_TODO);

      // Assert
      expect(cita.estado).toBe(EstadoCita.ASISTIO);
    });

    it('debería pasar de confirmada a no_asistio cuando el profesional marca inasistencia', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act
      cita.marcarInasistencia(TRAS_TODO);

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

    it('debería pasar de pendiente a ghosting cuando el job G1 la cierra', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act
      cita.marcarGhosting(TRAS_TODO);

      // Assert
      expect(cita.estado).toBe(EstadoCita.GHOSTING);
    });

    it('debería pasar de pendiente a asistio directo, sin confirmar antes (US-07.01)', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act
      cita.marcarAsistencia(TRAS_TODO);

      // Assert
      expect(cita.estado).toBe(EstadoCita.ASISTIO);
    });

    it('debería dejar en ghosting una pendiente cuando el profesional marca inasistencia (US-07.01)', () => {
      // Arrange
      const cita = Cita.crear(baseProps);

      // Act
      const destino = cita.marcarInasistencia(TRAS_TODO);

      // Assert — nunca confirmó y no llegó (ADR-04 §2)
      expect(destino).toBe(EstadoCita.GHOSTING);
      expect(cita.estado).toBe(EstadoCita.GHOSTING);
    });

    it('debería devolver no_asistio al marcar inasistencia sobre una confirmada', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.confirmar();

      // Act & Assert
      expect(cita.marcarInasistencia(TRAS_TODO)).toBe(EstadoCita.NO_ASISTIO);
    });
  });

  describe('guarda de la hora (US-07.01, H2)', () => {
    const INICIO = baseProps.inicio;
    const UN_MS_ANTES = new Date(INICIO.getTime() - 1);
    const confirmada = (): Cita => {
      const c = Cita.crear(baseProps);
      c.confirmar();
      return c;
    };

    it.each<[string, () => Cita]>([
      ['pendiente', () => Cita.crear(baseProps)],
      ['confirmada', confirmada],
    ])(
      'desde %s, a la hora EXACTA de inicio ya se puede marcar',
      (_estado, fabrica) => {
        expect(() =>
          fabrica().marcarAsistencia(new Date(INICIO.getTime())),
        ).not.toThrow();
        expect(() =>
          fabrica().marcarInasistencia(new Date(INICIO.getTime())),
        ).not.toThrow();
      },
    );

    it.each<[string, () => Cita]>([
      ['pendiente', () => Cita.crear(baseProps)],
      ['confirmada', confirmada],
    ])(
      'desde %s, un milisegundo antes lanza CitaAunNoComienzaError sin cambiar el estado',
      (_estado, fabrica) => {
        const cita = fabrica();
        const estado = cita.estado;

        expect(() => cita.marcarAsistencia(UN_MS_ANTES)).toThrow(
          CitaAunNoComienzaError,
        );
        expect(() => cita.marcarInasistencia(UN_MS_ANTES)).toThrow(
          CitaAunNoComienzaError,
        );
        expect(cita.estado).toBe(estado);
      },
    );

    it('marcarGhosting exige la hora y el estado pendiente', () => {
      expect(() => Cita.crear(baseProps).marcarGhosting(UN_MS_ANTES)).toThrow(
        CitaAunNoComienzaError,
      );
      expect(() => confirmada().marcarGhosting(TRAS_TODO)).toThrow(
        TransicionEstadoInvalidaError,
      );
    });

    it('una terminal responde TransicionEstadoInvalidaError aunque sea antes de su hora (primero el estado)', () => {
      // Arrange
      const cita = Cita.crear(baseProps);
      cita.cancelar();

      // Act & Assert
      expect(() => cita.marcarAsistencia(UN_MS_ANTES)).toThrow(
        TransicionEstadoInvalidaError,
      );
      expect(() => cita.marcarInasistencia(UN_MS_ANTES)).toThrow(
        TransicionEstadoInvalidaError,
      );
      expect(() => cita.marcarGhosting(UN_MS_ANTES)).toThrow(
        TransicionEstadoInvalidaError,
      );
    });

    it('el error tiene un mensaje fijo, sin ids ni horas', () => {
      expect(() => Cita.crear(baseProps).marcarAsistencia(UN_MS_ANTES)).toThrow(
        'La cita todavía no comienza: la asistencia y la inasistencia se marcan desde su hora de inicio',
      );
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
      expect(() => cita.marcarGhosting(TRAS_TODO)).toThrow(
        TransicionEstadoInvalidaError,
      );
    });

    describe('desde un estado terminal no sale ninguna transición', () => {
      // Fábrica que devuelve una cita ya en cada estado terminal.
      const enAsistio = (): Cita => {
        const c = Cita.crear(baseProps);
        c.confirmar();
        c.marcarAsistencia(TRAS_TODO);
        return c;
      };
      const enNoAsistio = (): Cita => {
        const c = Cita.crear(baseProps);
        c.confirmar();
        c.marcarInasistencia(TRAS_TODO);
        return c;
      };
      const enCancelada = (): Cita => {
        const c = Cita.crear(baseProps);
        c.cancelar();
        return c;
      };
      const enGhosting = (): Cita => {
        const c = Cita.crear(baseProps);
        c.marcarGhosting(TRAS_TODO);
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
        'una cita en estado "%s" debe rechazar marcarAsistencia(TRAS_TODO)',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.marcarAsistencia(TRAS_TODO)).toThrow(
            TransicionEstadoInvalidaError,
          );
        },
      );

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar marcarInasistencia(TRAS_TODO)',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.marcarInasistencia(TRAS_TODO)).toThrow(
            TransicionEstadoInvalidaError,
          );
        },
      );

      it.each(terminales)(
        'una cita en estado "%s" debe rechazar marcarGhosting(TRAS_TODO)',
        (_estado, fabrica) => {
          const cita = fabrica();
          expect(() => cita.marcarGhosting(TRAS_TODO)).toThrow(
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
      asistio.marcarAsistencia(TRAS_TODO);

      const noAsistio = Cita.crear(baseProps);
      noAsistio.confirmar();
      noAsistio.marcarInasistencia(TRAS_TODO);

      const ghosting = Cita.crear(baseProps);
      ghosting.marcarGhosting(TRAS_TODO);

      // Assert
      expect(cancelada.esTerminal()).toBe(true);
      expect(asistio.esTerminal()).toBe(true);
      expect(noAsistio.esTerminal()).toBe(true);
      expect(ghosting.esTerminal()).toBe(true);
    });
  });
});

describe('Cita.reagendar', () => {
  const props: CrearCitaProps = {
    inicio: new Date('2026-08-25T14:00:00Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
    origen: OrigenCita.MANUAL,
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
        c.marcarAsistencia(TRAS_TODO);
      },
    ],
    [
      'no_asistio',
      (c: Cita) => {
        c.confirmar();
        c.marcarInasistencia(TRAS_TODO);
      },
    ],
    ['ghosting', (c: Cita) => c.marcarGhosting(TRAS_TODO)],
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
  const props: CrearCitaProps = {
    inicio: new Date('2026-08-25T14:00:00Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
    origen: OrigenCita.MANUAL,
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

describe('Cita.accionesPermitidas(ahora) (US-02.08, US-07.01)', () => {
  const INICIO = new Date('2026-09-25T13:00:00Z');
  // Un milisegundo antes del inicio y a la hora exacta (ya se puede marcar).
  const ANTES = new Date(INICIO.getTime() - 1);
  const DESDE = new Date(INICIO.getTime());

  const enEstado = (estado: EstadoCita): Cita =>
    Cita.reconstituir({
      id: 'cita-1',
      inicio: INICIO,
      duracionMin: 30,
      tipoConsulta: 'Control',
      estado,
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      usuarioId: 'usuario-1',
      origen: OrigenCita.MANUAL,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

  it.each<[EstadoCita, AccionCita[], AccionCita[]]>([
    [
      EstadoCita.PENDIENTE,
      ['confirmar', 'cancelar', 'reagendar', 'editar'],
      [
        'confirmar',
        'cancelar',
        'reagendar',
        'asistencia',
        'inasistencia',
        'editar',
      ],
    ],
    [
      EstadoCita.CONFIRMADA,
      ['cancelar', 'reagendar', 'editar'],
      ['cancelar', 'reagendar', 'asistencia', 'inasistencia', 'editar'],
    ],
    [EstadoCita.CANCELADA, [], []],
    [EstadoCita.ASISTIO, [], []],
    [EstadoCita.NO_ASISTIO, [], []],
    [EstadoCita.GHOSTING, [], []],
  ])(
    'desde %s permite %j antes del inicio y %j desde el inicio',
    (estado, antes, desde) => {
      expect(enEstado(estado).accionesPermitidas(ANTES)).toEqual(antes);
      expect(enEstado(estado).accionesPermitidas(DESDE)).toEqual(desde);
    },
  );

  // Coherencia pregunta/transicion: lo que se anuncia como permitido NO lanza,
  // y lo que no se anuncia SI lanza (por el estado o por la hora). Protege
  // contra que ambas reglas diverjan, con el reloj antes y desde el inicio.
  const ejecutar = (ahora: Date): Record<AccionCita, (c: Cita) => unknown> => ({
    confirmar: (c) => c.confirmar(),
    cancelar: (c) => c.cancelar(),
    reagendar: (c) => c.reagendar(new Date('2026-09-26T13:00:00Z')),
    asistencia: (c) => c.marcarAsistencia(ahora),
    inasistencia: (c) => c.marcarInasistencia(ahora),
    editar: (c) => c.editar({ duracionMin: 45 }),
  });
  const todas: AccionCita[] = [
    'confirmar',
    'cancelar',
    'reagendar',
    'asistencia',
    'inasistencia',
    'editar',
  ];
  const casos = Object.values(EstadoCita).flatMap((estado) => [
    [estado, 'antes del inicio', ANTES] as const,
    [estado, 'desde el inicio', DESDE] as const,
  ]);

  it.each(casos)(
    'en %s y %s, accionesPermitidas coincide con las transiciones que no lanzan',
    (estado, _momento, ahora) => {
      const permitidas = enEstado(estado).accionesPermitidas(ahora);
      const operaciones = ejecutar(ahora);

      for (const accion of todas) {
        const cita = enEstado(estado);
        if (permitidas.includes(accion)) {
          expect(() => operaciones[accion](cita)).not.toThrow();
        } else {
          let error: unknown;
          try {
            operaciones[accion](cita);
          } catch (e) {
            error = e;
          }
          expect(
            error instanceof TransicionEstadoInvalidaError ||
              error instanceof CitaAunNoComienzaError,
          ).toBe(true);
        }
      }
    },
  );

  it('nunca anuncia ghosting', () => {
    for (const estado of Object.values(EstadoCita)) {
      expect(enEstado(estado).accionesPermitidas(DESDE)).not.toContain(
        'ghosting',
      );
    }
  });

  // Las pruebas de arriba parten de `reconstituir`. Estas recorren transiciones
  // reales: la respuesta debe seguir al estado vivo, no a una foto inicial.
  describe('sigue al estado tras cada transición', () => {
    it('debería volver a las acciones de pendiente cuando se reagenda una cita confirmada', () => {
      // Arrange — ya empezó: se puede marcar asistencia
      const cita = enEstado(EstadoCita.CONFIRMADA);
      expect(cita.accionesPermitidas(DESDE)).toContain('asistencia');

      // Act — se mueve al día siguiente
      cita.reagendar(new Date('2026-09-26T13:00:00Z'));

      // Assert: la confirmación era para otra hora; se puede volver a confirmar
      // y, como la hora VIGENTE todavía no llega, no se marca asistencia.
      expect(cita.accionesPermitidas(DESDE)).toEqual([
        'confirmar',
        'cancelar',
        'reagendar',
        'editar',
      ]);
    });

    it('debería quedar sin acciones cuando se cancela desde el voucher', () => {
      // Arrange
      const cita = enEstado(EstadoCita.CONFIRMADA);

      // Act
      cita.cancelar();

      // Assert
      expect(cita.accionesPermitidas(DESDE)).toEqual([]);
    });

    it('debería devolver un arreglo nuevo en cada llamada cuando el llamador lo muta', () => {
      // Arrange
      const cita = enEstado(EstadoCita.PENDIENTE);
      const primera = cita.accionesPermitidas(ANTES);

      // Act: un consumidor descuidado altera lo que recibió.
      primera.push('asistencia');

      // Assert: la entidad no comparte estado con el llamador.
      expect(cita.accionesPermitidas(ANTES)).toEqual([
        'confirmar',
        'cancelar',
        'reagendar',
        'editar',
      ]);
    });
  });
});

describe('Cita.fin y Cita.chocaCon (ADR-11)', () => {
  // Base: 10:00Z–10:50Z del profesional usuario-1 en tenant-1.
  const cita = (over: Partial<ReconstituirCitaProps> = {}): Cita =>
    Cita.reconstituir({
      id: 'cita-a',
      inicio: new Date('2026-09-22T10:00:00Z'),
      duracionMin: 50,
      tipoConsulta: 'Control',
      estado: EstadoCita.PENDIENTE,
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      usuarioId: 'usuario-1',
      origen: OrigenCita.MANUAL,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
      ...over,
    });

  it('exporta los estados vigentes y la duración máxima', () => {
    expect(ESTADOS_VIGENTES).toEqual([
      EstadoCita.PENDIENTE,
      EstadoCita.CONFIRMADA,
    ]);
    expect(DURACION_MAXIMA_MIN).toBe(1440);
  });

  it('fin = inicio + duracionMin', () => {
    expect(cita().fin.toISOString()).toBe('2026-09-22T10:50:00.000Z');
  });

  it('se cruza con otra vigente del mismo profesional que se intersecta', () => {
    const otra = cita({
      id: 'cita-b',
      inicio: new Date('2026-09-22T10:30:00Z'),
      estado: EstadoCita.CONFIRMADA,
    });
    expect(cita().chocaCon(otra)).toBe(true);
    expect(otra.chocaCon(cita())).toBe(true);
  });

  it('detecta una cita contenida dentro de otra', () => {
    const otra = cita({
      id: 'cita-b',
      inicio: new Date('2026-09-22T10:10:00Z'),
      duracionMin: 10,
    });
    expect(cita().chocaCon(otra)).toBe(true);
  });

  it('citas pegadas NO se cruzan (intervalo semiabierto)', () => {
    const despues = cita({
      id: 'cita-b',
      inicio: new Date('2026-09-22T10:50:00Z'),
    });
    const antes = cita({
      id: 'cita-c',
      inicio: new Date('2026-09-22T09:10:00Z'),
    });
    expect(cita().chocaCon(despues)).toBe(false);
    expect(cita().chocaCon(antes)).toBe(false);
  });

  it('una cita no choca consigo misma (misma instancia o mismo id)', () => {
    const a = cita();
    expect(a.chocaCon(a)).toBe(false);
    expect(a.chocaCon(cita())).toBe(false);
  });

  it('no choca con citas de otro profesional ni de otro tenant', () => {
    const inicio = new Date('2026-09-22T10:30:00Z');
    expect(
      cita().chocaCon(cita({ id: 'cita-b', inicio, usuarioId: 'usuario-2' })),
    ).toBe(false);
    expect(
      cita().chocaCon(cita({ id: 'cita-b', inicio, tenantId: 'tenant-2' })),
    ).toBe(false);
  });

  it.each([
    EstadoCita.CANCELADA,
    EstadoCita.ASISTIO,
    EstadoCita.NO_ASISTIO,
    EstadoCita.GHOSTING,
  ])('una cita %s no ocupa la agenda', (estado) => {
    const terminal = cita({
      id: 'cita-b',
      inicio: new Date('2026-09-22T10:30:00Z'),
      estado,
    });
    expect(cita().chocaCon(terminal)).toBe(false);
    expect(terminal.chocaCon(cita())).toBe(false);
  });
});
