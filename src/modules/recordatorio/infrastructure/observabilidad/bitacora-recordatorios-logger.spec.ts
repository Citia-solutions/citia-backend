import { AlertaRecordatorios } from '../../application/bitacora-recordatorios';
import { BitacoraRecordatoriosLogger } from './bitacora-recordatorios-logger';

describe('BitacoraRecordatoriosLogger', () => {
  const logger = {
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const bitacora = new BitacoraRecordatoriosLogger(logger);

  beforeEach(() => jest.clearAllMocks());

  it('escribe UN objeto con evento, alerta, campos y msg, al nivel pedido', () => {
    // Act
    bitacora.registrar({
      nivel: 'warn',
      evento: 'recordatorios.cuota_80',
      alerta: AlertaRecordatorios.CUOTA_80,
      campos: { alcance: 'dia', usados: 80, cuota: 100 },
      msg: 'aviso',
    });

    // Assert
    expect(logger.warn).toHaveBeenCalledWith({
      evento: 'recordatorios.cuota_80',
      alerta: 'recordatorios.cuota_80',
      alcance: 'dia',
      usados: 80,
      cuota: 100,
      msg: 'aviso',
    });
  });

  it.each([
    ['debug', 'debug'],
    ['info', 'log'],
    ['warn', 'warn'],
    ['error', 'error'],
  ] as const)('nivel %s → logger.%s', (nivel, metodo) => {
    // Act
    bitacora.registrar({ nivel, evento: 'x', msg: 'x' });

    // Assert
    expect(logger[metodo]).toHaveBeenCalledWith({ evento: 'x', msg: 'x' });
  });

  it('nunca lanza aunque el logger falle', () => {
    // Arrange
    logger.error.mockImplementationOnce(() => {
      throw new Error('stdout cerrado');
    });

    // Act & Assert
    expect(() =>
      bitacora.registrar({ nivel: 'error', evento: 'x', msg: 'x' }),
    ).not.toThrow();
  });
});
