import { EventoDominio } from '../../../shared/application/publicador-eventos';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import {
  CitasService,
  ResumenCita,
} from '../../cita/application/citas.service';
import { EstadoCita } from '../../cita/domain/cita.entity';
import { TransicionEstadoInvalidaError } from '../../cita/domain/exceptions/transicion-estado-invalida.error';
import { AvisosCitaDto } from '../../cita/presentation/dto/avisos-cita.dto';
import { CitaResponseDto } from '../../cita/presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../../cita/presentation/dto/crear-cita.dto';
import { PacienteResponseDto } from '../../paciente/presentation/dto/paciente-response.dto';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import {
  EstadoSolicitud,
  SolicitudCita,
  TipoSolicitud,
} from '../domain/solicitud-cita.entity';
import { TransicionSolicitudInvalidaError } from '../domain/transicion-solicitud-invalida.error';
import { AceptarSolicitudDto } from '../presentation/dto/aceptar-solicitud.dto';
import { SolicitudAceptadaDto } from '../presentation/dto/solicitud-aceptada.dto';
import { SolicitudBandejaDto } from '../presentation/dto/solicitud-bandeja.dto';
import {
  BandejaSolicitudesService,
  LIMITE_BANDEJA,
} from './bandeja-solicitudes.service';
import { DatosAceptacionIncompletosError } from './datos-aceptacion-incompletos.error';
import { SolicitudNoEncontradaError } from './solicitud-no-encontrada.error';

