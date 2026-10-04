import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { CambioContactoVacioError } from '../domain/exceptions/cambio-contacto-vacio.error';
import { CorreoPacienteRequeridoError } from '../domain/exceptions/correo-paciente-requerido.error';
import { Paciente } from '../domain/paciente.entity';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacienteResponseDto } from '../presentation/dto/paciente-response.dto';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';
import { PacientesService } from './pacientes.service';

describe('PacientesService', () => {
  let service: PacientesService;
  let mockPacienteRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorRut: jest.Mock;
    buscarPorIds: jest.Mock;
    actualizarContacto: jest.Mock;
    completarCorreoSiVacio: jest.Mock;
  };

  const TENANT = 'tenant-1';
  const PACIENTE_ID = '3f1c2b9e-8a4d-4c7e-9b21-5d6f7a8b9c0d';

  const dto: CrearPacienteDto = {
    rut: '12.345.678-5',
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
  };

  // Fila ya persistida (ficha existente). `correo` por defecto en NULL: la
  // ficha vieja típica de antes de la Fase 2 (ADR-13, opción F4).
  const existente = (correo: string | null = null): Paciente =>
    Paciente.reconstituir({
      id: 'paciente-ya-existe',
      rut: '123456785',
      nombre: 'Ana Soto (ficha)',
      telefono: '+56 9 9999 9999',
      correo,
      consentimiento: true,
      tenantId: TENANT,
    });

  beforeEach(() => {
    mockPacienteRepository = {
      guardar: jest
        .fn()
        .mockImplementation((p: Partial<Paciente>) =>
          Promise.resolve({ ...p, id: 'paciente-1' }),
        ),
      buscarPorId: jest.fn(),
      buscarPorRut: jest.fn().mockResolvedValue(null),
      buscarPorIds: jest.fn().mockResolvedValue([]),
      actualizarContacto: jest.fn().mockResolvedValue(true),
      completarCorreoSiVacio: jest.fn().mockResolvedValue(true),
    };
    service = new PacientesService(mockPacienteRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolverOCrear', () => {
    it('debería normalizar el RUT antes de buscarlo', async () => {
      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert — se busca por la forma canónica, no por lo que tecleó el usuario
      expect(mockPacienteRepository.buscarPorRut).toHaveBeenCalledWith(
        '123456785',
        TENANT,
        undefined,
      );
    });

    it('debería crear el paciente con el RUT canónico cuando no existe', async () => {
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

    it('debería crear a través de la fábrica de dominio (instancia de Paciente)', async () => {
      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert
      const [guardado] = mockPacienteRepository.guardar.mock.calls[0] as [
        unknown,
      ];
      expect(guardado).toBeInstanceOf(Paciente);
    });

    it('debería guardar el correo normalizado aunque el llamador no pase por el DTO', async () => {
      // Act — p. ej. la aceptación de una solicitud, que arma el dto a mano
      await service.resolverOCrear(
        { ...dto, correo: '  Ana.Soto@Mail.COM ' },
        TENANT,
      );

      // Assert
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ correo: 'ana.soto@mail.com' }),
        undefined,
      );
    });

    it('debería rechazar crear un paciente sin correo sin tocar la BD (ADR-13 §14)', async () => {
      // Arrange — un llamador que no pasó por el ValidationPipe
      const sinCorreo = {
        nombre: 'Sin correo',
        telefono: '+56 9 0000 0000',
        consentimiento: true,
      } as CrearPacienteDto;

      // Act & Assert
      await expect(
        service.resolverOCrear(sinCorreo, TENANT),
      ).rejects.toBeInstanceOf(CorreoPacienteRequeridoError);

      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería rechazar un correo en blanco al crear', async () => {
      // Act & Assert
      await expect(
        service.resolverOCrear({ ...dto, correo: '   ' }, TENANT),
      ).rejects.toBeInstanceOf(CorreoPacienteRequeridoError);

      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
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
      // Act
      await service.resolverOCrear(
        {
          nombre: 'Sin RUT',
          telefono: '+56 9 0000 0000',
          correo: 'sin.rut@mail.com',
          consentimiento: false,
        },
        TENANT,
      );

      // Assert — sin RUT no hay identidad que resolver: siempre se crea
      expect(mockPacienteRepository.buscarPorRut).not.toHaveBeenCalled();
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ rut: null, correo: 'sin.rut@mail.com' }),
        undefined,
      );
    });

    it('debería propagar el contexto de transacción a las dos operaciones', async () => {
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

    describe('paciente existente por RUT (ADR-13 §14, matiza ADR-09 §3)', () => {
      it('debería vincularlo sin crear otro', async () => {
        // Arrange
        const ficha = existente('ana@mail.com');
        mockPacienteRepository.buscarPorRut.mockResolvedValue(ficha);

        // Act
        const result = await service.resolverOCrear(dto, TENANT);

        // Assert — se vincula al existente; NO se duplica
        expect(result).toBe(ficha);
        expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
      });

      it('debería completar el correo cuando el guardado está vacío (NULL)', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        const result = await service.resolverOCrear(dto, TENANT);

        // Assert — escritura condicional, con el tenant; el resto de la
        // ficha no cambia
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'ana@mail.com',
          undefined,
        );
        expect(result.correo).toBe('ana@mail.com');
        expect(result.nombre).toBe('Ana Soto (ficha)');
        expect(result.telefono).toBe('+56 9 9999 9999');
        expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
      });

      it('debería completar también un correo guardado en blanco', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente('  '));

        // Act
        await service.resolverOCrear(dto, TENANT);

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledTimes(1);
      });

      it('debería completar con el correo normalizado', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        await service.resolverOCrear(
          { ...dto, correo: ' Ana@Mail.COM ' },
          TENANT,
        );

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'ana@mail.com',
          undefined,
        );
      });

      it('NO debería tocar un correo distinto ya guardado', async () => {
        // Arrange
        const ficha = existente('otro@mail.com');
        mockPacienteRepository.buscarPorRut.mockResolvedValue(ficha);

        // Act
        const result = await service.resolverOCrear(dto, TENANT);

        // Assert — nunca se reemplaza: ni escritura condicional ni guardar
        expect(result.correo).toBe('otro@mail.com');
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).not.toHaveBeenCalled();
        expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
      });

      it('NO debería escribir cuando el correo guardado es el mismo', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(
          existente('ana@mail.com'),
        );

        // Act
        await service.resolverOCrear(dto, TENANT);

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).not.toHaveBeenCalled();
      });

      it('debería escribir el correo dentro de la transacción del llamador', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        await service.resolverOCrear(dto, TENANT, 'tx');

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'ana@mail.com',
          'tx',
        );
      });

      it('debería releer la ficha si otra transacción completó el correo primero', async () => {
        // Arrange — la escritura condicional no encontró la fila vacía
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));
        mockPacienteRepository.completarCorreoSiVacio.mockResolvedValue(false);
        const ganadora = existente('primero@mail.com');
        mockPacienteRepository.buscarPorId.mockResolvedValue(ganadora);

        // Act
        const result = await service.resolverOCrear(dto, TENANT, 'tx');

        // Assert — se devuelve lo que quedó, sin pisarlo
        expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'tx',
        );
        expect(result).toBe(ganadora);
      });

      it('debería vincular sin error aunque el que llega no traiga correo', async () => {
        // Arrange — un llamador interno sin DTO; la fábrica solo aplica al crear
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        const result = await service.resolverOCrear(
          { ...dto, correo: undefined as unknown as string },
          TENANT,
        );

        // Assert
        expect(result.id).toBe('paciente-ya-existe');
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('crearPaciente', () => {
    it('debería devolver el RUT formateado para mostrar', async () => {
      // Act
      const result = await service.crearPaciente(dto, TENANT);

      // Assert — canónico en BD, formateado hacia afuera
      expect(result.rut).toBe('12.345.678-5');
      expect(result.id).toBe('paciente-1');
      expect(result.tenantId).toBe(TENANT);
    });

    it('debería devolver rut null cuando el paciente no tiene', async () => {
      // Act
      const result = await service.crearPaciente(
        {
          nombre: 'Sin RUT',
          telefono: '+56 9 0000 0000',
          correo: 'sin.rut@mail.com',
          consentimiento: false,
        },
        TENANT,
      );

      // Assert
      expect(result.rut).toBeNull();
    });
  });

  describe('actualizarContacto (PATCH /pacientes/:id)', () => {
    const tras = (correo: string | null, telefono = '+56 9 9999 9999') =>
      Paciente.reconstituir({
        id: PACIENTE_ID,
        rut: '123456785',
        nombre: 'Ana Soto',
        telefono,
        correo,
        consentimiento: true,
        tenantId: TENANT,
      });

    it('debería escribir solo los campos presentes, filtrando por tenant', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('ana@mail.com'),
      );

      // Act
      await service.actualizarContacto(
        PACIENTE_ID,
        { correo: 'ana@mail.com' },
        TENANT,
      );

      // Assert
      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
        { correo: 'ana@mail.com' },
      );
    });

    it('debería normalizar el correo antes de escribirlo', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('ana@mail.com'),
      );

      // Act
      await service.actualizarContacto(
        PACIENTE_ID,
        { correo: '  ANA@Mail.com ' },
        TENANT,
      );

      // Assert
      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
        { correo: 'ana@mail.com' },
      );
    });

    it('debería responder con el paciente releído, en el DTO del alta', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('nuevo@mail.com', '+56 9 2222 2222'),
      );

      // Act
      const result = await service.actualizarContacto(
        PACIENTE_ID,
        { telefono: '+56 9 2222 2222', correo: 'nuevo@mail.com' },
        TENANT,
      );

      // Assert
      expect(result).toBeInstanceOf(PacienteResponseDto);
      expect(result).toEqual({
        id: PACIENTE_ID,
        rut: '12.345.678-5',
        nombre: 'Ana Soto',
        telefono: '+56 9 2222 2222',
        correo: 'nuevo@mail.com',
        consentimiento: true,
        tenantId: TENANT,
      });
      expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
      );
    });

    it('debería permitir reemplazar un correo ya guardado (edición explícita)', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('corregido@mail.com'),
      );

      // Act
      const result = await service.actualizarContacto(
        PACIENTE_ID,
        { correo: 'corregido@mail.com' },
        TENANT,
      );

      // Assert — a diferencia de la vinculación por RUT, aquí sí se escribe
      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalled();
      expect(result.correo).toBe('corregido@mail.com');
    });

    it('debería lanzar PacienteNoEncontradoError si el paciente es de otro tenant (o no existe)', async () => {
      // Arrange — el UPDATE filtrado por tenant no encontró fila
      mockPacienteRepository.actualizarContacto.mockResolvedValue(false);

      // Act & Assert
      await expect(
        service.actualizarContacto(
          PACIENTE_ID,
          { telefono: '+56 9 2222 2222' },
          'tenant-ajeno',
        ),
      ).rejects.toBeInstanceOf(PacienteNoEncontradoError);

      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalledWith(
        PACIENTE_ID,
        'tenant-ajeno',
        { telefono: '+56 9 2222 2222' },
      );
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
    });

    it('debería lanzar CambioContactoVacioError sin tocar la BD si no trae campos', async () => {
      // Act & Assert
      await expect(
        service.actualizarContacto(PACIENTE_ID, {}, TENANT),
      ).rejects.toBeInstanceOf(CambioContactoVacioError);

      expect(mockPacienteRepository.actualizarContacto).not.toHaveBeenCalled();
    });

    it('debería lanzar CorreoPacienteRequeridoError sin tocar la BD si el correo viene en blanco', async () => {
      // Act & Assert
      await expect(
        service.actualizarContacto(PACIENTE_ID, { correo: '  ' }, TENANT),
      ).rejects.toBeInstanceOf(CorreoPacienteRequeridoError);

      expect(mockPacienteRepository.actualizarContacto).not.toHaveBeenCalled();
    });
  });
});
