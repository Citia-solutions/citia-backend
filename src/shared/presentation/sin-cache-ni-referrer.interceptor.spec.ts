import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { lastValueFrom, of } from 'rxjs';

import {
  SinCacheNiReferrer,
  SinCacheNiReferrerInterceptor,
} from './sin-cache-ni-referrer.interceptor';

function contextoHttp(setHeader: jest.Mock, tipo = 'http'): ExecutionContext {
  return {
    getType: () => tipo,
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
}

describe('SinCacheNiReferrerInterceptor', () => {
  const interceptor = new SinCacheNiReferrerInterceptor();
  const siguiente: CallHandler = { handle: () => of({ ok: true }) };

  it('pone Cache-Control: no-store y Referrer-Policy: no-referrer antes de la ruta', async () => {
    // Arrange
    const setHeader = jest.fn();
    const handle = jest.fn(() => {
      // Assert — las cabeceras ya están cuando corre la ruta (y su error)
      expect(setHeader).toHaveBeenCalledTimes(2);
      return of({ ok: true });
    });

    // Act
    const resultado = await lastValueFrom(
      interceptor.intercept(contextoHttp(setHeader), { handle }),
    );

    // Assert
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ ok: true });
  });

  it('fuera de HTTP no toca nada', async () => {
    const setHeader = jest.fn();

    await lastValueFrom(
      interceptor.intercept(contextoHttp(setHeader, 'rpc'), siguiente),
    );

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('@SinCacheNiReferrer() registra el interceptor en la clase o en la ruta', () => {
    @SinCacheNiReferrer()
    class Controlador {
      @SinCacheNiReferrer()
      ver(): void {}
    }

    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, Controlador)).toEqual([
      SinCacheNiReferrerInterceptor,
    ]);
    const ver = Object.getOwnPropertyDescriptor(Controlador.prototype, 'ver')
      ?.value as object;
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, ver)).toEqual([
      SinCacheNiReferrerInterceptor,
    ]);
  });
});
