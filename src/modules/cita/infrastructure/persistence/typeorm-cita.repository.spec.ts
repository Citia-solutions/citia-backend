import { ConfigService } from '@nestjs/config';
import {
  And,
  EntityManager,
  In,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { Cita, ESTADOS_VIGENTES, EstadoCita } from '../../domain/cita.entity';
import { CitaOrmEntity } from './cita.orm-entity';
import { TypeOrmCitaRepository } from './typeorm-cita.repository';

/**
 * Adaptador TypeORM de citas SIN base de datos: se comprueba la consulta que
 * arma (where / order) sobre un `Repository` de mentira. El SQL real, el
 * índice y el orden en Postgres siguen pendientes de la e2e con BD (DT-20).
 */
describe('TypeOrmCitaRepository', () => {
  let repoOrm: { find: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let repositorio: TypeOrmCitaRepository;

  const DESDE = new Date('2026-09-21T03:00:00.000Z');
  const HASTA = new Date('2026-09-28T03:00:00.000Z');

  const fila = (id: string): CitaOrmEntity =>
    Object.assign(new CitaOrmEntity(), {
      id,
      inicio: new Date('2026-09-22T13:00:00.000Z'),
      duracionMin: 50,
      tipoConsulta: 'Control',
      estado: EstadoCita.CONFIRMADA,
      tenantId: 'tenant-1',
      pacienteId: 'paciente-1',
      usuarioId: 'usuario-1',
      creadoEn: new Date('2026-09-01T00:00:00Z'),
      actualizadoEn: new Date('2026-09-01T00:00:00Z'),
    });

  beforeEach(() => {
    repoOrm = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    repositorio = new TypeOrmCitaRepository(
      repoOrm as unknown as Repository<CitaOrmEntity>,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buscarPorProfesionalEnRango', () => {
    it('debería filtrar por tenant + profesional en [desde, hasta) sin filtro de estado y ordenar por inicio, creadoEn', async () => {
      // Act
      await repositorio.buscarPorProfesionalEnRango(
        'tenant-1',
        'usuario-1',
        DESDE,
        HASTA,
      );

      // Assert
      expect(repoOrm.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          usuarioId: 'usuario-1',
          inicio: And(MoreThanOrEqual(DESDE), LessThan(HASTA)),
        },
        order: { inicio: 'ASC', creadoEn: 'ASC' },
      });
    });

    it('debería restringir con IN (estados) cuando se piden ESTADOS_VIGENTES', async () => {
      // Act
      await repositorio.buscarPorProfesionalEnRango(
        'tenant-1',
        'usuario-1',
        DESDE,
        HASTA,
        { estados: ESTADOS_VIGENTES },
      );

      // Assert
      const [opciones] = repoOrm.find.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(opciones.where.estado).toEqual(
        In([EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA]),
      );
    });

    it('debería devolver [] sin consultar cuando la lista de estados está vacía (IN () no es SQL)', async () => {
      // Act
      const result = await repositorio.buscarPorProfesionalEnRango(
        'tenant-1',
        'usuario-1',
        DESDE,
        HASTA,
        { estados: [] },
      );

      // Assert
      expect(result).toEqual([]);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });

    it('debería usar el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { find: jest.fn().mockResolvedValue([]) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.buscarPorProfesionalEnRango(
        'tenant-1',
        'usuario-1',
        DESDE,
        HASTA,
        { estados: ESTADOS_VIGENTES },
        tx,
      );

      // Assert
      expect(repoTx.find).toHaveBeenCalledTimes(1);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });

    it('debería reconstituir las filas a Cita conservando el orden', async () => {
      // Arrange
      repoOrm.find.mockResolvedValue([fila('c1'), fila('c2')]);

      // Act
      const result = await repositorio.buscarPorProfesionalEnRango(
        'tenant-1',
        'usuario-1',
        DESDE,
        HASTA,
      );

      // Assert
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(result[0]).toBeInstanceOf(Cita);
      expect(result[0].estado).toBe(EstadoCita.CONFIRMADA);
    });
  });
});
