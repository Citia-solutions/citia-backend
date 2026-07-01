import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { CitasService } from '../application/citas.service';
import { PacienteNoEncontradoError } from '../application/paciente-no-encontrado.error';
import { EstadoCita } from '../domain/cita.entity';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CitaDashboardDto } from './dto/cita-dashboard.dto';
import { CitaResponseDto } from './dto/cita-response.dto';
import { CrearCitaDto } from './dto/crear-cita.dto';
import { CitasController } from './citas.controller';

describe('CitasController', () => {
  let controller: CitasController;
  let mockCitasService: {
    crearCita: jest.Mock;
    citasDeHoy: jest.Mock;
  };

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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CitasController],
      providers: [{ provide: CitasService, useValue: mockCitasService }],
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
        pacienteId: dto.pacienteId,
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
});
