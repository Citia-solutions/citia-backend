import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { ConfiguracionRecordatoriosService } from '../application/configuracion-recordatorios.service';
import { ConfiguracionRecordatorio } from '../domain/configuracion-recordatorio.entity';
import { ConfiguracionRecordatorioInvalidaError } from '../domain/exceptions/configuracion-recordatorio-invalida.error';
import { CanalRecordatorio } from '../domain/recordatorio.entity';
import { ConfiguracionRecordatoriosController } from './configuracion-recordatorios.controller';

describe('ConfiguracionRecordatoriosController', () => {
  let controller: ConfiguracionRecordatoriosController;
  let servicio: { obtener: jest.Mock; guardar: jest.Mock };

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  beforeEach(async () => {
    servicio = { obtener: jest.fn(), guardar: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfiguracionRecordatoriosController],
      providers: [
        { provide: ConfiguracionRecordatoriosService, useValue: servicio },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ConfiguracionRecordatoriosController);
  });

  it('GET devuelve la predeterminada del profesional del token', async () => {
    // Arrange
    servicio.obtener.mockResolvedValue(
      ConfiguracionRecordatorio.predeterminada('tenant-1', 'usuario-1'),
    );

    // Act
    const dto = await controller.obtener(usuario);

    // Assert
    expect(servicio.obtener).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      usuarioId: 'usuario-1',
    });
    expect(dto).toEqual({
      activo: true,
      canal: CanalRecordatorio.EMAIL,
      antelacionesMin: [1440, 120],
      telefonoContacto: null,
      correoRespuesta: null,
      predeterminada: true,
    });
  });

  it('PUT guarda con el profesional del token y devuelve la guardada', async () => {
    // Arrange
    servicio.guardar.mockResolvedValue(
      ConfiguracionRecordatorio.reconstituir({
        id: 'cfg-1',
        tenantId: 'tenant-1',
        usuarioId: 'usuario-1',
        activo: true,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [2880],
        telefonoContacto: '+56 9',
        correoRespuesta: 'a@b.cl',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      }),
    );

    // Act
    const dto = await controller.guardar(
      { activo: true, antelacionesMin: [2880], telefonoContacto: '+56 9' },
      usuario,
    );

    // Assert
    expect(servicio.guardar).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', usuarioId: 'usuario-1' },
      {
        activo: true,
        antelacionesMin: [2880],
        telefonoContacto: '+56 9',
        correoRespuesta: null,
      },
    );
    expect(dto).toEqual({
      activo: true,
      canal: CanalRecordatorio.EMAIL,
      antelacionesMin: [2880],
      telefonoContacto: '+56 9',
      correoRespuesta: 'a@b.cl',
      predeterminada: false,
    });
    expect(dto).not.toHaveProperty('tenantId');
    expect(dto).not.toHaveProperty('usuarioId');
  });

  it('PUT con reglas de dominio rotas → 400 con el mensaje del dominio', async () => {
    // Arrange
    servicio.guardar.mockRejectedValue(
      new ConfiguracionRecordatorioInvalidaError(
        'antelacionesMin',
        'los momentos de aviso no pueden repetirse',
      ),
    );

    // Act & Assert
    await expect(
      controller.guardar({ activo: true, antelacionesMin: [60] }, usuario),
    ).rejects.toThrow(BadRequestException);
  });

  it('PUT deja pasar otros errores (500)', async () => {
    // Arrange
    servicio.guardar.mockRejectedValue(new Error('db'));

    // Act & Assert
    await expect(
      controller.guardar({ activo: true, antelacionesMin: [60] }, usuario),
    ).rejects.toThrow('db');
  });
});
