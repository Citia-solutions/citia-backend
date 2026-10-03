import { EntityManager } from 'typeorm';

import { DatosConfiguracionRecordatorio } from '../../domain/configuracion-recordatorio.repository';
import { CanalRecordatorio } from '../../domain/recordatorio.entity';
import { TypeOrmConfiguracionRecordatorioRepository } from './typeorm-configuracion-recordatorio.repository';

describe('TypeOrmConfiguracionRecordatorioRepository', () => {
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const USUARIO = '05000000-0000-4000-8000-000000000001';
  const AHORA = new Date('2026-10-03T12:00:00.000Z');

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let repositorio: TypeOrmConfiguracionRecordatorioRepository;

  const comoTx = () => tx as unknown as EntityManager;
  const sql = (i = 0): string =>
    tx.query.mock.calls[i][0].replace(/\s+/g, ' ').trim();

  const datos: DatosConfiguracionRecordatorio = {
    tenantId: TENANT,
    usuarioId: USUARIO,
    activo: true,
    canal: CanalRecordatorio.EMAIL,
    antelacionesMin: [2880, 120],
    telefonoContacto: '+56 9 1234 5678',
    correoRespuesta: null,
  };

  const fila = {
    id: 'c0000000-0000-4000-8000-000000000001',
    ...datos,
    antelacionesMin: [2880, 120],
    creadoEn: AHORA,
    actualizadoEn: AHORA,
  };

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    repositorio = new TypeOrmConfiguracionRecordatorioRepository();
  });

  it.each<[string, () => Promise<unknown>]>([
    ['obtener', () => repositorio.obtener(TENANT, USUARIO, undefined)],
    ['guardar', () => repositorio.guardar(datos, undefined)],
  ])('%s sin tx debería lanzar', async (op, fn) => {
    // Act & Assert
    await expect(fn()).rejects.toThrow(
      new RegExp(
        `ConfiguracionRecordatorioRepository\\.${op} requiere una transacción`,
      ),
    );
  });

  describe('obtener', () => {
    it('debería leer por (tenant, usuario)', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila]);

      // Act
      const configuracion = await repositorio.obtener(
        TENANT,
        USUARIO,
        comoTx(),
      );

      // Assert
      expect(sql()).toContain(`WHERE "tenant_id" = $1 AND "usuario_id" = $2`);
      expect(tx.query.mock.calls[0][1]).toEqual([TENANT, USUARIO]);
      expect(configuracion).toEqual(fila);
    });

    it('debería devolver null sin fila (aplica la predeterminada quien llama)', async () => {
      // Act & Assert
      expect(await repositorio.obtener(TENANT, USUARIO, comoTx())).toBeNull();
    });

    it('debería normalizar las antelaciones a números', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ ...fila, antelacionesMin: ['1440'] }]);

      // Act
      const configuracion = await repositorio.obtener(
        TENANT,
        USUARIO,
        comoTx(),
      );

      // Assert
      expect(configuracion?.antelacionesMin).toEqual([1440]);
    });
  });

  describe('guardar', () => {
    it('debería hacer upsert por (tenant_id, usuario_id) y devolver la fila', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila]);

      // Act
      const guardada = await repositorio.guardar(datos, comoTx());

      // Assert
      expect(sql()).toContain(
        `ON CONFLICT ("tenant_id", "usuario_id") DO UPDATE`,
      );
      expect(sql()).toContain(
        `"antelaciones_min" = EXCLUDED."antelaciones_min"`,
      );
      expect(sql()).toContain(`"actualizado_en" = now()`);
      expect(sql()).toContain(`$5::int[]`);
      expect(tx.query.mock.calls[0][1]).toEqual([
        TENANT,
        USUARIO,
        true,
        'email',
        [2880, 120],
        '+56 9 1234 5678',
        null,
      ]);
      expect(guardada).toEqual(fila);
    });

    it('no debería tocar creado_en en la actualización', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila]);

      // Act
      await repositorio.guardar(datos, comoTx());

      // Assert
      expect(sql()).not.toMatch(/"creado_en"\s*=/);
    });
  });
});
