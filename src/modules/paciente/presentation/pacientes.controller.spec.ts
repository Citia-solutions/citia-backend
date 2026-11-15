import { BadRequestException } from '@nestjs/common';

import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { PacientesService } from '../application/pacientes.service';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { PacientesController } from './pacientes.controller';

/**
 * Traducción del RUT inválido a HTTP en el alta manual. Qué RUT es inválido
 * (forma escrita y dígito verificador) lo prueban `rut.spec.ts` y
 * `pacientes.service.spec.ts`; aquí, solo que el error llega como 400.
 */
describe('PacientesController', () => {
  const USUARIO: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'pro@mail.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  const dto = {
    rut: '17.890.123-X',
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
  } as CrearPacienteDto;

  it('debería responder 400 cuando el caso de uso rechaza el RUT', async () => {
    // Arrange
    const servicio = {
      crearPaciente: jest
        .fn()
        .mockRejectedValue(new RutInvalidoError(dto.rut as string)),
    };
    const controller = new PacientesController(
      servicio as unknown as PacientesService,
    );

    // Act & Assert
    await expect(controller.crear(dto, USUARIO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
