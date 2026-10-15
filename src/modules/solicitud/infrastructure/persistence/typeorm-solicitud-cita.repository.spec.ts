import {
  EntityManager,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  EstadoSolicitud,
  SolicitudCita,
  TipoSolicitud,
} from '../../domain/solicitud-cita.entity';
import { ReagendamientoYaSolicitadoError } from '../../domain/reagendamiento-ya-solicitado.error';
import { SolicitudCitaOrmEntity } from './solicitud-cita.orm-entity';
import {
  INDICE_REAGENDAMIENTO_RECIBIDA,
  TypeOrmSolicitudCitaRepository,
} from './typeorm-solicitud-cita.repository';

/**
 * Adaptador TypeORM de solicitudes SIN base de datos.
 *
 * `repo.save` se sustituye por un doble que reproduce la semántica de TypeORM
 * 1.x con Postgres:
 *  - INSERT: devuelve el objeto recibido + las columnas generadas (id,
 *    @CreateDateColumn `recibidaEn`, defaults) que vuelven por RETURNING.
 *  - UPDATE: devuelve el MISMO objeto recibido, mezclando solo las columnas
 *    `isUpdateDate` / `isVersion` / generadas por expresión
 *    (`ReturningResultsEntityUpdator.getUpdationReturningColumns`). Esta
 *    entidad no tiene ninguna, así que NO se relee `recibidaEn`.
 *
 * Lo que no cubre (pendiente contra Postgres): el SQL real, el FOR UPDATE y el
 * orden NULLS LAST.
 */
