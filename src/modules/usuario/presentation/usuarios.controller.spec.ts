import { Test, TestingModule } from '@nestjs/testing';

import { UserRole } from '../domain/user.entity';
import { UsuariosService } from '../application/usuarios.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsuariosController } from './usuarios.controller';

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let mockUsuariosService: {
    registerUser: jest.Mock;
  };

  beforeEach(async () => {
    mockUsuariosService = {
      registerUser: jest.fn(),
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

  describe('registerUser', () => {
    it('debería delegar al service y retornar el resultado cuando se recibe un dto válido', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        role: UserRole.PROFESSIONAL,
      };

      const expectedResponse = new UserResponseDto({
        id: 'uuid-1234',
        email: dto.email,
        fullName: dto.fullName,
        role: UserRole.PROFESSIONAL,
        createdAt: new Date('2026-06-22T00:00:00Z'),
      });

      mockUsuariosService.registerUser.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.registerUser(dto);

      // Assert
      expect(mockUsuariosService.registerUser).toHaveBeenCalledTimes(1);
      expect(mockUsuariosService.registerUser).toHaveBeenCalledWith(dto);
      expect(result).toBe(expectedResponse);
    });

    it('debería retornar exactamente lo que el service devuelve sin modificarlo', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'another@example.com',
        password: 'securepass',
        fullName: 'Another User',
      };

      const serviceResponse = new UserResponseDto({
        id: 'uuid-9999',
        email: dto.email,
        fullName: dto.fullName,
        role: UserRole.ADMIN,
        createdAt: new Date('2026-06-22T00:00:00Z'),
      });

      mockUsuariosService.registerUser.mockResolvedValue(serviceResponse);

      // Act
      const result = await controller.registerUser(dto);

      // Assert
      expect(result).toStrictEqual(serviceResponse);
      expect(result).toBeInstanceOf(UserResponseDto);
    });

    it('debería propagar la excepción cuando el service lanza un error', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'dup@example.com',
        password: 'password123',
        fullName: 'Dup User',
      };

      mockUsuariosService.registerUser.mockRejectedValue(
        new Error('El email ya está registrado'),
      );

      // Act & Assert
      await expect(controller.registerUser(dto)).rejects.toThrow(
        'El email ya está registrado',
      );
    });
  });
});
