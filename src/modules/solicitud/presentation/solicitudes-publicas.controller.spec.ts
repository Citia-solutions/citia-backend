import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { SolicitudesService } from '../application/solicitudes.service';
import { CrearSolicitudDto } from './dto/crear-solicitud.dto';
import { SolicitudRecibidaDto } from './dto/solicitud-recibida.dto';
import { SolicitudesPublicasController } from './solicitudes-publicas.controller';

/**
 * El RUT del formulario público, de punta a punta sin HTTP: controller y caso
 * de uso reales, repositorios simulados. El `ValidationPipe` solo exige que
 * `rut` sea texto; la forma y el dígito verificador los decide el dominio
 * (`esRutValido`) y el controller los traduce a 400.
 */
describe('SolicitudesPublicasController', () => {
  const SLUG = 'clinica-demo';

  let controller: SolicitudesPublicasController;
  let findBySlug: jest.Mock;
  let guardar: jest.Mock;

  // Como lo arma el ValidationPipe. Con `plainToInstance` el cuerpo no depende
  // de los campos que declare el DTO: `terminosVersion` (US-11) compila esté o
  // no en `CrearSolicitudDto`.
  const cuerpo = (rut: string): CrearSolicitudDto =>
    plainToInstance(CrearSolicitudDto, {
      rut,
      nombrePaciente: 'Ana Soto',
      telefono: '+56 9 1111 1111',
      correo: 'ana@mail.com',
      motivo: 'Control',
      preferenciaHoraria: 'mañanas',
      consentimiento: true,
      terminosVersion: '1.0',
    });

  beforeEach(() => {
    findBySlug = jest.fn().mockResolvedValue({ id: 'tenant-1', slug: SLUG });
    guardar = jest.fn().mockResolvedValue(undefined);
    const solicitudes = {
      guardar,
      buscarAbiertaPorRut: jest.fn().mockResolvedValue(null),
    };
    controller = new SolicitudesPublicasController(
      new SolicitudesService(solicitudes as never, { findBySlug } as never, 72),
    );
  });

  it('debería responder 400 a un RUT mal escrito que normalizado sería otro RUT válido', async () => {
    // Act
    const respuesta = controller.recibir(SLUG, cuerpo('17.890.123-X'));

    // Assert — 400 antes de buscar la organización: no revela si existe
    await expect(respuesta).rejects.toBeInstanceOf(BadRequestException);
    expect(findBySlug).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
  });

  it.each(['12.345.678-5', '12345678-5', '123456785'])(
    'debería aceptar el RUT bien escrito %p con el 202 de siempre',
    async (rut) => {
      // Act
      const respuesta = await controller.recibir(SLUG, cuerpo(rut));

      // Assert
      expect(respuesta).toBeInstanceOf(SolicitudRecibidaDto);
      expect(guardar).toHaveBeenCalledTimes(1);
    },
  );
});
