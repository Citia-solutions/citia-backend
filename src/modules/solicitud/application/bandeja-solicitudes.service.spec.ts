import { EventoDominio } from '../../../shared/application/publicador-eventos';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CitasService } from '../../cita/application/citas.service';
import { EstadoCita } from '../../cita/domain/cita.entity';
import { AvisosCitaDto } from '../../cita/presentation/dto/avisos-cita.dto';
import { CitaResponseDto } from '../../cita/presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../../cita/presentation/dto/crear-cita.dto';
import { PacienteResponseDto } from '../../paciente/presentation/dto/paciente-response.dto';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../domain/solicitud-cita.entity';
import { TransicionSolicitudInvalidaError } from '../domain/transicion-solicitud-invalida.error';
import { AceptarSolicitudDto } from '../presentation/dto/aceptar-solicitud.dto';
import { SolicitudAceptadaDto } from '../presentation/dto/solicitud-aceptada.dto';
import { SolicitudBandejaDto } from '../presentation/dto/solicitud-bandeja.dto';
import {
  BandejaSolicitudesService,
  LIMITE_BANDEJA,
} from './bandeja-solicitudes.service';
import { SolicitudNoEncontradaError } from './solicitud-no-encontrada.error';

describe('BandejaSolicitudesService', () => {
  let service: BandejaSolicitudesService;
  let mockSolicitudRepository: {
    guardar: jest.Mock;
    buscarAbiertaPorRut: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorIdParaActualizar: jest.Mock;
    listarPorEstado: jest.Mock;
  };
  let mockCitasService: { agendar: jest.Mock };
  let mockTx: { run: jest.Mock };
  let mockEventos: { publicar: jest.Mock };

  const SOLICITUD_ID = '5f0c0000-0000-4000-8000-000000000001';
  const CITA_ID = 'a1b20000-0000-4000-8000-000000000002';
  const RECIBIDA_EN = new Date('2026-09-17T14:02:11.000Z');

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  const dto: AceptarSolicitudDto = {
    inicio: '2026-09-18T10:00:00-03:00',
    duracionMin: 50,
    tipoConsulta: 'Dolor de muela desde el lunes',
  };

  // Solicitud como la traeria el repositorio desde BD (RUT canonico).
  const solicitudEn = (
    estado: EstadoSolicitud,
    extra: Partial<{ consentimiento: boolean }> = {},
  ): SolicitudCita =>
    SolicitudCita.reconstituir({
      id: SOLICITUD_ID,
      tenantId: 'tenant-1',
      usuarioId: estado === EstadoSolicitud.RECIBIDA ? null : 'otro-usuario',
      rut: '111111111',
      nombrePaciente: 'Paciente Público',
      telefono: '+56 9 5555 5555',
      correo: 'publico@mail.com',
      motivo: 'Dolor de muela desde el lunes',
      preferenciaHoraria: 'viernes, 18 de septiembre a las 10:00',
      consentimiento: extra.consentimiento ?? true,
      estado,
      citaId: estado === EstadoSolicitud.ACEPTADA ? 'cita-previa' : null,
      recibidaEn: RECIBIDA_EN,
      resueltaEn:
        estado === EstadoSolicitud.RECIBIDA
          ? null
          : new Date('2026-09-20T10:00:00Z'),
    });

  const citaCreada = new CitaResponseDto({
    id: CITA_ID,
    inicio: new Date('2026-09-18T13:00:00.000Z'),
    duracionMin: 50,
    tipoConsulta: 'Dolor de muela desde el lunes',
    estado: EstadoCita.PENDIENTE,
    pacienteId: 'paciente-9',
    paciente: new PacienteResponseDto({
      id: 'paciente-9',
      rut: '11.111.111-1',
      nombre: 'Paciente Público',
      telefono: '+56 9 5555 5555',
      correo: 'publico@mail.com',
      consentimiento: true,
      tenantId: 'tenant-1',
    }),
    avisos: new AvisosCitaDto({ solapamientos: [] }),
  });

  beforeEach(() => {
    mockSolicitudRepository = {
      // Igual que el adaptador real: devuelve una solicitud (aqui, la misma).
      guardar: jest.fn((s: SolicitudCita) => Promise.resolve(s)),
      buscarAbiertaPorRut: jest.fn().mockResolvedValue(null),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarPorIdParaActualizar: jest.fn().mockResolvedValue(null),
      listarPorEstado: jest.fn().mockResolvedValue([]),
    };
    mockCitasService = { agendar: jest.fn().mockResolvedValue(citaCreada) };
    mockTx = {
      run: jest.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
    };
    mockEventos = { publicar: jest.fn().mockResolvedValue(undefined) };

    service = new BandejaSolicitudesService(
      mockSolicitudRepository,
      // CitasService es una clase concreta: solo se usa `agendar`.
      mockCitasService as unknown as CitasService,
      mockTx,
      mockEventos,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const primeraGuardada = (): SolicitudCita =>
    (
      mockSolicitudRepository.guardar.mock.calls as unknown as SolicitudCita[][]
    )[0][0];

  const primerEvento = (): EventoDominio =>
    (mockEventos.publicar.mock.calls as unknown as EventoDominio[][])[0][0];

  const primerAgendar = (): [CrearCitaDto, AuthenticatedUser, unknown] =>
    (
      mockCitasService.agendar.mock.calls as unknown as [
        CrearCitaDto,
        AuthenticatedUser,
        unknown,
      ][]
    )[0];

  // ---------------------------------------------------------------------
  describe('listar', () => {
    it(`debería listar por tenant del token, estado y tope fijo de ${LIMITE_BANDEJA}`, async () => {
      // Arrange
      expect(LIMITE_BANDEJA).toBe(100);

      // Act
      await service.listar(EstadoSolicitud.RECIBIDA, usuario);

      // Assert
      expect(mockSolicitudRepository.listarPorEstado).toHaveBeenCalledWith(
        'tenant-1',
        EstadoSolicitud.RECIBIDA,
        100,
      );
    });

    it('debería pasar el estado pedido tal cual (aceptada / rechazada)', async () => {
      // Act
      await service.listar(EstadoSolicitud.RECHAZADA, usuario);

      // Assert
      expect(mockSolicitudRepository.listarPorEstado).toHaveBeenCalledWith(
        'tenant-1',
        EstadoSolicitud.RECHAZADA,
        LIMITE_BANDEJA,
      );
    });

    it('debería mapear a SolicitudBandejaDto con RUT formateado, preservando el orden del repositorio', async () => {
      // Arrange
      const s1 = solicitudEn(EstadoSolicitud.RECIBIDA);
      const s2 = solicitudEn(EstadoSolicitud.RECIBIDA);
      s2.id = 'otra-solicitud';
      mockSolicitudRepository.listarPorEstado.mockResolvedValue([s1, s2]);

      // Act
      const result = await service.listar(EstadoSolicitud.RECIBIDA, usuario);

      // Assert
      expect(result.map((s) => s.id)).toEqual([SOLICITUD_ID, 'otra-solicitud']);
      expect(result[0]).toBeInstanceOf(SolicitudBandejaDto);
      expect(result[0]).toEqual({
        id: SOLICITUD_ID,
        estado: EstadoSolicitud.RECIBIDA,
        rut: '11.111.111-1',
        nombrePaciente: 'Paciente Público',
        telefono: '+56 9 5555 5555',
        correo: 'publico@mail.com',
        motivo: 'Dolor de muela desde el lunes',
        preferenciaHoraria: 'viernes, 18 de septiembre a las 10:00',
        consentimiento: true,
        recibidaEn: RECIBIDA_EN,
        resueltaEn: null,
        citaId: null,
      });
    });

    it('no debería exponer tenantId, usuarioId ni el RUT canónico', async () => {
      // Arrange
      mockSolicitudRepository.listarPorEstado.mockResolvedValue([
        solicitudEn(EstadoSolicitud.RECHAZADA),
      ]);

      // Act
      const json = JSON.stringify(
        await service.listar(EstadoSolicitud.RECHAZADA, usuario),
      );

      // Assert
      expect(json).not.toMatch(/tenantId|usuarioId/);
      expect(json).not.toContain('tenant-1');
      expect(json).not.toContain('otro-usuario');
      expect(json).not.toContain('"111111111"');
    });

    it('debería ser de solo lectura: sin transacción ni eventos', async () => {
      // Act
      await service.listar(EstadoSolicitud.RECIBIDA, usuario);

      // Assert
      expect(mockTx.run).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  describe('aceptar', () => {
    beforeEach(() => {
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        solicitudEn(EstadoSolicitud.RECIBIDA),
      );
    });

    it('debería cargar la solicitud con bloqueo (buscarPorIdParaActualizar) dentro de UNA transacción', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(
        mockSolicitudRepository.buscarPorIdParaActualizar,
      ).toHaveBeenCalledWith(SOLICITUD_ID, 'tenant-1', 'tx');
      // No se usa la lectura sin bloqueo
      expect(mockSolicitudRepository.buscarPorId).not.toHaveBeenCalled();
    });

    it('debería crear la cita con CitasService.agendar en el MISMO tx y el usuario del token', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(mockCitasService.agendar).toHaveBeenCalledTimes(1);
      const [, usuarioAgendar, tx] = primerAgendar();
      expect(usuarioAgendar).toBe(usuario);
      expect(tx).toBe('tx');
    });

    it('debería propagar a agendar la hora del profesional y los datos que escribió el paciente', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      const [dtoCita] = primerAgendar();
      expect(dtoCita).toEqual({
        inicio: dto.inicio,
        duracionMin: dto.duracionMin,
        tipoConsulta: dto.tipoConsulta,
        paciente: {
          rut: '111111111',
          nombre: 'Paciente Público',
          telefono: '+56 9 5555 5555',
          correo: 'publico@mail.com',
          consentimiento: true,
        },
      });
      // Nunca un pacienteId: se resuelve-o-crea por RUT
      expect(dtoCita.pacienteId).toBeUndefined();
    });

    it.each([true, false])(
      'debería propagar el consentimiento que marcó el paciente (%s)',
      async (consentimiento) => {
        // Arrange
        mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
          solicitudEn(EstadoSolicitud.RECIBIDA, { consentimiento }),
        );

        // Act
        await service.aceptar(SOLICITUD_ID, dto, usuario);

        // Assert
        expect(primerAgendar()[0].paciente?.consentimiento).toBe(
          consentimiento,
        );
      },
    );

    it('debería dejar la solicitud aceptada, con citaId, usuarioId y resueltaEn, y guardarla en el tx', async () => {
      // Arrange
      const antes = Date.now();

      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(mockSolicitudRepository.guardar).toHaveBeenCalledTimes(1);
      expect(mockSolicitudRepository.guardar).toHaveBeenCalledWith(
        expect.any(SolicitudCita),
        'tx',
      );
      const guardada = primeraGuardada();
      expect(guardada.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(guardada.citaId).toBe(CITA_ID);
      expect(guardada.usuarioId).toBe('usuario-1');
      expect(guardada.resueltaEn).toBeInstanceOf(Date);
      expect(guardada.resueltaEn!.getTime()).toBeGreaterThanOrEqual(antes);
    });

    it('debería responder { solicitud, cita } con la solicitud resuelta y la cita tal cual la devuelve agendar', async () => {
      // Act
      const result = await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(result).toBeInstanceOf(SolicitudAceptadaDto);
      expect(result.cita).toBe(citaCreada);
      expect(result.solicitud).toBeInstanceOf(SolicitudBandejaDto);
      expect(result.solicitud).toMatchObject({
        id: SOLICITUD_ID,
        estado: EstadoSolicitud.ACEPTADA,
        citaId: CITA_ID,
        rut: '11.111.111-1',
        recibidaEn: RECIBIDA_EN,
      });
      expect(result.solicitud.resueltaEn).toBeInstanceOf(Date);
    });

    it('debería proyectar la respuesta desde la entidad cargada, no desde lo que devuelve guardar', async () => {
      // Arrange — el adaptador TypeORM, en un UPDATE, no relee `recibidaEn`
      mockSolicitudRepository.guardar.mockImplementation((s: SolicitudCita) => {
        const copia = SolicitudCita.reconstituir({
          ...s,
          estado: s.estado,
          recibidaEn: undefined as unknown as Date,
        });
        return Promise.resolve(copia);
      });

      // Act
      const result = await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(result.solicitud.recibidaEn).toEqual(RECIBIDA_EN);
    });

    it('debería seguir el orden cargar -> agendar -> guardar -> publicar', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      const orden = [
        mockSolicitudRepository.buscarPorIdParaActualizar.mock
          .invocationCallOrder[0],
        mockCitasService.agendar.mock.invocationCallOrder[0],
        mockSolicitudRepository.guardar.mock.invocationCallOrder[0],
        mockEventos.publicar.mock.invocationCallOrder[0],
      ];
      expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    });

    it('debería publicar SolicitudCitaAceptada con SOLO ids (sin RUT ni nombre)', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(mockEventos.publicar).toHaveBeenCalledTimes(1);
      const evento = primerEvento();
      expect(evento.nombre).toBe('SolicitudCitaAceptada');
      expect(evento.tenantId).toBe('tenant-1');
      expect(evento.ocurridoEn).toBeInstanceOf(Date);
      expect(evento.payload).toEqual({
        solicitudId: SOLICITUD_ID,
        citaId: CITA_ID,
        usuarioId: 'usuario-1',
      });
      const json = JSON.stringify(evento);
      expect(json).not.toContain('111111111');
      expect(json).not.toContain('11.111.111-1');
      expect(json).not.toContain('Paciente Público');
      expect(json).not.toContain('publico@mail.com');
      expect(json).not.toContain('5555');
    });

    it.each([EstadoSolicitud.ACEPTADA, EstadoSolicitud.RECHAZADA])(
      'debería lanzar 409 (TransicionSolicitudInvalidaError) si ya está %s, sin llamar agendar ni publicar',
      async (estado) => {
        // Arrange
        mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
          solicitudEn(estado),
        );

        // Act
        const promesa = service.aceptar(SOLICITUD_ID, dto, usuario);

        // Assert
        await expect(promesa).rejects.toBeInstanceOf(
          TransicionSolicitudInvalidaError,
        );
        await expect(promesa).rejects.toThrow(
          `Transición inválida: no se puede aplicar "aceptar" a una solicitud "${estado}"`,
        );
        expect(mockCitasService.agendar).not.toHaveBeenCalled();
        expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
        expect(mockEventos.publicar).not.toHaveBeenCalled();
      },
    );

    it('debería lanzar SolicitudNoEncontradaError cuando no existe o es de otro tenant', async () => {
      // Arrange
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(null);

      // Act
      const promesa = service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      await expect(promesa).rejects.toBeInstanceOf(SolicitudNoEncontradaError);
      await expect(promesa).rejects.toThrow(
        `Solicitud "${SOLICITUD_ID}" no encontrada`,
      );
      expect(mockCitasService.agendar).not.toHaveBeenCalled();
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });

    it('debería propagar el error de agendar sin resolver la solicitud ni publicar', async () => {
      // Arrange — p. ej. RUT inválido en la solicitud
      const error = new Error('fallo al agendar');
      mockCitasService.agendar.mockRejectedValue(error);

      // Act & Assert
      await expect(service.aceptar(SOLICITUD_ID, dto, usuario)).rejects.toBe(
        error,
      );
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  describe('rechazar', () => {
    it('debería rechazar en UNA transacción con bloqueo, fijando usuarioId y resueltaEn', async () => {
      // Arrange
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        solicitudEn(EstadoSolicitud.RECIBIDA),
      );

      // Act
      const result = await service.rechazar(SOLICITUD_ID, usuario);

      // Assert
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(
        mockSolicitudRepository.buscarPorIdParaActualizar,
      ).toHaveBeenCalledWith(SOLICITUD_ID, 'tenant-1', 'tx');
      expect(mockSolicitudRepository.guardar).toHaveBeenCalledWith(
        expect.any(SolicitudCita),
        'tx',
      );
      const guardada = primeraGuardada();
      expect(guardada.estado).toBe(EstadoSolicitud.RECHAZADA);
      expect(guardada.usuarioId).toBe('usuario-1');
      expect(guardada.resueltaEn).toBeInstanceOf(Date);
      expect(guardada.citaId).toBeNull();

      expect(result).toBeInstanceOf(SolicitudBandejaDto);
      expect(result).toMatchObject({
        id: SOLICITUD_ID,
        estado: EstadoSolicitud.RECHAZADA,
        citaId: null,
        rut: '11.111.111-1',
        recibidaEn: RECIBIDA_EN,
      });
      expect(result.resueltaEn).toBeInstanceOf(Date);
    });

    it('no debería crear cita ni paciente al rechazar', async () => {
      // Arrange
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        solicitudEn(EstadoSolicitud.RECIBIDA),
      );

      // Act
      await service.rechazar(SOLICITUD_ID, usuario);

      // Assert
      expect(mockCitasService.agendar).not.toHaveBeenCalled();
    });

    it('debería publicar SolicitudCitaRechazada con SOLO { solicitudId, usuarioId }', async () => {
      // Arrange
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        solicitudEn(EstadoSolicitud.RECIBIDA),
      );

      // Act
      await service.rechazar(SOLICITUD_ID, usuario);

      // Assert
      const evento = primerEvento();
      expect(evento.nombre).toBe('SolicitudCitaRechazada');
      expect(evento.tenantId).toBe('tenant-1');
      expect(evento.payload).toEqual({
        solicitudId: SOLICITUD_ID,
        usuarioId: 'usuario-1',
      });
      const json = JSON.stringify(evento);
      expect(json).not.toContain('111111111');
      expect(json).not.toContain('Paciente Público');
    });

    it.each([EstadoSolicitud.ACEPTADA, EstadoSolicitud.RECHAZADA])(
      'debería lanzar 409 si ya está %s, sin guardar ni publicar',
      async (estado) => {
        // Arrange
        mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
          solicitudEn(estado),
        );

        // Act
        const promesa = service.rechazar(SOLICITUD_ID, usuario);

        // Assert
        await expect(promesa).rejects.toBeInstanceOf(
          TransicionSolicitudInvalidaError,
        );
        await expect(promesa).rejects.toThrow(
          `no se puede aplicar "rechazar" a una solicitud "${estado}"`,
        );
        expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
        expect(mockEventos.publicar).not.toHaveBeenCalled();
      },
    );

    it('debería lanzar SolicitudNoEncontradaError cuando no existe o es de otro tenant', async () => {
      // Arrange
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.rechazar(SOLICITUD_ID, usuario),
      ).rejects.toBeInstanceOf(SolicitudNoEncontradaError);
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });
  });
});
