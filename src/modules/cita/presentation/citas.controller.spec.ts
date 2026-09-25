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
import { CitaNoEncontradaError } from '../application/cita-no-encontrada.error';
import { PacienteNoEncontradoError } from '../application/paciente-no-encontrado.error';
import { EstadoCita } from '../domain/cita.entity';
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
      detalle: jest.fn(),
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
});
