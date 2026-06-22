import { Test, TestingModule } from '@nestjs/testing';

import { RolUsuario } from '../domain/usuario.entity';
import { UsuariosService } from '../application/usuarios.service';
import { RegistroResponseDto } from './dto/registro-response.dto';
import { RegistroUsuarioDto } from './dto/registro-usuario.dto';
import { UsuariosController } from './usuarios.controller';

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let mockUsuariosService: {
    registrar: jest.Mock;
  };

  beforeEach(async () => {
    mockUsuariosService = {
      registrar: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        {
          provide: UsuariosService,
          useValue: mockUsuariosService,
        },
      ],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registrar', () => {
    it('debería delegar al service y retornar el resultado cuando se recibe un dto válido', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Clínica Test',
        email: 'test@example.com',
        password: 'password123',
        nombreCompleto: 'Test User',
      };

      const expectedResponse = new RegistroResponseDto({
        id: 'uuid-1234',
        email: dto.email,
        nombreCompleto: dto.nombreCompleto,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: 'tenant-uuid-001',
        creadoEn: new Date('2026-06-22T00:00:00Z'),
      });

      mockUsuariosService.registrar.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.registrar(dto);

      // Assert
      expect(mockUsuariosService.registrar).toHaveBeenCalledTimes(1);
      expect(mockUsuariosService.registrar).toHaveBeenCalledWith(dto);
      expect(result).toBe(expectedResponse);
    });

    it('debería retornar exactamente lo que el service devuelve sin modificarlo', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Otro Tenant',
        email: 'another@example.com',
        password: 'securepass',
        nombreCompleto: 'Another User',
      };

      const serviceResponse = new RegistroResponseDto({
        id: 'uuid-9999',
        email: dto.email,
        nombreCompleto: dto.nombreCompleto,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: 'tenant-uuid-002',
        creadoEn: new Date('2026-06-22T00:00:00Z'),
      });

      mockUsuariosService.registrar.mockResolvedValue(serviceResponse);

      // Act
      const result = await controller.registrar(dto);

      // Assert
      expect(result).toStrictEqual(serviceResponse);
      expect(result).toBeInstanceOf(RegistroResponseDto);
    });

    it('debería propagar la excepción cuando el service lanza un error', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Tenant Dup',
        email: 'dup@example.com',
        password: 'password123',
        nombreCompleto: 'Dup User',
      };

      mockUsuariosService.registrar.mockRejectedValue(
        new Error('El email ya está registrado en este tenant'),
      );

      // Act & Assert
      await expect(controller.registrar(dto)).rejects.toThrow(
        'El email ya está registrado en este tenant',
      );
    });
  });
});
