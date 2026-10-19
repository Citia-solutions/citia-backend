import { ConfigService } from '@nestjs/config';
import {
  And,
  EntityManager,
  In,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import {
  Cita,
  ESTADOS_VIGENTES,
  EstadoCita,
  OrigenCita,
} from '../../domain/cita.entity';
import { CitaOrmEntity } from './cita.orm-entity';
import {
  citaDesdeFila,
  columnasCita,
  TypeOrmCitaRepository,
} from './typeorm-cita.repository';

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
      origen: OrigenCita.SOLICITUD_PUBLICA,
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

  describe('buscarPorIdParaActualizar', () => {
    it('debería lanzar si no recibe una transacción', async () => {
      // Act & Assert
      await expect(
        repositorio.buscarPorIdParaActualizar('c1', 'tenant-1', undefined),
      ).rejects.toThrow(/requiere una transacción/);
      expect(repoOrm.findOne).not.toHaveBeenCalled();
    });

    it('debería filtrar por id + tenant con bloqueo for_no_key_update dentro del tx', async () => {
      // Arrange
      const repoTx = { findOne: jest.fn().mockResolvedValue(fila('c1')) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      const result = await repositorio.buscarPorIdParaActualizar(
        'c1',
        'tenant-1',
        tx,
      );

      // Assert
      expect(repoTx.findOne).toHaveBeenCalledWith({
        where: { id: 'c1', tenantId: 'tenant-1' },
        lock: { mode: 'for_no_key_update' },
      });
      expect(repoOrm.findOne).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(Cita);
      expect(result?.id).toBe('c1');
    });

    it('debería devolver null cuando no la encuentra (inexistente u otro tenant)', async () => {
      // Arrange
      const repoTx = { findOne: jest.fn().mockResolvedValue(null) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act & Assert
      expect(
        await repositorio.buscarPorIdParaActualizar('c1', 'otro-tenant', tx),
      ).toBeNull();
    });
  });

  describe('origen (US-07.01)', () => {
    it('guardar debería persistir el origen de la cita y devolverlo', async () => {
      // Arrange
      // Lo que "relee" la base es lo que se le pasó: si el adaptador no
      // escribiera `origen`, volvería el de la fila base (`manual`).
      repoOrm.save.mockImplementation((orm: Partial<CitaOrmEntity>) =>
        Promise.resolve({ ...fila('c1'), origen: OrigenCita.MANUAL, ...orm }),
      );
      const cita = Cita.crear({
        inicio: new Date('2026-10-22T13:00:00.000Z'),
        duracionMin: 45,
        tipoConsulta: 'Control',
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'usuario-1',
        origen: OrigenCita.SOLICITUD_PUBLICA,
      });

      // Act
      const guardada = await repositorio.guardar(cita);

      // Assert
      expect(repoOrm.save).toHaveBeenCalledWith(
        expect.objectContaining({ origen: OrigenCita.SOLICITUD_PUBLICA }),
      );
      expect(guardada.origen).toBe(OrigenCita.SOLICITUD_PUBLICA);
    });

    it('debería reconstituir el origen leído', async () => {
      // Arrange
      repoOrm.findOne.mockResolvedValue(fila('c1'));

      // Act
      const cita = await repositorio.buscarPorId('c1', 'tenant-1');

      // Assert
      expect(cita?.origen).toBe(OrigenCita.SOLICITUD_PUBLICA);
    });
  });

  describe('mapeo compartido con el SQL a mano', () => {
    it('columnasCita debería seleccionar cada columna con el nombre de su propiedad', () => {
      expect(columnasCita('c')).toBe(
        [
          'c."id" AS "id"',
          'c."inicio" AS "inicio"',
          'c."duracion_min" AS "duracionMin"',
          'c."tipo_consulta" AS "tipoConsulta"',
          'c."estado" AS "estado"',
          'c."origen" AS "origen"',
          'c."tenant_id" AS "tenantId"',
          'c."paciente_id" AS "pacienteId"',
          'c."usuario_id" AS "usuarioId"',
          'c."creado_en" AS "creadoEn"',
          'c."actualizado_en" AS "actualizadoEn"',
        ].join(', '),
      );
    });

    it('citaDesdeFila debería reconstituir la Cita con todos sus datos', () => {
      // Act
      const cita = citaDesdeFila(fila('c9'));

      // Assert
      expect(cita).toBeInstanceOf(Cita);
      expect(cita).toMatchObject({
        id: 'c9',
        duracionMin: 50,
        tipoConsulta: 'Control',
        estado: EstadoCita.CONFIRMADA,
        origen: OrigenCita.SOLICITUD_PUBLICA,
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'usuario-1',
      });
    });
  });

  describe('buscarPorIds', () => {
    it('debería filtrar por IN (ids deduplicados) + tenant, sin bloqueo', async () => {
      // Arrange
      repoOrm.find.mockResolvedValue([fila('c1'), fila('c2')]);

      // Act
      const result = await repositorio.buscarPorIds(
        ['c1', 'c2', 'c1'],
        'tenant-1',
      );

      // Assert
      expect(repoOrm.find).toHaveBeenCalledWith({
        where: { id: In(['c1', 'c2']), tenantId: 'tenant-1' },
      });
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(result[0]).toBeInstanceOf(Cita);
    });

    it('debería devolver [] sin consultar cuando no hay ids (IN () no es SQL)', async () => {
      // Act
      const result = await repositorio.buscarPorIds([], 'tenant-1');

      // Assert
      expect(result).toEqual([]);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });

    it('debería usar el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { find: jest.fn().mockResolvedValue([]) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.buscarPorIds(['c1'], 'tenant-1', tx);

      // Assert
      expect(repoTx.find).toHaveBeenCalledTimes(1);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });
  });
});
