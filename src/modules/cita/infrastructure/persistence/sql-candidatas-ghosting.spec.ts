import { DataSource, EntityManager } from 'typeorm';

import { CriterioCierreGhosting } from '../../domain/candidatas-ghosting';
import { Cita, EstadoCita, OrigenCita } from '../../domain/cita.entity';
import { SqlCandidatasGhosting } from './sql-candidatas-ghosting';

/**
 * Adaptador del job G1 SIN base de datos: `query` es un doble y se comprueban
 * el SQL y los parámetros.
 *
 * Lo que NO cubre (integración contra Postgres, paso de `testing-agent`): la
 * regla caso por caso con datos reales, `SKIP LOCKED` entre dos
 * transacciones y que el planificador use `idx_cita_pendiente_inicio`.
 */
describe('SqlCandidatasGhosting', () => {
  const CITA = '0c1a0000-0000-4000-8000-000000000001';
  const OTRA = '0c1a0000-0000-4000-8000-000000000002';
  const CRITERIO: CriterioCierreGhosting = {
    limite: new Date('2026-10-19T03:00:00.000Z'),
    corte: new Date('2026-10-17T03:22:00.000Z'),
  };

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let manager: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let adaptador: SqlCandidatasGhosting;

  const comoTx = () => tx as unknown as EntityManager;
  const normalizar = (texto: string): string =>
    texto.replace(/\s+/g, ' ').trim();
  const sqlDe = (mock: jest.Mock, i = 0): string =>
    normalizar((mock.mock.calls[i] as [string])[0]);
  const parametrosDe = (mock: jest.Mock, i = 0): unknown[] =>
    (mock.mock.calls[i] as [string, unknown[]])[1];

  const fila = () => ({
    id: CITA,
    inicio: new Date('2026-10-18T13:00:00.000Z'),
    duracionMin: 45,
    tipoConsulta: 'Control',
    estado: EstadoCita.PENDIENTE,
    origen: OrigenCita.SOLICITUD_PUBLICA,
    tenantId: '7e000000-0000-4000-8000-000000000001',
    pacienteId: 'aa000000-0000-4000-8000-000000000001',
    usuarioId: '05000000-0000-4000-8000-000000000001',
    creadoEn: new Date('2026-10-10T00:00:00.000Z'),
    actualizadoEn: new Date('2026-10-10T00:00:00.000Z'),
  });

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    manager = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([{ candidatas: 0, masAntigua: null }]),
    };
    adaptador = new SqlCandidatasGhosting({
      manager,
    } as unknown as DataSource);
  });

  describe('reclamarSiguiente', () => {
    it('debería lanzar sin tx, sin consultar', async () => {
      await expect(
        adaptador.reclamarSiguiente(CRITERIO, [], undefined),
      ).rejects.toThrow(/requiere una transacción/);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('debería aplicar las tres condiciones de G1 y el corte en una consulta', async () => {
      // Act
      await adaptador.reclamarSiguiente(CRITERIO, [], comoTx());

      // Assert
      const sql = sqlDe(tx.query);
      // Condición 1 + corte. Sin cast: es el predicado del índice parcial.
      expect(sql).toContain(
        `WHERE c."estado" = 'pendiente' AND c."inicio" < $1 AND c."inicio" > $2`,
      );
      expect(sql).not.toMatch(/"estado"::/);
      // Condición 2 (con H10): proveedor real y para la hora vigente.
      expect(sql).toContain(
        `AND EXISTS ( SELECT 1 FROM "recordatorios" AS r WHERE r."cita_id" = c."id" AND r."tenant_id" = c."tenant_id" AND r."estado" IN ('enviado', 'entregado') AND r."proveedor" <> 'registro' AND r."enviado_en" >= $2 AND r."inicio_cita" = c."inicio" )`,
      );
      // Condición 3: sin petición de otra hora abierta.
      expect(sql).toContain(
        `AND NOT EXISTS ( SELECT 1 FROM "solicitudes_cita" AS s WHERE s."cita_origen_id" = c."id" AND s."tenant_id" = c."tenant_id" AND s."tipo" = 'reagendamiento' AND s."estado" = 'recibida' )`,
      );
      expect(parametrosDe(tx.query)).toEqual([
        CRITERIO.limite,
        CRITERIO.corte,
        [],
      ]);
    });

    it('debería reclamar la más antigua con FOR NO KEY UPDATE OF c SKIP LOCKED, nunca FOR UPDATE', async () => {
      // Act
      await adaptador.reclamarSiguiente(CRITERIO, [], comoTx());

      // Assert
      const sql = sqlDe(tx.query);
      expect(sql).toMatch(
        /AND c\."id" <> ALL\(\$3::uuid\[\]\) ORDER BY c\."inicio", c\."id" LIMIT 1 FOR NO KEY UPDATE OF c SKIP LOCKED$/,
      );
      expect(sql).not.toMatch(/FOR UPDATE/);
    });

    it('debería barrer todos los tenants: la cita no se filtra por tenant', async () => {
      // Act
      await adaptador.reclamarSiguiente(CRITERIO, [], comoTx());

      // Assert — los únicos tenant_id son los de las subconsultas.
      expect(sqlDe(tx.query)).not.toMatch(/c\."tenant_id" = \$/);
    });

    it('debería leer las columnas de la cita con el mapeo de TypeOrmCitaRepository', async () => {
      // Act
      await adaptador.reclamarSiguiente(CRITERIO, [], comoTx());

      // Assert
      const sql = sqlDe(tx.query);
      expect(sql).toMatch(/^SELECT c\."id" AS "id", /);
      expect(sql).toContain(`c."origen" AS "origen"`);
      expect(sql).toContain(`c."duracion_min" AS "duracionMin"`);
      expect(sql).toContain(`FROM "citas" AS c`);
    });

    it('debería pasar las excluidas como arreglo, descartando lo que no es un UUID', async () => {
      // Act
      await adaptador.reclamarSiguiente(
        CRITERIO,
        [CITA, 'no-uuid', OTRA],
        comoTx(),
      );

      // Assert
      expect(parametrosDe(tx.query)[2]).toEqual([CITA, OTRA]);
    });

    it('debería devolver la Cita de dominio reclamada', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila()]);

      // Act
      const cita = await adaptador.reclamarSiguiente(CRITERIO, [], comoTx());

      // Assert
      expect(cita).toBeInstanceOf(Cita);
      expect(cita).toMatchObject({
        id: CITA,
        estado: EstadoCita.PENDIENTE,
        origen: OrigenCita.SOLICITUD_PUBLICA,
        duracionMin: 45,
      });
    });

    it('debería devolver null cuando no queda ninguna candidata', async () => {
      expect(
        await adaptador.reclamarSiguiente(CRITERIO, [], comoTx()),
      ).toBeNull();
    });
  });

  describe('contar', () => {
    it('debería usar la MISMA regla que reclamarSiguiente, sin bloqueo, orden ni límite', async () => {
      // Arrange
      await adaptador.reclamarSiguiente(CRITERIO, [], comoTx());
      const reclamo = sqlDe(tx.query);
      const condicionesReclamo = reclamo.slice(
        reclamo.indexOf('WHERE'),
        reclamo.indexOf(' AND c."id" <> ALL'),
      );

      // Act
      await adaptador.contar(CRITERIO);

      // Assert
      const sql = sqlDe(manager.query);
      expect(sql).toBe(
        `SELECT count(*)::int AS "candidatas", min(c."inicio") AS "masAntigua" FROM "citas" AS c ${condicionesReclamo}`,
      );
      expect(sql).not.toMatch(/FOR |ORDER BY|LIMIT/);
      expect(parametrosDe(manager.query)).toEqual([
        CRITERIO.limite,
        CRITERIO.corte,
      ]);
    });

    it('debería devolver cuántas cerraría y el inicio más antiguo', async () => {
      // Arrange
      const masAntigua = new Date('2026-10-17T13:00:00.000Z');
      manager.query.mockResolvedValue([{ candidatas: 3, masAntigua }]);

      // Act & Assert
      expect(await adaptador.contar(CRITERIO)).toEqual({
        candidatas: 3,
        masAntigua,
      });
    });

    it('debería devolver 0 y null sin candidatas', async () => {
      expect(await adaptador.contar(CRITERIO)).toEqual({
        candidatas: 0,
        masAntigua: null,
      });
    });

    it('debería consultar con el tx cuando lo recibe', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ candidatas: 1, masAntigua: null }]);

      // Act
      await adaptador.contar(CRITERIO, comoTx());

      // Assert
      expect(tx.query).toHaveBeenCalledTimes(1);
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  it.each<[string, CriterioCierreGhosting]>([
    ['limite inválido', { ...CRITERIO, limite: new Date('no es fecha') }],
    ['corte inválido', { ...CRITERIO, corte: new Date(Number.NaN) }],
  ])(
    'debería rechazar un criterio con %s sin consultar',
    async (_caso, criterio) => {
      await expect(
        adaptador.reclamarSiguiente(criterio, [], comoTx()),
      ).rejects.toThrow(RangeError);
      await expect(adaptador.contar(criterio)).rejects.toThrow(RangeError);
      expect(tx.query).not.toHaveBeenCalled();
      expect(manager.query).not.toHaveBeenCalled();
    },
  );
});
