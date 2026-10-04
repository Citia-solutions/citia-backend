import { EntityManager } from 'typeorm';

import { calcularHashCorreo } from '../../domain/hash-correo';
import { MotivoSupresion } from '../../domain/supresion-correo.repository';
import { TypeOrmSupresionCorreoRepository } from './typeorm-supresion-correo.repository';

describe('TypeOrmSupresionCorreoRepository', () => {
  const HASH = calcularHashCorreo('ana@example.com');
  const RECORDATORIO = '0e5a0000-0000-4000-8000-000000000001';

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let repositorio: TypeOrmSupresionCorreoRepository;

  const comoTx = () => tx as unknown as EntityManager;
  const sql = (i = 0): string =>
    tx.query.mock.calls[i][0].replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    repositorio = new TypeOrmSupresionCorreoRepository();
  });

  it.each<[string, () => Promise<unknown>]>([
    ['existe', () => repositorio.existe(HASH, undefined)],
    [
      'agregar',
      () =>
        repositorio.agregar(
          {
            correoHash: HASH,
            motivo: MotivoSupresion.REBOTE,
            origenRecordatorioId: null,
          },
          undefined,
        ),
    ],
  ])('%s sin tx debería lanzar', async (op, fn) => {
    // Act & Assert
    await expect(fn()).rejects.toThrow(
      new RegExp(`SupresionCorreoRepository\\.${op} requiere una transacción`),
    );
  });

  describe('existe', () => {
    it.each([true, false])('debería devolver %p según la base', async (hay) => {
      // Arrange
      tx.query.mockResolvedValue([{ existe: hay }]);

      // Act
      const existe = await repositorio.existe(HASH, comoTx());

      // Assert
      expect(existe).toBe(hay);
      expect(sql()).toContain(`WHERE "correo_hash" = $1`);
      expect(tx.query.mock.calls[0][1]).toEqual([HASH]);
    });
  });

  describe('agregar', () => {
    it('debería insertar de forma idempotente y decir si agregó', async () => {
      // Arrange
      tx.query.mockResolvedValueOnce([{ correoHash: HASH }]);
      tx.query.mockResolvedValueOnce([]);
      const supresion = {
        correoHash: HASH,
        motivo: MotivoSupresion.QUEJA,
        origenRecordatorioId: RECORDATORIO,
      };

      // Act
      const primera = await repositorio.agregar(supresion, comoTx());
      const segunda = await repositorio.agregar(supresion, comoTx());

      // Assert
      expect(primera).toBe(true);
      expect(segunda).toBe(false);
      expect(sql()).toContain(`ON CONFLICT ("correo_hash") DO NOTHING`);
      expect(tx.query.mock.calls[0][1]).toEqual([HASH, 'queja', RECORDATORIO]);
    });

    it('debería rechazar un origen que no es UUID', async () => {
      // Act & Assert
      await expect(
        repositorio.agregar(
          {
            correoHash: HASH,
            motivo: MotivoSupresion.REBOTE,
            origenRecordatorioId: 'x',
          },
          comoTx(),
        ),
      ).rejects.toThrow(/origenRecordatorioId no es un UUID/);
    });
  });

  describe('nunca la dirección en claro', () => {
    it.each(['ana@example.com', HASH.toUpperCase(), HASH.slice(1), ''])(
      'debería rechazar %p sin consultar ni repetir el valor',
      async (valor) => {
        // Act
        const existe = repositorio.existe(valor, comoTx());
        const agregar = repositorio.agregar(
          {
            correoHash: valor,
            motivo: MotivoSupresion.REBOTE,
            origenRecordatorioId: null,
          },
          comoTx(),
        );

        // Assert
        await expect(existe).rejects.toThrow(/se esperaba el hash SHA-256/);
        await expect(agregar).rejects.toThrow(/se esperaba el hash SHA-256/);
        await expect(existe).rejects.not.toThrow(valor || 'nada');
        expect(tx.query).not.toHaveBeenCalled();
      },
    );
  });
});
