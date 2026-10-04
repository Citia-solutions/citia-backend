import {
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { EstadoCita } from '../../cita/domain/cita.entity';
import { CitaResponseDto } from '../../cita/presentation/dto/cita-response.dto';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { BandejaSolicitudesService } from '../application/bandeja-solicitudes.service';
import { SolicitudNoEncontradaError } from '../application/solicitud-no-encontrada.error';
import { EstadoSolicitud } from '../domain/solicitud-cita.entity';
import { TransicionSolicitudInvalidaError } from '../domain/transicion-solicitud-invalida.error';
import { AceptarSolicitudDto } from './dto/aceptar-solicitud.dto';
import { SolicitudAceptadaDto } from './dto/solicitud-aceptada.dto';
import { SolicitudBandejaDto } from './dto/solicitud-bandeja.dto';
import { SolicitudesController } from './solicitudes.controller';

describe('SolicitudesController', () => {
  let controller: SolicitudesController;
  let mockBandeja: {
    listar: jest.Mock;
    aceptar: jest.Mock;
    rechazar: jest.Mock;
  };

  const ID = '5f0c0000-0000-4000-8000-000000000001';

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  const dto: AceptarSolicitudDto = {
    inicio: '2026-09-18T10:00:00-03:00',
    duracionMin: 50,
    tipoConsulta: 'Dolor de muela',
  };

  const bandejaDto = (estado: EstadoSolicitud): SolicitudBandejaDto =>
    new SolicitudBandejaDto({
      id: ID,
      estado,
      rut: '11.111.111-1',
      nombrePaciente: 'Paciente Público',
      telefono: '+56 9 5555 5555',
      correo: 'publico@mail.com',
      motivo: 'Dolor de muela',
      preferenciaHoraria: 'mañanas',
      consentimiento: true,
      recibidaEn: new Date('2026-09-17T14:02:11.000Z'),
      resueltaEn: null,
      citaId: null,
    });

  beforeEach(async () => {
    mockBandeja = {
      listar: jest.fn().mockResolvedValue([]),
      aceptar: jest.fn(),
      rechazar: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SolicitudesController],
      providers: [
        { provide: BandejaSolicitudesService, useValue: mockBandeja },
      ],
    })
      // El guard real requiere passport/JWT; aquí probamos solo el controller.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SolicitudesController>(SolicitudesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Ejecuta y devuelve el error lanzado (o undefined).
  const capturar = (promesa: Promise<unknown>): Promise<unknown> =>
    promesa.then(
      () => undefined,
      (e: unknown) => e,
    );

  describe('listar (GET /solicitudes)', () => {
    it('debería usar "recibida" por defecto cuando no llega estado', async () => {
      // Act
      await controller.listar({}, usuario);

      // Assert
      expect(mockBandeja.listar).toHaveBeenCalledWith(
        EstadoSolicitud.RECIBIDA,
        usuario,
      );
    });

    it('debería pasar el estado pedido y devolver lo que da el service', async () => {
      // Arrange
      const lista = [bandejaDto(EstadoSolicitud.ACEPTADA)];
      mockBandeja.listar.mockResolvedValue(lista);

      // Act
      const result = await controller.listar(
        { estado: EstadoSolicitud.ACEPTADA },
        usuario,
      );

      // Assert
      expect(mockBandeja.listar).toHaveBeenCalledWith(
        EstadoSolicitud.ACEPTADA,
        usuario,
      );
      expect(result).toBe(lista);
    });
  });

  describe('aceptar (POST /solicitudes/:id/aceptar)', () => {
    it('debería responder 201 (metadata @HttpCode)', () => {
      // Arrange
      const handler = Object.getOwnPropertyDescriptor(
        SolicitudesController.prototype,
        'aceptar',
      )?.value as object;

      // Act & Assert
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.CREATED,
      );
    });

    it('debería delegar con id, dto y @CurrentUser y devolver { solicitud, cita }', async () => {
      // Arrange
      const respuesta = new SolicitudAceptadaDto({
        solicitud: bandejaDto(EstadoSolicitud.ACEPTADA),
        cita: new CitaResponseDto({
          id: 'cita-1',
          inicio: new Date('2026-09-18T13:00:00.000Z'),
          duracionMin: 50,
          tipoConsulta: 'Dolor de muela',
          estado: EstadoCita.PENDIENTE,
          pacienteId: 'paciente-1',
        }),
      });
      mockBandeja.aceptar.mockResolvedValue(respuesta);

      // Act
      const result = await controller.aceptar(ID, dto, usuario);

      // Assert
      expect(mockBandeja.aceptar).toHaveBeenCalledWith(ID, dto, usuario);
      expect(result).toBe(respuesta);
    });

    it('debería traducir SolicitudNoEncontradaError a 404 con el mensaje del error', async () => {
      // Arrange
      mockBandeja.aceptar.mockRejectedValue(new SolicitudNoEncontradaError(ID));

      // Act
      const error = await capturar(controller.aceptar(ID, dto, usuario));

      // Assert
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(
        `Solicitud "${ID}" no encontrada`,
      );
    });

    it('debería traducir TransicionSolicitudInvalidaError a 409 con el mensaje del dominio', async () => {
      // Arrange
      mockBandeja.aceptar.mockRejectedValue(
        new TransicionSolicitudInvalidaError(
          EstadoSolicitud.ACEPTADA,
          'aceptar',
        ),
      );

      // Act
      const error = await capturar(controller.aceptar(ID, dto, usuario));

      // Assert
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'Transición inválida: no se puede aplicar "aceptar" a una solicitud "aceptada"',
      );
    });

    it('debería propagar cualquier otro error sin transformarlo', async () => {
      // Arrange
      const error = new Error('fallo inesperado');
      mockBandeja.aceptar.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.aceptar(ID, dto, usuario)).rejects.toBe(error);
    });
  });

  describe('rechazar (POST /solicitudes/:id/rechazar)', () => {
    it('debería responder 200 (metadata @HttpCode)', () => {
      // Arrange
      const handler = Object.getOwnPropertyDescriptor(
        SolicitudesController.prototype,
        'rechazar',
      )?.value as object;

      // Act & Assert
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.OK,
      );
    });

    it('debería delegar con id y @CurrentUser y devolver la solicitud', async () => {
      // Arrange
      const respuesta = bandejaDto(EstadoSolicitud.RECHAZADA);
      mockBandeja.rechazar.mockResolvedValue(respuesta);

      // Act
      const result = await controller.rechazar(ID, usuario);

      // Assert
      expect(mockBandeja.rechazar).toHaveBeenCalledWith(ID, usuario);
      expect(result).toBe(respuesta);
    });

    it('debería traducir SolicitudNoEncontradaError a 404', async () => {
      // Arrange
      mockBandeja.rechazar.mockRejectedValue(
        new SolicitudNoEncontradaError(ID),
      );

      // Act & Assert
      await expect(controller.rechazar(ID, usuario)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('debería traducir TransicionSolicitudInvalidaError a 409', async () => {
      // Arrange
      mockBandeja.rechazar.mockRejectedValue(
        new TransicionSolicitudInvalidaError(
          EstadoSolicitud.RECHAZADA,
          'rechazar',
        ),
      );

      // Act & Assert
      await expect(controller.rechazar(ID, usuario)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('debería propagar cualquier otro error sin transformarlo', async () => {
      // Arrange
      const error = new Error('fallo inesperado');
      mockBandeja.rechazar.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.rechazar(ID, usuario)).rejects.toBe(error);
    });
  });
});
