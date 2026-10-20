import { EventoEntregado } from '../../../shared/application/suscriptor-eventos';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../domain/solicitud-cita.entity';
import { EventoSolicitudInvalidoError } from './evento-solicitud-invalido.error';
import { SuscriptorSolicitudes } from './suscriptor-solicitudes';

/**
 * Doble del repositorio con la semántica que importa aquí: la búsqueda "para
 * actualizar" devuelve SOLO la de reagendamiento `recibida` de la cita y del
 * tenant (como el adaptador, con `FOR UPDATE`), y `guardar` la persiste. Así
 * se prueba la idempotencia de verdad: repetir el hecho no encuentra nada.
 */
class RepositorioDeSolicitudes {
  readonly filas = new Map<string, SolicitudCita>();
  readonly guardadas: [SolicitudCita, unknown][] = [];
  readonly busquedas: [string, string, unknown][] = [];

  buscarReagendamientoAbiertoParaActualizar = jest.fn(
    (citaOrigenId: string, tenantId: string, tx: unknown) => {
      this.busquedas.push([citaOrigenId, tenantId, tx]);
      const s = [...this.filas.values()].find(
        (x) =>
          x.citaOrigenId === citaOrigenId &&
          x.tenantId === tenantId &&
          x.esReagendamiento() &&
          x.estado === EstadoSolicitud.RECIBIDA,
      );
      return Promise.resolve(s ? clonar(s) : null);
    },
  );

  guardar = jest.fn((s: SolicitudCita, tx: unknown) => {
    this.guardadas.push([s, tx]);
    this.filas.set(s.id, clonar(s));
    return Promise.resolve(s);
  });

  // El resto del puerto no se usa.
  buscarAbiertaPorRut = jest.fn();
  buscarPorId = jest.fn();
  buscarPorIdParaActualizar = jest.fn();
  buscarReagendamientoAbierto = jest.fn();
  listarPorEstado = jest.fn();
}

function clonar(s: SolicitudCita): SolicitudCita {
  return SolicitudCita.reconstituir({ ...s, estado: s.estado });
}

