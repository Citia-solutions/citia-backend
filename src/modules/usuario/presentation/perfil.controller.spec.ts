import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { METADATA_LIMITES_TASA } from '../../../shared/presentation/limitar-tasa.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CambiarContrasenaService } from '../application/cambiar-contrasena.service';
import { PerfilService } from '../application/perfil.service';
import { ContrasenaActualIncorrectaError } from '../domain/exceptions/contrasena-actual-incorrecta.error';
import { ContrasenaCambiadaEnParaleloError } from '../domain/exceptions/contrasena-cambiada-en-paralelo.error';
import { ContrasenaNoValidaError } from '../domain/exceptions/contrasena-no-valida.error';
import { ContrasenaRepetidaError } from '../domain/exceptions/contrasena-repetida.error';
import { PerfilInvalidoError } from '../domain/exceptions/perfil-invalido.error';
import { UsuarioNoEncontradoError } from '../domain/exceptions/usuario-no-encontrado.error';
import { RolUsuario } from '../domain/usuario.entity';
import { ContrasenaCambiadaDto } from './dto/contrasena-cambiada.dto';
import { PerfilDto } from './dto/perfil.dto';
import { PerfilController } from './perfil.controller';
import { UsuariosController } from './usuarios.controller';

const USUARIO: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'ana@clinica.cl',
  tenantId: '22222222-2222-4222-8222-222222222222',
  rol: RolUsuario.ADMINISTRADOR,
};
const SESION = { userId: USUARIO.userId, tenantId: USUARIO.tenantId };

const PERFIL = new PerfilDto({
  id: USUARIO.userId,
  email: USUARIO.email,
  nombreCompleto: 'Ana Pérez',
  especialidad: null,
  rol: RolUsuario.ADMINISTRADOR,
  tenantId: USUARIO.tenantId,
  tenantSlug: 'clinica-demo',
  tenantNombre: 'Clínica Demo',
  creadoEn: new Date('2026-06-22T12:00:00Z'),
});

const CAMBIO = {
  contrasenaActual: 'actual-segura',
  contrasenaNueva: 'nueva-segura',
};

/** La función del handler, donde Nest deja los metadatos de la ruta. */
function handlerDe(metodo: keyof PerfilController): object {
  return Reflect.get(PerfilController.prototype, metodo);
}

