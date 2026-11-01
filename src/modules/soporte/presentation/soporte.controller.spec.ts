import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { METADATA_LIMITES_TASA } from '../../../shared/presentation/limitar-tasa.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { RegistrarMensajeSoporteService } from '../application/registrar-mensaje-soporte.service';
import { MensajeSoporteInvalidoError } from '../domain/exceptions/mensaje-soporte-invalido.error';
import { TopeMensajesSoporteError } from '../domain/exceptions/tope-mensajes-soporte.error';
import {
  CategoriaSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../domain/mensaje-soporte.entity';
import { SoporteController } from './soporte.controller';

const ID = '5e000000-0000-4000-8000-000000000001';
const CREADO = new Date('2026-10-31T15:00:00.000Z');
const TEXTO_SENSIBLE = 'Paciente Juan Pérez, RUT 12.345.678-5, no le llegó';

const guardado = (categoria = CategoriaSoporte.PROBLEMA): MensajeSoporte =>
  MensajeSoporte.reconstituir({
    id: ID,
    tenantId: 'tenant-1',
    usuarioId: 'usuario-1',
    categoria,
    mensaje: TEXTO_SENSIBLE,
    estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
    intentos: 0,
    proximoIntentoEn: CREADO,
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    creadoEn: CREADO,
  });

/** Status y cuerpo de una HttpException lanzada por `promesa`. */
async function httpDe(
  promesa: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  try {
    await promesa;
  } catch (error: unknown) {
    if (error instanceof HttpException) {
      return { status: error.getStatus(), body: error.getResponse() };
    }
    throw error;
  }
  throw new Error('se esperaba una HttpException');
}

describe('SoporteController (POST /api/soporte/mensajes)', () => {
  let controller: SoporteController;
  let registrar: jest.Mock;
  let log: jest.SpyInstance;

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'dra@clinica.cl',
    tenantId: 'tenant-1',
    rol: RolUsuario.ADMINISTRADOR,
  };

  beforeEach(async () => {
    registrar = jest.fn();
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SoporteController],
      providers: [
        { provide: RegistrarMensajeSoporteService, useValue: { registrar } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SoporteController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('201 con { id, creadoEn }, con el autor del TOKEN', async () => {
    // Arrange
    registrar.mockResolvedValue(guardado());

    // Act
    const respuesta = await controller.crear(
      { categoria: CategoriaSoporte.PROBLEMA, mensaje: TEXTO_SENSIBLE },
      usuario,
    );

    // Assert
    expect(respuesta).toEqual({ id: ID, creadoEn: CREADO });
    expect(Object.keys(respuesta)).toEqual(['id', 'creadoEn']);
    expect(registrar).toHaveBeenCalledWith(
      { userId: 'usuario-1', tenantId: 'tenant-1' },
      { categoria: CategoriaSoporte.PROBLEMA, mensaje: TEXTO_SENSIBLE },
    );
  });

  it('registra soporte.mensaje_recibido con ids y la categoría guardada, NUNCA el texto', async () => {
    // Arrange — sin categoría en el cuerpo: el dominio la deja en `otro`
    registrar.mockResolvedValue(guardado(CategoriaSoporte.OTRO));

    // Act
    await controller.crear({ mensaje: TEXTO_SENSIBLE }, usuario);

    // Assert
    expect(log).toHaveBeenCalledWith({
      evento: 'soporte.mensaje_recibido',
      mensajeId: ID,
      tenantId: 'tenant-1',
      usuarioId: 'usuario-1',
      categoria: CategoriaSoporte.OTRO,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Juan');
  });

  it('TopeMensajesSoporteError → 429 con su mensaje, y el log soporte.tope_diario', async () => {
    // Arrange
    registrar.mockRejectedValue(new TopeMensajesSoporteError());

    // Act
    const { status, body } = await httpDe(
      controller.crear({ mensaje: 'Sexto' }, usuario),
    );

    // Assert
    expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(body).toEqual({
      statusCode: 429,
      message:
        'Ya enviaste 5 mensajes a soporte en las últimas 24 horas. Vuelve a intentarlo más tarde.',
    });
    expect(log).toHaveBeenCalledWith({
      evento: 'soporte.tope_diario',
      tenantId: 'tenant-1',
    });
  });

  it('MensajeSoporteInvalidoError → 400 sin repetir el texto', async () => {
    // Arrange
    registrar.mockRejectedValue(
      new MensajeSoporteInvalidoError('mensaje', 'no puede estar vacío'),
    );

    // Act
    const intento = controller.crear({ mensaje: '   ' }, usuario);

    // Assert
    await expect(intento).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento).rejects.toThrow(/mensaje/);
  });

  it('otro error sube tal cual (500)', async () => {
    // Arrange
    const caida = new Error('connection refused');
    registrar.mockRejectedValue(caida);

    // Act + Assert
    await expect(controller.crear({ mensaje: 'Hola' }, usuario)).rejects.toBe(
      caida,
    );
  });

  describe('metadatos de la ruta', () => {
    it('JwtAuthGuard en la clase, 201 y el cubo de límite de tasa `soporte`', () => {
      // Arrange
      const metodo = Object.getOwnPropertyDescriptor(
        SoporteController.prototype,
        'crear',
      )?.value as object;

      // Assert
      expect(Reflect.getMetadata(GUARDS_METADATA, SoporteController)).toEqual([
        JwtAuthGuard,
      ]);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, metodo)).toBe(201);
      expect(Reflect.getMetadata(METADATA_LIMITES_TASA, metodo)).toEqual([
        'soporte',
      ]);
    });
  });
});
