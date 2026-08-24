import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacientesService } from './pacientes.service';

describe('PacientesService', () => {
  let service: PacientesService;
  let mockPacienteRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorRut: jest.Mock;
  };

  const TENANT = 'tenant-1';

  const dto: CrearPacienteDto = {
    rut: '12.345.678-5',
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
  };

  beforeEach(() => {
    mockPacienteRepository = {
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorRut: jest.fn(),
    };
    service = new PacientesService(mockPacienteRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolverOCrear', () => {
    it('debería normalizar el RUT antes de buscarlo', async () => {
      // Arrange
      mockPacienteRepository.buscarPorRut.mockResolvedValue(null);
      mockPacienteRepository.guardar.mockImplementation((p: unknown) =>
        Promise.resolve({ ...(p as object), id: 'paciente-1' }),
      );

      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert — se busca por la forma canónica, no por lo que tecleó el usuario
      expect(mockPacienteRepository.buscarPorRut).toHaveBeenCalledWith(
        '123456785',
        TENANT,
        undefined,
      );
    });

    it('debería devolver el paciente existente sin crear otro cuando el RUT ya está en el tenant', async () => {
      // Arrange
      const existente = {
        id: 'paciente-ya-existe',
        rut: '123456785',
        nombre: 'Ana Soto',
        telefono: '+56 9 9999 9999',
        correo: null,
        consentimiento: true,
        tenantId: TENANT,
      };
      mockPacienteRepository.buscarPorRut.mockResolvedValue(existente);

      // Act
      const result = await service.resolverOCrear(dto, TENANT);

      // Assert — se vincula al existente; NO se duplica
      expect(result).toBe(existente);
      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería crear el paciente con el RUT canónico cuando no existe', async () => {
      // Arrange
      mockPacienteRepository.buscarPorRut.mockResolvedValue(null);
      mockPacienteRepository.guardar.mockImplementation((p: unknown) =>
        Promise.resolve({ ...(p as object), id: 'paciente-1' }),
      );

      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert — se persiste normalizado y con el tenant del token
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({
          rut: '123456785',
          nombre: 'Ana Soto',
          telefono: '+56 9 1111 1111',
          correo: 'ana@mail.com',
          consentimiento: true,
          tenantId: TENANT,
        }),
        undefined,
      );
    });

    it('debería rechazar un RUT con dígito verificador incorrecto sin tocar la BD', async () => {
      // Act & Assert
      await expect(
        service.resolverOCrear({ ...dto, rut: '12.345.678-9' }, TENANT),
      ).rejects.toBeInstanceOf(RutInvalidoError);

      expect(mockPacienteRepository.buscarPorRut).not.toHaveBeenCalled();
      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería crear sin buscar cuando no hay RUT (alta manual de alguien sin documento)', async () => {
      // Arrange
      mockPacienteRepository.guardar.mockImplementation((p: unknown) =>
        Promise.resolve({ ...(p as object), id: 'paciente-1' }),
      );

      // Act
      await service.resolverOCrear(
        {
          nombre: 'Sin RUT',
          telefono: '+56 9 0000 0000',
          consentimiento: false,
        },
        TENANT,
      );

      // Assert — sin RUT no hay identidad que resolver: siempre se crea
      expect(mockPacienteRepository.buscarPorRut).not.toHaveBeenCalled();
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ rut: null, correo: null }),
        undefined,
      );
    });

    it('debería propagar el contexto de transacción a las dos operaciones', async () => {
      // Arrange
      mockPacienteRepository.buscarPorRut.mockResolvedValue(null);
      mockPacienteRepository.guardar.mockResolvedValue({ id: 'paciente-1' });

      // Act
      await service.resolverOCrear(dto, TENANT, 'tx');

      // Assert
      expect(mockPacienteRepository.buscarPorRut).toHaveBeenCalledWith(
        '123456785',
        TENANT,
        'tx',
      );
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.anything(),
        'tx',
      );
    });
  });

  describe('crearPaciente', () => {
    it('debería devolver el RUT formateado para mostrar', async () => {
      // Arrange
      mockPacienteRepository.buscarPorRut.mockResolvedValue(null);
      mockPacienteRepository.guardar.mockImplementation((p: unknown) =>
        Promise.resolve({ ...(p as object), id: 'paciente-1' }),
      );

      // Act
      const result = await service.crearPaciente(dto, TENANT);

      // Assert — canónico en BD, formateado hacia afuera
      expect(result.rut).toBe('12.345.678-5');
      expect(result.id).toBe('paciente-1');
      expect(result.tenantId).toBe(TENANT);
    });

    it('debería devolver rut null cuando el paciente no tiene', async () => {
      // Arrange
      mockPacienteRepository.guardar.mockImplementation((p: unknown) =>
        Promise.resolve({ ...(p as object), id: 'paciente-1' }),
      );

      // Act
      const result = await service.crearPaciente(
        {
          nombre: 'Sin RUT',
          telefono: '+56 9 0000 0000',
          consentimiento: false,
        },
        TENANT,
      );

      // Assert
      expect(result.rut).toBeNull();
    });
  });
});
