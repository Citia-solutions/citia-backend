import * as bcrypt from 'bcrypt';

import { TipoTenant } from '../../tenant/domain/tenant.entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { CredencialesInvalidasError } from '../domain/exceptions/credenciales-invalidas.error';
import { LoginDto } from '../presentation/dto/login.dto';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let mockUsuarioRepository: {
    findByEmailAndTenant: jest.Mock;
    guardar: jest.Mock;
  };
  let mockTenantRepository: {
    findBySlug: jest.Mock;
    findById: jest.Mock;
    guardar: jest.Mock;
  };
  let mockTokenSigner: {
    sign: jest.Mock;
  };

  const bcryptCompareMock = bcrypt.compare as jest.Mock;

  const tenant = {
    id: 'tenant-uuid-001',
    nombre: 'Clínica Demo',
    slug: 'clinica-demo',
    tipo: TipoTenant.CLINICA,
    plan: 'free',
    creadoEn: new Date('2026-06-22T00:00:00Z'),
  };

  const usuario = {
    id: 'usuario-uuid-001',
    email: 'admin@demo.com',
    passwordHash: '$2b$10$hashStored',
    nombreCompleto: 'Admin Demo',
    rol: RolUsuario.ADMINISTRADOR,
    tenantId: tenant.id,
    creadoEn: new Date('2026-06-22T00:00:00Z'),
    actualizadoEn: new Date('2026-06-22T00:00:00Z'),
  };

  const dto: LoginDto = {
    tenantSlug: 'clinica-demo',
    email: 'admin@demo.com',
    password: 'password123',
  };

  beforeEach(() => {
    mockUsuarioRepository = {
      findByEmailAndTenant: jest.fn(),
      guardar: jest.fn(),
    };
    mockTenantRepository = {
      findBySlug: jest.fn(),
      findById: jest.fn(),
      guardar: jest.fn(),
    };
    mockTokenSigner = {
      sign: jest.fn(),
    };

    service = new AuthService(
      mockUsuarioRepository,
      mockTenantRepository,
      mockTokenSigner,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('debería lanzar CredencialesInvalidasError cuando el tenant no existe', async () => {
      // Arrange
      mockTenantRepository.findBySlug.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(dto)).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
      expect(mockTenantRepository.findBySlug).toHaveBeenCalledWith(
        dto.tenantSlug,
      );
      expect(mockUsuarioRepository.findByEmailAndTenant).not.toHaveBeenCalled();
      expect(bcryptCompareMock).not.toHaveBeenCalled();
      expect(mockTokenSigner.sign).not.toHaveBeenCalled();
    });

    it('debería lanzar CredencialesInvalidasError cuando el usuario no existe en el tenant', async () => {
      // Arrange
      mockTenantRepository.findBySlug.mockResolvedValue(tenant);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(dto)).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
      expect(mockUsuarioRepository.findByEmailAndTenant).toHaveBeenCalledWith(
        dto.email,
        tenant.id,
      );
      expect(bcryptCompareMock).not.toHaveBeenCalled();
      expect(mockTokenSigner.sign).not.toHaveBeenCalled();
    });

    it('debería lanzar CredencialesInvalidasError cuando la contraseña es incorrecta', async () => {
      // Arrange
      mockTenantRepository.findBySlug.mockResolvedValue(tenant);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(usuario);
      bcryptCompareMock.mockResolvedValue(false);

      // Act & Assert
      await expect(service.login(dto)).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
      expect(bcryptCompareMock).toHaveBeenCalledWith(
        dto.password,
        usuario.passwordHash,
      );
      expect(mockTokenSigner.sign).not.toHaveBeenCalled();
    });

    it('debería usar siempre el mensaje genérico "Credenciales inválidas" sin filtrar la causa', async () => {
      // Arrange
      mockTenantRepository.findBySlug.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(dto)).rejects.toThrow(
        'Credenciales inválidas',
      );
    });

    it('debería firmar el token con el payload correcto y devolver accessToken + usuario sin passwordHash en el happy path', async () => {
      // Arrange
      mockTenantRepository.findBySlug.mockResolvedValue(tenant);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(usuario);
      bcryptCompareMock.mockResolvedValue(true);
      mockTokenSigner.sign.mockReturnValue('signed.jwt.token');

      // Act
      const result = await service.login(dto);

      // Assert — payload firmado exacto { sub, email, tenantId, rol }
      expect(mockTokenSigner.sign).toHaveBeenCalledWith({
        sub: usuario.id,
        email: usuario.email,
        tenantId: usuario.tenantId,
        rol: usuario.rol,
      });

      // Assert — respuesta
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.usuario).toEqual({
        id: usuario.id,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
        rol: usuario.rol,
        tenantId: usuario.tenantId,
      });

      // Assert — el passwordHash nunca se expone
      expect(
        (result.usuario as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });
  });
});
