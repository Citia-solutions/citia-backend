import {
  POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
  PoliticaReintentoSalida,
  agotoIntentos,
  calcularEsperaReintentoMs,
  validarPoliticaReintentoSalida,
} from './politica-reintento-salida';

/**
 * Espera creciente y carta muerta del outbox (ADR-12 §3), sin base ni reloj.
 */
describe('politica-reintento-salida', () => {
  const SIN_VARIACION: PoliticaReintentoSalida = {
    ...POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
    variacion: 0,
  };
  const SEG = 1_000;

  describe('POLITICA_REINTENTO_SALIDA_POR_DEFECTO', () => {
    it('debería reflejar ADR-12: 10 intentos, 10 s de base, tope de 1 h', () => {
      // Assert
      expect(POLITICA_REINTENTO_SALIDA_POR_DEFECTO).toMatchObject({
        maxIntentos: 10,
        esperaBaseMs: 10 * SEG,
        esperaMaximaMs: 3_600 * SEG,
      });
      expect(() =>
        validarPoliticaReintentoSalida(POLITICA_REINTENTO_SALIDA_POR_DEFECTO),
      ).not.toThrow();
    });
  });

  describe('calcularEsperaReintentoMs', () => {
    it.each([
      [0, 10],
      [1, 20],
      [2, 40],
      [3, 80],
      [4, 160],
      [5, 320],
      [6, 640],
      [7, 1_280],
      [8, 2_560],
    ])(
      'con %i intentos previos debería esperar %i s (10 s × 2^n)',
      (intentosPrevios, segundos) => {
        // Act & Assert
        expect(calcularEsperaReintentoMs(intentosPrevios, SIN_VARIACION)).toBe(
          segundos * SEG,
        );
      },
    );

    it.each([9, 10, 50, 2_000])(
      'con %i intentos previos debería quedarse en el tope de 1 h',
      (intentosPrevios) => {
        // Act
        const espera = calcularEsperaReintentoMs(
          intentosPrevios,
          SIN_VARIACION,
        );

        // Assert — también cuando 2^n desborda a Infinity
        expect(espera).toBe(3_600 * SEG);
      },
    );

    it('debería tratar un contador negativo como cero', () => {
      // Act & Assert
      expect(calcularEsperaReintentoMs(-3, SIN_VARIACION)).toBe(10 * SEG);
    });

    it('debería acortar la espera según la variación, nunca alargarla', () => {
      // Arrange
      const politica = { ...SIN_VARIACION, variacion: 0.2 };

      // Act
      const conAzarCero = calcularEsperaReintentoMs(3, politica, () => 0);
      const conAzarMedio = calcularEsperaReintentoMs(3, politica, () => 0.5);
      const conAzarCasiUno = calcularEsperaReintentoMs(
        3,
        politica,
        () => 0.999_999,
      );

      // Assert — nominal 80 s; rango (64 s, 80 s]
      expect(conAzarCero).toBe(80 * SEG);
      expect(conAzarMedio).toBe(72 * SEG);
      expect(conAzarCasiUno).toBeGreaterThanOrEqual(64 * SEG);
      expect(conAzarCasiUno).toBeLessThan(80 * SEG);
    });

    it('no debería pasar del tope aunque haya variación', () => {
      // Arrange
      const politica = { ...SIN_VARIACION, variacion: 0.2 };

      // Act & Assert
      expect(calcularEsperaReintentoMs(30, politica, () => 0)).toBe(
        3_600 * SEG,
      );
      expect(
        calcularEsperaReintentoMs(30, politica, () => 0.999_999),
      ).toBeGreaterThanOrEqual(2_880 * SEG);
    });

    it('con la variación máxima (0.5) la espera no debería caer bajo la nominal anterior', () => {
      // Arrange
      const politica = { ...SIN_VARIACION, variacion: 0.5 };

      for (let n = 1; n <= 8; n++) {
        // Act — el peor caso (azar casi 1) del intento n
        const peor = calcularEsperaReintentoMs(n, politica, () => 0.999_999);
        const nominalAnterior = calcularEsperaReintentoMs(n - 1, SIN_VARIACION);

        // Assert
        expect(peor).toBeGreaterThanOrEqual(nominalAnterior);
      }
    });

    it('debería usar Math.random por defecto y quedar en el rango', () => {
      // Arrange
      const politica = { ...SIN_VARIACION, variacion: 0.2 };

      for (let i = 0; i < 50; i++) {
        // Act
        const espera = calcularEsperaReintentoMs(0, politica);

        // Assert
        expect(espera).toBeGreaterThanOrEqual(8 * SEG);
        expect(espera).toBeLessThanOrEqual(10 * SEG);
      }
    });
  });

  describe('agotoIntentos', () => {
    it('debería seguir pendiente por debajo del máximo', () => {
      // Act & Assert
      expect(agotoIntentos(9, POLITICA_REINTENTO_SALIDA_POR_DEFECTO)).toBe(
        false,
      );
    });

    it('debería pasar a fallido AL LLEGAR al máximo (ADR-12 §3)', () => {
      // Act & Assert
      expect(agotoIntentos(10, POLITICA_REINTENTO_SALIDA_POR_DEFECTO)).toBe(
        true,
      );
      expect(agotoIntentos(11, POLITICA_REINTENTO_SALIDA_POR_DEFECTO)).toBe(
        true,
      );
    });

    it('con maxIntentos = 1 el primer fallo ya es definitivo', () => {
      // Act & Assert
      expect(agotoIntentos(1, { ...SIN_VARIACION, maxIntentos: 1 })).toBe(true);
    });
  });

  describe('validarPoliticaReintentoSalida', () => {
    it.each<[string, Partial<PoliticaReintentoSalida>]>([
      ['maxIntentos = 0', { maxIntentos: 0 }],
      ['maxIntentos no entero', { maxIntentos: 2.5 }],
      [
        'maxIntentos NaN (variable de entorno mal escrita)',
        { maxIntentos: NaN },
      ],
      ['esperaBaseMs = 0', { esperaBaseMs: 0 }],
      ['esperaMaximaMs < esperaBaseMs', { esperaMaximaMs: 5_000 }],
      ['esperaMaximaMs infinita', { esperaMaximaMs: Infinity }],
      ['variacion negativa', { variacion: -0.1 }],
      ['variacion > 0.5', { variacion: 0.6 }],
    ])('debería rechazar %s', (_caso, cambio) => {
      // Act & Assert
      expect(() =>
        validarPoliticaReintentoSalida({ ...SIN_VARIACION, ...cambio }),
      ).toThrow(/Política de reintento inválida/);
    });
  });
});
