import { createHash } from 'node:crypto';

import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

import { LimitarTasa } from '../../presentation/limitar-tasa.decorator';
import {
  claveContador,
  crearOpcionesLimiteTasa,
  limitesDeRuta,
  MENSAJE_LIMITE_TASA,
  rastrearPorEnlace,
  rastrearPorIp,
} from './opciones-limite-tasa';

@LimitarTasa('portalPorIp')
class PortalDePrueba {
  ver(): void {}

  @LimitarTasa('portalPorEnlace')
  confirmar(): void {}
}

class SinLimites {
  ruta(): void {}
}

/** El método de la clase, leído del prototipo (sin separarlo de su objeto). */
function metodo(clase: new () => object, nombre: string): object {
  const descriptor = Object.getOwnPropertyDescriptor(clase.prototype, nombre);
  if (typeof descriptor?.value !== 'function') {
    throw new Error(`falta el método ${nombre}`);
  }
  return descriptor.value as object;
}

function contexto(
  clase: new () => object,
  nombreMetodo: string,
  tipo = 'http',
): ExecutionContext {
  const manejador = metodo(clase, nombreMetodo);
  return {
    getType: () => tipo,
    getClass: () => clase,
    getHandler: () => manejador,
  } as unknown as ExecutionContext;
}

const sha256 = (texto: string): string =>
  createHash('sha256').update(texto).digest('hex');

