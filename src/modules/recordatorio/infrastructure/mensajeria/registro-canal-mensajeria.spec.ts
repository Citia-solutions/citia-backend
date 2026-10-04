import { Logger } from '@nestjs/common';

import {
  MensajeSaliente,
  TipoResultadoEnvio,
  claveIdempotencia,
} from '../../domain/canal-mensajeria';
import {
  RegistroCanalMensajeria,
  idFicticio,
} from './registro-canal-mensajeria';

const ID = '0e5a0000-0000-4000-8000-000000000001';
const MENSAJE: MensajeSaliente = {
  destinatario: 'paciente@correo.cl',
  asunto: 'Recordatorio de tu hora: martes 14 de octubre, 10:30',
  html: '<p>Dra. Ana Pérez</p>',
  texto: 'Dra. Ana Pérez',
  responderA: 'consulta@ana.cl',
  claveIdempotencia: claveIdempotencia(ID),
  etiquetas: { recordatorio_id: ID },
};

describe('RegistroCanalMensajeria (MENSAJERIA_ADAPTADOR=registro)', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('responde aceptado con un id ficticio y estable por clave', async () => {
    // Act
    const primero = await new RegistroCanalMensajeria().enviar(MENSAJE);
    const segundo = await new RegistroCanalMensajeria().enviar(MENSAJE);

    // Assert
    expect(primero).toEqual({
      tipo: TipoResultadoEnvio.ACEPTADO,
      proveedor: 'registro',
      proveedorMensajeId: `registro_recordatorio_${ID}`,
    });
    expect(segundo).toEqual(primero);
    expect(idFicticio('recordatorio/abc')).toBe('registro_recordatorio_abc');
  });

  it('deja constancia SIN datos personales: ni destinatario, ni cuerpo, ni nombres', async () => {
    // Act
    await new RegistroCanalMensajeria().enviar(MENSAJE);

    // Assert
    expect(log).toHaveBeenCalledTimes(1);
    const registrado = JSON.stringify(log.mock.calls[0]);
    expect(registrado).toContain(ID);
    expect(registrado).not.toContain('paciente@correo.cl');
    expect(registrado).not.toContain('consulta@ana.cl');
    expect(registrado).not.toContain('Ana Pérez');
    expect(registrado).not.toContain('Recordatorio de tu hora');
  });
});
