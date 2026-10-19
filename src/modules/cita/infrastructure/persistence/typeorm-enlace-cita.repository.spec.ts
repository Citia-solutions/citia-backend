import { EntityManager } from 'typeorm';

import {
  EnlaceCita,
  MotivoRevocacionEnlace,
} from '../../domain/enlace-cita.entity';
import { TypeOrmEnlaceCitaRepository } from './typeorm-enlace-cita.repository';

/**
 * Adaptador de `enlaces_cita` SIN base de datos: `tx.query` es un doble y se
 * comprueban el SQL y los parámetros.
 *
 * Lo que NO cubre (integration, `enlaces-cita-persistencia.integration.spec`):
 * que el `ON CONFLICT DO NOTHING` sin destino respete el índice único PARCIAL,
 * los CHECK y la carrera entre dos transacciones.
 */
describe('TypeOrmEnlaceCitaRepository', () => {
  const CITA = '0c1a0000-0000-4000-8000-000000000001';
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const ENLACE = 'e1000000-0000-4000-8000-000000000001';
  const USUARIO = '05000000-0000-4000-8000-000000000001';
  const HASH = 'b'.repeat(64);
  const EMITIDO = new Date('2026-10-14T12:00:00.000Z');

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let repositorio: TypeOrmEnlaceCitaRepository;

  const comoTx = () => tx as unknown as EntityManager;
  const sql = (i = 0): string =>
    tx.query.mock.calls[i][0].replace(/\s+/g, ' ').trim();
  const parametros = (i = 0): unknown[] | undefined =>
    tx.query.mock.calls[i][1];

  const fila = (extra: Record<string, unknown> = {}) => ({
    id: ENLACE,
    citaId: CITA,
    tenantId: TENANT,
    version: 1,
    tokenHash: HASH,
    emitidoEn: EMITIDO,
    revocadoEn: null,
    motivoRevocacion: null,
    revocadoPor: null,
    primeraAperturaEn: null,
    ...extra,
  });

  const emitido = (version = 1) =>
    EnlaceCita.emitir({
      citaId: CITA,
      tenantId: TENANT,
      version,
      tokenHash: HASH,
    });

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    repositorio = new TypeOrmEnlaceCitaRepository();
  });

  it.each<[string, () => Promise<unknown>]>([
    [
      'buscarActivoPorCita',
      () => repositorio.buscarActivoPorCita(CITA, undefined),
    ],
    [
      'buscarPorTokenHash',
      () => repositorio.buscarPorTokenHash(HASH, undefined),
    ],
    [
      'insertarSiNoExiste',
      () => repositorio.insertarSiNoExiste(emitido(), undefined),
    ],
    ['maxVersion', () => repositorio.maxVersion(CITA, undefined)],
    [
      'guardar',
      () => repositorio.guardar(EnlaceCita.reconstituir(fila()), undefined),
    ],
    [
      'registrarPrimeraApertura',
      () => repositorio.registrarPrimeraApertura(ENLACE, new Date(), undefined),
    ],
  ])('%s sin tx debería lanzar', async (op, fn) => {
    // Act & Assert
    await expect(fn()).rejects.toThrow(
      new RegExp(`EnlaceCitaRepository\\.${op} requiere una transacción`),
    );
    expect(tx.query).not.toHaveBeenCalled();
  });

  describe('buscarActivoPorCita', () => {
    it('debería buscar el enlace sin revocar de la cita y reconstituirlo', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila()]);

      // Act
      const enlace = await repositorio.buscarActivoPorCita(CITA, comoTx());

      // Assert
      expect(sql()).toContain(
        `FROM "enlaces_cita" WHERE "cita_id" = $1 AND "revocado_en" IS NULL`,
      );
      expect(parametros()).toEqual([CITA]);
      expect(enlace).toBeInstanceOf(EnlaceCita);
      expect(enlace).toMatchObject({
        id: ENLACE,
        citaId: CITA,
        tenantId: TENANT,
        version: 1,
        tokenHash: HASH,
        emitidoEn: EMITIDO,
      });
      expect(enlace?.estaActivo()).toBe(true);
      expect(enlace?.primeraAperturaEn).toBeNull();
    });

    it('debería leer y reconstituir la primera apertura (US-07.01)', async () => {
      // Arrange
      const apertura = new Date('2026-10-19T15:00:00.000Z');
      tx.query.mockResolvedValue([fila({ primeraAperturaEn: apertura })]);

      // Act
      const enlace = await repositorio.buscarActivoPorCita(CITA, comoTx());

      // Assert
      expect(sql()).toContain(`"primera_apertura_en" AS "primeraAperturaEn"`);
      expect(enlace?.primeraAperturaEn).toEqual(apertura);
    });

    it('debería devolver null sin fila', async () => {
      expect(await repositorio.buscarActivoPorCita(CITA, comoTx())).toBeNull();
    });

    it('debería devolver null sin consultar cuando el id no es un UUID', async () => {
      expect(
        await repositorio.buscarActivoPorCita('no-uuid', comoTx()),
      ).toBeNull();
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('buscarPorTokenHash', () => {
    it('debería buscar por token_hash, activo o revocado', async () => {
      // Arrange
      tx.query.mockResolvedValue([
        fila({
          revocadoEn: new Date('2026-10-15T00:00:00.000Z'),
          motivoRevocacion: MotivoRevocacionEnlace.INVALIDADO,
          revocadoPor: USUARIO,
        }),
      ]);

      // Act
      const enlace = await repositorio.buscarPorTokenHash(HASH, comoTx());

      // Assert
      expect(sql()).toContain(`WHERE "token_hash" = $1`);
      expect(sql()).not.toContain('revocado_en" IS NULL');
      expect(parametros()).toEqual([HASH]);
      expect(enlace?.estaActivo()).toBe(false);
      expect(enlace?.revocadoPor).toBe(USUARIO);
    });

    it.each([
      ['el token en claro', 'Ab-_'.repeat(10) + 'xyz'],
      ['mayúsculas', 'B'.repeat(64)],
      ['vacío', ''],
    ])('debería devolver null sin consultar con %s', async (_caso, valor) => {
      expect(await repositorio.buscarPorTokenHash(valor, comoTx())).toBeNull();
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('insertarSiNoExiste', () => {
    it('debería insertar con ON CONFLICT DO NOTHING (sin destino) y devolver true si insertó', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ id: ENLACE }]);

      // Act
      const insertado = await repositorio.insertarSiNoExiste(
        emitido(2),
        comoTx(),
      );

      // Assert
      expect(insertado).toBe(true);
      expect(sql()).toBe(
        `INSERT INTO "enlaces_cita" ("cita_id", "tenant_id", "version", "token_hash") VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING "id"`,
      );
      expect(parametros()).toEqual([CITA, TENANT, 2, HASH]);
    });

    it('debería devolver false cuando chocó con una clave única', async () => {
      // Arrange — ON CONFLICT DO NOTHING: RETURNING no devuelve filas.
      tx.query.mockResolvedValue([]);

      // Act & Assert
      expect(await repositorio.insertarSiNoExiste(emitido(), comoTx())).toBe(
        false,
      );
    });

    it('no debería modificar el enlace recibido', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ id: ENLACE }]);
      const enlace = emitido();

      // Act
      await repositorio.insertarSiNoExiste(enlace, comoTx());

      // Assert
      expect(enlace.id).toBeUndefined();
    });

    it.each<[string, () => EnlaceCita]>([
      ['ya persistido', () => EnlaceCita.reconstituir(fila())],
      [
        'revocado',
        () => {
          const e = emitido();
          e.invalidar(USUARIO, new Date());
          return e;
        },
      ],
    ])('debería rechazar un enlace %s sin consultar', async (_caso, crear) => {
      await expect(
        repositorio.insertarSiNoExiste(crear(), comoTx()),
      ).rejects.toThrow(/solo se insertan enlaces recién emitidos/);
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('maxVersion', () => {
    it('debería devolver la mayor versión de la cita', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ max: 3 }]);

      // Act
      const max = await repositorio.maxVersion(CITA, comoTx());

      // Assert
      expect(max).toBe(3);
      expect(sql()).toContain(
        `SELECT max("version") AS "max" FROM "enlaces_cita" WHERE "cita_id" = $1`,
      );
      expect(parametros()).toEqual([CITA]);
    });

    it('debería devolver null cuando la cita nunca tuvo enlace', async () => {
      // Arrange — max() sobre cero filas devuelve una fila con NULL.
      tx.query.mockResolvedValue([{ max: null }]);

      // Act & Assert
      expect(await repositorio.maxVersion(CITA, comoTx())).toBeNull();
    });
  });

  describe('guardar', () => {
    const revocado = () => {
      const enlace = EnlaceCita.reconstituir(fila());
      enlace.invalidar(USUARIO, new Date('2026-10-15T10:00:00.000Z'));
      return enlace;
    };

    it('debería persistir solo la revocación y solo sobre un enlace activo', async () => {
      // Arrange — TypeORM devuelve [filas, cantidad] en un UPDATE.
      const enlace = revocado();
      tx.query.mockResolvedValue([
        [
          fila({
            revocadoEn: enlace.revocadoEn,
            motivoRevocacion: MotivoRevocacionEnlace.INVALIDADO,
            revocadoPor: USUARIO,
          }),
        ],
        1,
      ]);

      // Act
      const guardado = await repositorio.guardar(enlace, comoTx());

      // Assert
      expect(sql()).toContain(`UPDATE "enlaces_cita"`);
      expect(sql()).toContain(
        `SET "revocado_en" = $2, "motivo_revocacion" = $3, "revocado_por" = $4 WHERE "id" = $1 AND "revocado_en" IS NULL`,
      );
      expect(sql()).not.toContain('"token_hash" =');
      expect(sql()).not.toContain('"version" =');
      // La revocación nunca pisa la primera apertura (US-07.01).
      expect(sql()).not.toContain('"primera_apertura_en" =');
      expect(parametros()).toEqual([
        ENLACE,
        enlace.revocadoEn,
        MotivoRevocacionEnlace.INVALIDADO,
        USUARIO,
      ]);
      expect(guardado.estaActivo()).toBe(false);
      expect(tx.query).toHaveBeenCalledTimes(1);
    });

    it('debería devolver la revocación existente (gana la primera) si ya estaba revocado', async () => {
      // Arrange — el UPDATE no afecta filas; la relectura trae la primera.
      const primera = new Date('2026-10-14T20:00:00.000Z');
      tx.query.mockResolvedValueOnce([[], 0]);
      tx.query.mockResolvedValueOnce([
        fila({
          revocadoEn: primera,
          motivoRevocacion: MotivoRevocacionEnlace.INVALIDADO,
          revocadoPor: 'otro-usuario',
        }),
      ]);

      // Act
      const guardado = await repositorio.guardar(revocado(), comoTx());

      // Assert
      expect(guardado.revocadoEn).toEqual(primera);
      expect(guardado.revocadoPor).toBe('otro-usuario');
      expect(sql(1)).toContain(`FROM "enlaces_cita" WHERE "id" = $1`);
    });

    it('debería lanzar si el enlace no existe', async () => {
      // Arrange
      tx.query.mockResolvedValueOnce([[], 0]);
      tx.query.mockResolvedValueOnce([]);

      // Act & Assert
      await expect(repositorio.guardar(revocado(), comoTx())).rejects.toThrow(
        /el enlace no existe/,
      );
    });

    it('debería rechazar un enlace sin id o sin revocar, sin consultar', async () => {
      // Act & Assert
      await expect(repositorio.guardar(emitido(), comoTx())).rejects.toThrow(
        /no está persistido/,
      );
      await expect(
        repositorio.guardar(EnlaceCita.reconstituir(fila()), comoTx()),
      ).rejects.toThrow(/solo persiste la revocación/);
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('registrarPrimeraApertura (US-07.01)', () => {
    const AHORA = new Date('2026-10-19T15:00:00.000Z');

    it('debería escribir solo primera_apertura_en, solo si estaba vacía, y devolver true si escribió', async () => {
      // Arrange — TypeORM devuelve [filas, cantidad] en un UPDATE.
      tx.query.mockResolvedValue([[{ id: ENLACE }], 1]);

      // Act
      const escribio = await repositorio.registrarPrimeraApertura(
        ENLACE,
        AHORA,
        comoTx(),
      );

      // Assert
      expect(escribio).toBe(true);
      expect(sql()).toBe(
        `UPDATE "enlaces_cita" SET "primera_apertura_en" = $2 WHERE "id" = $1 AND "primera_apertura_en" IS NULL RETURNING "id"`,
      );
      expect(parametros()).toEqual([ENLACE, AHORA]);
      expect(tx.query).toHaveBeenCalledTimes(1);
    });

    it('debería devolver false si ya tenía apertura (o el enlace no existe)', async () => {
      // Arrange — el UPDATE no afecta filas.
      tx.query.mockResolvedValue([[], 0]);

      // Act & Assert
      expect(
        await repositorio.registrarPrimeraApertura(ENLACE, AHORA, comoTx()),
      ).toBe(false);
    });

    it('debería devolver false sin consultar cuando el id no es un UUID', async () => {
      expect(
        await repositorio.registrarPrimeraApertura('no-uuid', AHORA, comoTx()),
      ).toBe(false);
      expect(tx.query).not.toHaveBeenCalled();
    });
  });
});
