import { HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';

import {
  SaludController,
  TIEMPO_LIMITE_BASE_DATOS_MS,
} from './salud.controller';

function respuestaFalsa(): Response & { status: jest.Mock } {
  const res = { status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock };
}

describe('SaludController', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  it('200 con la base arriba: hace SELECT 1', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = new SaludController({ query } as unknown as DataSource);
    const res = respuestaFalsa();

    await expect(controller.comprobar(res)).resolves.toEqual({
      estado: 'ok',
      baseDatos: 'ok',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('503 si la base falla, sin exponer el error y registrando solo el código', async () => {
    const error = Object.assign(
      new Error('connect ECONNREFUSED 10.0.0.5:5432'),
      {
        code: 'ECONNREFUSED',
      },
    );
    const controller = new SaludController({
      query: jest.fn().mockRejectedValue(error),
    } as unknown as DataSource);
    const res = respuestaFalsa();

    const cuerpo = await controller.comprobar(res);

    expect(cuerpo).toEqual({ estado: 'error', baseDatos: 'error' });
    expect(JSON.stringify(cuerpo)).not.toContain('10.0.0.5');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'salud.base_datos',
        motivo: 'ECONNREFUSED',
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('10.0.0.5');
  });

  it('503 si la base no responde a tiempo', async () => {
    jest.useFakeTimers();
    const controller = new SaludController({
      query: jest.fn(() => new Promise(() => undefined)),
    } as unknown as DataSource);
    const res = respuestaFalsa();

    const promesa = controller.comprobar(res);
    jest.advanceTimersByTime(TIEMPO_LIMITE_BASE_DATOS_MS);

    await expect(promesa).resolves.toEqual({
      estado: 'error',
      baseDatos: 'error',
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'tiempo_agotado' }),
    );
  });
});
