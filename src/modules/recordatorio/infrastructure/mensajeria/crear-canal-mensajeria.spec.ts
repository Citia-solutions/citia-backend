import { crearCanalMensajeria } from './crear-canal-mensajeria';
import { RegistroCanalMensajeria } from './registro-canal-mensajeria';
import { ResendCanalMensajeria } from './resend-canal-mensajeria';

describe('crearCanalMensajeria (MENSAJERIA_ADAPTADOR)', () => {
  const logger = { log: jest.fn(), warn: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('resend → ResendCanalMensajeria', () => {
    expect(
      crearCanalMensajeria(
        {
          adaptador: 'resend',
          apiKey: 're_123',
          remitente: 'Citia <a@b.cl>',
          produccion: true,
        },
        logger,
      ),
    ).toBeInstanceOf(ResendCanalMensajeria);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('resend sin clave → falla al arrancar', () => {
    expect(() =>
      crearCanalMensajeria(
        {
          adaptador: 'resend',
          apiKey: undefined,
          remitente: undefined,
          produccion: false,
        },
        logger,
      ),
    ).toThrow(/RESEND_API_KEY/);
  });

  it.each(['registro' as const, undefined])(
    '%p → RegistroCanalMensajeria, sin aviso fuera de producción',
    (adaptador) => {
      expect(
        crearCanalMensajeria(
          {
            adaptador,
            apiKey: undefined,
            remitente: undefined,
            produccion: false,
          },
          logger,
        ),
      ).toBeInstanceOf(RegistroCanalMensajeria);
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it('registro en producción → avisa que no se envía nada', () => {
    // Act
    crearCanalMensajeria(
      {
        adaptador: 'registro',
        apiKey: undefined,
        remitente: undefined,
        produccion: true,
      },
      logger,
    );

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'mensajeria.adaptador',
        adaptador: 'registro',
      }),
    );
  });
});
