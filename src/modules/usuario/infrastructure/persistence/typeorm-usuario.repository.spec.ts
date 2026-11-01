import { EntityManager, Repository } from 'typeorm';

import { RolUsuario, Usuario } from '../../domain/usuario.entity';
import { CambioContrasena } from '../../domain/usuario.repository';
import { TypeOrmUsuarioRepository } from './typeorm-usuario.repository';
import { UsuarioOrmEntity } from './usuario.orm-entity';

/**
 * Adaptador TypeORM de usuarios SIN base de datos (US-10): el mapeo de
 * `especialidad` y `sesiones_validas_desde`, y el SQL de los métodos nuevos.
 *
 * Lo que NO cubre (`integration/sesiones-usuario.integration.spec.ts`, contra
 * Postgres): que dos cambios de contraseña a la vez escriban UNA sola vez, el
 * CHECK de la especialidad y que `actualizado_en` cambie de verdad.
 */
describe('TypeOrmUsuarioRepository', () => {
  const ID = '0a5e0000-0000-4000-8000-000000000001';
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const CREADO = new Date('2026-06-22T00:00:00.000Z');
  const CORTE = new Date('2026-10-31T15:04:05.000Z');

  type Query = jest.Mock<Promise<unknown>, [string, unknown[]?]>;

  let manager: { query: Query };
  let tx: { query: Query; getRepository: jest.Mock };
  let txRepo: { findOne: jest.Mock };
  let repoOrm: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { query: Query };
  };
  let repositorio: TypeOrmUsuarioRepository;

  const comoTx = () => tx as unknown as EntityManager;
  const normalizar = (texto: string): string =>
    texto.replace(/\s+/g, ' ').trim();
  /** SQL de la llamada `i` de `mock`, con los espacios colapsados. */
  const sql = (mock: Query, i = 0): string => normalizar(mock.mock.calls[i][0]);
  const parametros = (mock: Query, i = 0): unknown[] =>
    mock.mock.calls[i][1] as unknown[];

  const fila = (extra: Record<string, unknown> = {}) => ({
    id: ID,
    email: 'dra@clinica.cl',
    passwordHash: '$2b$10$hash',
    nombreCompleto: 'Dra. Ana',
    especialidad: 'Kinesiología',
    rol: RolUsuario.ADMINISTRADOR,
    tenantId: TENANT,
    sesionesValidasDesde: CORTE,
    creadoEn: CREADO,
    actualizadoEn: CREADO,
    ...extra,
  });

  beforeEach(() => {
    manager = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    txRepo = { findOne: jest.fn().mockResolvedValue(null) };
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue(txRepo),
    };
    repoOrm = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      manager,
    };
    repositorio = new TypeOrmUsuarioRepository(
      repoOrm as unknown as Repository<UsuarioOrmEntity>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('mapeo de los campos de US-10', () => {
    it('findByEmailAndTenant debería traer especialidad y sesionesValidasDesde', async () => {
      // Arrange
      repoOrm.findOne.mockResolvedValue(fila());

      // Act
      const usuario = await repositorio.findByEmailAndTenant(
        'dra@clinica.cl',
        TENANT,
      );

      // Assert
      expect(usuario).toBeInstanceOf(Usuario);
      expect(usuario?.especialidad).toBe('Kinesiología');
      expect(usuario?.sesionesValidasDesde).toEqual(CORTE);
      expect(usuario?.passwordHash).toBe('$2b$10$hash');
    });

    it('guardar debería devolver especialidad y corte en null cuando save() no los devuelve (registro)', async () => {
      // Arrange — save() de un parcial devuelve solo lo que recibió + generados
      const { especialidad, sesionesValidasDesde, ...sinCampos } = fila();
      void especialidad;
      void sesionesValidasDesde;
      repoOrm.save.mockResolvedValue(sinCampos);

      // Act
      const usuario = await repositorio.guardar({
        email: 'dra@clinica.cl',
        nombreCompleto: 'Dra. Ana',
      });

      // Assert
      expect(usuario.especialidad).toBeNull();
      expect(usuario.sesionesValidasDesde).toBeNull();
    });

    it('guardar debería persistir la especialidad pero NUNCA el corte de sesiones', async () => {
      // Arrange
      repoOrm.save.mockResolvedValue(fila());
      const parcial: Partial<Usuario> = {
        email: 'dra@clinica.cl',
        especialidad: 'Kinesiología',
        sesionesValidasDesde: CORTE,
      };

      // Act
      await repositorio.guardar(parcial);

      // Assert — solo cambiarContrasena escribe el corte (ADR-15 §5)
      const [[guardado]] = repoOrm.save.mock.calls as [
        [Record<string, unknown>],
      ];
      expect(guardado.especialidad).toBe('Kinesiología');
      expect(guardado).not.toHaveProperty('sesionesValidasDesde');
    });
  });

  describe('findById', () => {
    it('debería buscar por id Y tenant', async () => {
      // Arrange
      repoOrm.findOne.mockResolvedValue(fila());

      // Act
      const usuario = await repositorio.findById(ID, TENANT);

      // Assert
      expect(repoOrm.findOne).toHaveBeenCalledWith({
        where: { id: ID, tenantId: TENANT },
      });
      expect(usuario?.id).toBe(ID);
      expect(usuario?.especialidad).toBe('Kinesiología');
    });

    it('debería usar el repositorio de la transacción cuando la recibe', async () => {
      // Act
      await repositorio.findById(ID, TENANT, comoTx());

      // Assert
      expect(tx.getRepository).toHaveBeenCalledWith(UsuarioOrmEntity);
      expect(txRepo.findOne).toHaveBeenCalledTimes(1);
      expect(repoOrm.findOne).not.toHaveBeenCalled();
    });

    it('debería devolver null cuando no existe', async () => {
      expect(await repositorio.findById(ID, TENANT)).toBeNull();
    });

    it.each([
      ['un id que no es UUID', 'usuario-1', TENANT],
      ['un tenant que no es UUID', ID, 'tenant-1'],
    ])(
      'debería devolver null sin consultar con %s',
      async (_caso, id, tenantId) => {
        expect(await repositorio.findById(id, tenantId)).toBeNull();
        expect(repoOrm.findOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('actualizarPerfil', () => {
    it('debería actualizar SOLO lo presente, con actualizado_en, filtrando por id y tenant', async () => {
      // Arrange — UPDATE … RETURNING: TypeORM devuelve [filas, cantidad]
      manager.query.mockResolvedValue([[fila({ nombreCompleto: 'Ana' })], 1]);

      // Act
      const usuario = await repositorio.actualizarPerfil(ID, TENANT, {
        nombreCompleto: 'Ana',
      });

      // Assert
      expect(sql(manager.query)).toMatch(
        /^UPDATE "usuarios" SET "nombre_completo" = \$3, "actualizado_en" = now\(\) WHERE "id" = \$1 AND "tenant_id" = \$2 RETURNING /,
      );
      expect(sql(manager.query)).not.toMatch(/"especialidad" =/);
      expect(parametros(manager.query)).toEqual([ID, TENANT, 'Ana']);
      expect(usuario?.nombreCompleto).toBe('Ana');
      expect(usuario?.especialidad).toBe('Kinesiología');
    });

    it('debería escribir los dos campos y borrar la especialidad con null', async () => {
      // Arrange
      manager.query.mockResolvedValue([[fila({ especialidad: null })], 1]);

      // Act
      const usuario = await repositorio.actualizarPerfil(ID, TENANT, {
        nombreCompleto: 'Dra. Ana',
        especialidad: null,
      });

      // Assert
      expect(sql(manager.query)).toContain(
        'SET "nombre_completo" = $3, "especialidad" = $4, "actualizado_en" = now()',
      );
      expect(parametros(manager.query)).toEqual([ID, TENANT, 'Dra. Ana', null]);
      expect(usuario?.especialidad).toBeNull();
    });

    it('debería devolver la fila completa (con el corte) leída del RETURNING', async () => {
      // Arrange
      manager.query.mockResolvedValue([[fila()], 1]);

      // Act
      await repositorio.actualizarPerfil(ID, TENANT, { especialidad: 'X' });

      // Assert
      const consulta = sql(manager.query);
      for (const columna of [
        '"password_hash" AS "passwordHash"',
        '"nombre_completo" AS "nombreCompleto"',
        '"especialidad"',
        '"tenant_id" AS "tenantId"',
        '"sesiones_validas_desde" AS "sesionesValidasDesde"',
        '"creado_en" AS "creadoEn"',
        '"actualizado_en" AS "actualizadoEn"',
      ]) {
        expect(consulta).toContain(columna);
      }
    });

    it('debería devolver null cuando el usuario no existe en esa organización', async () => {
      // Arrange
      manager.query.mockResolvedValue([[], 0]);

      // Act + Assert
      expect(
        await repositorio.actualizarPerfil(ID, TENANT, { nombreCompleto: 'A' }),
      ).toBeNull();
    });

    it('sin ningún campo presente NO debería escribir: devuelve el usuario tal como está', async () => {
      // Arrange
      repoOrm.findOne.mockResolvedValue(fila());

      // Act
      const usuario = await repositorio.actualizarPerfil(ID, TENANT, {});

      // Assert
      expect(manager.query).not.toHaveBeenCalled();
      expect(repoOrm.findOne).toHaveBeenCalledWith({
        where: { id: ID, tenantId: TENANT },
      });
      expect(usuario?.id).toBe(ID);
    });

    it('debería escribir en la transacción cuando la recibe', async () => {
      // Arrange
      tx.query.mockResolvedValue([[fila()], 1]);

      // Act
      await repositorio.actualizarPerfil(
        ID,
        TENANT,
        { nombreCompleto: 'A' },
        comoTx(),
      );

      // Assert
      expect(tx.query).toHaveBeenCalledTimes(1);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('debería devolver null sin consultar con un id que no es UUID', async () => {
      expect(
        await repositorio.actualizarPerfil('x', TENANT, {
          nombreCompleto: 'A',
        }),
      ).toBeNull();
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  describe('cambiarContrasena', () => {
    const cambio: CambioContrasena = {
      hashAnterior: '$2b$10$viejo',
      hashNuevo: '$2b$10$nuevo',
      sesionesValidasDesde: CORTE,
    };

    it('debería hacer un UPDATE CONDICIONAL al hash anterior, con el corte y actualizado_en', async () => {
      // Arrange
      manager.query.mockResolvedValue([[{ id: ID }], 1]);

      // Act
      const escribio = await repositorio.cambiarContrasena(ID, TENANT, cambio);

      // Assert — el SQL del plan (US-10 § Dominio)
      expect(sql(manager.query)).toBe(
        'UPDATE "usuarios" SET "password_hash" = $3, "sesiones_validas_desde" = $5, "actualizado_en" = now() WHERE "id" = $1 AND "tenant_id" = $2 AND "password_hash" = $4 RETURNING "id"',
      );
      expect(parametros(manager.query)).toEqual([
        ID,
        TENANT,
        '$2b$10$nuevo',
        '$2b$10$viejo',
        CORTE,
      ]);
      expect(escribio).toBe(true);
    });

    it('debería devolver false cuando no escribió (otro cambio ganó, o no existe)', async () => {
      // Arrange
      manager.query.mockResolvedValue([[], 0]);

      // Act + Assert
      expect(await repositorio.cambiarContrasena(ID, TENANT, cambio)).toBe(
        false,
      );
    });

    it('debería escribir en la transacción cuando la recibe', async () => {
      // Arrange
      tx.query.mockResolvedValue([[{ id: ID }], 1]);

      // Act
      const escribio = await repositorio.cambiarContrasena(
        ID,
        TENANT,
        cambio,
        comoTx(),
      );

      // Assert
      expect(escribio).toBe(true);
      expect(tx.query).toHaveBeenCalledTimes(1);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('debería devolver false sin consultar con un tenant que no es UUID', async () => {
      expect(await repositorio.cambiarContrasena(ID, 'otro', cambio)).toBe(
        false,
      );
      expect(manager.query).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<CambioContrasena>, RegExp]>([
      ['un hash nuevo vacío', { hashNuevo: '' }, /hashNuevo vacío/],
      [
        'un corte inválido',
        { sesionesValidasDesde: new Date(Number.NaN) },
        /sesionesValidasDesde inválida/,
      ],
    ])('debería rechazar %s sin consultar', async (_caso, extra, error) => {
      await expect(
        repositorio.cambiarContrasena(ID, TENANT, { ...cambio, ...extra }),
      ).rejects.toThrow(error);
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  describe('estadoSesion', () => {
    it('debería leer SOLO la columna del corte, por id y tenant', async () => {
      // Arrange
      manager.query.mockResolvedValue([{ sesionesValidasDesde: CORTE }]);

      // Act
      const estado = await repositorio.estadoSesion(ID, TENANT);

      // Assert
      expect(sql(manager.query)).toBe(
        'SELECT "sesiones_validas_desde" AS "sesionesValidasDesde" FROM "usuarios" WHERE "id" = $1 AND "tenant_id" = $2',
      );
      expect(parametros(manager.query)).toEqual([ID, TENANT]);
      expect(estado).toEqual({ sesionesValidasDesde: CORTE });
    });

    it('debería devolver el corte en null cuando el usuario no tiene corte', async () => {
      // Arrange
      manager.query.mockResolvedValue([{ sesionesValidasDesde: null }]);

      // Act + Assert
      expect(await repositorio.estadoSesion(ID, TENANT)).toEqual({
        sesionesValidasDesde: null,
      });
    });

    it('debería devolver null cuando el usuario no existe en esa organización', async () => {
      expect(await repositorio.estadoSesion(ID, TENANT)).toBeNull();
    });

    it('debería devolver null sin consultar con un sub que no es UUID', async () => {
      expect(await repositorio.estadoSesion('usuario-1', TENANT)).toBeNull();
      expect(manager.query).not.toHaveBeenCalled();
    });
  });
});
