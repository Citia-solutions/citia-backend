import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { PacienteNoEncontradoError } from '../application/paciente-no-encontrado.error';
import { PacientesService } from '../application/pacientes.service';
import { VersionTerminosNoVigenteError } from '../domain/exceptions/version-terminos-no-vigente.error';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { PacienteResponseDto } from './dto/paciente-response.dto';
import { MENSAJE_VERSION_TERMINOS_NO_VIGENTE } from './dto/version-terminos.decorator';
import { PacientesController } from './pacientes.controller';

describe('PacientesController', () => {
  let servicio: { crearPaciente: jest.Mock; actualizarContacto: jest.Mock };
  let controller: PacientesController;

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  const dto: CrearPacienteDto = {
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
    terminosVersion: '1.0',
  };

  const respuesta = new PacienteResponseDto({
    id: 'paciente-1',
    rut: null,
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
    tenantId: 'tenant-1',
  });

  beforeEach(() => {
    servicio = {
      crearPaciente: jest.fn().mockResolvedValue(respuesta),
      actualizarContacto: jest.fn().mockResolvedValue(respuesta),
    };
    controller = new PacientesController(
      servicio as unknown as PacientesService,
    );
  });

  describe('crear (POST /pacientes)', () => {
    it('debería pasar el usuario del token (userId y tenantId), nunca datos del body (US-11)', async () => {
      // Act
      const result = await controller.crear(dto, usuario);

      // Assert
      expect(result).toBe(respuesta);
      expect(servicio.crearPaciente).toHaveBeenCalledWith(dto, {
        userId: 'usuario-1',
        tenantId: 'tenant-1',
      });
    });

    it('debería traducir VersionTerminosNoVigenteError a 400 con el mensaje fijo', async () => {
      // Arrange
      servicio.crearPaciente.mockRejectedValue(
        new VersionTerminosNoVigenteError(),
      );

      // Act
      const error: unknown = await controller
        .crear(dto, usuario)
        .catch((e: unknown) => e);

      // Assert
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        statusCode: 400,
        message: MENSAJE_VERSION_TERMINOS_NO_VIGENTE,
      });
    });
  });

  describe('actualizarContacto (PATCH /pacientes/:id)', () => {
    it('debería traducir PacienteNoEncontradoError a 404', async () => {
      // Arrange
      servicio.actualizarContacto.mockRejectedValue(
        new PacienteNoEncontradoError('paciente-x'),
      );

      // Act & Assert
      await expect(
        controller.actualizarContacto(
          'paciente-x',
          { correo: 'a@b.cl' },
          usuario,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
