import { EntityManager, Repository } from 'typeorm';

import { ActorCambio, TipoCambio } from '../../domain/cambio-cita.entity';
import { CambioCitaOrmEntity } from './cambio-cita.orm-entity';
import { TypeOrmCambioCitaRepository } from './typeorm-cambio-cita.repository';

/**
 * Adaptador de la bitácora SIN base de datos: se comprueban el SQL y los
 * parámetros de `ultimoActorPorTipo`. El `DISTINCT ON` real contra Postgres
 * está en `enlaces-cita-persistencia.integration.spec`.
 */
describe('TypeOrmCambioCitaRepository', () => {
  let repoOrm: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let repositorio: TypeOrmCambioCitaRepository;

  const sql = (mock: jest.Mock, i = 0): string =>
    (mock.mock.calls[i] as [string])[0].replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    repoOrm = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    repositorio = new TypeOrmCambioCitaRepository(
      repoOrm as unknown as Repository<CambioCitaOrmEntity>,
    );
  });

  describe('ultimoActorPorTipo', () => {
    const TIPOS = [TipoCambio.CONFIRMADA, TipoCambio.CANCELADA] as const;

    it('debería pedir el último cambio de cada tipo filtrando por cita y tenant', async () => {
      // Act
      await repositorio.ultimoActorPorTipo('cita-1', 'tenant-1', TIPOS);

      // Assert
      expect(sql(repoOrm.query)).toBe(
        `SELECT DISTINCT ON ("tipo") "tipo", "actor_tipo" AS "actorTipo" FROM "cambios_cita" WHERE "cita_id" = $1 AND "tenant_id" = $2 AND "tipo"::text = ANY($3::text[]) ORDER BY "tipo", "ocurrido_en" DESC, "id" DESC`,
      );
      expect(repoOrm.query.mock.calls[0][1]).toEqual([
        'cita-1',
        'tenant-1',
        ['confirmada', 'cancelada'],
      ]);
    });

    it('debería devolver un mapa tipo → actor, sin los tipos que no tienen cambios', async () => {
      // Arrange
      repoOrm.query.mockResolvedValue([
        { tipo: TipoCambio.CONFIRMADA, actorTipo: ActorCambio.PACIENTE },
      ]);

      // Act
      const actores = await repositorio.ultimoActorPorTipo(
        'cita-1',
        'tenant-1',
        TIPOS,
      );

      // Assert
      expect(actores).toEqual({
        [TipoCambio.CONFIRMADA]: ActorCambio.PACIENTE,
      });
      expect(actores[TipoCambio.CANCELADA]).toBeUndefined();
    });

    it('debería devolver {} sin consultar cuando no se piden tipos', async () => {
      // Act & Assert
      expect(
        await repositorio.ultimoActorPorTipo('cita-1', 'tenant-1', []),
      ).toEqual({});
      expect(repoOrm.query).not.toHaveBeenCalled();
    });

    it('debería consultar con el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { query: jest.fn().mockResolvedValue([]) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.ultimoActorPorTipo('cita-1', 'tenant-1', TIPOS, tx);

      // Assert
      expect(repoTx.query).toHaveBeenCalledTimes(1);
      expect(repoOrm.query).not.toHaveBeenCalled();
    });
  });
});
