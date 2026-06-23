import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantModule } from '../../tenant/tenant.module';
import { UsuarioOrmEntity } from '../infrastructure/persistence/usuario.orm-entity';
import { UsuariosModule } from '../usuarios.module';
import { RegistroUsuarioDto } from '../presentation/dto/registro-usuario.dto';
import { UsuariosService } from '../application/usuarios.service';
import { RolUsuario } from '../domain/usuario.entity';
import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';

describe('RegistroUsuario (integration)', () => {
  let module: TestingModule;
  let service: UsuariosService;
  let usuarioRepo: Repository<UsuarioOrmEntity>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(typeOrmTestConfig),
        TenantModule,
        UsuariosModule,
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
    usuarioRepo = module.get<Repository<UsuarioOrmEntity>>(
      getRepositoryToken(UsuarioOrmEntity),
    );
  });

  afterAll(async () => {
    await module.close();
  });

  it('debería crear un tenant y un usuario administrador y persistirlos en la BD', async () => {
    // Arrange
    const dto: RegistroUsuarioDto = {
      nombreTenant: 'Clínica Integración',
      email: 'admin@clinica-integracion.com',
      password: 'password1234',
      nombreCompleto: 'Admin Integración',
    };

    // Act
    const result = await service.registrar(dto);

    // Assert — respuesta contiene campos correctos
    expect(result.id).toBeDefined();
    expect(result.tenantId).toBeDefined();
    expect(result.rol).toBe(RolUsuario.ADMINISTRADOR);

    // RegistroResponseDto ahora incluye nombreTenant y tenantSlug
    expect(result.nombreTenant).toBe(dto.nombreTenant);
    expect(result.tenantSlug).toBe('clinica-integracion');

    // tenantId es un UUID válido
    expect(result.tenantId).toMatch(/^[0-9a-f-]{36}$/);

    // passwordHash NO está en la respuesta
    expect(
      (result as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
  });

  it('debería rechazar el registro si el email ya existe en el mismo tenant', async () => {
    // Arrange — primer registro crea un tenant
    const dto: RegistroUsuarioDto = {
      nombreTenant: 'Tenant Duplicado',
      email: 'duplicado@tenant.com',
      password: 'password1234',
      nombreCompleto: 'Usuario Original',
    };

    // Act — primer registro exitoso
    const primerRegistro = await service.registrar(dto);
    expect(primerRegistro.id).toBeDefined();

    // Para forzar el caso de duplicado dentro del mismo tenant, insertamos
    // directamente en la BD usando el repositorio TypeORM, apuntando al mismo
    // tenantId ya creado.
    await expect(
      usuarioRepo.save({
        email: 'duplicado@tenant.com',
        passwordHash: '$2b$10$hashfake',
        nombreCompleto: 'Usuario Duplicado',
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: primerRegistro.tenantId,
      }),
    ).rejects.toThrow(); // viola la constraint UNIQUE(tenantId, email)
  });

  it('debería permitir el mismo email en dos tenants distintos', async () => {
    // Arrange
    const dtoA: RegistroUsuarioDto = {
      nombreTenant: 'Tenant A',
      email: 'shared@test.com',
      password: 'password1234',
      nombreCompleto: 'Usuario Shared A',
    };

    const dtoB: RegistroUsuarioDto = {
      nombreTenant: 'Tenant B',
      email: 'shared@test.com',
      password: 'password1234',
      nombreCompleto: 'Usuario Shared B',
    };

    // Act
    const resultA = await service.registrar(dtoA);
    const resultB = await service.registrar(dtoB);

    // Assert — ambas llamadas tienen éxito
    expect(resultA.id).toBeDefined();
    expect(resultB.id).toBeDefined();

    // Los tenantId son distintos
    expect(resultA.tenantId).not.toBe(resultB.tenantId);
  });

  it('debería almacenar el password hasheado, nunca en texto plano', async () => {
    // Arrange
    const passwordPlano = 'miPasswordSeguro';
    const dto: RegistroUsuarioDto = {
      nombreTenant: 'Tenant Hash Test',
      email: 'hashtest@test.com',
      password: passwordPlano,
      nombreCompleto: 'Hash Test User',
    };

    // Act
    const result = await service.registrar(dto);

    // Leer directamente desde la BD
    const ormEntity = await usuarioRepo.findOne({ where: { id: result.id } });
    expect(ormEntity).not.toBeNull();

    // Assert — el hash no es el password en texto plano
    expect(ormEntity!.passwordHash).not.toBe(passwordPlano);

    // El hash empieza con el prefijo bcrypt
    expect(ormEntity!.passwordHash).toMatch(/^\$2b\$/);
  });

  it('debería generar slugs únicos cuando dos tenants comparten el mismo nombre', async () => {
    // Arrange — mismo nombreTenant => mismo slug base => debe desambiguar
    const dtoUno: RegistroUsuarioDto = {
      nombreTenant: 'Centro Médico Slug',
      email: 'uno@slug-dup.com',
      password: 'password1234',
      nombreCompleto: 'Usuario Uno',
    };
    const dtoDos: RegistroUsuarioDto = {
      nombreTenant: 'Centro Médico Slug',
      email: 'dos@slug-dup.com',
      password: 'password1234',
      nombreCompleto: 'Usuario Dos',
    };

    // Act
    const resultUno = await service.registrar(dtoUno);
    const resultDos = await service.registrar(dtoDos);

    // Assert — el primero toma el slug base, el segundo el sufijo -2
    expect(resultUno.tenantSlug).toBe('centro-medico-slug');
    expect(resultDos.tenantSlug).toBe('centro-medico-slug-2');
    expect(resultUno.tenantId).not.toBe(resultDos.tenantId);
  });
});
