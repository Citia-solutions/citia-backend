import { EntityManager, Repository } from 'typeorm';

import {
  ActorCambio,
  CambioCita,
  PedidoPor,
  TipoCambio,
} from '../../domain/cambio-cita.entity';
import { EstadoCita } from '../../domain/cita.entity';
import { CambioCitaOrmEntity } from './cambio-cita.orm-entity';
import { TypeOrmCambioCitaRepository } from './typeorm-cambio-cita.repository';

/**
 * Adaptador de la bitácora SIN base de datos: se comprueban el SQL y los
 * parámetros de `ultimosCambiosPorTipo` y el mapeo de `pedidoPor`. El
 * `DISTINCT ON` real contra Postgres está en
 * `enlaces-cita-persistencia.integration.spec`.
 */
describe('TypeOrmCambioCitaRepository', () => {
  let repoOrm: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
    save: jest.Mock;
    find: jest.Mock;
  };
  let repositorio: TypeOrmCambioCitaRepository;

  const sql = (mock: jest.Mock, i = 0): string =>
    (mock.mock.calls[i] as [string])[0].replace(/\s+/g, ' ').trim();

  const filaOrm = (
    extra: Partial<CambioCitaOrmEntity> = {},
  ): CambioCitaOrmEntity =>
    Object.assign(new CambioCitaOrmEntity(), {
      id: 'cambio-1',
      citaId: 'cita-1',
      tenantId: 'tenant-1',
      tipo: TipoCambio.CANCELADA,
      estadoAnterior: EstadoCita.PENDIENTE,
      estadoNuevo: EstadoCita.CANCELADA,
      inicioAnterior: null,
      inicioNuevo: null,
      motivo: null,
      actorTipo: ActorCambio.PROFESIONAL,
      actorId: 'usuario-1',
      pedidoPor: null,
      ocurridoEn: new Date('2026-10-19T12:00:00Z'),
      ...extra,
    });

  beforeEach(() => {
    repoOrm = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    repositorio = new TypeOrmCambioCitaRepository(
      repoOrm as unknown as Repository<CambioCitaOrmEntity>,
    );
  });

  describe('pedidoPor (US-07.01)', () => {
    it('registrar debería persistir pedidoPor y devolverlo en el cambio', async () => {
      // Arrange
      repoOrm.save.mockImplementation((orm: Partial<CambioCitaOrmEntity>) =>
        Promise.resolve(filaOrm({ ...orm })),
      );
      const cambio = CambioCita.registrar({
        citaId: 'cita-1',
        tenantId: 'tenant-1',
        tipo: TipoCambio.CANCELADA,
        actorTipo: ActorCambio.PROFESIONAL,
        actorId: 'usuario-1',
        pedidoPor: PedidoPor.PACIENTE,
      });

      // Act
      const guardado = await repositorio.registrar(cambio);

      // Assert
      expect(repoOrm.save).toHaveBeenCalledWith(
        expect.objectContaining({ pedidoPor: PedidoPor.PACIENTE }),
      );
      expect(guardado.pedidoPor).toBe(PedidoPor.PACIENTE);
    });

    it('historialDeCita debería dejar vacío lo que está vacío en la base (H12)', async () => {
      // Arrange
      repoOrm.find.mockResolvedValue([
        filaOrm({ id: 'c1', pedidoPor: null }),
        filaOrm({ id: 'c2', pedidoPor: PedidoPor.PROFESIONAL }),
      ]);

      // Act
      const historial = await repositorio.historialDeCita('cita-1', 'tenant-1');

      // Assert
      expect(historial.map((c) => c.pedidoPor)).toEqual([
        null,
        PedidoPor.PROFESIONAL,
      ]);
    });
  });

  describe('ultimosCambiosPorTipo', () => {
    const TIPOS = [TipoCambio.CONFIRMADA, TipoCambio.REAGENDADA] as const;

    it('debería pedir el último cambio de cada tipo, con su instante, filtrando por cita y tenant', async () => {
      // Act
      await repositorio.ultimosCambiosPorTipo('cita-1', 'tenant-1', TIPOS);

      // Assert
      expect(sql(repoOrm.query)).toBe(
        `SELECT DISTINCT ON ("tipo") "tipo", "actor_tipo" AS "actorTipo", "ocurrido_en" AS "ocurridoEn" FROM "cambios_cita" WHERE "cita_id" = $1 AND "tenant_id" = $2 AND "tipo"::text = ANY($3::text[]) ORDER BY "tipo", "ocurrido_en" DESC, "id" DESC`,
      );
      expect(repoOrm.query.mock.calls[0][1]).toEqual([
        'cita-1',
        'tenant-1',
        ['confirmada', 'reagendada'],
      ]);
    });

    it('debería devolver un mapa tipo → { actor, ocurridoEn }, sin los tipos que no tienen cambios', async () => {
      // Arrange
      const cuando = new Date('2026-10-04T10:00:00Z');
      repoOrm.query.mockResolvedValue([
        {
          tipo: TipoCambio.CONFIRMADA,
          actorTipo: ActorCambio.PACIENTE,
          ocurridoEn: cuando,
        },
      ]);

      // Act
      const ultimos = await repositorio.ultimosCambiosPorTipo(
        'cita-1',
        'tenant-1',
        TIPOS,
      );

      // Assert
      expect(ultimos).toEqual({
        [TipoCambio.CONFIRMADA]: {
          actor: ActorCambio.PACIENTE,
          ocurridoEn: cuando,
        },
      });
      expect(ultimos[TipoCambio.REAGENDADA]).toBeUndefined();
    });

    it('debería devolver {} sin consultar cuando no se piden tipos', async () => {
      // Act & Assert
      expect(
        await repositorio.ultimosCambiosPorTipo('cita-1', 'tenant-1', []),
      ).toEqual({});
      expect(repoOrm.query).not.toHaveBeenCalled();
    });

    it('debería consultar con el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { query: jest.fn().mockResolvedValue([]) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.ultimosCambiosPorTipo('cita-1', 'tenant-1', TIPOS, tx);

      // Assert
      expect(repoTx.query).toHaveBeenCalledTimes(1);
      expect(repoOrm.query).not.toHaveBeenCalled();
    });
  });
});
