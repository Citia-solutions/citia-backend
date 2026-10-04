import { Logger } from '@nestjs/common';

import { EventosSalidaRepository } from '../../application/eventos-salida.repository';
import {
  TransactionContext,
  TransactionRunner,
} from '../../application/transaction-runner';
import { PurgaEventosSalida } from './purga-eventos-salida';

const AHORA = new Date('2026-10-01T07:00:00Z');

class TransaccionUnica extends TransactionRunner {
  readonly tx = { id: 'tx-purga' };
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return work(this.tx);
  }
}

describe('PurgaEventosSalida', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function crear(purgar: jest.Mock): {
    purga: PurgaEventosSalida;
    transacciones: TransaccionUnica;
  } {
    const transacciones = new TransaccionUnica();
    const salida = {
      purgarEntregadosAntiguos: purgar,
    } as unknown as EventosSalidaRepository;
    return {
      purga: new PurgaEventosSalida(transacciones, salida, () => AHORA),
      transacciones,
    };
  }

  it('purga en una transacción con la retención recibida y lo registra', async () => {
    const purgar = jest
      .fn()
      .mockResolvedValue({ ejecutada: true, borrados: 7 });
    const { purga, transacciones } = crear(purgar);

    await expect(purga.purgar(14)).resolves.toEqual({
      ejecutada: true,
      borrados: 7,
    });

    expect(purgar).toHaveBeenCalledWith(AHORA, 14, transacciones.tx);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'eventos_salida.purga', borrados: 7 }),
    );
  });

  it('ejecutada: false (otro proceso tiene el candado) no es un error', async () => {
    const purgar = jest
      .fn()
      .mockResolvedValue({ ejecutada: false, borrados: 0 });
    const { purga } = crear(purgar);

    await expect(purga.purgar(14)).resolves.toEqual({
      ejecutada: false,
      borrados: 0,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('propaga un fallo de la base', async () => {
    const { purga } = crear(
      jest.fn().mockRejectedValue(new Error('base caída')),
    );
    await expect(purga.purgar(14)).rejects.toThrow('base caída');
  });
});
