import * as bcrypt from 'bcrypt';

import { TipoTenant } from '../../tenant/domain/tenant.entity';
import { EmailYaRegistradoError } from '../domain/exceptions/email-ya-registrado.error';
import { RolUsuario } from '../domain/usuario.entity';
import { RegistroResponseDto } from '../presentation/dto/registro-response.dto';
import { RegistroUsuarioDto } from '../presentation/dto/registro-usuario.dto';
import { UsuariosService } from './usuarios.service';

jest.mock('bcrypt');

describe('UsuariosService', () => {
  let service: UsuariosService;
  let mockUsuarioRepository: {
    findByEmailAndTenant: jest.Mock;
    guardar: jest.Mock;
  };
  let mockTenantRepository: {
    guardar: jest.Mock;
    findById: jest.Mock;
    findBySlug: jest.Mock;
  };

  const bcryptHashMock = bcrypt.hash as jest.Mock;

  beforeEach(() => {
    mockUsuarioRepository = {
      findByEmailAndTenant: jest.fn(),
      guardar: jest.fn(),
    };

    mockTenantRepository = {
      guardar: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
    };

    service = new UsuariosService(mockUsuarioRepository, mockTenantRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registrar', () => {
    const createdTenant = {
      id: 'tenant-uuid-001',
      nombre: 'Clínica Demo',
      slug: 'clinica-demo',
      tipo: TipoTenant.CLINICA,
      plan: 'free',
      creadoEn: new Date('2026-06-22T00:00:00Z'),
    };

    it('debería crear el tenant y el usuario administrador exitosamente', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Clínica Demo',
        tipoTenant: TipoTenant.CLINICA,
        email: 'admin@demo.com',
        password: 'password123',
        nombreCompleto: 'Admin Demo',
      };

      const savedUsuario = {
        id: 'uuid-1234',
        email: dto.email,
        passwordHash: 'hashedPwd',
        nombreCompleto: dto.nombreCompleto,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: createdTenant.id,
        creadoEn: new Date('2026-06-22T00:00:00Z'),
        actualizadoEn: new Date('2026-06-22T00:00:00Z'),
      };

      mockTenantRepository.findBySlug.mockResolvedValue(null);
      mockTenantRepository.guardar.mockResolvedValue(createdTenant);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUsuarioRepository.guardar.mockResolvedValue(savedUsuario);

      // Act
      const result = await service.registrar(dto);

      // Assert
      expect(mockTenantRepository.findBySlug).toHaveBeenCalledWith(
        'clinica-demo',
      );
      expect(mockTenantRepository.guardar).toHaveBeenCalledWith({
        nombre: dto.nombreTenant,
        slug: 'clinica-demo',
        tipo: dto.tipoTenant,
      });
      expect(mockUsuarioRepository.findByEmailAndTenant).toHaveBeenCalledWith(
        dto.email,
        createdTenant.id,
      );
      expect(bcryptHashMock).toHaveBeenCalledWith(dto.password, 10);
      expect(mockUsuarioRepository.guardar).toHaveBeenCalledWith({
        email: dto.email,
        passwordHash: 'hashedPwd',
        nombreCompleto: dto.nombreCompleto,
        tenantId: createdTenant.id,
        rol: RolUsuario.ADMINISTRADOR,
      });
      expect(result).toBeInstanceOf(RegistroResponseDto);
      expect(result.id).toBe(savedUsuario.id);
      expect(result.email).toBe(savedUsuario.email);
      expect(result.nombreCompleto).toBe(savedUsuario.nombreCompleto);
      expect(result.rol).toBe(RolUsuario.ADMINISTRADOR);
      expect(result.tenantId).toBe(createdTenant.id);
      expect(result.nombreTenant).toBe(createdTenant.nombre);
      expect(result.tenantSlug).toBe(createdTenant.slug);
      expect(result.creadoEn).toBe(savedUsuario.creadoEn);
      expect(
        (result as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });

    it('debería usar TipoTenant.INDEPENDIENTE por defecto cuando tipoTenant no se pasa', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Consulta Independiente',
        email: 'prof@independiente.com',
        password: 'securepass',
        nombreCompleto: 'Profesional Solo',
      };

      const tenantIndependiente = {
        id: 'tenant-uuid-002',
        nombre: dto.nombreTenant,
        slug: 'consulta-independiente',
        tipo: TipoTenant.INDEPENDIENTE,
        plan: 'free',
        creadoEn: new Date('2026-06-22T00:00:00Z'),
      };

      const savedUsuario = {
        id: 'uuid-5678',
        email: dto.email,
        passwordHash: 'hashedPwd',
        nombreCompleto: dto.nombreCompleto,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: tenantIndependiente.id,
        creadoEn: new Date('2026-06-22T00:00:00Z'),
        actualizadoEn: new Date('2026-06-22T00:00:00Z'),
      };

      mockTenantRepository.findBySlug.mockResolvedValue(null);
      mockTenantRepository.guardar.mockResolvedValue(tenantIndependiente);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUsuarioRepository.guardar.mockResolvedValue(savedUsuario);

      // Act
      const result = await service.registrar(dto);

      // Assert
      expect(mockTenantRepository.guardar).toHaveBeenCalledWith({
        nombre: dto.nombreTenant,
        slug: 'consulta-independiente',
        tipo: TipoTenant.INDEPENDIENTE,
      });
      expect(result).toBeInstanceOf(RegistroResponseDto);
      expect(result.tenantId).toBe(tenantIndependiente.id);
    });

    it('debería lanzar EmailYaRegistradoError cuando el email ya está registrado en el tenant', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Tenant Existente',
        email: 'existing@example.com',
        password: 'password123',
        nombreCompleto: 'Existing User',
      };

      const existingUsuario = {
        id: 'uuid-existing',
        email: dto.email,
        passwordHash: 'someHash',
        nombreCompleto: dto.nombreCompleto,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: createdTenant.id,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      };

      mockTenantRepository.findBySlug.mockResolvedValue(null);
      mockTenantRepository.guardar.mockResolvedValue(createdTenant);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(
        existingUsuario,
      );

      // Act & Assert
      await expect(service.registrar(dto)).rejects.toThrow(
        EmailYaRegistradoError,
      );
      await expect(service.registrar(dto)).rejects.toThrow(
        'El email existing@example.com ya está registrado en este tenant',
      );

      expect(mockUsuarioRepository.guardar).not.toHaveBeenCalled();
      expect(bcryptHashMock).not.toHaveBeenCalled();
    });

    it('el rol del usuario siempre debe ser ADMINISTRADOR sin importar el input', async () => {
      // Arrange
      const dto: RegistroUsuarioDto = {
        nombreTenant: 'Tenant Test',
        email: 'admin@test.com',
        password: 'password123',
        nombreCompleto: 'Admin Test',
      };

      const savedUsuario = {
        id: 'uuid-admin',
        email: dto.email,
        passwordHash: 'hashedPwd',
        nombreCompleto: dto.nombreCompleto,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: createdTenant.id,
        creadoEn: new Date('2026-06-22T00:00:00Z'),
        actualizadoEn: new Date('2026-06-22T00:00:00Z'),
      };

      mockTenantRepository.findBySlug.mockResolvedValue(null);
      mockTenantRepository.guardar.mockResolvedValue(createdTenant);
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUsuarioRepository.guardar.mockResolvedValue(savedUsuario);

      // Act
      await service.registrar(dto);

      // Assert
      const guardarCalls = mockUsuarioRepository.guardar.mock.calls as Array<
        Array<Record<string, unknown>>
      >;
      const guardarCall = guardarCalls[0][0];
      expect(guardarCall.rol).toBe(RolUsuario.ADMINISTRADOR);
    });
  });

  describe('registrar — generación de slug único', () => {
    const dto: RegistroUsuarioDto = {
      nombreTenant: 'Clínica Demo',
      email: 'admin@demo.com',
      password: 'password123',
      nombreCompleto: 'Admin Demo',
    };

    const savedUsuario = {
      id: 'uuid-slug',
      email: dto.email,
      passwordHash: 'hashedPwd',
      nombreCompleto: dto.nombreCompleto,
      rol: RolUsuario.ADMINISTRADOR,
      tenantId: 'tenant-slug-id',
      creadoEn: new Date('2026-06-22T00:00:00Z'),
      actualizadoEn: new Date('2026-06-22T00:00:00Z'),
    };

    it('debería guardar el tenant con el slug base cuando el slug está libre al primer intento', async () => {
      // Arrange — findBySlug no encuentra nada => slug base disponible
      mockTenantRepository.findBySlug.mockResolvedValue(null);
      mockTenantRepository.guardar.mockResolvedValue({
        id: 'tenant-slug-id',
        nombre: dto.nombreTenant,
        slug: 'clinica-demo',
        tipo: TipoTenant.INDEPENDIENTE,
        plan: 'free',
        creadoEn: new Date('2026-06-22T00:00:00Z'),
      });
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUsuarioRepository.guardar.mockResolvedValue(savedUsuario);

      // Act
      const result = await service.registrar(dto);

      // Assert — solo se intentó el slug base una vez
      expect(mockTenantRepository.findBySlug).toHaveBeenCalledTimes(1);
      expect(mockTenantRepository.findBySlug).toHaveBeenCalledWith(
        'clinica-demo',
      );
      expect(mockTenantRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'clinica-demo' }),
      );
      expect(result.tenantSlug).toBe('clinica-demo');
    });

    it('debería usar el sufijo "-2" cuando el slug base ya existe y el segundo candidato está libre', async () => {
      // Arrange — 1er intento (clinica-demo) ocupado, 2do intento (clinica-demo-2) libre
      const tenantExistente = {
        id: 'tenant-existente',
        nombre: dto.nombreTenant,
        slug: 'clinica-demo',
        tipo: TipoTenant.INDEPENDIENTE,
        plan: 'free',
        creadoEn: new Date('2026-06-22T00:00:00Z'),
      };
      mockTenantRepository.findBySlug
        .mockResolvedValueOnce(tenantExistente)
        .mockResolvedValueOnce(null);
      mockTenantRepository.guardar.mockResolvedValue({
        id: 'tenant-slug-id',
        nombre: dto.nombreTenant,
        slug: 'clinica-demo-2',
        tipo: TipoTenant.INDEPENDIENTE,
        plan: 'free',
        creadoEn: new Date('2026-06-22T00:00:00Z'),
      });
      mockUsuarioRepository.findByEmailAndTenant.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedPwd');
      mockUsuarioRepository.guardar.mockResolvedValue(savedUsuario);

      // Act
      const result = await service.registrar(dto);

      // Assert — se probaron dos candidatos en orden
      expect(mockTenantRepository.findBySlug).toHaveBeenNthCalledWith(
        1,
        'clinica-demo',
      );
      expect(mockTenantRepository.findBySlug).toHaveBeenNthCalledWith(
        2,
        'clinica-demo-2',
      );
      // El tenant guardado lleva el slug con sufijo -2
      expect(mockTenantRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'clinica-demo-2' }),
      );
      expect(result.tenantSlug).toBe('clinica-demo-2');
    });
  });
});
