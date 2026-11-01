import {
  ForbiddenException,
  HttpException,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { METADATA_LIMITES_TASA } from '../../../shared/presentation/limitar-tasa.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { ConsultarSuscripcionService } from '../application/consultar-suscripcion.service';
import { OrganizacionNoEncontradaError } from '../domain/exceptions/organizacion-no-encontrada.error';
import { SoloAdministradorError } from '../domain/exceptions/solo-administrador.error';
import { SuscripcionDto } from './dto/suscripcion.dto';
import { SuscripcionController } from './suscripcion.controller';

const ADMIN: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'ana@clinica.cl',
  tenantId: '22222222-2222-4222-8222-222222222222',
  rol: RolUsuario.ADMINISTRADOR,
};

const SUSCRIPCION = new SuscripcionDto({
  plan: 'free',
  planNombre: 'Plan piloto',
  descripcion: 'Sin cobro durante el piloto',
  altaEn: new Date('2026-06-22T11:00:00Z'),
  renovacionEn: null,
  metodoPago: null,
});

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

describe('SuscripcionController (US-10)', () => {
  let controller: SuscripcionController;
  let servicio: { consultar: jest.Mock };

  beforeEach(async () => {
    servicio = { consultar: jest.fn().mockResolvedValue(SUSCRIPCION) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuscripcionController],
      providers: [{ provide: ConsultarSuscripcionService, useValue: servicio }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SuscripcionController);
  });

  it('GET /organizacion/suscripcion, con JwtAuthGuard y sin cubo de límite', () => {
    // La función del handler, donde Nest deja los metadatos de la ruta.
    const handler = Reflect.get(
      SuscripcionController.prototype,
      'consultar',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, SuscripcionController)).toBe(
      'organizacion',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('suscripcion');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, SuscripcionController)).toEqual(
      [JwtAuthGuard],
    );
    expect(Reflect.getMetadata(METADATA_LIMITES_TASA, handler)).toBeUndefined();
  });

  it('200: consulta con la organización y el rol del TOKEN', async () => {
    // Act
    const respuesta = await controller.consultar(ADMIN);

    // Assert
    expect(servicio.consultar).toHaveBeenCalledWith({
      tenantId: ADMIN.tenantId,
      rol: RolUsuario.ADMINISTRADOR,
    });
    expect(respuesta).toBe(SUSCRIPCION);
  });

  it('403 a un PROFESIONAL, con su mensaje', async () => {
    // Arrange
    servicio.consultar.mockRejectedValue(new SoloAdministradorError());

    // Act
    const error = await httpDe(
      controller.consultar({ ...ADMIN, rol: RolUsuario.PROFESIONAL }),
    );

    // Assert
    expect(servicio.consultar).toHaveBeenCalledWith({
      tenantId: ADMIN.tenantId,
      rol: RolUsuario.PROFESIONAL,
    });
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getStatus()).toBe(403);
    expect(error.message).toBe(
      'Solo el administrador de la organización puede ver la suscripción',
    );
  });

  it('401 si la organización del token no existe', async () => {
    // Arrange
    servicio.consultar.mockRejectedValue(new OrganizacionNoEncontradaError());

    // Act
    const error = await httpDe(controller.consultar(ADMIN));

    // Assert
    expect(error).toBeInstanceOf(UnauthorizedException);
  });

  it('otros errores siguen igual (500)', async () => {
    // Arrange
    servicio.consultar.mockRejectedValue(new Error('db'));

    // Act & Assert
    await expect(controller.consultar(ADMIN)).rejects.toThrow('db');
  });
});
