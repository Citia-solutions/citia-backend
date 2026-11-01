import { EntityManager } from 'typeorm';

import {
  CategoriaSoporte,
  DatosMensajeSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../../domain/mensaje-soporte.entity';
import {
  LARGO_MAXIMO_ULTIMO_ERROR_SOPORTE,
  TypeOrmMensajeSoporteRepository,
  truncarCodigo,
} from './typeorm-mensaje-soporte.repository';

/**
 * Adaptador de `mensajes_soporte` SIN base de datos: el `EntityManager` del
 * `tx` es un doble y se verifica el SQL y los parámetros que recibe.
 *
 * Lo que NO cubre (`integration/envio-soporte.integration.spec.ts`, contra
 * Postgres): que SKIP LOCKED reparta filas entre dos transacciones, los CHECK,
 * las FK y que el planificador use el índice parcial.
 */
describe('TypeOrmMensajeSoporteRepository', () => {
  const ID = '5e000000-0000-4000-8000-000000000001';
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const USUARIO = '0a5e0000-0000-4000-8000-000000000001';
  const AHORA = new Date('2026-10-31T15:00:00.000Z');

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let repositorio: TypeOrmMensajeSoporteRepository;

  const comoTx = () => tx as unknown as EntityManager;
  /** SQL de la llamada `i` con los espacios colapsados. */
  const sql = (i = 0): string =>
    tx.query.mock.calls[i][0].replace(/\s+/g, ' ').trim();
  const parametros = (i = 0): unknown[] =>
    tx.query.mock.calls[i][1] as unknown[];

  const datos = (
    extra: Partial<DatosMensajeSoporte> = {},
  ): DatosMensajeSoporte => ({
    id: ID,
    tenantId: TENANT,
    usuarioId: USUARIO,
    categoria: CategoriaSoporte.PROBLEMA,
    mensaje: 'No carga la agenda',
    estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
    intentos: 0,
    proximoIntentoEn: AHORA,
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    creadoEn: AHORA,
    ...extra,
  });

  /** Fila como la devuelve Postgres (`intentos` puede llegar como texto). */
  const fila = (extra: Record<string, unknown> = {}) => ({
    ...datos(),
    ...extra,
  });

  const nuevo = () =>
    MensajeSoporte.crear({
      tenantId: TENANT,
      usuarioId: USUARIO,
      categoria: CategoriaSoporte.PROBLEMA,
      mensaje: '  No carga la agenda  ',
    });

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    repositorio = new TypeOrmMensajeSoporteRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sin transacción', () => {
    it.each<[string, () => Promise<unknown>]>([
      ['insertar', () => repositorio.insertar(nuevo(), undefined)],
      [
        'contarCreadosDesde',
        () => repositorio.contarCreadosDesde(TENANT, AHORA, undefined),
      ],
      [
        'reclamarSiguientePendiente',
        () => repositorio.reclamarSiguientePendiente(AHORA, undefined),
      ],
      ['bloquearPorId', () => repositorio.bloquearPorId(ID, undefined)],
      [
        'guardarEnvio',
        () =>
          repositorio.guardarEnvio(
            MensajeSoporte.reconstituir(datos()),
            undefined,
          ),
      ],
    ])('%s debería lanzar', async (operacion, llamar) => {
      await expect(llamar()).rejects.toThrow(
        `MensajeSoporteRepository.${operacion} requiere una transacción`,
      );
    });
  });

  describe('insertar', () => {
    it('debería insertar tenant, usuario, categoría y texto (recortado) y devolver la fila', async () => {
      // Arrange — Postgres devuelve `intentos` como número; aquí, como texto
      tx.query.mockResolvedValue([fila({ intentos: '0' })]);

      // Act
      const guardado = await repositorio.insertar(nuevo(), comoTx());

      // Assert
      expect(sql()).toMatch(
        /^INSERT INTO "mensajes_soporte" \("tenant_id", "usuario_id", "categoria", "mensaje"\) VALUES \(\$1, \$2, \$3, \$4\) RETURNING /,
      );
      expect(parametros()).toEqual([
        TENANT,
        USUARIO,
        CategoriaSoporte.PROBLEMA,
        'No carga la agenda',
      ]);
      expect(guardado).toBeInstanceOf(MensajeSoporte);
      expect(guardado.id).toBe(ID);
      expect(guardado.creadoEn).toEqual(AHORA);
      expect(guardado.proximoIntentoEn).toEqual(AHORA);
      expect(guardado.intentos).toBe(0);
      expect(guardado.estaPendiente()).toBe(true);
    });

    it('el RETURNING debería traer todas las columnas con los nombres de dominio', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila()]);

      // Act
      await repositorio.insertar(nuevo(), comoTx());

      // Assert
      for (const columna of [
        '"tenant_id" AS "tenantId"',
        '"usuario_id" AS "usuarioId"',
        '"estado_envio" AS "estadoEnvio"',
        '"proximo_intento_en" AS "proximoIntentoEn"',
        '"ultimo_error" AS "ultimoError"',
        '"proveedor_mensaje_id" AS "proveedorMensajeId"',
        '"enviado_en" AS "enviadoEn"',
        '"creado_en" AS "creadoEn"',
      ]) {
        expect(sql()).toContain(columna);
      }
    });

    it('debería rechazar un mensaje ya guardado sin consultar', async () => {
      // Act + Assert
      await expect(
        repositorio.insertar(MensajeSoporte.reconstituir(datos()), comoTx()),
      ).rejects.toThrow(/solo se inserta un mensaje recién creado/);
      expect(tx.query).not.toHaveBeenCalled();
    });

    it('debería lanzar si la base no devuelve la fila', async () => {
      await expect(repositorio.insertar(nuevo(), comoTx())).rejects.toThrow(
        /no devolvió la fila/,
      );
    });
  });

  describe('contarCreadosDesde', () => {
    it('debería contar los de la organización desde el instante dado', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ total: 4 }]);
      const desde = new Date(AHORA.getTime() - 24 * 3_600_000);

      // Act
      const total = await repositorio.contarCreadosDesde(
        TENANT,
        desde,
        comoTx(),
      );

      // Assert
      expect(sql()).toBe(
        'SELECT count(*)::int AS "total" FROM "mensajes_soporte" WHERE "tenant_id" = $1 AND "creado_en" >= $2',
      );
      expect(parametros()).toEqual([TENANT, desde]);
      expect(total).toBe(4);
    });

    it('debería devolver 0 sin filas y convertir un total en texto', async () => {
      // Arrange + Act + Assert
      expect(
        await repositorio.contarCreadosDesde(TENANT, AHORA, comoTx()),
      ).toBe(0);
      tx.query.mockResolvedValue([{ total: '3' }]);
      expect(
        await repositorio.contarCreadosDesde(TENANT, AHORA, comoTx()),
      ).toBe(3);
    });

    it('debería rechazar una fecha inválida sin consultar', async () => {
      await expect(
        repositorio.contarCreadosDesde(TENANT, new Date(Number.NaN), comoTx()),
      ).rejects.toThrow(RangeError);
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('reclamarSiguientePendiente', () => {
    it('debería tomar el pendiente más antiguo vencido con FOR UPDATE SKIP LOCKED, sin filtro de tenant', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila()]);

      // Act
      const reclamado = await repositorio.reclamarSiguientePendiente(
        AHORA,
        comoTx(),
      );

      // Assert — el predicado IGUAL al del índice parcial
      expect(sql()).toMatch(
        /FROM "mensajes_soporte" WHERE "estado_envio" = 'pendiente' AND "proximo_intento_en" <= \$1 ORDER BY "proximo_intento_en", "id" LIMIT 1 FOR UPDATE SKIP LOCKED$/,
      );
      expect(sql()).not.toMatch(/tenant_id" =/);
      expect(parametros()).toEqual([AHORA]);
      expect(reclamado?.id).toBe(ID);
      expect(reclamado?.mensaje).toBe('No carga la agenda');
    });

    it('debería devolver null cuando no hay nada que enviar', async () => {
      expect(
        await repositorio.reclamarSiguientePendiente(AHORA, comoTx()),
      ).toBeNull();
    });
  });

  describe('bloquearPorId', () => {
    it('debería bloquear la fila por id con FOR UPDATE (sin SKIP LOCKED) en cualquier estado', async () => {
      // Arrange
      tx.query.mockResolvedValue([
        fila({ estadoEnvio: EstadoEnvioSoporte.ENVIADO, enviadoEn: AHORA }),
      ]);

      // Act
      const bloqueado = await repositorio.bloquearPorId(ID, comoTx());

      // Assert
      expect(sql()).toMatch(
        /FROM "mensajes_soporte" WHERE "id" = \$1 FOR UPDATE$/,
      );
      expect(parametros()).toEqual([ID]);
      expect(bloqueado?.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
    });

    it('debería devolver null si no existe', async () => {
      expect(await repositorio.bloquearPorId(ID, comoTx())).toBeNull();
    });

    it('debería devolver null sin consultar con un id que no es UUID', async () => {
      expect(await repositorio.bloquearPorId('no-uuid', comoTx())).toBeNull();
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('guardarEnvio', () => {
    it('debería escribir los siete campos del envío solo si la fila sigue pendiente, por id y tenant', async () => {
      // Arrange — el resultado de un envío aceptado
      tx.query.mockResolvedValue([[{ id: ID }], 1]);
      const enviado = MensajeSoporte.reconstituir(
        datos({
          estadoEnvio: EstadoEnvioSoporte.ENVIADO,
          intentos: 1,
          proveedor: 'resend',
          proveedorMensajeId: 'msg_1',
          enviadoEn: AHORA,
        }),
      );

      // Act
      await repositorio.guardarEnvio(enviado, comoTx());

      // Assert
      expect(sql()).toBe(
        'UPDATE "mensajes_soporte" SET "estado_envio" = $3, "intentos" = $4, "proximo_intento_en" = $5, "ultimo_error" = $6, "proveedor" = $7, "proveedor_mensaje_id" = $8, "enviado_en" = $9 WHERE "id" = $1 AND "tenant_id" = $2 AND "estado_envio" = \'pendiente\' RETURNING "id"',
      );
      expect(parametros()).toEqual([
        ID,
        TENANT,
        EstadoEnvioSoporte.ENVIADO,
        1,
        AHORA,
        null,
        'resend',
        'msg_1',
        AHORA,
      ]);
    });

    it(`debería truncar ultimo_error a ${LARGO_MAXIMO_ULTIMO_ERROR_SOPORTE} caracteres`, async () => {
      // Arrange
      tx.query.mockResolvedValue([[{ id: ID }], 1]);
      const reintento = MensajeSoporte.reconstituir(
        datos({ intentos: 1, ultimoError: 'E'.repeat(150) }),
      );

      // Act
      await repositorio.guardarEnvio(reintento, comoTx());

      // Assert
      expect(parametros()[5]).toBe('E'.repeat(100));
    });

    it('debería lanzar si la fila ya no está pendiente (o no existe): nunca pisa un final', async () => {
      // Arrange
      tx.query.mockResolvedValue([[], 0]);

      // Act + Assert
      await expect(
        repositorio.guardarEnvio(
          MensajeSoporte.reconstituir(datos()),
          comoTx(),
        ),
      ).rejects.toThrow(/no existe o ya no está pendiente/);
    });
  });

  describe('truncarCodigo', () => {
    it('no debería partir un par sustituto', () => {
      // Arrange — 99 letras y un emoji (2 unidades UTF-16) = 100 caracteres
      const codigo = `${'a'.repeat(99)}😀b`;

      // Act + Assert
      expect(truncarCodigo(codigo)).toBe(`${'a'.repeat(99)}😀`);
      expect(truncarCodigo('resend_429')).toBe('resend_429');
    });
  });
});
