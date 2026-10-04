import {
  afectadasDe,
  esUuid,
  exigirTransaccion,
  filasDe,
  validarPeriodo,
} from './soporte-sql';

describe('soporte-sql', () => {
  describe('esUuid', () => {
    it.each([
      ['0e5a0000-0000-4000-8000-000000000001', true],
      ['0E5A0000-0000-4000-8000-00000000000A', true],
      ['no-es-uuid', false],
      ['0e5a0000-0000-4000-8000-00000000000', false],
      ["' OR 1=1 --", false],
      ['', false],
      [null, false],
      [undefined, false],
      [42, false],
    ])('%p → %p', (valor, esperado) => {
      // Act & Assert
      expect(esUuid(valor)).toBe(esperado);
    });
  });

  describe('exigirTransaccion', () => {
    it('debería lanzar sin tx, con el puerto y la operación en el mensaje', () => {
      // Act & Assert
      expect(() => exigirTransaccion(undefined, 'Puerto', 'operar')).toThrow(
        /Puerto\.operar requiere una transacción/,
      );
    });

    it('debería devolver el tx como EntityManager', () => {
      // Arrange
      const tx = { query: jest.fn() };

      // Act & Assert
      expect(exigirTransaccion(tx, 'Puerto', 'operar')).toBe(tx);
    });
  });

  describe('filasDe / afectadasDe', () => {
    it('SELECT / INSERT: TypeORM devuelve las filas tal cual', () => {
      // Arrange
      const filas = [{ id: 'a' }, { id: 'b' }];

      // Act & Assert
      expect(filasDe(filas)).toBe(filas);
      expect(afectadasDe(filas)).toBe(2);
    });

    it('UPDATE / DELETE: TypeORM devuelve [filas, cantidad]', () => {
      // Arrange
      const filas = [{ id: 'a' }];

      // Act & Assert
      expect(filasDe([filas, 1])).toBe(filas);
      expect(afectadasDe([[], 0])).toBe(0);
      expect(afectadasDe([[], 3])).toBe(3);
    });

    it('no debería confundir dos filas de un INSERT con [filas, cantidad]', () => {
      // Arrange
      const filas = [{ id: 'a' }, { id: 'b' }];

      // Act & Assert
      expect(filasDe(filas)).toHaveLength(2);
    });

    it('debería devolver [] / 0 ante algo que no es un arreglo', () => {
      // Act & Assert
      expect(filasDe(undefined)).toEqual([]);
      expect(afectadasDe(undefined)).toBe(0);
    });
  });

  describe('validarPeriodo', () => {
    const A = new Date('2026-10-03T00:00:00Z');
    const B = new Date('2026-10-04T00:00:00Z');

    it('debería aceptar desde < hasta', () => {
      // Act & Assert
      expect(() => validarPeriodo(A, B, 'op')).not.toThrow();
    });

    it.each([
      ['vacío', A, A],
      ['invertido', B, A],
      ['fecha inválida', new Date('x'), B],
    ])('debería rechazar un periodo %s', (_caso, desde, hasta) => {
      // Act & Assert
      expect(() => validarPeriodo(desde, hasta, 'op')).toThrow(RangeError);
    });
  });
});