/** Captura la excepción HTTP que lanza `promesa`. */
async function httpDe(promesa: Promise<unknown>): Promise<HttpException> {
  try {
    await promesa;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('se esperaba una excepción HTTP');
}

describe('PerfilController (US-10)', () => {
  let controller: PerfilController;
  let perfil: { obtener: jest.Mock; actualizar: jest.Mock };
  let contrasenas: { cambiar: jest.Mock };
  let log: jest.SpyInstance;

  beforeEach(async () => {
    perfil = {
      obtener: jest.fn().mockResolvedValue(PERFIL),
      actualizar: jest.fn().mockResolvedValue(PERFIL),
    };
    contrasenas = {
      cambiar: jest
        .fn()
        .mockResolvedValue(new ContrasenaCambiadaDto({ accessToken: 'nuevo' })),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerfilController],
      providers: [
        { provide: PerfilService, useValue: perfil },
        { provide: CambiarContrasenaService, useValue: contrasenas },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PerfilController);
    // Después de compilar: el arranque del módulo también escribe por `log`.
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
  });

  describe('rutas', () => {
    it('vive en usuarios/me, protegido con JwtAuthGuard en la clase', () => {
      expect(Reflect.getMetadata(PATH_METADATA, PerfilController)).toBe(
        'usuarios/me',
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, PerfilController)).toEqual([
        JwtAuthGuard,
      ]);
    });

    it('el registro sigue público en otro controller (POST /usuarios, sin guard)', () => {
      expect(Reflect.getMetadata(PATH_METADATA, UsuariosController)).toBe(
        'usuarios',
      );
      expect(
        Reflect.getMetadata(GUARDS_METADATA, UsuariosController),
      ).toBeUndefined();
    });

    it.each([
      ['obtener', RequestMethod.GET, '/', undefined],
      ['actualizar', RequestMethod.PATCH, '/', HttpStatus.OK],
      ['cambiarContrasena', RequestMethod.PUT, 'contrasena', HttpStatus.OK],
    ] as const)(
      '%s → método %p, ruta %p, código %p',
      (metodo, verbo, ruta, codigo) => {
        const handler = handlerDe(metodo);
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verbo);
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(ruta);
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(codigo);
      },
    );

    it('solo el cambio de contraseña lleva el cubo cambioContrasena', () => {
      expect(
        Reflect.getMetadata(
          METADATA_LIMITES_TASA,
          handlerDe('cambiarContrasena'),
        ),
      ).toEqual(['cambioContrasena']);
      expect(
        Reflect.getMetadata(METADATA_LIMITES_TASA, handlerDe('obtener')),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(METADATA_LIMITES_TASA, handlerDe('actualizar')),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(METADATA_LIMITES_TASA, PerfilController),
      ).toBeUndefined();
    });
  });

  describe('GET /usuarios/me', () => {
    it('pide el perfil con el userId y el tenantId del TOKEN', async () => {
      // Act
      const respuesta = await controller.obtener(USUARIO);

      // Assert
      expect(perfil.obtener).toHaveBeenCalledWith(SESION);
      expect(respuesta).toBe(PERFIL);
    });

    it('usuario inexistente → 401', async () => {
      // Arrange
      perfil.obtener.mockRejectedValue(new UsuarioNoEncontradoError());

      // Act
      const error = await httpDe(controller.obtener(USUARIO));

      // Assert
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getStatus()).toBe(401);
    });

    it('otros errores siguen igual (500)', async () => {
      // Arrange
      perfil.obtener.mockRejectedValue(new Error('db'));

      // Act & Assert
      await expect(controller.obtener(USUARIO)).rejects.toThrow('db');
    });
  });

  describe('PATCH /usuarios/me', () => {
    it('actualiza el perfil del TOKEN con el cuerpo validado', async () => {
      // Arrange
      const dto = { nombreCompleto: 'Ana María', especialidad: null };

      // Act
      const respuesta = await controller.actualizar(dto, USUARIO);

      // Assert
      expect(perfil.actualizar).toHaveBeenCalledWith(SESION, dto);
      expect(respuesta).toBe(PERFIL);
    });

    it('PerfilInvalidoError → 400 con su mensaje', async () => {
      // Arrange
      perfil.actualizar.mockRejectedValue(
        new PerfilInvalidoError(
          'nombreCompleto',
          'El nombre no puede quedar vacío',
        ),
      );

      // Act
      const error = await httpDe(
        controller.actualizar({ nombreCompleto: ' ' }, USUARIO),
      );

      // Assert
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('El nombre no puede quedar vacío');
    });

    it('usuario inexistente → 401', async () => {
      // Arrange
      perfil.actualizar.mockRejectedValue(new UsuarioNoEncontradoError());

      // Act
      const error = await httpDe(
        controller.actualizar({ nombreCompleto: 'Ana' }, USUARIO),
      );

      // Assert
      expect(error.getStatus()).toBe(401);
    });
  });

  describe('PUT /usuarios/me/contrasena', () => {
    it('cambia la contraseña del TOKEN y devuelve el token nuevo', async () => {
      // Act
      const respuesta = await controller.cambiarContrasena(CAMBIO, USUARIO);

      // Assert
      expect(contrasenas.cambiar).toHaveBeenCalledWith(SESION, CAMBIO);
      expect(respuesta).toEqual({ accessToken: 'nuevo' });
    });

    it('registra usuarios.contrasena_cambiada solo con ids', async () => {
      // Act
      await controller.cambiarContrasena(CAMBIO, USUARIO);

      // Assert
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith({
        evento: 'usuarios.contrasena_cambiada',
        usuarioId: USUARIO.userId,
        tenantId: USUARIO.tenantId,
      });
      const linea = JSON.stringify(log.mock.calls);
      expect(linea).not.toContain(CAMBIO.contrasenaActual);
      expect(linea).not.toContain(CAMBIO.contrasenaNueva);
      expect(linea).not.toContain('nuevo');
      expect(linea).not.toContain(USUARIO.email);
    });

    it('contraseña actual incorrecta → 400, NUNCA 401 (el frontend cerraría la sesión)', async () => {
      // Arrange
      contrasenas.cambiar.mockRejectedValue(
        new ContrasenaActualIncorrectaError(),
      );

      // Act
      const error = await httpDe(controller.cambiarContrasena(CAMBIO, USUARIO));

      // Assert
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).not.toBeInstanceOf(UnauthorizedException);
      expect(error.getStatus()).toBe(400);
      expect(error.message).toBe('La contraseña actual no es correcta');
    });

    it.each([
      [
        new ContrasenaNoValidaError(
          'La nueva contraseña debe tener al menos 8 caracteres',
        ),
        400,
        'La nueva contraseña debe tener al menos 8 caracteres',
      ],
      [
        new ContrasenaRepetidaError(),
        400,
        'La nueva contraseña debe ser distinta de la actual',
      ],
      [
        new ContrasenaCambiadaEnParaleloError(),
        409,
        'Tu contraseña cambió mientras tanto; vuelve a intentarlo',
      ],
    ])('%s → %p con su mensaje', async (dominio, codigo, mensaje) => {
      // Arrange
      contrasenas.cambiar.mockRejectedValue(dominio);

      // Act
      const error = await httpDe(controller.cambiarContrasena(CAMBIO, USUARIO));

      // Assert
      expect(error.getStatus()).toBe(codigo);
      expect(error.message).toBe(mensaje);
      if (codigo === 409) expect(error).toBeInstanceOf(ConflictException);
    });

    it('usuario inexistente → 401 (la sesión apunta a nadie)', async () => {
      // Arrange
      contrasenas.cambiar.mockRejectedValue(new UsuarioNoEncontradoError());

      // Act
      const error = await httpDe(controller.cambiarContrasena(CAMBIO, USUARIO));

      // Assert
      expect(error).toBeInstanceOf(UnauthorizedException);
    });

    it('con un error no registra el cambio', async () => {
      // Arrange
      contrasenas.cambiar.mockRejectedValue(
        new ContrasenaActualIncorrectaError(),
      );

      // Act
      await httpDe(controller.cambiarContrasena(CAMBIO, USUARIO));

      // Assert
      expect(log).not.toHaveBeenCalled();
    });

    it('otros errores siguen igual (500)', async () => {
      // Arrange
      contrasenas.cambiar.mockRejectedValue(new Error('db'));

      // Act & Assert
      await expect(
        controller.cambiarContrasena(CAMBIO, USUARIO),
      ).rejects.toThrow('db');
      expect(log).not.toHaveBeenCalled();
    });
  });
});