describe('opciones-limite-tasa', () => {
  describe('rastrearPorIp', () => {
    it('usa la IP del cliente (req.ip)', () => {
      expect(rastrearPorIp({ ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
    });

    it('trata una IPv4 mapeada en IPv6 como la IPv4', () => {
      expect(rastrearPorIp({ ip: '::ffff:203.0.113.7' })).toBe(
        'ip:203.0.113.7',
      );
    });

    it('agrupa las IPv6 por /64', () => {
      expect(rastrearPorIp({ ip: '2001:db8:1:2:aaaa::1' })).toBe(
        rastrearPorIp({ ip: '2001:db8:1:2:bbbb::9' }),
      );
      expect(rastrearPorIp({ ip: '2001:db8:1:2::1' })).not.toBe(
        rastrearPorIp({ ip: '2001:db8:1:3::1' }),
      );
    });

    it('sin IP no lanza', () => {
      expect(rastrearPorIp({})).toBe('ip:desconocida');
    });
  });

  describe('rastrearPorEnlace', () => {
    const TOKEN = 'A'.repeat(43);

    it('usa el sha256 de la cabecera X-Enlace-Cita, nunca el token en claro', () => {
      const rastro = rastrearPorEnlace({
        ip: '203.0.113.7',
        headers: { 'x-enlace-cita': TOKEN },
      });

      expect(rastro).toBe(`enlace:${sha256(TOKEN)}`);
      expect(rastro).not.toContain(TOKEN);
    });

    it('el mismo enlace desde dos IP es la misma clave', () => {
      expect(
        rastrearPorEnlace({ ip: '1.1.1.1', headers: { 'x-enlace-cita': 'x' } }),
      ).toBe(
        rastrearPorEnlace({ ip: '2.2.2.2', headers: { 'x-enlace-cita': 'x' } }),
      );
    });

    it.each([
      ['sin cabeceras', undefined],
      ['sin la cabecera', {}],
      ['con la cabecera vacía', { 'x-enlace-cita': '' }],
    ])('%s cae a la IP', (_caso, headers) => {
      expect(rastrearPorEnlace({ ip: '203.0.113.7', headers })).toBe(
        'ip:203.0.113.7',
      );
    });

    it('con la cabecera repetida usa la primera', () => {
      expect(
        rastrearPorEnlace({ headers: { 'x-enlace-cita': ['uno', 'dos'] } }),
      ).toBe(`enlace:${sha256('uno')}`);
    });
  });

  describe('limitesDeRuta', () => {
    it('junta los de la clase y los del método', () => {
      expect(
        [...limitesDeRuta(contexto(PortalDePrueba, 'confirmar'))].sort(),
      ).toEqual(['portalPorEnlace', 'portalPorIp']);
      expect(limitesDeRuta(contexto(PortalDePrueba, 'ver'))).toEqual([
        'portalPorIp',
      ]);
    });

    it('una ruta sin marcar no pide ninguno', () => {
      expect(limitesDeRuta(contexto(SinLimites, 'ruta'))).toEqual([]);
    });
  });

  it('la clave del contador es el nombre del límite y el rastro, sin la ruta', () => {
    const ctx = contexto(PortalDePrueba, 'ver');
    expect(claveContador(ctx, 'ip:1.1.1.1', 'portalPorIp')).toBe(
      'portalPorIp:ip:1.1.1.1',
    );
    expect(
      claveContador(
        contexto(PortalDePrueba, 'confirmar'),
        'ip:1.1.1.1',
        'portalPorIp',
      ),
    ).toBe(claveContador(ctx, 'ip:1.1.1.1', 'portalPorIp'));
  });

  describe('crearOpcionesLimiteTasa', () => {
    const opcionesDe = (activo: boolean) => {
      const opciones = crearOpcionesLimiteTasa({ activo });
      if (Array.isArray(opciones)) {
        throw new Error('se esperaba el objeto de opciones');
      }
      return opciones;
    };
    const throttler = (activo: boolean, nombre: string): ThrottlerOptions => {
      const encontrado = opcionesDe(activo).throttlers.find(
        (t) => t.name === nombre,
      );
      if (!encontrado) {
        throw new Error(`falta el throttler ${nombre}`);
      }
      return encontrado;
    };

    it('un throttler con nombre por límite, con su límite, ventana, bloqueo y rastreador', () => {
      const opciones = opcionesDe(true);

      expect(opciones.throttlers.map((t) => t.name)).toEqual([
        'login',
        'registro',
        'solicitudPublica',
        'portalPorIp',
        'portalPorEnlace',
        'cambioContrasena',
        'soporte',
      ]);
      expect(throttler(true, 'login')).toMatchObject({
        limit: 5,
        ttl: 60_000,
        blockDuration: 60_000,
        getTracker: rastrearPorIp,
      });
      expect(throttler(true, 'portalPorIp')).toMatchObject({
        limit: 30,
        ttl: 60_000,
        getTracker: rastrearPorIp,
      });
      expect(throttler(true, 'portalPorEnlace')).toMatchObject({
        limit: 5,
        ttl: 3_600_000,
        blockDuration: 3_600_000,
        getTracker: rastrearPorEnlace,
      });
    });

    it.each(['cambioContrasena', 'soporte'])(
      'US-10: el cubo %s es de 5 por hora por IP, bloqueado una hora al pasarse (ADR-15 §8)',
      (nombre) => {
        expect(throttler(true, nombre)).toMatchObject({
          name: nombre,
          limit: 5,
          ttl: 3_600_000,
          blockDuration: 3_600_000,
          getTracker: rastrearPorIp,
        });
      },
    );

    it('US-10: los cubos nuevos son opt-in (no tocan las rutas que no los piden)', () => {
      const confirmar = contexto(PortalDePrueba, 'confirmar');
      expect(throttler(true, 'cambioContrasena').skipIf?.(confirmar)).toBe(
        true,
      );
      expect(throttler(true, 'soporte').skipIf?.(confirmar)).toBe(true);
    });

    it('429 genérico y sin cabeceras de límite', () => {
      const opciones = opcionesDe(true);
      expect(opciones.errorMessage).toBe(MENSAJE_LIMITE_TASA);
      expect(opciones.setHeaders).toBe(false);
      expect(opciones.generateKey).toBe(claveContador);
    });

    it('opt-in: cada throttler solo aplica en las rutas que lo piden', () => {
      const confirmar = contexto(PortalDePrueba, 'confirmar');
      const ver = contexto(PortalDePrueba, 'ver');
      const libre = contexto(SinLimites, 'ruta');

      expect(throttler(true, 'portalPorIp').skipIf?.(confirmar)).toBe(false);
      expect(throttler(true, 'portalPorEnlace').skipIf?.(confirmar)).toBe(
        false,
      );
      expect(throttler(true, 'portalPorIp').skipIf?.(ver)).toBe(false);
      expect(throttler(true, 'portalPorEnlace').skipIf?.(ver)).toBe(true);
      expect(throttler(true, 'login').skipIf?.(confirmar)).toBe(true);
      for (const t of opcionesDe(true).throttlers) {
        expect(t.skipIf?.(libre)).toBe(true);
      }
    });

    it('con LIMITE_TASA_ACTIVO=false se salta todo', () => {
      const confirmar = contexto(PortalDePrueba, 'confirmar');
      for (const t of opcionesDe(false).throttlers) {
        expect(t.skipIf?.(confirmar)).toBe(true);
      }
    });

    it('fuera de HTTP no limita', () => {
      const rpc = contexto(PortalDePrueba, 'confirmar', 'rpc');
      expect(throttler(true, 'portalPorEnlace').skipIf?.(rpc)).toBe(true);
    });
  });
});
