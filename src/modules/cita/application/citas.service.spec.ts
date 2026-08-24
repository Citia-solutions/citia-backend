import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { EventoDominio } from '../../../shared/application/publicador-eventos';
import { CambioCita, TipoCambio } from '../domain/cambio-cita.entity';
import { Cita, EstadoCita } from '../domain/cita.entity';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CitaDashboardDto } from '../presentation/dto/cita-dashboard.dto';
import { CitaResponseDto } from '../presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';
import { PacientesService } from '../../paciente/application/pacientes.service';
import { CitasService } from './citas.service';
import { CitaNoEncontradaError } from './cita-no-encontrada.error';
import { DatosPacienteRequeridosError } from './datos-paciente-requeridos.error';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';

describe('CitasService', () => {
  let service: CitasService;
  let mockCitaRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarDelDiaPorProfesional: jest.Mock;
  };
  let mockCambioCitaRepository: {
    registrar: jest.Mock;
    historialDeCita: jest.Mock;
  };
  let mockEventos: { publicar: jest.Mock };
  let mockPacienteRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorRut: jest.Mock;
  };
  let mockPacientesService: { resolverOCrear: jest.Mock };
  // TransactionRunner de mentira: ejecuta el trabajo con un contexto ficticio,
  // sin transaccion real. Basta para probar el orden de las llamadas.
  let mockTx: { run: jest.Mock };

  const usuarioAutenticado: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  beforeEach(() => {
    mockCitaRepository = {
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarDelDiaPorProfesional: jest.fn(),
    };
    mockCambioCitaRepository = {
      registrar: jest.fn().mockResolvedValue(undefined),
      historialDeCita: jest.fn().mockResolvedValue([]),
    };
    mockEventos = { publicar: jest.fn().mockResolvedValue(undefined) };
    mockPacienteRepository = {
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorRut: jest.fn(),
    };
    mockPacientesService = { resolverOCrear: jest.fn() };
    mockTx = {
      run: jest.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
    };

    service = new CitasService(
      mockCitaRepository,
      mockCambioCitaRepository,
      mockPacienteRepository,
      // PacientesService es una clase concreta: el doble no es estructuralmente
      // compatible, por eso el cast. Solo se usa `resolverOCrear`.
      mockPacientesService as unknown as PacientesService,
      mockTx,
      mockEventos,
      'America/Santiago',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Extrae, tipada, la Cita pasada al primer `guardar` (evita el `any` de
  // mock.calls). El adaptador real recibe una entidad de dominio Cita.
  const primeraCitaGuardada = (): Cita =>
    (mockCitaRepository.guardar.mock.calls as unknown as Cita[][])[0][0];

  describe('crearCita', () => {
    const dto: CrearCitaDto = {
      inicio: '2026-06-30T10:30:00Z',
      duracionMin: 30,
      tipoConsulta: 'Control',
      pacienteId: 'paciente-1',
    };

    it('debería validar que el paciente pertenece al tenant del usuario autenticado', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      await service.crearCita(dto, usuarioAutenticado);

      // Assert — el tenant sale del token, no del body
      expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
        dto.pacienteId,
        usuarioAutenticado.tenantId,
        'tx',
      );
    });

    it('debería lanzar PacienteNoEncontradoError cuando el paciente no existe o es de otro tenant', async () => {
      // Arrange — el puerto devuelve null (paciente inexistente en este tenant)
      mockPacienteRepository.buscarPorId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.crearCita(dto, usuarioAutenticado),
      ).rejects.toBeInstanceOf(PacienteNoEncontradoError);

      // No se debe intentar guardar la cita
      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería crear una cita PENDIENTE con tenantId/usuarioId del token y guardarla (happy path)', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      const result = await service.crearCita(dto, usuarioAutenticado);

      // Assert — se guardó una Cita de dominio con los datos correctos
      expect(mockCitaRepository.guardar).toHaveBeenCalledTimes(1);
      const citaGuardada = primeraCitaGuardada();
      expect(citaGuardada).toBeInstanceOf(Cita);
      expect(citaGuardada.estado).toBe(EstadoCita.PENDIENTE);
      expect(citaGuardada.tenantId).toBe(usuarioAutenticado.tenantId);
      expect(citaGuardada.usuarioId).toBe(usuarioAutenticado.userId);
      expect(citaGuardada.pacienteId).toBe(dto.pacienteId);
      expect(citaGuardada.duracionMin).toBe(dto.duracionMin);
      expect(citaGuardada.tipoConsulta).toBe(dto.tipoConsulta);
      expect(citaGuardada.inicio).toEqual(new Date(dto.inicio));

      // Assert — respuesta DTO
      expect(result).toBeInstanceOf(CitaResponseDto);
      expect(result.id).toBe('cita-1');
      expect(result.estado).toBe(EstadoCita.PENDIENTE);
      expect(result.pacienteId).toBe(dto.pacienteId);
    });

    it('NO debe tomar tenantId/usuarioId del dto — solo del usuario autenticado', async () => {
      // Arrange — el dto no expone tenantId/usuarioId (whitelist), pero forzamos
      // valores maliciosos para probar que se ignoran a nivel de service.
      const dtoMalicioso = {
        ...dto,
        tenantId: 'tenant-ATACANTE',
        usuarioId: 'usuario-ATACANTE',
      } as CrearCitaDto & { tenantId: string; usuarioId: string };

      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      await service.crearCita(dtoMalicioso, usuarioAutenticado);

      // Assert — se usan los datos del token, no los del body
      const citaGuardada = primeraCitaGuardada();
      expect(citaGuardada.tenantId).toBe('tenant-1');
      expect(citaGuardada.usuarioId).toBe('usuario-1');
    });

    it('debería resolver-o-crear el paciente cuando llegan sus datos en vez de pacienteId', async () => {
      // Arrange — formulario "nueva cita" con los datos del paciente
      const dtoConPaciente: CrearCitaDto = {
        inicio: '2026-06-30T10:30:00Z',
        duracionMin: 30,
        tipoConsulta: 'Primera consulta',
        paciente: {
          rut: '12.345.678-5',
          nombre: 'Ana Soto',
          telefono: '+56 9 1111 1111',
          correo: 'ana@mail.com',
          consentimiento: true,
        },
      };
      mockPacientesService.resolverOCrear.mockResolvedValue({
        id: 'paciente-nuevo',
        rut: '123456785',
        nombre: 'Ana Soto',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      const result = await service.crearCita(
        dtoConPaciente,
        usuarioAutenticado,
      );

      // Assert — se delega en el caso de uso de paciente, con el tenant del token
      expect(mockPacientesService.resolverOCrear).toHaveBeenCalledWith(
        dtoConPaciente.paciente,
        usuarioAutenticado.tenantId,
        'tx',
      );
      // Assert — no se busca por id: no se recibió ninguno
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
      // Assert — la cita queda vinculada al paciente resuelto
      expect(primeraCitaGuardada().pacienteId).toBe('paciente-nuevo');
      expect(result.pacienteId).toBe('paciente-nuevo');
      expect(result.paciente?.nombre).toBe('Ana Soto');
    });

    it('debería agendar dentro de una transacción (paciente y cita, todo o nada)', async () => {
      // Arrange
      mockPacientesService.resolverOCrear.mockResolvedValue({
        id: 'paciente-nuevo',
        rut: null,
        nombre: 'Sin RUT',
        telefono: '+56 9 0000 0000',
        correo: null,
        consentimiento: false,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      await service.crearCita(
        {
          inicio: '2026-06-30T10:30:00Z',
          duracionMin: 30,
          tipoConsulta: 'Control',
          paciente: {
            nombre: 'Sin RUT',
            telefono: '+56 9 0000 0000',
            consentimiento: false,
          },
        },
        usuarioAutenticado,
      );

      // Assert — todo el trabajo pasó por el TransactionRunner
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      // Assert — ambos escritores recibieron el mismo contexto
      expect(mockPacientesService.resolverOCrear).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        'tx',
      );
      expect(mockCitaRepository.guardar).toHaveBeenCalledWith(
        expect.any(Cita),
        'tx',
      );
    });

    it('debería lanzar DatosPacienteRequeridosError si no llega ni pacienteId ni paciente', async () => {
      // Act & Assert
      await expect(
        service.crearCita(
          {
            inicio: '2026-06-30T10:30:00Z',
            duracionMin: 30,
            tipoConsulta: 'Control',
          },
          usuarioAutenticado,
        ),
      ).rejects.toBeInstanceOf(DatosPacienteRequeridosError);

      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
    });
  });

  describe('transiciones de estado', () => {
    const CITA_ID = 'cita-1';

    // Devuelve una cita reconstituida en el estado pedido, como la traeria el
    // repositorio desde BD.
    const citaEn = (
      estado: EstadoCita,
      inicio = new Date('2026-08-25T14:00:00Z'),
    ) =>
      Cita.reconstituir({
        id: CITA_ID,
        inicio,
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado,
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'usuario-1',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });

    const prepararCita = (estado: EstadoCita, inicio?: Date) => {
      const cita = citaEn(estado, inicio);
      mockCitaRepository.buscarPorId.mockResolvedValue(cita);
      mockCitaRepository.guardar.mockImplementation((c: Cita) =>
        Promise.resolve(c),
      );
      return cita;
    };

    // Extrae, tipado, el CambioCita pasado al primer `registrar`.
    const primerCambio = (): CambioCita =>
      (
        mockCambioCitaRepository.registrar.mock
          .calls as unknown as CambioCita[][]
      )[0][0];

    it('deberia confirmar una cita pendiente y dejar el cambio en la bitacora', async () => {
      // Arrange
      prepararCita(EstadoCita.PENDIENTE);

      // Act
      const result = await service.confirmar(CITA_ID, usuarioAutenticado);

      // Assert - el estado se movio
      expect(result.estado).toBe(EstadoCita.CONFIRMADA);
      // Assert - quedo registrado el antes y el despues
      const cambio = primerCambio();
      expect(cambio.tipo).toBe(TipoCambio.CONFIRMADA);
      expect(cambio.estadoAnterior).toBe(EstadoCita.PENDIENTE);
      expect(cambio.estadoNuevo).toBe(EstadoCita.CONFIRMADA);
      expect(cambio.actorId).toBe(usuarioAutenticado.userId);
    });

    it('deberia cancelar guardando el motivo en la bitacora', async () => {
      // Arrange
      prepararCita(EstadoCita.PENDIENTE);

      // Act
      await service.cancelar(CITA_ID, usuarioAutenticado, 'El paciente aviso');

      // Assert
      expect(primerCambio().motivo).toBe('El paciente aviso');
      expect(primerCambio().tipo).toBe(TipoCambio.CANCELADA);
    });

    it('deberia propagar TransicionEstadoInvalidaError sin escribir nada', async () => {
      // Arrange - confirmar una cita ya cancelada es ilegal
      prepararCita(EstadoCita.CANCELADA);

      // Act & Assert
      await expect(
        service.confirmar(CITA_ID, usuarioAutenticado),
      ).rejects.toBeInstanceOf(TransicionEstadoInvalidaError);

      // Ni la cita ni la bitacora se tocan
      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
      expect(mockCambioCitaRepository.registrar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });

    it('deberia lanzar CitaNoEncontradaError si la cita es de otro tenant', async () => {
      // Arrange - el repositorio filtra por tenant y no la encuentra
      mockCitaRepository.buscarPorId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.confirmar(CITA_ID, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CitaNoEncontradaError);

      // Assert - se busco acotado al tenant del token
      expect(mockCitaRepository.buscarPorId).toHaveBeenCalledWith(
        CITA_ID,
        usuarioAutenticado.tenantId,
        'tx',
      );
    });

    it('deberia marcar asistencia solo desde confirmada', async () => {
      // Arrange
      prepararCita(EstadoCita.CONFIRMADA);

      // Act
      const result = await service.marcarAsistencia(
        CITA_ID,
        usuarioAutenticado,
      );

      // Assert
      expect(result.estado).toBe(EstadoCita.ASISTIO);
    });

    it('deberia guardar cita, bitacora y evento en la misma transaccion', async () => {
      // Arrange
      prepararCita(EstadoCita.PENDIENTE);

      // Act
      await service.confirmar(CITA_ID, usuarioAutenticado);

      // Assert - una sola transaccion, y ambas escrituras con su contexto
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(mockCitaRepository.guardar).toHaveBeenCalledWith(
        expect.any(Cita),
        'tx',
      );
      expect(mockCambioCitaRepository.registrar).toHaveBeenCalledWith(
        expect.any(CambioCita),
        'tx',
      );
      expect(mockEventos.publicar).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'CitaConfirmada' }),
      );
    });
  });

  describe('reagendar', () => {
    const CITA_ID = 'cita-1';
    const INICIO_ORIGINAL = new Date('2026-08-25T14:00:00Z');
    const NUEVO_INICIO = '2026-08-26T16:00:00Z';

    const prepararConfirmada = () => {
      const cita = Cita.reconstituir({
        id: CITA_ID,
        inicio: INICIO_ORIGINAL,
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado: EstadoCita.CONFIRMADA,
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'usuario-1',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });
      mockCitaRepository.buscarPorId.mockResolvedValue(cita);
      mockCitaRepository.guardar.mockImplementation((c: Cita) =>
        Promise.resolve(c),
      );
      return cita;
    };

    it('deberia mover la cita y devolverla a pendiente', async () => {
      // Arrange
      prepararConfirmada();

      // Act
      const result = await service.reagendar(
        CITA_ID,
        { inicio: NUEVO_INICIO },
        usuarioAutenticado,
      );

      // Assert - misma cita, nueva hora, confirmacion invalidada
      expect(result.id).toBe(CITA_ID);
      expect(result.inicio).toEqual(new Date(NUEVO_INICIO));
      expect(result.estado).toBe(EstadoCita.PENDIENTE);
    });

    it('deberia dejar el antes y el despues en la bitacora (materia prima de RF-08)', async () => {
      // Arrange
      prepararConfirmada();

      // Act
      await service.reagendar(
        CITA_ID,
        { inicio: NUEVO_INICIO, motivo: 'Choque de agenda' },
        usuarioAutenticado,
      );

      // Assert
      const cambio = (
        mockCambioCitaRepository.registrar.mock
          .calls as unknown as CambioCita[][]
      )[0][0];
      expect(cambio.tipo).toBe(TipoCambio.REAGENDADA);
      expect(cambio.inicioAnterior).toEqual(INICIO_ORIGINAL);
      expect(cambio.inicioNuevo).toEqual(new Date(NUEVO_INICIO));
      expect(cambio.motivo).toBe('Choque de agenda');
      expect(cambio.estadoAnterior).toBe(EstadoCita.CONFIRMADA);
      expect(cambio.estadoNuevo).toBe(EstadoCita.PENDIENTE);
    });

    it('deberia publicar el hecho con la hora anterior', async () => {
      // Arrange
      prepararConfirmada();

      // Act
      await service.reagendar(
        CITA_ID,
        { inicio: NUEVO_INICIO },
        usuarioAutenticado,
      );

      // Assert - US-03 y US-05 se enchufaran a este hecho sin tocar el caso de uso
      const evento = (
        mockEventos.publicar.mock.calls as unknown as EventoDominio[][]
      )[0][0];
      expect(evento.nombre).toBe('CitaReagendada');
      expect(evento.tenantId).toBe('tenant-1');
      expect(evento.payload.citaId).toBe(CITA_ID);
      expect(evento.payload.inicioAnterior).toEqual(INICIO_ORIGINAL);
    });
  });

  describe('citasDeHoy', () => {
    const reconstituir = (id: string, pacienteId: string, inicio: Date): Cita =>
      Cita.reconstituir({
        id,
        inicio,
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado: EstadoCita.CONFIRMADA,
        tenantId: 'tenant-1',
        pacienteId,
        usuarioId: 'usuario-1',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });

    it('debería consultar el repositorio con el tenantId y usuarioId del token', async () => {
      // Arrange
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([]);

      // Act
      await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(
        mockCitaRepository.buscarDelDiaPorProfesional,
      ).toHaveBeenCalledTimes(1);
      const [tenantId, usuarioId, dia] = (
        mockCitaRepository.buscarDelDiaPorProfesional.mock.calls as unknown as [
          string,
          string,
          Date,
        ][]
      )[0];
      expect(tenantId).toBe(usuarioAutenticado.tenantId);
      expect(usuarioId).toBe(usuarioAutenticado.userId);
      expect(dia).toBeInstanceOf(Date);
    });

    it('debería mapear cada cita a CitaDashboardDto con la hora "HH:mm" en la zona de la clínica', async () => {
      // Arrange — 18:05Z = 14:05 en America/Santiago (UTC-4). Instante UTC
      // explícito: el test es determinista sin importar la TZ de la máquina.
      const inicio = new Date('2026-06-30T18:05:00Z');
      const cita = reconstituir('cita-1', 'paciente-1', inicio);
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([cita]);
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        nombre: 'Ana Pérez',
        contacto: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(CitaDashboardDto);
      expect(result[0].hora).toBe('14:05');
      expect(result[0].pacienteNombre).toBe('Ana Pérez');
      expect(result[0].id).toBe('cita-1');
      expect(result[0].estado).toBe(EstadoCita.CONFIRMADA);
    });

    it('debería resolver los nombres de paciente SIN N+1: un buscarPorId por id único', async () => {
      // Arrange — 3 citas pero solo 2 pacientes distintos
      const base = new Date();
      base.setHours(9, 0, 0, 0);
      const citas = [
        reconstituir('c1', 'paciente-A', base),
        reconstituir('c2', 'paciente-A', new Date(base.getTime() + 60000)),
        reconstituir('c3', 'paciente-B', new Date(base.getTime() + 120000)),
      ];
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue(citas);
      mockPacienteRepository.buscarPorId.mockImplementation((id: string) =>
        Promise.resolve({
          id,
          nombre: id === 'paciente-A' ? 'Ana' : 'Beto',
          contacto: 'x',
          consentimiento: true,
          tenantId: 'tenant-1',
        }),
      );

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert — 3 citas, pero solo 2 lookups (ids únicos)
      expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledTimes(2);
      expect(result.map((c) => c.pacienteNombre)).toEqual([
        'Ana',
        'Ana',
        'Beto',
      ]);
    });

    it('debería usar "Paciente" como nombre por defecto cuando el paciente no se resuelve', async () => {
      // Arrange
      const inicio = new Date();
      inicio.setHours(8, 0, 0, 0);
      const cita = reconstituir('cita-1', 'paciente-fantasma', inicio);
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([cita]);
      mockPacienteRepository.buscarPorId.mockResolvedValue(null);

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result[0].pacienteNombre).toBe('Paciente');
    });

    it('debería preservar el orden que entrega el repositorio (ASC)', async () => {
      // Arrange — el repo ya devuelve en orden ASC; el service debe respetarlo
      const base = new Date();
      base.setHours(9, 0, 0, 0);
      const citas = [
        reconstituir('c1', 'paciente-A', base),
        reconstituir('c2', 'paciente-B', new Date(base.getTime() + 3600000)),
        reconstituir('c3', 'paciente-C', new Date(base.getTime() + 7200000)),
      ];
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue(citas);
      mockPacienteRepository.buscarPorId.mockImplementation((id: string) =>
        Promise.resolve({
          id,
          nombre: id,
          contacto: 'x',
          consentimiento: true,
          tenantId: 'tenant-1',
        }),
      );

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it('debería devolver una lista vacía cuando no hay citas del día', async () => {
      // Arrange
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([]);

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result).toEqual([]);
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
    });
  });
});
