import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { CitasService } from '../application/citas.service';
import { EnlacesCitaService } from '../application/enlaces-cita.service';
import { CitaNoEncontradaError } from '../application/cita-no-encontrada.error';
import { PacienteNoEncontradoError } from '../../paciente/application/paciente-no-encontrado.error';
import { RangoFechasInvalidoError } from '../application/rango-fechas-invalido.error';
import { PedidoPor } from '../domain/cambio-cita.entity';
import { EstadoCita } from '../domain/cita.entity';
import { CitaAunNoComienzaError } from '../domain/exceptions/cita-aun-no-comienza.error';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CitaDashboardDto } from './dto/cita-dashboard.dto';
import { CitaDetalleDto } from './dto/cita-detalle.dto';
import { PacienteResponseDto } from '../../paciente/presentation/dto/paciente-response.dto';
import { CitaResponseDto } from './dto/cita-response.dto';
import { CrearCitaDto } from './dto/crear-cita.dto';
import { CitasController } from './citas.controller';

describe('CitasController', () => {
  let controller: CitasController;
  let mockCitasService: {
    crearCita: jest.Mock;
    citasDeHoy: jest.Mock;
    detalle: jest.Mock;
    listarEnRango: jest.Mock;
    cancelar: jest.Mock;
    reagendar: jest.Mock;
    marcarAsistencia: jest.Mock;
    marcarInasistencia: jest.Mock;
  };
  let mockEnlacesCita: { invalidar: jest.Mock };

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  beforeEach(async () => {
    mockCitasService = {
      crearCita: jest.fn(),
      citasDeHoy: jest.fn(),
      detalle: jest.fn(),
      listarEnRango: jest.fn(),
      cancelar: jest.fn(),
      reagendar: jest.fn(),
      marcarAsistencia: jest.fn(),
      marcarInasistencia: jest.fn(),
    };
    mockEnlacesCita = { invalidar: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CitasController],
      providers: [
        { provide: CitasService, useValue: mockCitasService },
        { provide: EnlacesCitaService, useValue: mockEnlacesCita },
      ],
    })
      // El guard real requiere passport/JWT; aquí probamos solo el controller.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CitasController>(CitasController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crear (POST /citas)', () => {
    const pacienteResuelto = new PacienteResponseDto({
      id: 'paciente-1',
      rut: '11.111.111-1',
      nombre: 'Ana',
      telefono: '+56 9 1111 1111',
      correo: 'ana@mail.com',
      consentimiento: true,
      tenantId: 'tenant-1',
    });

    const dto: CrearCitaDto = {
      inicio: '2026-06-30T10:30:00Z',
      duracionMin: 30,
      tipoConsulta: 'Control',
      pacienteId: 'paciente-1',
    };

    it('debería delegar en el service pasando el @CurrentUser y devolver el response DTO', async () => {
      // Arrange
      const response = new CitaResponseDto({
        id: 'cita-1',
        inicio: new Date(dto.inicio),
        duracionMin: dto.duracionMin,
        tipoConsulta: dto.tipoConsulta,
        estado: EstadoCita.PENDIENTE,
        pacienteId: dto.pacienteId as string,
        paciente: pacienteResuelto,
      });
      mockCitasService.crearCita.mockResolvedValue(response);

      // Act
      const result = await controller.crear(dto, usuario);

      // Assert — el usuario autenticado se pasa al service
      expect(mockCitasService.crearCita).toHaveBeenCalledWith(dto, usuario);
      // Assert — devuelve el DTO, no la entidad cruda
      expect(result).toBe(response);
      expect(result).toBeInstanceOf(CitaResponseDto);
    });

    it('debería mapear PacienteNoEncontradoError a BadRequestException (400)', async () => {
      // Arrange
      mockCitasService.crearCita.mockRejectedValue(
        new PacienteNoEncontradoError('paciente-x'),
      );

      // Act & Assert
      await expect(controller.crear(dto, usuario)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('debería mapear TransicionEstadoInvalidaError a ConflictException (409)', async () => {
      // Arrange
      mockCitasService.crearCita.mockRejectedValue(
        new TransicionEstadoInvalidaError(EstadoCita.CANCELADA, 'confirmar'),
      );

      // Act & Assert
      await expect(controller.crear(dto, usuario)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('debería propagar cualquier otro error sin transformarlo', async () => {
      // Arrange
      const error = new Error('fallo inesperado');
      mockCitasService.crearCita.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.crear(dto, usuario)).rejects.toBe(error);
    });
  });

  describe('hoy (GET /citas/hoy)', () => {
    it('debería delegar en el service con el @CurrentUser y devolver los dashboards', async () => {
      // Arrange
      const dashboard = new CitaDashboardDto({
        id: 'cita-1',
        pacienteNombre: 'Ana',
        fecha: '2026-06-30',
        hora: '10:30',
        inicio: new Date('2026-06-30T10:30:00Z'),
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado: EstadoCita.CONFIRMADA,
      });
      mockCitasService.citasDeHoy.mockResolvedValue([dashboard]);

      // Act
      const result = await controller.hoy(usuario);

      // Assert
      expect(mockCitasService.citasDeHoy).toHaveBeenCalledWith(usuario);
      expect(result).toEqual([dashboard]);
      expect(result[0]).toBeInstanceOf(CitaDashboardDto);
    });
  });

  describe('detalle (GET /citas/:id)', () => {
    it('debería delegar en el service con el id y el @CurrentUser', async () => {
      // Arrange
      const detalle = new CitaDetalleDto({
        id: 'cita-1',
        estado: EstadoCita.PENDIENTE,
        inicio: new Date('2026-09-25T13:00:00Z'),
        hora: '10:00',
        duracionMin: 30,
        tipoConsulta: 'Control',
        paciente: {
          id: 'paciente-1',
          nombre: 'Ana',
          rut: '12.345.678-5',
          telefono: '+56 9 1111 1111',
          correo: null,
        },
        accionesPermitidas: ['confirmar', 'cancelar', 'reagendar', 'editar'],
        confirmadaPor: null,
        canceladaPor: null,
      });
      mockCitasService.detalle.mockResolvedValue(detalle);

      // Act
      const result = await controller.detalle('cita-1', usuario);

      // Assert
      expect(mockCitasService.detalle).toHaveBeenCalledWith('cita-1', usuario);
      expect(result).toBe(detalle);
    });

    it('debería traducir CitaNoEncontradaError a 404 (inexistente u otro tenant)', async () => {
      // Arrange
      mockCitasService.detalle.mockRejectedValue(
        new CitaNoEncontradaError('cita-x'),
      );

      // Act & Assert
      await expect(
        controller.detalle('cita-x', usuario),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('debería propagar sin traducir un error de integridad cuando falta el paciente (500, no 404)', async () => {
      // Arrange: la cita existe pero su paciente no; es un fallo del servidor,
      // no del cliente. Convertirlo en 404 escondería la inconsistencia.
      const error = new Error('Integridad: el paciente no existe');
      mockCitasService.detalle.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.detalle('cita-1', usuario)).rejects.toBe(error);
    });
  });

  describe('US-07.01: marcas antes de la hora y quién lo pidió', () => {
    it.each(['asistencia', 'inasistencia'])(
      '%s: CitaAunNoComienzaError → 409 con su mensaje',
      async (ruta) => {
        // Arrange — los dobles se crean en el beforeEach: se eligen aquí
        const asistencia = ruta === 'asistencia';
        (asistencia
          ? mockCitasService.marcarAsistencia
          : mockCitasService.marcarInasistencia
        ).mockRejectedValue(new CitaAunNoComienzaError());

        // Act
        const error = await (
          asistencia
            ? controller.marcarAsistencia('cita-1', usuario)
            : controller.marcarInasistencia('cita-1', usuario)
        ).catch((e: unknown) => e);

        // Assert
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getStatus()).toBe(409);
        expect((error as ConflictException).message).toBe(
          'La cita todavía no comienza: la asistencia y la inasistencia se marcan desde su hora de inicio',
        );
      },
    );

    it('cancelar pasa motivo y pedidoPor al servicio', async () => {
      // Arrange
      mockCitasService.cancelar.mockResolvedValue({});

      // Act
      await controller.cancelar(
        'cita-1',
        { motivo: 'Avisó por teléfono', pedidoPor: PedidoPor.PACIENTE },
        usuario,
      );
      await controller.cancelar('cita-1', {}, usuario);

      // Assert
      expect(mockCitasService.cancelar).toHaveBeenNthCalledWith(
        1,
        'cita-1',
        usuario,
        'Avisó por teléfono',
        PedidoPor.PACIENTE,
      );
      expect(mockCitasService.cancelar).toHaveBeenNthCalledWith(
        2,
        'cita-1',
        usuario,
        undefined,
        undefined,
      );
    });

    it('reagendar pasa el DTO completo (con pedidoPor) al servicio', async () => {
      // Arrange
      mockCitasService.reagendar.mockResolvedValue({});
      const dto = {
        inicio: '2026-10-22T15:00:00-03:00',
        pedidoPor: PedidoPor.PROFESIONAL,
      };

      // Act
      await controller.reagendar('cita-1', dto, usuario);

      // Assert
      expect(mockCitasService.reagendar).toHaveBeenCalledWith(
        'cita-1',
        dto,
        usuario,
      );
    });
  });

  describe('invalidarEnlace (POST /citas/:id/enlace/invalidar)', () => {
    it('debería delegar en EnlacesCitaService con el id y el @CurrentUser, sin cuerpo de respuesta', async () => {
      // Act
      const result = await controller.invalidarEnlace('cita-1', usuario);

      // Assert
      expect(mockEnlacesCita.invalidar).toHaveBeenCalledWith('cita-1', usuario);
      expect(result).toBeUndefined();
    });

    it('debería responder 204 (HttpCode de la ruta)', () => {
      // Assert — metadato que Nest usa para el status de éxito
      const status: unknown = Reflect.getMetadata(
        '__httpCode__',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        CitasController.prototype.invalidarEnlace,
      );
      expect(status).toBe(204);
    });

    it('debería traducir CitaNoEncontradaError a 404 (otro tenant o inexistente)', async () => {
      // Arrange
      mockEnlacesCita.invalidar.mockRejectedValue(
        new CitaNoEncontradaError('cita-x'),
      );

      // Act & Assert
      await expect(
        controller.invalidarEnlace('cita-x', usuario),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar (GET /citas?desde&hasta)', () => {
    const query = { desde: '2026-09-21', hasta: '2026-09-27' };

    it('debería delegar en listarEnRango con desde, hasta y el @CurrentUser', async () => {
      // Arrange
      const dashboard = new CitaDashboardDto({
        id: 'cita-1',
        pacienteNombre: 'María González',
        fecha: '2026-09-22',
        hora: '10:00',
        inicio: new Date('2026-09-22T13:00:00.000Z'),
        duracionMin: 50,
        tipoConsulta: 'Terapia individual',
        estado: EstadoCita.CONFIRMADA,
      });
      mockCitasService.listarEnRango.mockResolvedValue([dashboard]);

      // Act
      const result = await controller.listar(query, usuario);

      // Assert
      expect(mockCitasService.listarEnRango).toHaveBeenCalledWith(
        '2026-09-21',
        '2026-09-27',
        usuario,
      );
      expect(result).toEqual([dashboard]);
    });

    it('debería traducir RangoFechasInvalidoError a 400 conservando el mensaje', async () => {
      // Arrange
      mockCitasService.listarEnRango.mockRejectedValue(
        new RangoFechasInvalidoError('El rango máximo es de 42 días'),
      );

      // Act
      const error = await controller
        .listar(query, usuario)
        .catch((e: unknown) => e);

      // Assert
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).message).toBe(
        'El rango máximo es de 42 días',
      );
    });

    it.each([
      [
        'CitaNoEncontradaError',
        new CitaNoEncontradaError('x'),
        NotFoundException,
        404,
      ],
      [
        'TransicionEstadoInvalidaError',
        new TransicionEstadoInvalidaError(EstadoCita.CANCELADA, 'confirmar'),
        ConflictException,
        409,
      ],
      [
        'PacienteNoEncontradoError',
        new PacienteNoEncontradoError('p'),
        BadRequestException,
        400,
      ],
    ])(
      'debería pasar por la traducción común: %s -> %i',
      async (_nombre, errorDominio, Excepcion, status) => {
        // Arrange
        mockCitasService.listarEnRango.mockRejectedValue(errorDominio);

        // Act
        const error = await controller
          .listar(query, usuario)
          .catch((e: unknown) => e);

        // Assert
        expect(error).toBeInstanceOf(Excepcion);
        expect((error as NotFoundException).getStatus()).toBe(status);
      },
    );

    it('debería propagar un error inesperado sin transformarlo (500)', async () => {
      // Arrange
      const error = new Error('fallo inesperado');
      mockCitasService.listarEnRango.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.listar(query, usuario)).rejects.toBe(error);
    });
  });
});
