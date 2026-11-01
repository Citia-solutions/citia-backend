import { inicioSesionesValidas, tokenEmitidoVigente } from './sesiones';

describe('sesiones (corte de sesiones, ADR-15 §5)', () => {
  describe('inicioSesionesValidas', () => {
    it('trunca al segundo', () => {
      expect(
        inicioSesionesValidas(new Date('2026-10-31T12:00:00.999Z')),
      ).toEqual(new Date('2026-10-31T12:00:00.000Z'));
    });

    it('deja igual un instante que ya está en el segundo', () => {
      expect(
        inicioSesionesValidas(new Date('2026-10-31T12:00:00.000Z')),
      ).toEqual(new Date('2026-10-31T12:00:00.000Z'));
    });

    it('devuelve una fecha nueva, sin tocar la recibida', () => {
      // Arrange
      const ahora = new Date('2026-10-31T12:00:00.700Z');

      // Act
      const corte = inicioSesionesValidas(ahora);

      // Assert
      expect(corte).not.toBe(ahora);
      expect(ahora.toISOString()).toBe('2026-10-31T12:00:00.700Z');
    });
  });

  describe('tokenEmitidoVigente', () => {
    const CORTE = new Date('2026-10-31T12:00:00.000Z');
    const CORTE_SEG = CORTE.getTime() / 1000;

    it('sin corte (NULL) vale cualquier token', () => {
      expect(tokenEmitidoVigente(CORTE_SEG - 86_400, null)).toBe(true);
    });

    it('sin corte vale también un token sin iat', () => {
      expect(tokenEmitidoVigente(undefined, null)).toBe(true);
    });

    it('con corte, un token sin iat no vale', () => {
      expect(tokenEmitidoVigente(undefined, CORTE)).toBe(false);
    });

    it.each([NaN, Infinity, '1793448000' as unknown as number])(
      'con corte, un iat no numérico (%p) no vale',
      (iat) => {
        expect(tokenEmitidoVigente(iat, CORTE)).toBe(false);
      },
    );

    it('iat × 1000 igual al corte vale (el token nuevo se firma así)', () => {
      expect(tokenEmitidoVigente(CORTE_SEG, CORTE)).toBe(true);
    });

    it('un segundo antes del corte no vale', () => {
      expect(tokenEmitidoVigente(CORTE_SEG - 1, CORTE)).toBe(false);
    });

    it('un segundo después del corte vale', () => {
      expect(tokenEmitidoVigente(CORTE_SEG + 1, CORTE)).toBe(true);
    });

    it('un token del MISMO segundo del cambio, pero emitido antes, vale (ventana < 1 s aceptada, opción B1)', () => {
      // Arrange — el cambio ocurre a las 12:00:00.700; el corte se guarda
      // truncado (12:00:00.000). Un login de las 12:00:00.300 tiene iat
      // 12:00:00 (jsonwebtoken trunca a segundos).
      const cambio = new Date('2026-10-31T12:00:00.700Z');
      const corte = inicioSesionesValidas(cambio);
      const iatLoginPrevio = Math.floor(
        new Date('2026-10-31T12:00:00.300Z').getTime() / 1000,
      );

      // Act & Assert
      expect(tokenEmitidoVigente(iatLoginPrevio, corte)).toBe(true);
    });

    it('el token nuevo firmado con iat = corte vale con su propio corte', () => {
      // Arrange
      const corte = inicioSesionesValidas(new Date('2026-10-31T12:00:00.999Z'));
      const iatNuevo = Math.floor(corte.getTime() / 1000);

      // Act & Assert
      expect(tokenEmitidoVigente(iatNuevo, corte)).toBe(true);
    });

    it('un corte que no es una fecha válida no deja pasar a nadie', () => {
      expect(tokenEmitidoVigente(CORTE_SEG, new Date(NaN))).toBe(false);
    });
  });
});
