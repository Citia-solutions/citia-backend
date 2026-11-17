import { EntityManager } from 'typeorm';

import {
  AceptacionTerminos,
  CanalAceptacion,
} from '../../domain/aceptacion-terminos.entity';
import { TypeOrmAceptacionTerminosRepository } from './typeorm-aceptacion-terminos.repository';

/**
 * Adaptador de `aceptaciones_terminos` SIN base de datos: la forma de las
 * consultas, los parámetros, las guardas de UUID y la exigencia del `tx`. Lo
 * que el SQL hace de verdad (CHECK, índice único con ON CONFLICT, el
 * INSERT … SELECT por tenant, la FK) lo prueba
 * `paciente/integration/aceptaciones-terminos.integration.spec.ts`.
 */
describe('TypeOrmAceptacionTerminosRepository', () => {
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const PACIENTE = 'a0000000-0000-4000-8000-000000000001';
  const ENLACE = 'e1000000-0000-4000-8000-000000000001';
  const USUARIO = 'b5000000-0000-4000-8000-000000000001';
  const AHORA = new Date('2026-11-14T15:00:00.000Z');

  let porDefecto: { query: jest.Mock };
  let deLaTx: { query: jest.Mock };
  let repositorio: TypeOrmAceptacionTerminosRepository;

  const tx = (): EntityManager => deLaTx as unknown as EntityManager;

  const delEnlace = (
    extra: Partial<{
      pacienteId: string;
      tenantId: string;
      enlaceId: string;
    }> = {},
  ): AceptacionTerminos =>
    AceptacionTerminos.registrar({
      canal: CanalAceptacion.ENLACE_CITA,
      enlaceId: extra.enlaceId ?? ENLACE,
      tenantId: extra.tenantId ?? TENANT,
      pacienteId: extra.pacienteId ?? PACIENTE,
      version: '1.0',
      aceptadaEn: AHORA,
    });

  beforeEach(() => {
    porDefecto = { query: jest.fn().mockResolvedValue([]) };
    deLaTx = { query: jest.fn().mockResolvedValue([{ id: 'nueva' }]) };
    repositorio = new TypeOrmAceptacionTerminosRepository(
      porDefecto as unknown as EntityManager,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('insertarSiNoExiste', () => {
    it('debería insertar con INSERT … SELECT por id y tenant, ON CONFLICT DO NOTHING y RETURNING, en el tx', async () => {
      // Act
      const insertada = await repositorio.insertarSiNoExiste(delEnlace(), tx());

      // Assert
      expect(insertada).toBe(true);
      expect(porDefecto.query).not.toHaveBeenCalled();
      expect(deLaTx.query).toHaveBeenCalledTimes(1);
      const [sql, parametros] = deLaTx.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(/INSERT INTO "aceptaciones_terminos"/);
      expect(sql).toMatch(/FROM "pacientes" p/);
      expect(sql).toMatch(/p\."id" = \$1\s+AND p\."tenant_id" = \$2/);
      expect(sql).toMatch(
        /ON CONFLICT \("paciente_id", "version", "canal"\) DO NOTHING/,
      );
      expect(sql).toMatch(/RETURNING "id"/);
      // Ni UPDATE ni DELETE: solo inserción.
      expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
      expect(parametros).toEqual([
        PACIENTE,
        TENANT,
        '1.0',
        CanalAceptacion.ENLACE_CITA,
        AHORA,
        null,
        null,
        ENLACE,
      ]);
    });

    it('debería pasar la referencia del canal profesional en su lugar', async () => {
      // Arrange
      const profesional = AceptacionTerminos.registrar({
        canal: CanalAceptacion.PROFESIONAL,
        usuarioId: USUARIO,
        tenantId: TENANT,
        pacienteId: PACIENTE,
        version: '1.0',
        aceptadaEn: AHORA,
      });

      // Act
      await repositorio.insertarSiNoExiste(profesional, tx());

      // Assert
      const [, parametros] = deLaTx.query.mock.calls[0] as [string, unknown[]];
      expect(parametros.slice(5)).toEqual([USUARIO, null, null]);
    });

    it('debería devolver false cuando no hay RETURNING (ya existía, u otro tenant)', async () => {
      // Arrange
      deLaTx.query.mockResolvedValue([]);

      // Act & Assert
      expect(await repositorio.insertarSiNoExiste(delEnlace(), tx())).toBe(
        false,
      );
    });

    it('debería leer las filas también con la forma [filas, cantidad] de TypeORM', async () => {
      // Arrange
      deLaTx.query.mockResolvedValue([[{ id: 'nueva' }], 1]);

      // Act & Assert
      expect(await repositorio.insertarSiNoExiste(delEnlace(), tx())).toBe(
        true,
      );
    });

    it('debería tratar un resultado que no es una lista como "no insertó"', async () => {
      // Arrange
      deLaTx.query.mockResolvedValue(undefined);

      // Act & Assert
      expect(await repositorio.insertarSiNoExiste(delEnlace(), tx())).toBe(
        false,
      );
    });

    it.each([undefined, null])(
      'debería lanzar sin transacción (%p), sin consultar',
      async (sinTx) => {
        // Act & Assert
        await expect(
          repositorio.insertarSiNoExiste(delEnlace(), sinTx),
        ).rejects.toThrow(/requiere una transacción/);
        expect(porDefecto.query).not.toHaveBeenCalled();
      },
    );

    it('debería rechazar una aceptación que ya tiene id (solo se insertan las recién registradas)', async () => {
      // Arrange
      const releida = delEnlace();
      releida.id = 'ya-guardada';

      // Act & Assert
      await expect(
        repositorio.insertarSiNoExiste(releida, tx()),
      ).rejects.toThrow(/recién registradas/);
      expect(deLaTx.query).not.toHaveBeenCalled();
    });

    it.each<
      [
        string,
        Partial<{ pacienteId: string; tenantId: string; enlaceId: string }>,
      ]
    >([
      ['pacienteId', { pacienteId: 'no-es-uuid' }],
      ['tenantId', { tenantId: 'tenant-1' }],
      ['la referencia del canal', { enlaceId: '123' }],
    ])(
      'debería devolver false SIN consultar si %s no es un UUID',
      async (_campo, extra) => {
        // Act & Assert
        expect(
          await repositorio.insertarSiNoExiste(delEnlace(extra), tx()),
        ).toBe(false);
        expect(deLaTx.query).not.toHaveBeenCalled();
      },
    );
  });

  describe('existeDelTitular', () => {
    it('debería consultar SOLO los canales del titular, por paciente, tenant y versiones, sin bloqueo', async () => {
      // Arrange
      deLaTx.query.mockResolvedValue([{ existe: 1 }]);

      // Act
      const existe = await repositorio.existeDelTitular(
        PACIENTE,
        TENANT,
        ['1.0'],
        tx(),
      );

      // Assert
      expect(existe).toBe(true);
      const [sql, parametros] = deLaTx.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(/"canal" IN \('formulario_publico', 'enlace_cita'\)/);
      expect(sql).not.toMatch(/profesional/);
      expect(sql).toMatch(/"version" = ANY\(\$3::varchar\[\]\)/);
      expect(sql).not.toMatch(/FOR (NO KEY )?UPDATE|FOR SHARE/);
      expect(parametros).toEqual([PACIENTE, TENANT, ['1.0']]);
    });

    it('debería pasar una COPIA de las versiones (el catálogo es de solo lectura)', async () => {
      // Arrange
      const versiones = Object.freeze(['1.0']);

      // Act
      await repositorio.existeDelTitular(PACIENTE, TENANT, versiones, tx());

      // Assert
      const [, parametros] = deLaTx.query.mock.calls[0] as [string, unknown[]];
      expect(parametros[2]).not.toBe(versiones);
      expect(parametros[2]).toEqual(['1.0']);
    });

    it('debería usar el EntityManager por defecto cuando no recibe tx', async () => {
      // Act
      const existe = await repositorio.existeDelTitular(PACIENTE, TENANT, [
        '1.0',
      ]);

      // Assert
      expect(existe).toBe(false);
      expect(porDefecto.query).toHaveBeenCalledTimes(1);
      expect(deLaTx.query).not.toHaveBeenCalled();
    });

    it.each<[string, string, string, readonly string[]]>([
      ['sin versiones', PACIENTE, TENANT, []],
      ['con un pacienteId que no es UUID', 'paciente-1', TENANT, ['1.0']],
      ['con un tenantId que no es UUID', PACIENTE, 'tenant-1', ['1.0']],
    ])(
      'debería devolver false SIN consultar %s',
      async (_caso, pacienteId, tenantId, versiones) => {
        // Act & Assert
        expect(
          await repositorio.existeDelTitular(
            pacienteId,
            tenantId,
            versiones,
            tx(),
          ),
        ).toBe(false);
        expect(deLaTx.query).not.toHaveBeenCalled();
        expect(porDefecto.query).not.toHaveBeenCalled();
      },
    );
  });
});
