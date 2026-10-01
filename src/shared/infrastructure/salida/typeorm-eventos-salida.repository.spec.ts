import { EntityManager, LessThan, LessThanOrEqual } from 'typeorm';

import { EstadoEventoSalida } from '../../application/eventos-salida.repository';
import {
  POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
  PoliticaReintentoSalida,
} from '../../application/politica-reintento-salida';
import { EventoSalidaOrmEntity } from './evento-salida.orm-entity';
import {
  CLAVE_CANDADO_PURGA_SALIDA,
  LARGO_MAXIMO_ULTIMO_ERROR,
  TypeOrmEventosSalidaRepository,
  truncarError,
} from './typeorm-eventos-salida.repository';

/**
 * Adaptador TypeORM del outbox SIN base de datos: el `EntityManager` del `tx`
 * se sustituye por un doble y se verifica lo que se le pide.
 *
 * Lo que NO cubre (testing-agent, integración contra Postgres): el SQL real,
 * que `SKIP LOCKED` reparta filas entre dos despachadores, el índice parcial,
 * el CHECK y el candado consultivo entre dos procesos.
 */
describe('TypeOrmEventosSalidaRepository', () => {
  const ID = '0e5a0000-0000-4000-8000-000000000001';
  const AHORA = new Date('2026-10-01T12:00:00.000Z');
  const OCURRIDO_EN = new Date('2026-10-01T11:59:58.000Z');
  const SIN_VARIACION: PoliticaReintentoSalida = {
    ...POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
    variacion: 0,
  };

  let repoTx: {
    insert: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let tx: { getRepository: jest.Mock; query: jest.Mock };
  let repositorio: TypeOrmEventosSalidaRepository;

  const fila = (
    extra: Partial<EventoSalidaOrmEntity> = {},
  ): EventoSalidaOrmEntity =>
    Object.assign(new EventoSalidaOrmEntity(), {
      id: ID,
      nombre: 'CitaCreada',
      tenantId: 'tenant-1',
      payload: { citaId: 'cita-1' },
      ocurridoEn: OCURRIDO_EN,
      estado: EstadoEventoSalida.PENDIENTE,
      intentos: 0,
      proximoIntentoEn: OCURRIDO_EN,
      ultimoError: null,
      entregadoEn: null,
      creadoEn: OCURRIDO_EN,
      ...extra,
    });

  const comoTx = () => tx as unknown as EntityManager;

  beforeEach(() => {
    repoTx = {
      insert: jest.fn().mockResolvedValue({ identifiers: [] }),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    tx = {
      getRepository: jest.fn(() => repoTx),
      query: jest.fn().mockResolvedValue([{ obtenido: true }]),
    };
    repositorio = new TypeOrmEventosSalidaRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sin transacción', () => {
    it.each<[string, () => Promise<unknown>]>([
      [
        'insertar',
        () =>
          repositorio.insertar(
            {
              nombre: 'CitaCreada',
              tenantId: 'tenant-1',
              ocurridoEn: OCURRIDO_EN,
              payload: {},
            },
            undefined,
          ),
      ],
      [
        'reclamarProximoPendiente',
        () => repositorio.reclamarProximoPendiente(AHORA, undefined),
      ],
      [
        'marcarEntregado',
        () => repositorio.marcarEntregado(ID, AHORA, undefined),
      ],
      [
        'registrarFallo',
        () =>
          repositorio.registrarFallo(
            ID,
            'error',
            AHORA,
            SIN_VARIACION,
            undefined,
          ),
      ],
      [
        'purgarEntregadosAntiguos',
        () => repositorio.purgarEntregadosAntiguos(AHORA, 14, undefined),
      ],
    ])(
      '%s debería lanzar en lugar de usar una conexión suelta',
      async (op, fn) => {
        // Act & Assert
        await expect(fn()).rejects.toThrow(
          new RegExp(`${op} requiere una transacción`),
        );
      },
    );
  });

  describe('insertar', () => {
    it('debería escribir el hecho como pendiente con el EntityManager del tx y devolver su id', async () => {
      // Act
      const id = await repositorio.insertar(
        {
          nombre: 'CitaReagendada',
          tenantId: 'tenant-1',
          ocurridoEn: OCURRIDO_EN,
          payload: { citaId: 'cita-1', inicioAnterior: '2026-10-02T13:00:00Z' },
        },
        comoTx(),
      );

      // Assert
      expect(tx.getRepository).toHaveBeenCalledWith(EventoSalidaOrmEntity);
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(repoTx.insert).toHaveBeenCalledWith({
        id,
        nombre: 'CitaReagendada',
        tenantId: 'tenant-1',
        payload: { citaId: 'cita-1', inicioAnterior: '2026-10-02T13:00:00Z' },
        ocurridoEn: OCURRIDO_EN,
        estado: EstadoEventoSalida.PENDIENTE,
      });
    });

    it('debería generar un id distinto en cada inserción', async () => {
      // Arrange
      const evento = {
        nombre: 'CitaCreada',
        tenantId: 'tenant-1',
        ocurridoEn: OCURRIDO_EN,
        payload: {},
      };

      // Act
      const a = await repositorio.insertar(evento, comoTx());
      const b = await repositorio.insertar(evento, comoTx());

      // Assert
      expect(a).not.toBe(b);
    });
  });

  describe('reclamarProximoPendiente', () => {
    it('debería pedir el pendiente vencido más antiguo con FOR UPDATE SKIP LOCKED', async () => {
      // Act
      await repositorio.reclamarProximoPendiente(AHORA, comoTx());

      // Assert
      expect(repoTx.findOne).toHaveBeenCalledWith({
        where: {
          estado: EstadoEventoSalida.PENDIENTE,
          proximoIntentoEn: LessThanOrEqual(AHORA),
        },
        order: { ocurridoEn: 'ASC', id: 'ASC' },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
    });

    it('no debería filtrar por tenant (BARRIDO GLOBAL, ADR-12 §6)', async () => {
      // Act
      await repositorio.reclamarProximoPendiente(AHORA, comoTx());

      // Assert
      const [opciones] = repoTx.findOne.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(opciones.where).not.toHaveProperty('tenantId');
    });

    it('debería devolver el hecho con su tenantId y payload', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila({ intentos: 2 }));

      // Act
      const evento = await repositorio.reclamarProximoPendiente(
        AHORA,
        comoTx(),
      );

      // Assert
      expect(evento).toEqual({
        id: ID,
        nombre: 'CitaCreada',
        tenantId: 'tenant-1',
        payload: { citaId: 'cita-1' },
        ocurridoEn: OCURRIDO_EN,
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 2,
        proximoIntentoEn: OCURRIDO_EN,
        ultimoError: null,
        entregadoEn: null,
        creadoEn: OCURRIDO_EN,
      });
      expect(evento).not.toBeInstanceOf(EventoSalidaOrmEntity);
    });

    it('debería devolver null cuando no queda ninguno libre', async () => {
      // Act & Assert
      expect(
        await repositorio.reclamarProximoPendiente(AHORA, comoTx()),
      ).toBeNull();
    });
  });

  describe('marcarEntregado', () => {
    it('debería pasar de pendiente a entregado con la hora recibida', async () => {
      // Act
      const ok = await repositorio.marcarEntregado(ID, AHORA, comoTx());

      // Assert
      expect(ok).toBe(true);
      expect(repoTx.update).toHaveBeenCalledWith(
        { id: ID, estado: EstadoEventoSalida.PENDIENTE },
        { estado: EstadoEventoSalida.ENTREGADO, entregadoEn: AHORA },
      );
    });

    it('debería devolver false si el hecho ya no estaba pendiente', async () => {
      // Arrange
      repoTx.update.mockResolvedValue({ affected: 0 });

      // Act & Assert
      expect(await repositorio.marcarEntregado(ID, AHORA, comoTx())).toBe(
        false,
      );
    });
  });

  describe('registrarFallo', () => {
    it('debería bloquear la fila pendiente SIN saltar bloqueos', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila());

      // Act
      await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        SIN_VARIACION,
        comoTx(),
      );

      // Assert
      expect(repoTx.findOne).toHaveBeenCalledWith({
        where: { id: ID, estado: EstadoEventoSalida.PENDIENTE },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('debería devolver null y no escribir si el hecho ya no está pendiente', async () => {
      // Arrange — otro proceso lo entregó entre la reversión y este registro
      repoTx.findOne.mockResolvedValue(null);

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        SIN_VARIACION,
        comoTx(),
      );

      // Assert
      expect(resultado).toBeNull();
      expect(repoTx.update).not.toHaveBeenCalled();
    });

    it('primer fallo: intentos 1 y reintento a los 10 s', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila({ intentos: 0 }));

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        'SuscriptorRecordatorios: timeout',
        AHORA,
        SIN_VARIACION,
        comoTx(),
      );

      // Assert
      const esperado = new Date(AHORA.getTime() + 10_000);
      expect(repoTx.update).toHaveBeenCalledWith(
        { id: ID },
        {
          intentos: 1,
          ultimoError: 'SuscriptorRecordatorios: timeout',
          proximoIntentoEn: esperado,
        },
      );
      expect(resultado).toMatchObject({
        id: ID,
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 1,
        proximoIntentoEn: esperado,
        ultimoError: 'SuscriptorRecordatorios: timeout',
      });
    });

    it.each([
      [1, 20],
      [3, 80],
      [8, 2_560],
    ])(
      'con %i intentos previos debería reintentar a los %i s',
      async (previos, segundos) => {
        // Arrange — máximo alto para aislar el cálculo de la espera
        repoTx.findOne.mockResolvedValue(fila({ intentos: previos }));

        // Act
        await repositorio.registrarFallo(
          ID,
          'boom',
          AHORA,
          { ...SIN_VARIACION, maxIntentos: 50 },
          comoTx(),
        );

        // Assert
        expect(repoTx.update).toHaveBeenCalledWith(
          { id: ID },
          expect.objectContaining({
            intentos: previos + 1,
            proximoIntentoEn: new Date(AHORA.getTime() + segundos * 1_000),
          }),
        );
      },
    );

    it('debería acotar la espera a 1 h', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila({ intentos: 15 }));

      // Act
      await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        { ...SIN_VARIACION, maxIntentos: 50 },
        comoTx(),
      );

      // Assert
      expect(repoTx.update).toHaveBeenCalledWith(
        { id: ID },
        expect.objectContaining({
          proximoIntentoEn: new Date(AHORA.getTime() + 3_600_000),
        }),
      );
    });

    it('debería seguir pendiente con un intento por debajo del máximo', async () => {
      // Arrange — 8 previos + este = 9 < 10
      repoTx.findOne.mockResolvedValue(fila({ intentos: 8 }));

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        SIN_VARIACION,
        comoTx(),
      );

      // Assert
      expect(resultado?.estado).toBe(EstadoEventoSalida.PENDIENTE);
      expect(resultado?.intentos).toBe(9);
    });

    it('debería pasar a fallido AL LLEGAR al máximo, sin reprogramar', async () => {
      // Arrange — 9 previos + este = 10 = maxIntentos
      repoTx.findOne.mockResolvedValue(fila({ intentos: 9 }));

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        SIN_VARIACION,
        comoTx(),
      );

      // Assert
      expect(repoTx.update).toHaveBeenCalledWith(
        { id: ID },
        {
          intentos: 10,
          ultimoError: 'boom',
          estado: EstadoEventoSalida.FALLIDO,
        },
      );
      expect(resultado).toMatchObject({
        estado: EstadoEventoSalida.FALLIDO,
        intentos: 10,
        nombre: 'CitaCreada',
        // No se reprograma: conserva el último valor.
        proximoIntentoEn: OCURRIDO_EN,
      });
    });

    it('debería respetar el máximo recibido por parámetro', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila({ intentos: 2 }));

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        { ...SIN_VARIACION, maxIntentos: 3 },
        comoTx(),
      );

      // Assert
      expect(resultado?.estado).toBe(EstadoEventoSalida.FALLIDO);
    });

    it('debería aplicar la variación hacia abajo, dentro del rango', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila({ intentos: 3 }));

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        'boom',
        AHORA,
        { ...SIN_VARIACION, variacion: 0.2 },
        comoTx(),
      );

      // Assert — nominal 80 s; con variación 0.2, en [64 s, 80 s]
      const espera =
        (resultado?.proximoIntentoEn.getTime() ?? 0) - AHORA.getTime();
      expect(espera).toBeGreaterThanOrEqual(64_000);
      expect(espera).toBeLessThanOrEqual(80_000);
    });

    it('debería truncar ultimo_error', async () => {
      // Arrange
      repoTx.findOne.mockResolvedValue(fila());
      const largo = 'x'.repeat(LARGO_MAXIMO_ULTIMO_ERROR + 100);

      // Act
      const resultado = await repositorio.registrarFallo(
        ID,
        largo,
        AHORA,
        SIN_VARIACION,
        comoTx(),
      );

      // Assert
      expect(resultado?.ultimoError).toHaveLength(LARGO_MAXIMO_ULTIMO_ERROR);
      expect(repoTx.update).toHaveBeenCalledWith(
        { id: ID },
        expect.objectContaining({
          ultimoError: 'x'.repeat(LARGO_MAXIMO_ULTIMO_ERROR),
        }),
      );
    });

    it('debería rechazar una política inválida antes de tocar la base', async () => {
      // Act & Assert
      await expect(
        repositorio.registrarFallo(
          ID,
          'boom',
          AHORA,
          { ...SIN_VARIACION, maxIntentos: NaN },
          comoTx(),
        ),
      ).rejects.toThrow(/Política de reintento inválida/);
      expect(repoTx.findOne).not.toHaveBeenCalled();
    });
  });

  describe('purgarEntregadosAntiguos', () => {
    it('debería tomar el candado consultivo de transacción de la purga', async () => {
      // Act
      await repositorio.purgarEntregadosAntiguos(AHORA, 14, comoTx());

      // Assert
      expect(tx.query).toHaveBeenCalledWith(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS "obtenido"',
        [CLAVE_CANDADO_PURGA_SALIDA],
      );
    });

    it('debería borrar solo los entregados de hace más de N días', async () => {
      // Arrange
      repoTx.delete.mockResolvedValue({ affected: 37 });

      // Act
      const resultado = await repositorio.purgarEntregadosAntiguos(
        AHORA,
        14,
        comoTx(),
      );

      // Assert
      expect(repoTx.delete).toHaveBeenCalledWith({
        estado: EstadoEventoSalida.ENTREGADO,
        entregadoEn: LessThan(new Date('2026-09-17T12:00:00.000Z')),
      });
      expect(resultado).toEqual({ ejecutada: true, borrados: 37 });
    });

    it('no debería borrar nada si otro proceso tiene el candado', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ obtenido: false }]);

      // Act
      const resultado = await repositorio.purgarEntregadosAntiguos(
        AHORA,
        14,
        comoTx(),
      );

      // Assert
      expect(resultado).toEqual({ ejecutada: false, borrados: 0 });
      expect(repoTx.delete).not.toHaveBeenCalled();
    });

    it.each([0, -1, NaN])(
      'debería rechazar retencionDias = %p',
      async (dias) => {
        // Act & Assert
        await expect(
          repositorio.purgarEntregadosAntiguos(AHORA, dias, comoTx()),
        ).rejects.toThrow(/retencionDias debe ser > 0/);
        expect(tx.query).not.toHaveBeenCalled();
      },
    );
  });

  describe('truncarError', () => {
    it('debería dejar intacto un mensaje corto', () => {
      // Act & Assert
      expect(truncarError('ECONNRESET')).toBe('ECONNRESET');
    });

    it('no debería partir un par sustituto por la mitad', () => {
      // Arrange — 499 letras y luego emojis (2 unidades UTF-16 cada uno)
      const mensaje = 'a'.repeat(LARGO_MAXIMO_ULTIMO_ERROR - 1) + '😀😀😀';

      // Act
      const truncado = truncarError(mensaje);

      // Assert
      expect(Array.from(truncado)).toHaveLength(LARGO_MAXIMO_ULTIMO_ERROR);
      expect(truncado.endsWith('😀')).toBe(true);
    });
  });
});