describe('SuscriptorSolicitudes (outbox, Fase 3)', () => {
  const TX = { soy: 'tx-del-despachador' };
  const TENANT = 'tenant-1';
  const CITA = '0c1a0000-0000-4000-8000-000000000001';
  const ENLACE = 'e1000000-0000-4000-8000-000000000002';
  const PROFESIONAL = 'usuario-profesional';
  const RECIBIDA_EN = new Date('2026-10-15T10:00:00.000Z');
  const AHORA = new Date('2026-10-15T12:00:00.000Z');

  let repo: RepositorioDeSolicitudes;
  let suscriptor: SuscriptorSolicitudes;

  const pedida = (
    citaOrigenId = CITA,
    tenantId = TENANT,
    recibidaEn = RECIBIDA_EN,
    id = 'sol-1',
  ): SolicitudCita => {
    const s = SolicitudCita.pedirOtraHora({
      tenantId,
      citaOrigenId,
      enlaceId: ENLACE,
      usuarioId: 'duenio',
      rut: null,
      nombrePaciente: 'Paciente Secreto',
      telefono: '+56 9 0000 0000',
      correo: null,
      consentimiento: true,
      preferenciaHoraria: 'tardes',
    });
    s.id = id;
    s.recibidaEn = recibidaEn;
    return s;
  };

  const sembrar = (s: SolicitudCita): void => {
    repo.filas.set(s.id, clonar(s));
  };

  const hecho = (
    nombre: string,
    payload: Record<string, unknown> = {},
    extra: Partial<EventoEntregado> = {},
  ): EventoEntregado => ({
    id: 'evento-1',
    nombre,
    // El profesional reagendó DESPUÉS de que el paciente pidiera otra hora.
    ocurridoEn: new Date('2026-10-15T11:00:00.000Z'),
    tenantId: TENANT,
    payload: {
      citaId: CITA,
      pacienteId: 'paciente-1',
      usuarioId: 'duenio',
      estado: 'cancelada',
      inicio: new Date('2026-10-20T13:00:00.000Z'),
      inicioAnterior: null,
      actor: { tipo: 'profesional', id: PROFESIONAL },
      ...payload,
    },
    ...extra,
  });

  const estadoDe = (id = 'sol-1'): EstadoSolicitud | undefined =>
    repo.filas.get(id)?.estado;

  beforeEach(() => {
    repo = new RepositorioDeSolicitudes();
    suscriptor = new SuscriptorSolicitudes(repo, () => AHORA);
  });

  it('debería escuchar CitaCancelada, CitaAsistida, CitaNoAsistida y CitaReagendada', () => {
    expect([...suscriptor.eventos].sort()).toEqual(
      [
        'CitaAsistida',
        'CitaCancelada',
        'CitaNoAsistida',
        'CitaReagendada',
      ].sort(),
    );
  });

  // ---------------------------------------------------------------------
  describe.each(['CitaCancelada', 'CitaAsistida', 'CitaNoAsistida'])(
    '%s → descarta la petición abierta',
    (nombre) => {
      it('debería dejarla descartada (resueltaEn = ahora), con FOR UPDATE y el tx recibido', async () => {
        // Arrange
        sembrar(pedida());

        // Act
        await suscriptor.manejar(hecho(nombre), TX);

        // Assert
        expect(repo.busquedas).toEqual([[CITA, TENANT, TX]]);
        expect(repo.guardadas).toHaveLength(1);
        expect(repo.guardadas[0][1]).toBe(TX);
        const s = repo.filas.get('sol-1')!;
        expect(s.estado).toBe(EstadoSolicitud.DESCARTADA);
        expect(s.resueltaEn).toEqual(AHORA);
        // El sistema la descarta: no cambia el dueño ni la cita
        expect(s.usuarioId).toBe('duenio');
        expect(s.citaId).toBeNull();
      });

      it('debería ser idempotente: repetir el hecho no cambia nada', async () => {
        // Arrange
        sembrar(pedida());
        await suscriptor.manejar(hecho(nombre), TX);

        // Act
        await suscriptor.manejar(hecho(nombre), TX);

        // Assert
        expect(repo.guardadas).toHaveLength(1);
        expect(estadoDe()).toBe(EstadoSolicitud.DESCARTADA);
      });

      it('no debería hacer nada sin una petición abierta', async () => {
        // Act
        await suscriptor.manejar(hecho(nombre), TX);

        // Assert
        expect(repo.guardadas).toHaveLength(0);
      });

      it('no debería tocar la petición de otra cita ni la de otro tenant', async () => {
        // Arrange
        sembrar(pedida('otra-cita', TENANT, RECIBIDA_EN, 'sol-otra-cita'));
        sembrar(pedida(CITA, 'otro-tenant', RECIBIDA_EN, 'sol-otro-tenant'));

        // Act
        await suscriptor.manejar(hecho(nombre), TX);

        // Assert
        expect(estadoDe('sol-otra-cita')).toBe(EstadoSolicitud.RECIBIDA);
        expect(estadoDe('sol-otro-tenant')).toBe(EstadoSolicitud.RECIBIDA);
      });

      it('debería descartar aunque el actor sea el paciente o el sistema', async () => {
        // Arrange
        sembrar(pedida());

        // Act
        await suscriptor.manejar(
          hecho(nombre, { actor: { tipo: 'paciente', id: ENLACE } }),
          TX,
        );

        // Assert
        expect(estadoDe()).toBe(EstadoSolicitud.DESCARTADA);
      });
    },
  );

  // ---------------------------------------------------------------------
  // US-07.01 (H8): ningún hecho nuevo. La inasistencia sobre una `pendiente`
  // (del profesional) y el cierre del job G1 (del sistema, `id: null`)
  // publican `CitaNoAsistida` con `estado: 'ghosting'`: la petición abierta se
  // descarta igual que con `no_asistio`.
  describe('CitaNoAsistida con estado ghosting (US-07.01)', () => {
    it.each<[string, Record<string, unknown>]>([
      [
        'del profesional (inasistencia sobre una pendiente)',
        { tipo: 'profesional', id: PROFESIONAL },
      ],
      ['del sistema (job G1, id nulo)', { tipo: 'sistema', id: null }],
    ])(
      '%s → descarta la petición abierta con el tx recibido',
      async (_caso, actor) => {
        // Arrange
        sembrar(pedida());

        // Act
        await suscriptor.manejar(
          hecho('CitaNoAsistida', { estado: 'ghosting', actor }),
          TX,
        );

        // Assert
        expect(repo.busquedas).toEqual([[CITA, TENANT, TX]]);
        expect(repo.guardadas).toHaveLength(1);
        expect(repo.guardadas[0][1]).toBe(TX);
        const s = repo.filas.get('sol-1')!;
        expect(s.estado).toBe(EstadoSolicitud.DESCARTADA);
        expect(s.resueltaEn).toEqual(AHORA);
        // La descarta el sistema: ni el dueño ni la cita cambian
        expect(s.usuarioId).toBe('duenio');
        expect(s.citaId).toBeNull();
      },
    );

    it('del sistema con actor.id nulo NO es un hecho inválido (a diferencia de CitaReagendada del profesional sin id)', async () => {
      // Arrange
      sembrar(pedida());

      // Act & Assert
      await expect(
        suscriptor.manejar(
          hecho('CitaNoAsistida', {
            estado: 'ghosting',
            actor: { tipo: 'sistema', id: null },
          }),
          TX,
        ),
      ).resolves.toBeUndefined();
      expect(estadoDe()).toBe(EstadoSolicitud.DESCARTADA);
    });

    it('tiene el mismo efecto que un CitaNoAsistida con estado no_asistio', async () => {
      // Arrange — dos peticiones abiertas, una por cita
      const OTRA = '0c1a0000-0000-4000-8000-000000000099';
      sembrar(pedida());
      sembrar(pedida(OTRA, TENANT, RECIBIDA_EN, 'sol-otra'));

      // Act
      await suscriptor.manejar(
        hecho('CitaNoAsistida', {
          estado: 'ghosting',
          actor: { tipo: 'sistema', id: null },
        }),
        TX,
      );
      await suscriptor.manejar(
        hecho('CitaNoAsistida', { citaId: OTRA, estado: 'no_asistio' }),
        TX,
      );

      // Assert
      expect(estadoDe('sol-1')).toBe(EstadoSolicitud.DESCARTADA);
      expect(estadoDe('sol-otra')).toBe(EstadoSolicitud.DESCARTADA);
      expect(repo.filas.get('sol-1')?.resueltaEn).toEqual(
        repo.filas.get('sol-otra')?.resueltaEn,
      );
    });

    it('repetir el hecho del job no cambia nada (idempotente)', async () => {
      // Arrange
      sembrar(pedida());
      const delJob = hecho('CitaNoAsistida', {
        estado: 'ghosting',
        actor: { tipo: 'sistema', id: null },
      });
      await suscriptor.manejar(delJob, TX);

      // Act
      await suscriptor.manejar(delJob, TX);

      // Assert
      expect(repo.guardadas).toHaveLength(1);
      expect(estadoDe()).toBe(EstadoSolicitud.DESCARTADA);
    });

    it('sin petición abierta no hace nada', async () => {
      // Act
      await suscriptor.manejar(
        hecho('CitaNoAsistida', {
          estado: 'ghosting',
          actor: { tipo: 'sistema', id: null },
        }),
        TX,
      );

      // Assert
      expect(repo.guardadas).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  describe('CitaReagendada', () => {
    it('del profesional → la petición abierta queda ATENDIDA (aceptada por quien reagendó, citaId = la cita)', async () => {
      // Arrange
      sembrar(pedida());

      // Act
      await suscriptor.manejar(
        hecho('CitaReagendada', { estado: 'pendiente' }),
        TX,
      );

      // Assert
      expect(repo.busquedas).toEqual([[CITA, TENANT, TX]]);
      expect(repo.guardadas[0][1]).toBe(TX);
      const s = repo.filas.get('sol-1')!;
      expect(s.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(s.usuarioId).toBe(PROFESIONAL);
      expect(s.citaId).toBe(CITA);
      expect(s.resueltaEn).toEqual(AHORA);
    });

    it('debería ser idempotente (repetir el hecho no cambia nada)', async () => {
      // Arrange
      sembrar(pedida());
      await suscriptor.manejar(hecho('CitaReagendada'), TX);

      // Act
      await suscriptor.manejar(hecho('CitaReagendada'), TX);

      // Assert
      expect(repo.guardadas).toHaveLength(1);
      expect(estadoDe()).toBe(EstadoSolicitud.ACEPTADA);
    });

    it('no-op si la bandeja ya la aceptó en el mismo tx (no queda ninguna abierta)', async () => {
      // Arrange — aceptada en la bandeja, que reagendó en ese mismo tx
      const s = pedida();
      s.aceptar('quien-acepto', CITA, new Date('2026-10-15T11:00:00.000Z'));
      sembrar(s);

      // Act
      await suscriptor.manejar(hecho('CitaReagendada'), TX);

      // Assert
      expect(repo.guardadas).toHaveLength(0);
      expect(repo.filas.get('sol-1')?.usuarioId).toBe('quien-acepto');
    });

    it('no debería atender una petición recibida DESPUÉS de reagendar (la decide la bandeja)', async () => {
      // Arrange — pedida a las 11:30, el hecho ocurrió a las 11:00
      sembrar(pedida(CITA, TENANT, new Date('2026-10-15T11:30:00.000Z')));

      // Act
      await suscriptor.manejar(hecho('CitaReagendada'), TX);

      // Assert
      expect(repo.guardadas).toHaveLength(0);
      expect(estadoDe()).toBe(EstadoSolicitud.RECIBIDA);
    });

    it('debería atender una recibida en el MISMO instante del hecho', async () => {
      // Arrange
      const instante = new Date('2026-10-15T11:00:00.000Z');
      sembrar(pedida(CITA, TENANT, instante));

      // Act
      await suscriptor.manejar(
        hecho('CitaReagendada', {}, { ocurridoEn: instante }),
        TX,
      );

      // Assert
      expect(estadoDe()).toBe(EstadoSolicitud.ACEPTADA);
    });

    it.each<[string, unknown]>([
      ['del paciente', { tipo: 'paciente', id: ENLACE }],
      ['del sistema', { tipo: 'sistema', id: null }],
      ['sin actor (hecho anterior a la Fase 3)', undefined],
      ['con actor mal formado', 'profesional'],
    ])('%s → no hace nada', async (_caso, actor) => {
      // Arrange
      sembrar(pedida());

      // Act
      await suscriptor.manejar(hecho('CitaReagendada', { actor }), TX);

      // Assert
      expect(
        repo.buscarReagendamientoAbiertoParaActualizar,
      ).not.toHaveBeenCalled();
      expect(estadoDe()).toBe(EstadoSolicitud.RECIBIDA);
    });

    it('debería fallar como hecho inválido si el actor profesional no trae id', async () => {
      // Act & Assert
      await expect(
        suscriptor.manejar(
          hecho('CitaReagendada', { actor: { tipo: 'profesional', id: null } }),
          TX,
        ),
      ).rejects.toBeInstanceOf(EventoSolicitudInvalidoError);
    });
  });

  // ---------------------------------------------------------------------
  describe('hechos mal formados (ADR-12 §3: se reintentan hasta la carta muerta)', () => {
    it.each([
      ['sin citaId', hecho('CitaCancelada', { citaId: undefined }), 'citaId'],
      ['citaId vacío', hecho('CitaCancelada', { citaId: ' ' }), 'citaId'],
      [
        'sin tenantId',
        hecho('CitaCancelada', {}, { tenantId: '' }),
        'tenantId',
      ],
      [
        'reagendada sin ocurridoEn válido',
        hecho('CitaReagendada', {}, { ocurridoEn: new Date('no es fecha') }),
        'ocurridoEn',
      ],
    ])(
      '%s → EventoSolicitudInvalidoError que nombra el campo',
      async (_c, evento, campo) => {
        // Act
        const promesa = suscriptor.manejar(evento, TX);

        // Assert
        await expect(promesa).rejects.toBeInstanceOf(
          EventoSolicitudInvalidoError,
        );
        await expect(promesa).rejects.toThrow(`"${campo}"`);
        expect(repo.guardadas).toHaveLength(0);
      },
    );

    it('el mensaje del error no lleva valores del hecho', async () => {
      // Act
      const promesa = suscriptor.manejar(
        hecho('CitaReagendada', { actor: { tipo: 'profesional', id: '' } }),
        TX,
      );

      // Assert
      await expect(promesa).rejects.not.toThrow(CITA);
    });
  });

  it('debería ignorar un hecho que no escucha', async () => {
    // Act
    await suscriptor.manejar(hecho('CitaConfirmada'), TX);

    // Assert
    expect(
      repo.buscarReagendamientoAbiertoParaActualizar,
    ).not.toHaveBeenCalled();
  });
});
