import { Logger } from '@nestjs/common';

import { TrabajoSinSolapamiento } from './trabajo-sin-solapamiento';

/** Promesa que se resuelve a mano. */
function diferida(): { promesa: Promise<void>; resolver: () => void } {
  let resolver: () => void = () => undefined;
  const promesa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('TrabajoSinSolapamiento', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('salta el tick si el anterior sigue en curso', async () => {
    const { promesa, resolver } = diferida();
    const trabajo = jest.fn(() => promesa);
    const tarea = new TrabajoSinSolapamiento('t', trabajo);

    const primero = tarea.disparar();
    const segundo = tarea.disparar();
    await Promise.resolve(); // deja arrancar al primero

    expect(primero).not.toBeNull();
    expect(segundo).toBeNull();
    expect(trabajo).toHaveBeenCalledTimes(1);
    expect(tarea.ocupado).toBe(true);

    resolver();
    await primero;
    expect(tarea.ocupado).toBe(false);

    // Terminado el anterior, el siguiente tick sí corre.
    await tarea.disparar();
    expect(trabajo).toHaveBeenCalledTimes(2);
  });

  it('detener() espera al tick en curso e impide nuevos', async () => {
    const { promesa, resolver } = diferida();
    let terminado = false;
    const tarea = new TrabajoSinSolapamiento('t', async () => {
      await promesa;
      terminado = true;
    });

    void tarea.disparar();
    const deteniendo = tarea.detener();
    expect(tarea.detenido).toBe(true);
    expect(terminado).toBe(false);

    resolver();
    await deteniendo;
    expect(terminado).toBe(true);
    expect(tarea.disparar()).toBeNull();
  });

  it('un error que escapa se registra y no deja la bandera trabada', async () => {
    const tarea = new TrabajoSinSolapamiento('t', () =>
      Promise.reject(new Error('inesperado')),
    );

    await expect(tarea.disparar()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'planificador.error_no_controlado',
        trabajo: 't',
      }),
    );
    expect(tarea.ocupado).toBe(false);
  });

  it('tampoco se traba si el trabajo lanza de forma síncrona', async () => {
    const tarea = new TrabajoSinSolapamiento('t', () => {
      throw new Error('síncrono');
    });

    await tarea.disparar();

    expect(tarea.ocupado).toBe(false);
    expect(tarea.disparar()).not.toBeNull();
  });
});
