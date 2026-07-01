import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { Cita, EstadoCita } from '../domain/cita.entity';
import { CitaDashboardDto } from '../presentation/dto/cita-dashboard.dto';
import { CitaResponseDto } from '../presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';
import { CitasService } from './citas.service';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';

describe('CitasService', () => {
  let service: CitasService;
  let mockCitaRepository: {
    guardar: jest.Mock;
    buscarDelDiaPorProfesional: jest.Mock;
  };
  let mockPacienteRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
  };

  const usuarioAutenticado: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  beforeEach(() => {
    mockCitaRepository = {
      guardar: jest.fn(),
      buscarDelDiaPorProfesional: jest.fn(),
    };
    mockPacienteRepository = {
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
    };

    service = new CitasService(mockCitaRepository, mockPacienteRepository);
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
        nombre: 'Ana',
        contacto: 'ana@mail.com',
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
        nombre: 'Ana',
        contacto: 'ana@mail.com',
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
        nombre: 'Ana',
        contacto: 'ana@mail.com',
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

    it('debería mapear cada cita a CitaDashboardDto con la hora "HH:mm" derivada de inicio', async () => {
      // Arrange — 14:05 hora local
      const inicio = new Date();
      inicio.setHours(14, 5, 0, 0);
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