describe('BandejaSolicitudesService', () => {
  let service: BandejaSolicitudesService;
  let mockSolicitudRepository: {
    guardar: jest.Mock;
    buscarAbiertaPorRut: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorIdParaActualizar: jest.Mock;
    buscarReagendamientoAbierto: jest.Mock;
    buscarReagendamientoAbiertoParaActualizar: jest.Mock;
    listarPorEstado: jest.Mock;
  };
  let mockCitasService: {
    agendar: jest.Mock;
    reagendarEnTx: jest.Mock;
    resumenesPorIds: jest.Mock;
  };
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

  // --- Fase 3: reagendamiento -------------------------------------------
  const CITA_ORIGEN = '0c1a0000-0000-4000-8000-000000000003';
  const ENLACE = 'e1000000-0000-4000-8000-000000000004';

  // Petición de otra hora tal como la trae el repositorio: paciente sin RUT
  // ni correo en su ficha, motivo vacío, dueño = el de la cita.
  const reagendamientoEn = (estado: EstadoSolicitud): SolicitudCita =>
    SolicitudCita.reconstituir({
      id: SOLICITUD_ID,
      tenantId: 'tenant-1',
      usuarioId: 'duenio-cita',
      rut: null,
      nombrePaciente: 'Paciente Reagenda',
      telefono: '+56 9 4444 4444',
      correo: null,
      motivo: '',
      preferenciaHoraria: 'martes en la tarde',
      consentimiento: true,
      estado,
      citaId: null,
      recibidaEn: RECIBIDA_EN,
      resueltaEn: null,
      tipo: TipoSolicitud.REAGENDAMIENTO,
      citaOrigenId: CITA_ORIGEN,
      enlaceId: ENLACE,
    });

  // Lo que devuelve `reagendarEnTx`: la MISMA cita, movida y `pendiente`,
  // con avisos y sin paciente (forma de PATCH /citas/:id/reagendar).
  const citaMovida = new CitaResponseDto({
    id: CITA_ORIGEN,
    inicio: new Date('2026-09-22T19:00:00.000Z'),
    duracionMin: 45,
    tipoConsulta: 'Control',
    estado: EstadoCita.PENDIENTE,
    pacienteId: 'paciente-7',
    avisos: new AvisosCitaDto({ solapamientos: [] }),
  });

  const resumen = (
    id: string,
    estado: EstadoCita = EstadoCita.CONFIRMADA,
  ): ResumenCita => ({
    id,
    inicio: new Date('2026-09-21T13:00:00.000Z'),
    duracionMin: 45,
    estado,
  });

  beforeEach(() => {
    mockSolicitudRepository = {
      // Igual que el adaptador real: devuelve una solicitud (aqui, la misma).
      guardar: jest.fn((s: SolicitudCita) => Promise.resolve(s)),
      buscarAbiertaPorRut: jest.fn().mockResolvedValue(null),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarPorIdParaActualizar: jest.fn().mockResolvedValue(null),
      buscarReagendamientoAbierto: jest.fn().mockResolvedValue(null),
      buscarReagendamientoAbiertoParaActualizar: jest
        .fn()
        .mockResolvedValue(null),
      listarPorEstado: jest.fn().mockResolvedValue([]),
    };
    mockCitasService = {
      agendar: jest.fn().mockResolvedValue(citaCreada),
      reagendarEnTx: jest.fn().mockResolvedValue(citaMovida),
      resumenesPorIds: jest.fn().mockResolvedValue(new Map()),
    };
    mockTx = {
      run: jest.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
    };
    mockEventos = { publicar: jest.fn().mockResolvedValue(undefined) };

    service = new BandejaSolicitudesService(
      mockSolicitudRepository,
      // CitasService es una clase concreta: solo se usan `agendar`,
      // `reagendarEnTx` y `resumenesPorIds`.
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

  // tx con el que se publicó el primer hecho (ADR-12 §2).
  const txDelPrimerEvento = (): unknown =>
    (
      mockEventos.publicar.mock.calls as unknown as [EventoDominio, unknown][]
    )[0][1];

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
        {},
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
        {},
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
        tipo: TipoSolicitud.NUEVA,
        citaOrigenId: null,
        citaOrigen: null,
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

    // --- Fase 3 ---------------------------------------------------------
    it('debería pasar el filtro citaOrigenId al repositorio (voucher, R4)', async () => {
      // Act
      await service.listar(EstadoSolicitud.RECIBIDA, usuario, {
        citaOrigenId: CITA_ORIGEN,
      });

      // Assert
      expect(mockSolicitudRepository.listarPorEstado).toHaveBeenCalledWith(
        'tenant-1',
        EstadoSolicitud.RECIBIDA,
        LIMITE_BANDEJA,
        { citaOrigenId: CITA_ORIGEN },
      );
    });

    it('no debería leer citas cuando no hay ninguna de reagendamiento', async () => {
      // Arrange
      mockSolicitudRepository.listarPorEstado.mockResolvedValue([
        solicitudEn(EstadoSolicitud.RECIBIDA),
      ]);

      // Act
      await service.listar(EstadoSolicitud.RECIBIDA, usuario);

      // Assert
      expect(mockCitasService.resumenesPorIds).not.toHaveBeenCalled();
    });

    it('debería resolver citaOrigen SIN N+1: una lectura por lote con los ids de origen, del tenant del token', async () => {
      // Arrange — dos peticiones de otra hora y una nueva
      const r1 = reagendamientoEn(EstadoSolicitud.RECIBIDA);
      const r2 = reagendamientoEn(EstadoSolicitud.RECIBIDA);
      r2.id = 'otra-reagenda';
      r2.citaOrigenId = 'otra-cita';
      const nueva = solicitudEn(EstadoSolicitud.RECIBIDA);
      nueva.id = 'una-nueva';
      mockSolicitudRepository.listarPorEstado.mockResolvedValue([
        r1,
        nueva,
        r2,
      ]);
      mockCitasService.resumenesPorIds.mockResolvedValue(
        new Map([[CITA_ORIGEN, resumen(CITA_ORIGEN)]]),
      );

      // Act
      const result = await service.listar(EstadoSolicitud.RECIBIDA, usuario);

      // Assert
      expect(mockCitasService.resumenesPorIds).toHaveBeenCalledTimes(1);
      expect(mockCitasService.resumenesPorIds).toHaveBeenCalledWith(
        [CITA_ORIGEN, 'otra-cita'],
        'tenant-1',
        undefined,
      );
      expect(result.map((s) => s.id)).toEqual([
        SOLICITUD_ID,
        'una-nueva',
        'otra-reagenda',
      ]);
      expect(result[0]).toMatchObject({
        tipo: TipoSolicitud.REAGENDAMIENTO,
        citaOrigenId: CITA_ORIGEN,
        citaOrigen: {
          inicio: new Date('2026-09-21T13:00:00.000Z'),
          duracionMin: 45,
          estado: EstadoCita.CONFIRMADA,
        },
        rut: null,
        correo: null,
        motivo: '',
      });
      expect(result[1]).toMatchObject({
        tipo: TipoSolicitud.NUEVA,
        citaOrigenId: null,
        citaOrigen: null,
      });
      // Su cita no volvió (otro tenant o inexistente): sin citaOrigen
      expect(result[2]).toMatchObject({
        citaOrigenId: 'otra-cita',
        citaOrigen: null,
      });
    });

    it('no debería exponer enlaceId, tipoConsulta ni ids de tenant/usuario', async () => {
      // Arrange
      mockSolicitudRepository.listarPorEstado.mockResolvedValue([
        reagendamientoEn(EstadoSolicitud.RECIBIDA),
      ]);
      mockCitasService.resumenesPorIds.mockResolvedValue(
        new Map([[CITA_ORIGEN, resumen(CITA_ORIGEN)]]),
      );

      // Act
      const [item] = await service.listar(EstadoSolicitud.RECIBIDA, usuario);

      // Assert
      expect(Object.keys(item.citaOrigen ?? {}).sort()).toEqual([
        'duracionMin',
        'estado',
        'inicio',
      ]);
      const json = JSON.stringify(item);
      expect(json).not.toContain(ENLACE);
      expect(json).not.toMatch(/enlaceId|usuarioId|tenantId|tipoConsulta/);
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
      expect(txDelPrimerEvento()).toBe('tx');
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

    it.each<[string, Partial<AceptarSolicitudDto>]>([
      ['sin duracionMin', { duracionMin: undefined }],
      ['sin tipoConsulta', { tipoConsulta: undefined }],
      ['sin ninguno', { duracionMin: undefined, tipoConsulta: undefined }],
    ])(
      'debería lanzar 400 (DatosAceptacionIncompletosError) para una nueva %s, sin agendar ni resolver',
      async (_caso, faltante) => {
        // Act
        const promesa = service.aceptar(
          SOLICITUD_ID,
          { ...dto, ...faltante },
          usuario,
        );

        // Assert
        await expect(promesa).rejects.toBeInstanceOf(
          DatosAceptacionIncompletosError,
        );
        expect(mockCitasService.agendar).not.toHaveBeenCalled();
        expect(mockCitasService.reagendarEnTx).not.toHaveBeenCalled();
        expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
        expect(mockEventos.publicar).not.toHaveBeenCalled();
      },
    );
  });

  // ---------------------------------------------------------------------
  describe('aceptar una petición de otra hora (Fase 3, R2)', () => {
    const soloInicio: AceptarSolicitudDto = {
      inicio: '2026-09-22T16:00:00-03:00',
    };

    beforeEach(() => {
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        reagendamientoEn(EstadoSolicitud.RECIBIDA),
      );
    });

    it('debería MOVER la cita de origen con reagendarEnTx en el mismo tx, sin crear cita ni paciente', async () => {
      // Act — solo fecha y hora: duración y tipo no hacen falta
      await service.aceptar(SOLICITUD_ID, soloInicio, usuario);

      // Assert
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(mockCitasService.reagendarEnTx).toHaveBeenCalledTimes(1);
      expect(mockCitasService.reagendarEnTx).toHaveBeenCalledWith(
        CITA_ORIGEN,
        soloInicio.inicio,
        usuario,
        'tx',
      );
      expect(mockCitasService.agendar).not.toHaveBeenCalled();
    });

    it('debería ignorar duracionMin y tipoConsulta si llegan', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(mockCitasService.reagendarEnTx).toHaveBeenCalledWith(
        CITA_ORIGEN,
        dto.inicio,
        usuario,
        'tx',
      );
      expect(mockCitasService.agendar).not.toHaveBeenCalled();
    });

    it('debería bloquear la solicitud ANTES que la cita (orden de bloqueo de la bandeja)', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, soloInicio, usuario);

      // Assert
      expect(
        mockSolicitudRepository.buscarPorIdParaActualizar.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mockCitasService.reagendarEnTx.mock.invocationCallOrder[0],
      );
    });

    it('debería dejar la solicitud aceptada con citaId = citaOrigenId y el profesional del token', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, soloInicio, usuario);

      // Assert
      expect(mockSolicitudRepository.guardar).toHaveBeenCalledWith(
        expect.any(SolicitudCita),
        'tx',
      );
      const guardada = primeraGuardada();
      expect(guardada.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(guardada.citaId).toBe(CITA_ORIGEN);
      expect(guardada.citaOrigenId).toBe(CITA_ORIGEN);
      expect(guardada.usuarioId).toBe('usuario-1');
      expect(guardada.resueltaEn).toBeInstanceOf(Date);
    });

    it('debería responder { solicitud, cita } con la cita YA movida y citaOrigen = la cita movida', async () => {
      // Act
      const result = await service.aceptar(SOLICITUD_ID, soloInicio, usuario);

      // Assert
      expect(result).toBeInstanceOf(SolicitudAceptadaDto);
      expect(result.cita).toBe(citaMovida);
      expect(result.solicitud).toMatchObject({
        id: SOLICITUD_ID,
        estado: EstadoSolicitud.ACEPTADA,
        tipo: TipoSolicitud.REAGENDAMIENTO,
        citaId: CITA_ORIGEN,
        citaOrigenId: CITA_ORIGEN,
        citaOrigen: {
          inicio: citaMovida.inicio,
          duracionMin: 45,
          estado: EstadoCita.PENDIENTE,
        },
        rut: null,
      });
      // Sin otra lectura: la cita movida ya trae lo necesario
      expect(mockCitasService.resumenesPorIds).not.toHaveBeenCalled();
    });

    it('debería publicar SolicitudCitaAceptada con la cita de origen, solo ids, en el tx', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, soloInicio, usuario);

      // Assert
      expect(mockEventos.publicar).toHaveBeenCalledTimes(1);
      expect(txDelPrimerEvento()).toBe('tx');
      expect(primerEvento().nombre).toBe('SolicitudCitaAceptada');
      expect(primerEvento().payload).toEqual({
        solicitudId: SOLICITUD_ID,
        citaId: CITA_ORIGEN,
        usuarioId: 'usuario-1',
      });
      expect(JSON.stringify(primerEvento())).not.toContain('Paciente Reagenda');
    });

    it('debería propagar el 409 de una cita de origen terminal sin resolver la solicitud ni publicar', async () => {
      // Arrange
      const error = new TransicionEstadoInvalidaError(
        EstadoCita.CANCELADA,
        'reagendar',
      );
      mockCitasService.reagendarEnTx.mockRejectedValue(error);

      // Act & Assert
      await expect(
        service.aceptar(SOLICITUD_ID, soloInicio, usuario),
      ).rejects.toBe(error);
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });

    it.each([
      EstadoSolicitud.ACEPTADA,
      EstadoSolicitud.RECHAZADA,
      EstadoSolicitud.DESCARTADA,
    ])(
      'debería lanzar 409 si ya está %s, sin mover la cita',
      async (estado) => {
        // Arrange
        mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
          reagendamientoEn(estado),
        );

        // Act & Assert
        await expect(
          service.aceptar(SOLICITUD_ID, soloInicio, usuario),
        ).rejects.toBeInstanceOf(TransicionSolicitudInvalidaError);
        expect(mockCitasService.reagendarEnTx).not.toHaveBeenCalled();
      },
    );
  });

  describe('rechazar una petición de otra hora (Fase 3, R3)', () => {
    it('no debería tocar la cita de origen y debería devolver citaOrigen leída en el tx', async () => {
      // Arrange
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        reagendamientoEn(EstadoSolicitud.RECIBIDA),
      );
      mockCitasService.resumenesPorIds.mockResolvedValue(
        new Map([[CITA_ORIGEN, resumen(CITA_ORIGEN)]]),
      );

      // Act
      const result = await service.rechazar(SOLICITUD_ID, usuario);

      // Assert
      expect(mockCitasService.reagendarEnTx).not.toHaveBeenCalled();
      expect(mockCitasService.agendar).not.toHaveBeenCalled();
      expect(mockCitasService.resumenesPorIds).toHaveBeenCalledWith(
        [CITA_ORIGEN],
        'tenant-1',
        'tx',
      );
      expect(result).toMatchObject({
        estado: EstadoSolicitud.RECHAZADA,
        tipo: TipoSolicitud.REAGENDAMIENTO,
        citaId: null,
        citaOrigen: { estado: EstadoCita.CONFIRMADA },
      });
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
      expect(mockEventos.publicar).toHaveBeenCalledTimes(1);
      expect(txDelPrimerEvento()).toBe('tx');
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

  // ---------------------------------------------------------------------
  // ADR-12 §2: el hecho se escribe en la MISMA transacción que el cambio. Se
  // verifica que aceptar y rechazar publican DENTRO del callback de
  // `TransactionRunner.run` y con el contexto que ese callback recibe (el
  // mismo que reciben `agendar` y `guardar`).
  describe('publicación de hechos dentro de la transacción (ADR-12 §2)', () => {
    const txOperacion = { soy: 'tx-de-la-bandeja' };

    // ¿Estaba el callback de `run` en curso cuando se llamó a `publicar`?
    let enTransaccion: boolean;
    let publicadoEnTransaccion: boolean[];

    beforeEach(() => {
      enTransaccion = false;
      publicadoEnTransaccion = [];
      mockTx.run.mockImplementation(
        async (work: (tx: unknown) => Promise<unknown>) => {
          enTransaccion = true;
          try {
            return await work(txOperacion);
          } finally {
            enTransaccion = false;
          }
        },
      );
      mockEventos.publicar.mockImplementation(() => {
        publicadoEnTransaccion.push(enTransaccion);
        return Promise.resolve();
      });
      mockSolicitudRepository.buscarPorIdParaActualizar.mockResolvedValue(
        solicitudEn(EstadoSolicitud.RECIBIDA),
      );
    });

    it('aceptar: publica SolicitudCitaAceptada dentro del callback, con el tx con el que agenda y guarda', async () => {
      // Act
      await service.aceptar(SOLICITUD_ID, dto, usuario);

      // Assert
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(publicadoEnTransaccion).toEqual([true]);
      expect(primerEvento().nombre).toBe('SolicitudCitaAceptada');
      expect(txDelPrimerEvento()).toBe(txOperacion);
      // `CitaCreada` lo publica `agendar` con este mismo tx
      expect(primerAgendar()[2]).toBe(txOperacion);
      expect(mockSolicitudRepository.guardar).toHaveBeenCalledWith(
        expect.any(SolicitudCita),
        txOperacion,
      );
    });

    it('rechazar: publica SolicitudCitaRechazada dentro del callback, con el tx con el que guarda', async () => {
      // Act
      await service.rechazar(SOLICITUD_ID, usuario);

      // Assert
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(publicadoEnTransaccion).toEqual([true]);
      expect(primerEvento().nombre).toBe('SolicitudCitaRechazada');
      expect(txDelPrimerEvento()).toBe(txOperacion);
      expect(mockSolicitudRepository.guardar).toHaveBeenCalledWith(
        expect.any(SolicitudCita),
        txOperacion,
      );
    });
  });
});
