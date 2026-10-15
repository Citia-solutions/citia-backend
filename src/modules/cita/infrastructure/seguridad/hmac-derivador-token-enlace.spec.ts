import { createHash, createHmac } from 'node:crypto';

import {
  FORMATO_TOKEN_ENLACE,
  LARGO_TOKEN_ENLACE,
  esFormatoTokenEnlace,
} from '../../domain/derivador-token-enlace';
import { FORMATO_HASH_TOKEN_ENLACE } from '../../domain/enlace-cita.entity';
import { HmacDerivadorTokenEnlace } from './hmac-derivador-token-enlace';

describe('HmacDerivadorTokenEnlace (Fase 3, E2)', () => {
  const CLAVE = 'clave-de-prueba-del-enlace-de-32-caracteres!';
  const CITA = '6f1c2a8e-3b7d-4c55-9a10-2f4e8d9b0c11';
  const derivador = new HmacDerivadorTokenEnlace(CLAVE);

  describe('derivar', () => {
    it('debería ser determinista: la misma (cita, versión) da siempre el mismo token', () => {
      // Act
      const a = derivador.derivar(CITA, 1);
      const b = derivador.derivar(CITA, 1);
      const c = new HmacDerivadorTokenEnlace(CLAVE).derivar(CITA, 1);

      // Assert
      expect(a).toBe(b);
      expect(a).toBe(c);
    });

    it('debería producir 43 caracteres del alfabeto base64url, sin relleno', () => {
      // Act — varias versiones para no depender de un caso afortunado
      const tokens = [1, 2, 3, 10, 999].map((v) => derivador.derivar(CITA, v));

      // Assert
      for (const token of tokens) {
        expect(token).toHaveLength(LARGO_TOKEN_ENLACE);
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(token).not.toContain('=');
        expect(FORMATO_TOKEN_ENLACE.test(token)).toBe(true);
      }
    });

    it('debería seguir exactamente la fórmula del contrato (HMAC-SHA256 del mensaje "enlace-cita:<cita>:<versión>")', () => {
      // Arrange
      const esperado = createHmac('sha256', CLAVE)
        .update(`enlace-cita:${CITA}:7`)
        .digest('base64url');

      // Act & Assert
      expect(derivador.derivar(CITA, 7)).toBe(esperado);
    });

    it('debería dar otro token con otra versión (invalidar sube la versión)', () => {
      expect(derivador.derivar(CITA, 2)).not.toBe(derivador.derivar(CITA, 1));
    });

    it('debería dar otro token para otra cita con la misma versión', () => {
      const otraCita = '0b9d3c4e-1111-4222-8333-444455556666';
      expect(derivador.derivar(otraCita, 1)).not.toBe(
        derivador.derivar(CITA, 1),
      );
    });

    it('debería dar otro token con otra clave (rotación de ENLACE_CITA_CLAVE, DT-45)', () => {
      // Arrange
      const otra = new HmacDerivadorTokenEnlace(`${CLAVE}-rotada`);

      // Act & Assert
      expect(otra.derivar(CITA, 1)).not.toBe(derivador.derivar(CITA, 1));
    });
  });

  describe('hashear', () => {
    it('debería ser el SHA-256 hex del token, con el formato que exige la tabla', () => {
      // Arrange
      const token = derivador.derivar(CITA, 1);

      // Act
      const hash = derivador.hashear(token);

      // Assert
      expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(hash).toMatch(FORMATO_HASH_TOKEN_ENLACE);
      expect(hash).not.toContain(token);
    });

    it('debería ser determinista y distinto para tokens distintos', () => {
      const t1 = derivador.derivar(CITA, 1);
      const t2 = derivador.derivar(CITA, 2);
      expect(derivador.hashear(t1)).toBe(derivador.hashear(t1));
      expect(derivador.hashear(t1)).not.toBe(derivador.hashear(t2));
    });
  });

  it('debería negarse a construirse sin clave, sin repetir ningún valor', () => {
    expect(() => new HmacDerivadorTokenEnlace('')).toThrow(/ENLACE_CITA_CLAVE/);
    expect(
      () => new HmacDerivadorTokenEnlace(undefined as unknown as string),
    ).toThrow(/ENLACE_CITA_CLAVE/);
  });

  describe('esFormatoTokenEnlace (validador sin base de datos)', () => {
    it('debería aceptar un token real', () => {
      expect(esFormatoTokenEnlace(derivador.derivar(CITA, 1))).toBe(true);
    });

    it.each([
      ['vacío', ''],
      ['corto (42)', 'a'.repeat(42)],
      ['largo (44)', 'a'.repeat(44)],
      ['con relleno', `${'a'.repeat(42)}=`],
      ['base64 estándar (+)', `${'a'.repeat(42)}+`],
      ['base64 estándar (/)', `${'a'.repeat(42)}/`],
      ['con espacio', `${'a'.repeat(42)} `],
      ['un hash hex (64)', 'a'.repeat(64)],
      ['un uuid', CITA],
    ])('debería rechazar %s', (_caso, valor) => {
      expect(esFormatoTokenEnlace(valor)).toBe(false);
    });

    it.each([[undefined], [null], [123], [['x']], [{}]])(
      'debería rechazar un valor que no es texto (%p)',
      (valor) => {
        expect(esFormatoTokenEnlace(valor)).toBe(false);
      },
    );
  });
});
