import { EntityManager, In, Repository } from 'typeorm';

import { Paciente } from '../../domain/paciente.entity';
import { PacienteOrmEntity } from './paciente.orm-entity';
import { TypeOrmPacienteRepository } from './typeorm-paciente.repository';

/**
 * Adaptador TypeORM de pacientes SIN base de datos: solo `buscarPorIds`
 * (nuevo en el cierre de Fase 1, resuelve nombres sin N+1).
 */
describe('TypeOrmPacienteRepository', () => {
  let repoOrm: { find: jest.Mock };
  let repositorio: TypeOrmPacienteRepository;

  beforeEach(() => {
    repoOrm = { find: jest.fn().mockResolvedValue([]) };
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
});
