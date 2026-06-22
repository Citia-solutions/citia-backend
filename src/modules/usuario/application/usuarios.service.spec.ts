import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { USER_REPOSITORY } from '../domain/user.repository';
import { UserRole } from '../domain/user.entity';
import { CreateUserDto } from '../presentation/dto/create-user.dto';
import { UserResponseDto } from '../presentation/dto/user-response.dto';
import { UsuariosService } from './usuarios.service';

jest.mock('bcrypt');

describe('UsuariosService', () => {
  let service: UsuariosService;
  let mockUserRepository: {
    findByEmail: jest.Mock;
    save: jest.Mock;
  };

  const bcryptHashMock = bcrypt.hash as jest.Mock;

  beforeEach(async () => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: USER_REPOSITORY,
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('debería registrar un usuario exitosamente cuando el email no existe', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        role: UserRole.PROFESSIONAL,
      };

      const savedUser = {
        id: 'uuid-1234',
        email: dto.email,
        passwordHash: 'hashedPwd',
        fullName: dto.fullName,
        role: UserRole.PROFESSIONAL,
        createdAt: new Date('2026-06-22T00:00:00Z'),
        updatedAt: new Date('2026-06-22T00:00:00Z'),
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUserRepository.save.mockResolvedValue(savedUser);

      // Act
      const result = await service.registerUser(dto);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(dto.email);
      expect(bcryptHashMock).toHaveBeenCalledWith(dto.password, 10);
      expect(mockUserRepository.save).toHaveBeenCalledWith({
        email: dto.email,
        passwordHash: 'hashedPwd',
        fullName: dto.fullName,
        role: dto.role,
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(savedUser.id);
      expect(result.email).toBe(savedUser.email);
      expect(result.fullName).toBe(savedUser.fullName);
      expect(result.role).toBe(savedUser.role);
      expect(result.createdAt).toBe(savedUser.createdAt);
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('debería lanzar ConflictException cuando el email ya está registrado', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'existing@example.com',
        password: 'password123',
        fullName: 'Existing User',
      };

      const existingUser = {
        id: 'uuid-existing',
        email: dto.email,
        passwordHash: 'someHash',
        fullName: dto.fullName,
        role: UserRole.PROFESSIONAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.registerUser(dto)).rejects.toThrow(ConflictException);
      await expect(service.registerUser(dto)).rejects.toThrow(
        'El email ya está registrado',
      );

      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(bcryptHashMock).not.toHaveBeenCalled();
    });

    it('debería registrar correctamente cuando el role es opcional y no se pasa', async () => {
      // Arrange
      const dto: CreateUserDto = {
        email: 'norole@example.com',
        password: 'password123',
        fullName: 'No Role User',
        // role no se incluye
      };

      const savedUser = {
        id: 'uuid-5678',
        email: dto.email,
        passwordHash: 'hashedPwd',
        fullName: dto.fullName,
        role: UserRole.PROFESSIONAL, // la BD aplica el default
        createdAt: new Date('2026-06-22T00:00:00Z'),
        updatedAt: new Date('2026-06-22T00:00:00Z'),
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUserRepository.save.mockResolvedValue(savedUser);

      // Act
      const result = await service.registerUser(dto);

      // Assert
      expect(mockUserRepository.save).toHaveBeenCalledWith({
        email: dto.email,
        passwordHash: 'hashedPwd',
        fullName: dto.fullName,
        // role NO debe estar en el objeto enviado al save
      });

      const saveCall = mockUserRepository.save.mock.calls[0][0] as Record<string, unknown>;
      expect(saveCall).not.toHaveProperty('role');

      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(savedUser.id);
    });
  });
});
