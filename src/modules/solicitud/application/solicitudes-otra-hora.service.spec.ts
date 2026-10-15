import { EventoDominio } from '../../../shared/application/publicador-eventos';
import { Paciente } from '../../paciente/domain/paciente.entity';
import {
  EstadoSolicitud,
  SolicitudCita,
  TipoSolicitud,
} from '../domain/solicitud-cita.entity';
import { ReagendamientoYaSolicitadoError } from '../domain/reagendamiento-ya-solicitado.error';
import {
  CitaOrigen,
  REAGENDAMIENTO_SOLICITADO,
  SolicitudesOtraHoraService,
} from './solicitudes-otra-hora.service';

describe('SolicitudesOtraHoraService (pedir otra hora, Fase 3)', () => {
  const TX = { soy: 'tx-del-portal' };
  const CITA: CitaOrigen = {
    id: '0c1a0000-0000-4000-8000-000000000001',
    tenantId: 'tenant-1',
    usuarioId: 'duenio-cita',
    pacienteId: 'paciente-1',
  };
  const ENLACE = { id: 'e1000000-0000-4000-8000-000000000002' };
  const RECIBIDA_EN = new Date('2026-10-15T12:00:00.000Z');

  const fichaPaciente = (extra: Partial<Paciente> = {}): Paciente =>
    Paciente.reconstituir({
      id: 'paciente-1',
      rut: '123456785',
      nombre: 'Ana Pérez',
      telefono: '+56 9 1234 5678',
      correo: 'ana@correo.cl',
      consentimiento: true,
      tenantId: 'tenant-1',
      ...extra,
    });

  let solicitudes: {
    guardar: jest.Mock;
    buscarAbiertaPorRut: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorIdParaActualizar: jest.Mock;
    buscarReagendamientoAbierto: jest.Mock;
    buscarReagendamientoAbiertoParaActualizar: jest.Mock;
    listarPorEstado: jest.Mock;
  };
  let pacientes: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorRut: jest.Mock;
    buscarPorIds: jest.Mock;
    actualizarContacto: jest.Mock;
    completarCorreoSiVacio: jest.Mock;
  };
  let eventos: { publicar: jest.Mock<Promise<void>, [EventoDominio, unknown]> };
  let service: SolicitudesOtraHoraService;

  beforeEach(() => {
    solicitudes = {
      // Como el adaptador real en un INSERT: id y recibidaEn de la base.
      guardar: jest.fn((s: SolicitudCita) =>
        Promise.resolve(
          SolicitudCita.reconstituir({
            ...s,
            id: 'solicitud-nueva',
            estado: s.estado,
            recibidaEn: RECIBIDA_EN,
          }),
        ),
      ),
      buscarAbiertaPorRut: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorIdParaActualizar: jest.fn(),
      buscarReagendamientoAbierto: jest.fn().mockResolvedValue(null),
      buscarReagendamientoAbiertoParaActualizar: jest.fn(),
      listarPorEstado: jest.fn(),
    };
    pacientes = {
      guardar: jest.fn(),
      buscarPorId: jest.fn().mockResolvedValue(fichaPaciente()),
      buscarPorRut: jest.fn(),
      buscarPorIds: jest.fn(),
      actualizarContacto: jest.fn(),
      completarCorreoSiVacio: jest.fn(),
    };
    eventos = {
      publicar: jest
        .fn<Promise<void>, [EventoDominio, unknown]>()
        .mockResolvedValue(undefined),
    };
    service = new SolicitudesOtraHoraService(solicitudes, pacientes, eventos);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const solicitudGuardada = (): SolicitudCita =>
    (solicitudes.guardar.mock.calls as unknown as [SolicitudCita][])[0][0];

  describe('abierta', () => {
    it('debería LEER (sin bloqueo) la de reagendamiento recibida de la cita, en su tenant y con el tx', async () => {
      // Arrange
      const abierta = SolicitudCita.pedirOtraHora({
        tenantId: 'tenant-1',
        citaOrigenId: CITA.id,
        enlaceId: ENLACE.id,
        usuarioId: CITA.usuarioId,
        rut: null,
        nombrePaciente: 'Ana',
        telefono: '+56 9',
        correo: null,
        consentimiento: true,
        preferenciaHoraria: 'tardes',
      });
      solicitudes.buscarReagendamientoAbierto.mockResolvedValue(abierta);

      // Act
      const result = await service.abierta(CITA, TX);

      // Assert
      expect(result).toBe(abierta);
      expect(solicitudes.buscarReagendamientoAbierto).toHaveBeenCalledWith(
        CITA.id,
        'tenant-1',
        TX,
      );
      expect(
        solicitudes.buscarReagendamientoAbiertoParaActualizar,
      ).not.toHaveBeenCalled();
    });
  });

  describe('pedir', () => {
    it('debería crear una de reagendamiento recibida con origen, enlace y dueño de la cita, guardada en el tx', async () => {
      // Act
      const result = await service.pedir(
        CITA,
        ENLACE,
        { preferencia: 'martes en la tarde', motivo: 'viaje' },
        TX,
      );

      // Assert
      expect(solicitudes.guardar).toHaveBeenCalledWith(
        expect.any(SolicitudCita),
        TX,
      );
      const s = solicitudGuardada();
      expect(s.tipo).toBe(TipoSolicitud.REAGENDAMIENTO);
      expect(s.estado).toBe(EstadoSolicitud.RECIBIDA);
      expect(s.citaOrigenId).toBe(CITA.id);
      expect(s.enlaceId).toBe(ENLACE.id);
      expect(s.usuarioId).toBe('duenio-cita');
      expect(s.tenantId).toBe('tenant-1');
      expect(s.citaId).toBeNull();
      expect(s.preferenciaHoraria).toBe('martes en la tarde');
      expect(s.motivo).toBe('viaje');
      // Devuelve lo guardado (con id y recibidaEn de la base)
      expect(result.id).toBe('solicitud-nueva');
      expect(result.recibidaEn).toEqual(RECIBIDA_EN);
    });

    it('debería copiar los datos del paciente desde su ficha (del tenant de la cita)', async () => {
      // Act
      await service.pedir(CITA, ENLACE, { preferencia: 'tardes' }, TX);

      // Assert
      expect(pacientes.buscarPorId).toHaveBeenCalledWith(
        'paciente-1',
        'tenant-1',
        TX,
      );
      expect(solicitudGuardada()).toMatchObject({
        rut: '123456785',
        nombrePaciente: 'Ana Pérez',
        telefono: '+56 9 1234 5678',
        correo: 'ana@correo.cl',
        consentimiento: true,
      });
    });

    it.each<[string, Partial<Paciente>]>([
      ['sin RUT ni correo (alta manual)', { rut: null, correo: null }],
      ['con el correo en blanco (ficha vieja)', { rut: null, correo: '  ' }],
    ])(
      'debería admitir una ficha %s: rut y correo quedan null',
      async (_caso, ficha) => {
        // Arrange
        pacientes.buscarPorId.mockResolvedValue(fichaPaciente(ficha));

        // Act
        await service.pedir(CITA, ENLACE, { preferencia: 'tardes' }, TX);

        // Assert
        expect(solicitudGuardada().rut).toBeNull();
        expect(solicitudGuardada().correo).toBeNull();
      },
    );

    it.each([undefined, '', '   '])(
      'debería guardar el motivo ausente (%p) como texto vacío',
      async (motivo) => {
        // Act
        await service.pedir(
          CITA,
          ENLACE,
          { preferencia: ' tardes ', motivo },
          TX,
        );

        // Assert
        expect(solicitudGuardada().motivo).toBe('');
        expect(solicitudGuardada().preferenciaHoraria).toBe('tardes');
      },
    );

    it('debería publicar ReagendamientoSolicitado en el tx con SOLO ids y el actor paciente (id del enlace)', async () => {
      // Act
      await service.pedir(
        CITA,
        ENLACE,
        { preferencia: 'martes en la tarde', motivo: 'me cambiaron el turno' },
        TX,
      );

      // Assert
      expect(eventos.publicar).toHaveBeenCalledTimes(1);
      const [evento, tx] = eventos.publicar.mock.calls[0];
      expect(tx).toBe(TX);
      expect(evento.nombre).toBe(REAGENDAMIENTO_SOLICITADO);
      expect(evento.nombre).toBe('ReagendamientoSolicitado');
      expect(evento.tenantId).toBe('tenant-1');
      expect(evento.ocurridoEn).toBeInstanceOf(Date);
      expect(evento.payload).toEqual({
        citaId: CITA.id,
        usuarioId: 'duenio-cita',
        solicitudId: 'solicitud-nueva',
        actor: { tipo: 'paciente', id: ENLACE.id },
      });
    });

    it('no debería poner datos del paciente, preferencia ni motivo en el hecho', async () => {
      // Act
      await service.pedir(
        CITA,
        ENLACE,
        { preferencia: 'martes en la tarde', motivo: 'me cambiaron el turno' },
        TX,
      );

      // Assert
      const json = JSON.stringify(eventos.publicar.mock.calls[0][0]);
      for (const sensible of [
        'Ana Pérez',
        '123456785',
        'ana@correo.cl',
        '1234 5678',
        'martes en la tarde',
        'me cambiaron el turno',
        'paciente-1',
      ]) {
        expect(json).not.toContain(sensible);
      }
    });

    it('debería guardar ANTES de publicar (el hecho lleva el id guardado)', async () => {
      // Act
      await service.pedir(CITA, ENLACE, { preferencia: 'tardes' }, TX);

      // Assert
      expect(solicitudes.guardar.mock.invocationCallOrder[0]).toBeLessThan(
        eventos.publicar.mock.invocationCallOrder[0],
      );
    });

    it('debería propagar ReagendamientoYaSolicitadoError (23505 traducido, el portal → 409) sin publicar', async () => {
      // Arrange — otra petición abierta ganó la carrera
      solicitudes.guardar.mockRejectedValue(
        new ReagendamientoYaSolicitadoError(),
      );

      // Act & Assert
      await expect(
        service.pedir(CITA, ENLACE, { preferencia: 'tardes' }, TX),
      ).rejects.toBeInstanceOf(ReagendamientoYaSolicitadoError);
      expect(eventos.publicar).not.toHaveBeenCalled();
    });

    it('debería fallar como error interno si el paciente de la cita no existe en su tenant (sin crear nada)', async () => {
      // Arrange
      pacientes.buscarPorId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.pedir(CITA, ENLACE, { preferencia: 'tardes' }, TX),
      ).rejects.toThrow(/^Integridad/);
      expect(solicitudes.guardar).not.toHaveBeenCalled();
      expect(eventos.publicar).not.toHaveBeenCalled();
    });
  });
});
