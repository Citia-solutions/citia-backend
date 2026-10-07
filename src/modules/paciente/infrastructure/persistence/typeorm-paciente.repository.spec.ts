import { EntityManager, In, Repository } from 'typeorm';

import { Paciente } from '../../domain/paciente.entity';
import { PacienteOrmEntity } from './paciente.orm-entity';
import { TypeOrmPacienteRepository } from './typeorm-paciente.repository';

/**
 * Adaptador TypeORM de pacientes SIN base de datos: `buscarPorIds` (cierre de
 * Fase 1, resuelve nombres sin N+1) y la forma de las escrituras de contacto
 * (ADR-13 §14). El SQL real de estas últimas lo prueba
 * `test/pacientes.e2e-spec.ts` contra PostgreSQL.
 */
describe('TypeOrmPacienteRepository', () => {
  let repoOrm: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };
  let repositorio: TypeOrmPacienteRepository;

  beforeEach(() => {
    qb = {
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    qb.update.mockReturnValue(qb);
    qb.set.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    repoOrm = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    repositorio = new TypeOrmPacienteRepository(
      repoOrm as unknown as Repository<PacienteOrmEntity>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buscarPorIds', () => {
    it('debería devolver [] sin consultar cuando no hay ids (IN () no es SQL)', async () => {
      // Act
      const result = await repositorio.buscarPorIds([], 'tenant-1');

      // Assert
      expect(result).toEqual([]);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });

    it('debería consultar UNA vez con IN (ids) filtrando por tenant', async () => {
      // Act
      await repositorio.buscarPorIds(['p1', 'p2'], 'tenant-1');

      // Assert
      expect(repoOrm.find).toHaveBeenCalledTimes(1);
      expect(repoOrm.find).toHaveBeenCalledWith({
        where: { id: In(['p1', 'p2']), tenantId: 'tenant-1' },
      });
    });

    it('debería mapear las filas a Paciente de dominio', async () => {
      // Arrange
      repoOrm.find.mockResolvedValue([
        Object.assign(new PacienteOrmEntity(), {
          id: 'p1',
          rut: '123456785',
          nombre: 'Ana',
          telefono: '+56 9 1111 1111',
          correo: null,
          consentimiento: true,
          tenantId: 'tenant-1',
        }),
      ]);

      // Act
      const [p] = await repositorio.buscarPorIds(['p1'], 'tenant-1');

      // Assert
      expect(p).toBeInstanceOf(Paciente);
      expect(p).toMatchObject({
        id: 'p1',
        nombre: 'Ana',
        tenantId: 'tenant-1',
      });
    });

    it('debería usar el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { find: jest.fn().mockResolvedValue([]) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.buscarPorIds(['p1'], 'tenant-1', tx);

      // Assert
      expect(repoTx.find).toHaveBeenCalledTimes(1);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });
  });

  describe('actualizarContacto', () => {
    it('debería escribir SOLO los campos presentes, con id y tenant en el WHERE', async () => {
      // Act
      const result = await repositorio.actualizarContacto('p1', 'tenant-1', {
        correo: 'nuevo@mail.com',
      });

      // Assert
      expect(result).toBe(true);
      expect(repoOrm.update).toHaveBeenCalledWith(
        { id: 'p1', tenantId: 'tenant-1' },
        { correo: 'nuevo@mail.com' },
      );
    });

    it('debería devolver false cuando el UPDATE no toca filas (otro tenant o inexistente)', async () => {
      // Arrange
      repoOrm.update.mockResolvedValue({ affected: 0 });

      // Act & Assert
      expect(
        await repositorio.actualizarContacto('p1', 'tenant-ajeno', {
          telefono: '+56 9 2',
        }),
      ).toBe(false);
    });

    it('NO debería emitir un UPDATE sin SET: con cambio vacío solo comprueba la fila', async () => {
      // Act
      const result = await repositorio.actualizarContacto('p1', 'tenant-1', {});

      // Assert
      expect(result).toBe(false);
      expect(repoOrm.update).not.toHaveBeenCalled();
      expect(repoOrm.findOne).toHaveBeenCalledWith({
        where: { id: 'p1', tenantId: 'tenant-1' },
      });
    });
  });

  describe('completarCorreoSiVacio', () => {
    it('debería poner la condición de correo vacío en el propio UPDATE', async () => {
      // Act
      const result = await repositorio.completarCorreoSiVacio(
        'p1',
        'tenant-1',
        'ana@mail.com',
      );

      // Assert
      expect(result).toBe(true);
      expect(qb.update).toHaveBeenCalledWith(PacienteOrmEntity);
      expect(qb.set).toHaveBeenCalledWith({ correo: 'ana@mail.com' });
      expect(qb.where).toHaveBeenCalledWith('id = :id', { id: 'p1' });
      expect(qb.andWhere).toHaveBeenCalledWith('tenant_id = :tenantId', {
        tenantId: 'tenant-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "(correo IS NULL OR btrim(correo) = '')",
      );
    });

    it('debería devolver false cuando el correo ya estaba (0 filas)', async () => {
      // Arrange
      qb.execute.mockResolvedValue({ affected: 0 });

      // Act & Assert
      expect(
        await repositorio.completarCorreoSiVacio('p1', 'tenant-1', 'a@b.cl'),
      ).toBe(false);
    });

    it('debería usar el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.completarCorreoSiVacio('p1', 'tenant-1', 'a@b.cl', tx);

      // Assert
      expect(repoTx.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(repoOrm.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
