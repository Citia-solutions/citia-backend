import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { AuthService } from '../application/auth.service';
import { CredencialesInvalidasError } from '../domain/exceptions/credenciales-invalidas.error';
import { AuthController } from './auth.controller';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: {
    login: jest.Mock;
  };

  const dto: LoginDto = {
    tenantSlug: 'clinica-demo',
    email: 'admin@demo.com',
    password: 'password123',
  };

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('debería delegar al service y retornar el response cuando las credenciales son válidas', async () => {
      // Arrange
      const expectedResponse = new LoginResponseDto({
        accessToken: 'signed.jwt.token',
        usuario: {
          id: 'usuario-uuid-001',
          email: dto.email,
          nombreCompleto: 'Admin Demo',
          rol: RolUsuario.ADMINISTRADOR,
          tenantId: 'tenant-uuid-001',
        },
      });
      mockAuthService.login.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.login(dto);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(expectedResponse);
    });

    it('debería mapear CredencialesInvalidasError a UnauthorizedException (401)', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new CredencialesInvalidasError());

      // Act & Assert
      await expect(controller.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('debería preservar el mensaje genérico "Credenciales inválidas" al mapear a 401', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new CredencialesInvalidasError());

      // Act & Assert
      await expect(controller.login(dto)).rejects.toThrow(
        'Credenciales inválidas',
      );
    });

    it('debería propagar sin transformar cualquier error que no sea CredencialesInvalidasError', async () => {
      // Arrange
      const inesperado = new Error('fallo de infraestructura');
      mockAuthService.login.mockRejectedValue(inesperado);

      // Act & Assert
      await expect(controller.login(dto)).rejects.toBe(inesperado);
      await expect(controller.login(dto)).rejects.not.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