describe('TypeOrmSolicitudCitaRepository', () => {
  const ID = '5f0c0000-0000-4000-8000-000000000001';
  const RECIBIDA_EN = new Date('2026-09-17T14:02:11.000Z');

  let repoOrm: {
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let repositorio: TypeOrmSolicitudCitaRepository;

  const filaOrm = (
    extra: Partial<SolicitudCitaOrmEntity> = {},
  ): SolicitudCitaOrmEntity =>
    Object.assign(new SolicitudCitaOrmEntity(), {
      id: ID,
      tenantId: 'tenant-1',
      usuarioId: null,
      rut: '111111111',
      nombrePaciente: 'Paciente Público',
      telefono: '+56 9 5555 5555',
      correo: 'publico@mail.com',
      motivo: 'Dolor de muela',
      preferenciaHoraria: 'mañanas',
      consentimiento: true,
      estado: EstadoSolicitud.RECIBIDA,
      citaId: null,
      recibidaEn: RECIBIDA_EN,
      resueltaEn: null,
      tipo: TipoSolicitud.NUEVA,
      citaOrigenId: null,
      enlaceId: null,
      ...extra,
    });

  const CITA_ORIGEN = '0c1a0000-0000-4000-8000-000000000001';
  const ENLACE = 'e1000000-0000-4000-8000-000000000001';

  // Fila de una solicitud de reagendamiento: paciente sin RUT ni correo.
  const reagendamientoOrm = (): SolicitudCitaOrmEntity =>
    filaOrm({
      usuarioId: 'usuario-1',
      rut: null,
      correo: null,
      motivo: '',
      tipo: TipoSolicitud.REAGENDAMIENTO,
      citaOrigenId: CITA_ORIGEN,
      enlaceId: ENLACE,
    });

  // Semántica de `save` de TypeORM descrita arriba.
  const saveComoTypeOrm = (entidad: Partial<SolicitudCitaOrmEntity>) => {
    if (entidad.id === undefined) {
      // INSERT: RETURNING id, recibida_en (CreateDate) y defaults.
      return Promise.resolve(
        Object.assign(entidad, { id: ID, recibidaEn: RECIBIDA_EN }),
      );
    }
    // UPDATE: el mismo objeto; no hay UpdateDate/Version que releer.
    return Promise.resolve(entidad);
  };

  beforeEach(() => {
    repoOrm = {
      save: jest.fn(saveComoTypeOrm),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    repositorio = new TypeOrmSolicitudCitaRepository(
      repoOrm as unknown as Repository<SolicitudCitaOrmEntity>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Solicitud cargada de BD y aceptada: lo que la bandeja pasa a `guardar`.
  const aceptadaDesdeBd = (): SolicitudCita => {
    const solicitud = SolicitudCita.reconstituir({
      ...filaOrm(),
      estado: EstadoSolicitud.RECIBIDA,
    });
    solicitud.aceptar(
      'usuario-1',
      'cita-1',
      new Date('2026-09-25T15:40:00.000Z'),
    );
    return solicitud;
  };

  describe('guardar', () => {
    it('debería devolver recibidaEn generado por la BD en un INSERT', async () => {
      // Arrange
      const nueva = SolicitudCita.recibir({
        tenantId: 'tenant-1',
        rut: '111111111',
        nombrePaciente: 'Paciente Público',
        telefono: '+56 9 5555 5555',
        correo: 'publico@mail.com',
        motivo: 'Dolor de muela',
        preferenciaHoraria: 'mañanas',
        consentimiento: true,
      });

      // Act
      const guardada = await repositorio.guardar(nueva);

      // Assert
      expect(guardada.id).toBe(ID);
      expect(guardada.recibidaEn).toEqual(RECIBIDA_EN);
    });

    it('debería escribir en el UPDATE estado, usuarioId, citaId y resueltaEn', async () => {
      // Act
      await repositorio.guardar(aceptadaDesdeBd());

      // Assert
      expect(repoOrm.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ID,
          estado: EstadoSolicitud.ACEPTADA,
          usuarioId: 'usuario-1',
          citaId: 'cita-1',
          resueltaEn: new Date('2026-09-25T15:40:00.000Z'),
        }),
      );
    });

    it('causa raíz: toPersistence NO incluye recibidaEn en lo que se pasa a save', async () => {
      // Act
      await repositorio.guardar(aceptadaDesdeBd());

      // Assert — documenta el mecanismo de la sospecha (hoy es así)
      const [enviado] = repoOrm.save.mock.calls[0] as [
        Partial<SolicitudCitaOrmEntity>,
      ];
      expect(enviado).not.toHaveProperty('recibidaEn');
    });

    // Regresión: `toPersistence` no incluye `recibidaEn` y TypeORM no relee
    // @CreateDateColumn en un UPDATE; `guardar` conserva la del dominio.
    it('debería devolver un dominio con recibidaEn en un UPDATE (contrato del puerto)', async () => {
      // Act
      const guardada = await repositorio.guardar(aceptadaDesdeBd());

      // Assert
      expect(guardada.recibidaEn).toEqual(RECIBIDA_EN);
    });

    it('debería usar el repositorio del EntityManager cuando recibe tx', async () => {
      // Arrange
      const repoTx = { save: jest.fn(saveComoTypeOrm) };
      const tx = {
        getRepository: jest.fn(() => repoTx),
      } as unknown as EntityManager;

      // Act
      await repositorio.guardar(aceptadaDesdeBd(), tx);

      // Assert
      expect(repoTx.save).toHaveBeenCalledTimes(1);
      expect(repoOrm.save).not.toHaveBeenCalled();
    });

    // Error de Postgres tal como lo envuelve TypeORM (`QueryFailedError`
    // copia `code` y `constraint` del error del driver).
    const errorPostgres = (code: string, constraint: string): Error =>
      new QueryFailedError(
        'INSERT INTO "solicitudes_cita" ...',
        [],
        Object.assign(new Error('duplicate key value'), { code, constraint }),
      );

    it('debería traducir el 23505 de uq_solicitud_reagendamiento_recibida a ReagendamientoYaSolicitadoError (R5)', async () => {
      // Arrange
      repoOrm.save.mockRejectedValue(
        errorPostgres('23505', INDICE_REAGENDAMIENTO_RECIBIDA),
      );

      // Act & Assert
      await expect(
        repositorio.guardar(
          SolicitudCita.reconstituir({
            ...reagendamientoOrm(),
            id: undefined as unknown as string,
          }),
        ),
      ).rejects.toBeInstanceOf(ReagendamientoYaSolicitadoError);
    });

    it.each([
      ['otra restricción única', '23505', 'solicitudes_cita_pkey'],
      ['otro código', '23514', INDICE_REAGENDAMIENTO_RECIBIDA],
    ])(
      'debería propagar tal cual cualquier otro error de la base (%s)',
      async (_caso, code, constraint) => {
        // Arrange
        const error = errorPostgres(code, constraint);
        repoOrm.save.mockRejectedValue(error);

        // Act & Assert
        await expect(repositorio.guardar(aceptadaDesdeBd())).rejects.toBe(
          error,
        );
      },
    );

    it('debería propagar tal cual un error que no es de la base', async () => {
      // Arrange
      const error = Object.assign(new Error('x'), {
        code: '23505',
        constraint: INDICE_REAGENDAMIENTO_RECIBIDA,
      });
      repoOrm.save.mockRejectedValue(error);

      // Act & Assert
      await expect(repositorio.guardar(aceptadaDesdeBd())).rejects.toBe(error);
    });
  });

  describe('buscarPorIdParaActualizar', () => {
    it('debería lanzar si no recibe una transacción', async () => {
      // Act & Assert
      await expect(
        repositorio.buscarPorIdParaActualizar(ID, 'tenant-1', undefined),
      ).rejects.toThrow(/requiere una transacción/);
    });

    it('debería filtrar por id + tenant con bloqueo pessimistic_write dentro del tx', async () => {
      // Arrange
      const repoTx = { findOne: jest.fn().mockResolvedValue(filaOrm()) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      const result = await repositorio.buscarPorIdParaActualizar(
        ID,
        'tenant-1',
        tx,
      );

      // Assert
      expect(repoTx.findOne).toHaveBeenCalledWith({
        where: { id: ID, tenantId: 'tenant-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result).toBeInstanceOf(SolicitudCita);
      expect(result?.recibidaEn).toEqual(RECIBIDA_EN);
    });

    it('debería devolver null cuando no la encuentra (inexistente u otro tenant)', async () => {
      // Arrange
      const repoTx = { findOne: jest.fn().mockResolvedValue(null) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act & Assert
      expect(
        await repositorio.buscarPorIdParaActualizar(ID, 'otro-tenant', tx),
      ).toBeNull();
    });
  });

  describe('listarPorEstado', () => {
    it('debería ordenar las recibidas por recibidaEn ASC con tope', async () => {
      // Act
      await repositorio.listarPorEstado(
        'tenant-1',
        EstadoSolicitud.RECIBIDA,
        100,
      );

      // Assert
      expect(repoOrm.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', estado: EstadoSolicitud.RECIBIDA },
        order: { recibidaEn: 'ASC', id: 'ASC' },
        take: 100,
      });
    });

    it.each([EstadoSolicitud.ACEPTADA, EstadoSolicitud.RECHAZADA])(
      'debería ordenar %s por resueltaEn DESC NULLS LAST',
      async (estado) => {
        // Act
        await repositorio.listarPorEstado('tenant-1', estado, 100);

        // Assert
        expect(repoOrm.find).toHaveBeenCalledWith({
          where: { tenantId: 'tenant-1', estado },
          order: {
            resueltaEn: { direction: 'DESC', nulls: 'LAST' },
            id: 'ASC',
          },
          take: 100,
        });
      },
    );

    it('debería reconstituir las filas a dominio', async () => {
      // Arrange
      repoOrm.find.mockResolvedValue([
        filaOrm({
          estado: EstadoSolicitud.RECHAZADA,
          usuarioId: 'usuario-1',
          resueltaEn: new Date('2026-09-20T10:00:00Z'),
        }),
      ]);

      // Act
      const [s] = await repositorio.listarPorEstado(
        'tenant-1',
        EstadoSolicitud.RECHAZADA,
        100,
      );

      // Assert
      expect(s).toBeInstanceOf(SolicitudCita);
      expect(s.estado).toBe(EstadoSolicitud.RECHAZADA);
      expect(s.resueltaEn).toEqual(new Date('2026-09-20T10:00:00Z'));
    });

    it('debería ordenar las descartadas por resueltaEn DESC NULLS LAST', async () => {
      // Act
      await repositorio.listarPorEstado(
        'tenant-1',
        EstadoSolicitud.DESCARTADA,
        100,
      );

      // Assert
      expect(repoOrm.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: {
            resueltaEn: { direction: 'DESC', nulls: 'LAST' },
            id: 'ASC',
          },
        }),
      );
    });

    it('debería filtrar además por citaOrigenId cuando se pide', async () => {
      // Act
      await repositorio.listarPorEstado(
        'tenant-1',
        EstadoSolicitud.RECIBIDA,
        100,
        { citaOrigenId: CITA_ORIGEN },
      );

      // Assert
      expect(repoOrm.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          estado: EstadoSolicitud.RECIBIDA,
          citaOrigenId: CITA_ORIGEN,
        },
        order: { recibidaEn: 'ASC', id: 'ASC' },
        take: 100,
      });
    });

    it('debería usar el repositorio del EntityManager cuando recibe tx (5º argumento)', async () => {
      // Arrange
      const repoTx = { find: jest.fn().mockResolvedValue([]) };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      await repositorio.listarPorEstado(
        'tenant-1',
        EstadoSolicitud.RECIBIDA,
        100,
        undefined,
        tx,
      );

      // Assert
      expect(repoTx.find).toHaveBeenCalledTimes(1);
      expect(repoOrm.find).not.toHaveBeenCalled();
    });
  });

  describe('buscarAbiertaPorRut', () => {
    it('debería contar solo solicitudes NUEVAS recibidas dentro de la ventana (R5)', async () => {
      // Arrange
      const desde = new Date('2026-09-14T00:00:00.000Z');

      // Act
      await repositorio.buscarAbiertaPorRut('111111111', 'tenant-1', desde);

      // Assert
      expect(repoOrm.findOne).toHaveBeenCalledWith({
        where: {
          rut: '111111111',
          tenantId: 'tenant-1',
          tipo: TipoSolicitud.NUEVA,
          estado: EstadoSolicitud.RECIBIDA,
          recibidaEn: MoreThanOrEqual(desde),
        },
      });
    });
  });

  describe('buscarReagendamientoAbierto', () => {
    const DONDE = {
      citaOrigenId: CITA_ORIGEN,
      tenantId: 'tenant-1',
      tipo: TipoSolicitud.REAGENDAMIENTO,
      estado: EstadoSolicitud.RECIBIDA,
    };

    it('debería buscar la de reagendamiento RECIBIDA de esa cita, sin bloqueo', async () => {
      // Arrange
      repoOrm.findOne.mockResolvedValue(reagendamientoOrm());

      // Act
      const result = await repositorio.buscarReagendamientoAbierto(
        CITA_ORIGEN,
        'tenant-1',
      );

      // Assert
      expect(repoOrm.findOne).toHaveBeenCalledWith({ where: DONDE });
      expect(result?.esReagendamiento()).toBe(true);
      expect(result?.citaOrigenId).toBe(CITA_ORIGEN);
      expect(result?.enlaceId).toBe(ENLACE);
      expect(result?.rut).toBeNull();
    });

    it('debería devolver null si no hay ninguna abierta', async () => {
      expect(
        await repositorio.buscarReagendamientoAbierto(CITA_ORIGEN, 'tenant-1'),
      ).toBeNull();
    });

    it('ParaActualizar debería lanzar sin transacción', async () => {
      await expect(
        repositorio.buscarReagendamientoAbiertoParaActualizar(
          CITA_ORIGEN,
          'tenant-1',
          undefined,
        ),
      ).rejects.toThrow(/requiere una transacción/);
    });

    it('ParaActualizar debería bloquear la fila (pessimistic_write) dentro del tx', async () => {
      // Arrange
      const repoTx = {
        findOne: jest.fn().mockResolvedValue(reagendamientoOrm()),
      };
      const tx = { getRepository: () => repoTx } as unknown as EntityManager;

      // Act
      const result =
        await repositorio.buscarReagendamientoAbiertoParaActualizar(
          CITA_ORIGEN,
          'tenant-1',
          tx,
        );

      // Assert
      expect(repoTx.findOne).toHaveBeenCalledWith({
        where: DONDE,
        lock: { mode: 'pessimistic_write' },
      });
      expect(result).toBeInstanceOf(SolicitudCita);
    });
  });

  describe('reagendamiento: ida y vuelta', () => {
    it('debería escribir tipo, citaOrigenId, enlaceId y los nulos de RUT/correo', async () => {
      // Arrange
      const solicitud = SolicitudCita.pedirOtraHora({
        tenantId: 'tenant-1',
        citaOrigenId: CITA_ORIGEN,
        enlaceId: ENLACE,
        usuarioId: 'usuario-1',
        rut: null,
        nombrePaciente: 'Paciente Público',
        telefono: '+56 9 5555 5555',
        correo: null,
        consentimiento: true,
        preferenciaHoraria: 'tardes',
      });

      // Act
      const guardada = await repositorio.guardar(solicitud);

      // Assert
      expect(repoOrm.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: TipoSolicitud.REAGENDAMIENTO,
          citaOrigenId: CITA_ORIGEN,
          enlaceId: ENLACE,
          usuarioId: 'usuario-1',
          rut: null,
          correo: null,
          motivo: '',
        }),
      );
      expect(guardada.esReagendamiento()).toBe(true);
      expect(guardada.citaOrigenId).toBe(CITA_ORIGEN);
    });

    it('debería escribir tipo nueva y nulos de origen en una solicitud del formulario', async () => {
      // Act
      await repositorio.guardar(aceptadaDesdeBd());

      // Assert
      expect(repoOrm.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: TipoSolicitud.NUEVA,
          citaOrigenId: null,
          enlaceId: null,
        }),
      );
    });

    it('debería descartar y persistir estado descartada con resueltaEn', async () => {
      // Arrange
      const solicitud = SolicitudCita.reconstituir({
        ...reagendamientoOrm(),
        id: ID,
      });
      const ahora = new Date('2026-10-15T09:00:00.000Z');
      solicitud.descartar(ahora);

      // Act
      await repositorio.guardar(solicitud);

      // Assert
      expect(repoOrm.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ID,
          estado: EstadoSolicitud.DESCARTADA,
          resueltaEn: ahora,
        }),
      );
    });
  });
});
