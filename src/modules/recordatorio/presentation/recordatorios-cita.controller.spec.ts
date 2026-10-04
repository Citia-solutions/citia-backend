import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { CitaDeRecordatoriosNoEncontradaError } from '../application/cita-de-recordatorios-no-encontrada.error';
import { ConsultarRecordatoriosService } from '../application/consultar-recordatorios.service';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import { DatosRecordatorio } from '../domain/recordatorio.repository';
import { RecordatoriosCitaController } from './recordatorios-cita.controller';

const CITA = '11111111-1111-4111-8111-111111111111';

function datos(extra: Partial<DatosRecordatorio>): DatosRecordatorio {
  return {
    id: 'r-1',
    tenantId: 'tenant-1',
    citaId: CITA,
    canal: CanalRecordatorio.EMAIL,
    antelacionMin: 1440,
    inicioCita: new Date('2026-10-14T13:30:00Z'),
    programadoPara: new Date('2026-10-13T13:30:00Z'),
    venceEn: new Date('2026-10-14T11:30:00Z'),
    estado: EstadoRecordatorio.PROGRAMADO,
    motivo: null,
    intentos: 0,
    proximoIntentoEn: new Date('2026-10-13T13:30:00Z'),
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    entregadoEn: null,
    quejaEn: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...extra,
  };
}

describe('RecordatoriosCitaController', () => {
  let controller: RecordatoriosCitaController;
  let servicio: { listarDeCita: jest.Mock };

  const usuario: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  beforeEach(async () => {
    servicio = { listarDeCita: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordatoriosCitaController],
      providers: [
        { provide: ConsultarRecordatoriosService, useValue: servicio },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RecordatoriosCitaController);
  });

  it('lista con el tenant del token y SIN destinatario ni datos del proveedor', async () => {
    // Arrange
    servicio.listarDeCita.mockResolvedValue([
      datos({
        id: 'r-1',
        estado: EstadoRecordatorio.ENTREGADO,
        proveedor: 'resend',
        proveedorMensajeId: 're_secreto',
        ultimoError: 'x',
        intentos: 1,
        enviadoEn: new Date('2026-10-13T13:30:05Z'),
        entregadoEn: new Date('2026-10-13T13:30:09Z'),
      }),
      datos({
        id: 'r-2',
        antelacionMin: 120,
        programadoPara: new Date('2026-10-14T11:30:00Z'),
        proximoIntentoEn: new Date('2026-10-14T11:30:00Z'),
      }),
    ]);

    // Act
    const lista = await controller.listar(CITA, usuario);

    // Assert
    expect(servicio.listarDeCita).toHaveBeenCalledWith(CITA, 'tenant-1');
    expect(lista).toEqual([
      {
        id: 'r-1',
        canal: 'email',
        antelacionMin: 1440,
        estado: 'entregado',
        motivo: null,
        programadoPara: new Date('2026-10-13T13:30:00Z'),
        proximoIntentoEn: null,
        enviadoEn: new Date('2026-10-13T13:30:05Z'),
        entregadoEn: new Date('2026-10-13T13:30:09Z'),
      },
      {
        id: 'r-2',
        canal: 'email',
        antelacionMin: 120,
        estado: 'programado',
        motivo: null,
        programadoPara: new Date('2026-10-14T11:30:00Z'),
        proximoIntentoEn: new Date('2026-10-14T11:30:00Z'),
        enviadoEn: null,
        entregadoEn: null,
      },
    ]);
    const json = JSON.stringify(lista);
    for (const prohibido of [
      'proveedor',
      're_secreto',
      'ultimoError',
      'intentos',
      'tenantId',
      'destinatario',
      'correo',
    ]) {
      expect(json).not.toContain(prohibido);
    }
  });

  it('muestra el motivo cuando no salió', async () => {
    // Arrange
    servicio.listarDeCita.mockResolvedValue([
      datos({
        estado: EstadoRecordatorio.OMITIDO,
        motivo: MotivoRecordatorio.SIN_CORREO,
      }),
    ]);

    // Act
    const [r] = await controller.listar(CITA, usuario);

    // Assert
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'sin_correo' });
  });

  it('cita de otro tenant o inexistente → 404', async () => {
    // Arrange
    servicio.listarDeCita.mockRejectedValue(
      new CitaDeRecordatoriosNoEncontradaError(CITA),
    );

    // Act & Assert
    await expect(controller.listar(CITA, usuario)).rejects.toThrow(
      NotFoundException,
    );
  });
});
