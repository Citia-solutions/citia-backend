import { EntityManager } from 'typeorm';

import { LARGO_MAXIMO_ULTIMO_ERROR } from '../../../../shared/infrastructure/salida/typeorm-eventos-salida.repository';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../../domain/recordatorio.entity';
import {
  EventoEntrega,
  NuevoRecordatorio,
  TipoEventoEntrega,
} from '../../domain/recordatorio.repository';
import {
  CLAVE_CANDADO_CITA,
  CONFLICTO_CLAVE_RECORDATORIO,
  SQL_CANDADO_CITA,
  TypeOrmRecordatorioRepository,
} from './typeorm-recordatorio.repository';

/**
 * Adaptador de `recordatorios` SIN base de datos: el `EntityManager` del `tx`
 * es un doble y se verifica el SQL y los parámetros que recibe.
 *
 * Lo que NO cubre (smoke del paso 7 y testing-agent en el paso 14): que
 * Postgres infiera la clave PARCIAL en el ON CONFLICT, que SKIP LOCKED reparta
 * filas entre dos procesos, los CHECK y el candado entre dos conexiones.
 */
describe('TypeOrmRecordatorioRepository', () => {
  const ID = '0e5a0000-0000-4000-8000-000000000001';
  const CITA = '0c170000-0000-4000-8000-000000000001';
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const AHORA = new Date('2026-10-03T12:00:00.000Z');
  const INICIO = new Date('2026-10-05T13:00:00.000Z');

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let repositorio: TypeOrmRecordatorioRepository;

  const comoTx = () => tx as unknown as EntityManager;
  /** SQL de la llamada `i` con los espacios colapsados. */
  const sql = (i = 0): string =>
    tx.query.mock.calls[i][0].replace(/\s+/g, ' ').trim();
  const parametros = (i = 0): unknown[] =>
    tx.query.mock.calls[i][1] as unknown[];

  const fila = (extra: Record<string, unknown> = {}) => ({
    id: ID,
    tenantId: TENANT,
    citaId: CITA,
    canal: CanalRecordatorio.EMAIL,
    antelacionMin: 1440,
    inicioCita: INICIO,
    programadoPara: new Date('2026-10-04T13:00:00.000Z'),
    venceEn: new Date('2026-10-05T11:00:00.000Z'),
    estado: EstadoRecordatorio.PROGRAMADO,
    motivo: null,
    intentos: 0,
    proximoIntentoEn: new Date('2026-10-04T13:00:00.000Z'),
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    entregadoEn: null,
    quejaEn: null,
    creadoEn: AHORA,
    actualizadoEn: AHORA,
    ...extra,
  });

  const nuevo = (extra: Partial<NuevoRecordatorio> = {}): NuevoRecordatorio =>
    ({
      tenantId: TENANT,
      citaId: CITA,
      canal: CanalRecordatorio.EMAIL,
      antelacionMin: 1440,
      inicioCita: INICIO,
      programadoPara: new Date('2026-10-04T13:00:00.000Z'),
      venceEn: new Date('2026-10-05T11:00:00.000Z'),
      proximoIntentoEn: new Date('2026-10-04T13:00:00.000Z'),
      estado: EstadoRecordatorio.PROGRAMADO,
      motivo: null,
      ...extra,
    }) as NuevoRecordatorio;

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    repositorio = new TypeOrmRecordatorioRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sin transacción', () => {
    it.each<[string, () => Promise<unknown>]>([
      [
        'bloquearCitaParaReconciliar',
        () => repositorio.bloquearCitaParaReconciliar(CITA, undefined),
      ],
      [
        'insertarSiNoExisten',
        () => repositorio.insertarSiNoExisten([], undefined),
      ],
      [
        'listarVigentesDeCita',
        () => repositorio.listarVigentesDeCita(CITA, TENANT, undefined),
      ],
      [
        'listarPorCita',
        () => repositorio.listarPorCita(CITA, TENANT, undefined),
      ],
      [
        'anular',
        () =>
          repositorio.anular(
            [ID],
            TENANT,
            MotivoRecordatorio.CITA_TERMINAL,
            undefined,
          ),
      ],
      [
        'reclamarProximoProgramado',
        () => repositorio.reclamarProximoProgramado(AHORA, undefined),
      ],
      [
        'registrarEnvio',
        () =>
          repositorio.registrarEnvio(
            ID,
            TENANT,
            { proveedor: 'registro', proveedorMensajeId: 'm-1' },
            AHORA,
            undefined,
          ),
      ],
      [
        'registrarReintento',
        () =>
          repositorio.registrarReintento(
            ID,
            TENANT,
            { ultimoError: '503', proximoIntentoEn: AHORA },
            undefined,
          ),
      ],
      ['posponer', () => repositorio.posponer(ID, TENANT, AHORA, undefined)],
      [
        'omitir',
        () =>
          repositorio.omitir(
            ID,
            TENANT,
            MotivoRecordatorio.SIN_CORREO,
            undefined,
          ),
      ],
      [
        'registrarFallo',
        () =>
          repositorio.registrarFallo(
            ID,
            TENANT,
            {
              motivo: MotivoRecordatorio.VENCIDO,
              ultimoError: null,
              contarIntento: false,
            },
            undefined,
          ),
      ],
      [
        'registrarEventoEntrega',
        () =>
          repositorio.registrarEventoEntrega(
            { recordatorioId: ID, proveedorMensajeId: null },
            {
              tipo: TipoEventoEntrega.ENTREGADO,
              proveedor: 'resend',
              proveedorMensajeId: 'm-1',
              ocurridoEn: AHORA,
            },
            undefined,
          ),
      ],
      [
        'contarEnviadosEntre',
        () => repositorio.contarEnviadosEntre(AHORA, INICIO, undefined),
      ],
      [
        'contarEnviadosDeTenantEntre',
        () =>
          repositorio.contarEnviadosDeTenantEntre(
            TENANT,
            AHORA,
            INICIO,
            undefined,
          ),
      ],
      [
        'contarDesenlacesEntre',
        () => repositorio.contarDesenlacesEntre(AHORA, INICIO, undefined),
      ],
    ])(
      '%s debería lanzar en lugar de usar una conexión suelta',
      async (op, fn) => {
        // Act & Assert
        await expect(fn()).rejects.toThrow(
          new RegExp(`RecordatorioRepository\\.${op} requiere una transacción`),
        );
      },
    );
  });

  describe('bloquearCitaParaReconciliar', () => {
    it('debería tomar el candado consultivo de transacción de la cita', async () => {
      // Act
      await repositorio.bloquearCitaParaReconciliar(CITA, comoTx());

      // Assert
      expect(tx.query).toHaveBeenCalledWith(SQL_CANDADO_CITA, [
        CLAVE_CANDADO_CITA,
        CITA,
      ]);
      expect(SQL_CANDADO_CITA).toContain('pg_advisory_xact_lock');
      expect(SQL_CANDADO_CITA).not.toContain('try');
    });
  });

  describe('insertarSiNoExisten', () => {
    it('no debería consultar con una lista vacía', async () => {
      // Act
      const insertados = await repositorio.insertarSiNoExisten([], comoTx());

      // Assert
      expect(insertados).toEqual([]);
      expect(tx.query).not.toHaveBeenCalled();
    });

    it('debería insertar todo en una sentencia con ON CONFLICT sobre la clave parcial', async () => {
      // Arrange
      const omitido = nuevo({
        antelacionMin: 120,
        estado: EstadoRecordatorio.OMITIDO,
        motivo: MotivoRecordatorio.FUSIONADO,
      });

      // Act
      await repositorio.insertarSiNoExisten([nuevo(), omitido], comoTx());

      // Assert
      expect(tx.query).toHaveBeenCalledTimes(1);
      expect(sql()).toContain(
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10), ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      );
      expect(sql()).toContain(
        `ON CONFLICT ${CONFLICTO_CLAVE_RECORDATORIO} DO NOTHING`,
      );
      expect(CONFLICTO_CLAVE_RECORDATORIO).toBe(
        `("cita_id", "canal", "antelacion_min", "programado_para") WHERE "estado" <> 'cancelado'`,
      );
      expect(sql()).toContain('RETURNING');
      expect(parametros()).toHaveLength(20);
      expect(parametros().slice(10)).toEqual([
        TENANT,
        CITA,
        'email',
        120,
        INICIO,
        omitido.programadoPara,
        omitido.venceEn,
        'omitido',
        'fusionado',
        omitido.proximoIntentoEn,
      ]);
    });

    it('debería devolver solo lo que la base insertó', async () => {
      // Arrange — de dos, uno chocó con la clave y no vuelve en RETURNING
      tx.query.mockResolvedValue([fila()]);

      // Act
      const insertados = await repositorio.insertarSiNoExisten(
        [nuevo(), nuevo({ antelacionMin: 120 })],
        comoTx(),
      );

      // Assert
      expect(insertados).toEqual([fila()]);
    });

    it.each([EstadoRecordatorio.CANCELADO, EstadoRecordatorio.ENVIADO])(
      'debería rechazar un recordatorio que nace %s',
      async (estado) => {
        // Act & Assert
        await expect(
          repositorio.insertarSiNoExisten(
            [nuevo({ estado } as Partial<NuevoRecordatorio>)],
            comoTx(),
          ),
        ).rejects.toThrow(/nace programado u omitido/);
        expect(tx.query).not.toHaveBeenCalled();
      },
    );
  });

  describe('listarVigentesDeCita / listarPorCita', () => {
    it('vigentes: todos menos cancelado, del tenant', async () => {
      // Arrange
      tx.query.mockResolvedValue([fila()]);

      // Act
      const vigentes = await repositorio.listarVigentesDeCita(
        CITA,
        TENANT,
        comoTx(),
      );

      // Assert
      expect(sql()).toContain(`"estado" <> 'cancelado'`);
      expect(sql()).toContain(`"tenant_id" = $2`);
      expect(parametros()).toEqual([CITA, TENANT]);
      expect(vigentes).toEqual([fila()]);
    });

    it('por cita: incluye los cancelados, del tenant, en orden', async () => {
      // Act
      await repositorio.listarPorCita(CITA, TENANT, comoTx());

      // Assert
      expect(sql()).not.toContain('cancelado');
      expect(sql()).toContain(`"tenant_id" = $2`);
      expect(sql()).toContain(`ORDER BY "programado_para", "creado_en", "id"`);
    });

    it('con un id que no es UUID debería devolver [] sin consultar', async () => {
      // Act & Assert
      expect(
        await repositorio.listarPorCita('no-es-uuid', TENANT, comoTx()),
      ).toEqual([]);
      expect(
        await repositorio.listarVigentesDeCita('x', TENANT, comoTx()),
      ).toEqual([]);
      expect(tx.query).not.toHaveBeenCalled();
    });

    it('debería devolver datos planos con números', async () => {
      // Arrange — por si el driver entregara texto
      tx.query.mockResolvedValue([
        fila({ intentos: '2', antelacionMin: '120' }),
      ]);

      // Act
      const [recordatorio] = await repositorio.listarPorCita(
        CITA,
        TENANT,
        comoTx(),
      );

      // Assert
      expect(recordatorio.intentos).toBe(2);
      expect(recordatorio.antelacionMin).toBe(120);
    });
  });

  describe('anular', () => {
    it('debería pasar solo los programados del tenant a cancelado con el motivo', async () => {
      // Arrange — TypeORM devuelve [filas, cantidad] en un UPDATE
      tx.query.mockResolvedValue([[{ id: ID }], 1]);

      // Act
      const anulados = await repositorio.anular(
        [ID, '0e5a0000-0000-4000-8000-000000000002'],
        TENANT,
        MotivoRecordatorio.REPROGRAMADO,
        comoTx(),
      );

      // Assert
      expect(anulados).toEqual([ID]);
      expect(sql()).toContain(`SET "estado" = 'cancelado', "motivo" = $3`);
      expect(sql()).toContain(`"id" = ANY($1::uuid[])`);
      expect(sql()).toContain(`AND "tenant_id" = $2`);
      expect(sql()).toContain(`AND "estado" = 'programado'`);
      expect(parametros()).toEqual([
        [ID, '0e5a0000-0000-4000-8000-000000000002'],
        TENANT,
        'reprogramado',
      ]);
    });

    it('no debería consultar sin ids', async () => {
      // Act & Assert
      expect(
        await repositorio.anular(
          [],
          TENANT,
          MotivoRecordatorio.CITA_TERMINAL,
          comoTx(),
        ),
      ).toEqual([]);
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('reclamarProximoProgramado', () => {
    it('debería pedir el programado vencido más antiguo con FOR UPDATE SKIP LOCKED', async () => {
      // Act
      await repositorio.reclamarProximoProgramado(AHORA, comoTx());

      // Assert
      expect(sql()).toContain(`WHERE "estado" = 'programado'`);
      expect(sql()).toContain(`"proximo_intento_en" <= $1`);
      expect(sql()).toContain(
        `ORDER BY "proximo_intento_en", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      expect(parametros()).toEqual([AHORA]);
    });

    it('no debería filtrar por tenant (BARRIDO GLOBAL, ADR-12 §6)', async () => {
      // Act
      await repositorio.reclamarProximoProgramado(AHORA, comoTx());

      // Assert
      expect(sql()).not.toMatch(/WHERE[^;]*"tenant_id"/);
    });

    it('debería devolver la fila con su tenantId, o null', async () => {
      // Arrange
      tx.query.mockResolvedValueOnce([fila()]).mockResolvedValueOnce([]);

      // Act & Assert
      expect(
        await repositorio.reclamarProximoProgramado(AHORA, comoTx()),
      ).toEqual(fila());
      expect(
        await repositorio.reclamarProximoProgramado(AHORA, comoTx()),
      ).toBeNull();
    });
  });

  describe('resultados del envío (fila tomada, guarda programado)', () => {
    beforeEach(() => {
      tx.query.mockResolvedValue([[], 1]);
    });

    const conGuarda = () => {
      expect(sql()).toContain(
        `WHERE "id" = $1 AND "tenant_id" = $2 AND "estado" = 'programado'`,
      );
      expect(sql()).toContain(`"actualizado_en" = now()`);
    };

    it('registrarEnvio: enviado, enviado_en = ahora, intentos + 1 y proveedor', async () => {
      // Act
      const ok = await repositorio.registrarEnvio(
        ID,
        TENANT,
        { proveedor: 'resend', proveedorMensajeId: 'msg-1' },
        AHORA,
        comoTx(),
      );

      // Assert
      expect(ok).toBe(true);
      conGuarda();
      expect(sql()).toContain(`"estado" = 'enviado'`);
      expect(sql()).toContain(`"intentos" = "intentos" + 1`);
      expect(parametros()).toEqual([ID, TENANT, AHORA, 'resend', 'msg-1']);
    });

    it('registrarEnvio: admite posible_duplicado sin id de mensaje', async () => {
      // Act
      await repositorio.registrarEnvio(
        ID,
        TENANT,
        { proveedor: 'resend', proveedorMensajeId: null },
        AHORA,
        comoTx(),
      );

      // Assert
      expect(parametros()[4]).toBeNull();
    });

    it('registrarReintento: intentos + 1, error truncado y próximo intento', async () => {
      // Arrange
      const largo = 'x'.repeat(LARGO_MAXIMO_ULTIMO_ERROR + 50);
      const proximo = new Date('2026-10-03T12:05:00.000Z');

      // Act
      await repositorio.registrarReintento(
        ID,
        TENANT,
        { ultimoError: largo, proximoIntentoEn: proximo },
        comoTx(),
      );

      // Assert
      conGuarda();
      // Sigue programado: el SET no toca el estado.
      expect(sql()).toContain(
        `SET "intentos" = "intentos" + 1, "ultimo_error" = $3, "proximo_intento_en" = $4, "actualizado_en" = now() WHERE`,
      );
      expect(parametros()).toEqual([
        ID,
        TENANT,
        'x'.repeat(LARGO_MAXIMO_ULTIMO_ERROR),
        proximo,
      ]);
    });

    it('posponer: solo mueve proximo_intento_en, sin sumar intento', async () => {
      // Act
      await repositorio.posponer(ID, TENANT, INICIO, comoTx());

      // Assert
      conGuarda();
      expect(sql()).not.toContain('intentos');
      expect(parametros()).toEqual([ID, TENANT, INICIO]);
    });

    it('omitir: omitido con el motivo', async () => {
      // Act
      await repositorio.omitir(
        ID,
        TENANT,
        MotivoRecordatorio.CORREO_SUPRIMIDO,
        comoTx(),
      );

      // Assert
      conGuarda();
      expect(sql()).toContain(`"estado" = 'omitido'`);
      expect(parametros()).toEqual([ID, TENANT, 'correo_suprimido']);
    });

    it.each([
      [true, 1],
      [false, 0],
    ])(
      'registrarFallo: fallido con motivo; contarIntento=%p suma %p',
      async (contarIntento, suma) => {
        // Act
        await repositorio.registrarFallo(
          ID,
          TENANT,
          {
            motivo: MotivoRecordatorio.CORREO_INVALIDO,
            ultimoError: 'validation_error',
            contarIntento,
          },
          comoTx(),
        );

        // Assert
        conGuarda();
        expect(sql()).toContain(`"estado" = 'fallido'`);
        expect(sql()).toContain(
          `"ultimo_error" = COALESCE($4, "ultimo_error")`,
        );
        expect(parametros()).toEqual([
          ID,
          TENANT,
          'correo_invalido',
          'validation_error',
          suma,
        ]);
      },
    );

    it('registrarFallo sin error nuevo conserva el último guardado', async () => {
      // Act
      await repositorio.registrarFallo(
        ID,
        TENANT,
        {
          motivo: MotivoRecordatorio.VENCIDO,
          ultimoError: null,
          contarIntento: false,
        },
        comoTx(),
      );

      // Assert
      expect(parametros()[3]).toBeNull();
    });

    it('debería devolver false si la fila ya no estaba programada', async () => {
      // Arrange
      tx.query.mockResolvedValue([[], 0]);

      // Act & Assert
      expect(await repositorio.posponer(ID, TENANT, INICIO, comoTx())).toBe(
        false,
      );
    });
  });

  describe('registrarEventoEntrega (monótono)', () => {
    const evento = (
      tipo: TipoEventoEntrega,
      extra: Partial<EventoEntrega> = {},
    ): EventoEntrega => ({
      tipo,
      proveedor: 'resend',
      proveedorMensajeId: 'msg-1',
      ocurridoEn: AHORA,
      ...extra,
    });

    it('debería buscar por la etiqueta recordatorio_id y bloquear la fila', async () => {
      // Arrange
      tx.query.mockResolvedValueOnce([fila()]).mockResolvedValueOnce([[], 0]);

      // Act
      await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: 'msg-1' },
        evento(TipoEventoEntrega.ENTREGADO),
        comoTx(),
      );

      // Assert
      expect(sql(0)).toContain(`WHERE "id" = $1 FOR UPDATE`);
      expect(sql(0)).not.toContain('SKIP LOCKED');
      expect(parametros(0)).toEqual([ID]);
    });

    it('sin etiqueta válida debería buscar por proveedor_mensaje_id', async () => {
      // Arrange
      tx.query.mockResolvedValueOnce([fila()]).mockResolvedValueOnce([[], 0]);

      // Act
      await repositorio.registrarEventoEntrega(
        { recordatorioId: 'no-uuid', proveedorMensajeId: 'msg-1' },
        evento(TipoEventoEntrega.ENTREGADO),
        comoTx(),
      );

      // Assert
      expect(sql(0)).toContain(
        `WHERE "proveedor_mensaje_id" = $1 ORDER BY "creado_en", "id" LIMIT 1 FOR UPDATE`,
      );
      expect(parametros(0)).toEqual(['msg-1']);
    });

    it('con etiqueta de una fila inexistente debería probar por proveedor_mensaje_id', async () => {
      // Arrange
      tx.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([fila()])
        .mockResolvedValueOnce([[], 0]);

      // Act
      const resultado = await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: 'msg-1' },
        evento(TipoEventoEntrega.ENTREGADO),
        comoTx(),
      );

      // Assert
      expect(sql(1)).toContain(`"proveedor_mensaje_id" = $1`);
      expect(resultado.recordatorio).toEqual(fila());
    });

    it('id desconocido → recordatorio null, sin actualizar', async () => {
      // Act
      const resultado = await repositorio.registrarEventoEntrega(
        { recordatorioId: null, proveedorMensajeId: 'desconocido' },
        evento(TipoEventoEntrega.ENTREGADO),
        comoTx(),
      );

      // Assert
      expect(resultado).toEqual({ recordatorio: null, aplicado: false });
      expect(tx.query).toHaveBeenCalledTimes(1);
    });

    it('sin etiqueta ni id de mensaje no debería consultar', async () => {
      // Act
      const resultado = await repositorio.registrarEventoEntrega(
        { recordatorioId: null, proveedorMensajeId: null },
        evento(TipoEventoEntrega.QUEJA),
        comoTx(),
      );

      // Assert
      expect(resultado).toEqual({ recordatorio: null, aplicado: false });
      expect(tx.query).not.toHaveBeenCalled();
    });

    it('entregado: solo desde programado/enviado, completando fechas sin pisarlas', async () => {
      // Arrange
      const entregada = fila({
        estado: EstadoRecordatorio.ENTREGADO,
        entregadoEn: AHORA,
      });
      tx.query
        .mockResolvedValueOnce([fila({ estado: EstadoRecordatorio.ENVIADO })])
        .mockResolvedValueOnce([[entregada], 1]);

      // Act
      const resultado = await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: 'msg-1' },
        evento(TipoEventoEntrega.ENTREGADO),
        comoTx(),
      );

      // Assert
      expect(resultado).toEqual({ recordatorio: entregada, aplicado: true });
      expect(sql(1)).toContain(`SET "estado" = 'entregado'`);
      expect(sql(1)).toContain(`"entregado_en" = COALESCE("entregado_en", $2)`);
      expect(sql(1)).toContain(`"enviado_en" = COALESCE("enviado_en", $2)`);
      expect(sql(1)).toContain(
        `"proveedor_mensaje_id" = COALESCE("proveedor_mensaje_id", $3)`,
      );
      expect(sql(1)).toContain(
        `WHERE "id" = $1 AND "estado" IN ('programado', 'enviado')`,
      );
      expect(parametros(1)).toEqual([ID, AHORA, 'msg-1', 'resend']);
    });

    it('evento que no hace avanzar la fila → aplicado false con su estado actual', async () => {
      // Arrange — ya fallida por rebote; llega un delivered tardío
      const fallida = fila({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.REBOTE,
      });
      tx.query.mockResolvedValueOnce([fallida]).mockResolvedValueOnce([[], 0]);

      // Act
      const resultado = await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: 'msg-1' },
        evento(TipoEventoEntrega.ENTREGADO),
        comoTx(),
      );

      // Assert
      expect(resultado).toEqual({ recordatorio: fallida, aplicado: false });
    });

    it.each([
      [TipoEventoEntrega.REBOTADO, 'rebote'],
      [TipoEventoEntrega.RECHAZADO, 'rechazado'],
    ])('%s: programado/enviado → fallido (%s)', async (tipo, motivo) => {
      // Arrange
      tx.query
        .mockResolvedValueOnce([fila({ estado: EstadoRecordatorio.ENVIADO })])
        .mockResolvedValueOnce([[fila()], 1]);

      // Act
      await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: 'msg-1' },
        evento(tipo),
        comoTx(),
      );

      // Assert
      expect(sql(1)).toContain(`SET "estado" = 'fallido', "motivo" = $5`);
      expect(sql(1)).toContain(`"estado" IN ('programado', 'enviado')`);
      expect(parametros(1)).toEqual([ID, AHORA, 'msg-1', 'resend', motivo]);
    });

    it('queja: fija queja_en una sola vez y no toca el estado', async () => {
      // Arrange
      tx.query
        .mockResolvedValueOnce([fila({ estado: EstadoRecordatorio.ENTREGADO })])
        .mockResolvedValueOnce([[fila()], 1]);

      // Act
      await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: null },
        evento(TipoEventoEntrega.QUEJA),
        comoTx(),
      );

      // Assert
      expect(sql(1)).toContain(`SET "queja_en" = $2`);
      expect(sql(1)).toContain(`WHERE "id" = $1 AND "queja_en" IS NULL`);
      expect(sql(1)).not.toContain(`"estado" =`);
      expect(parametros(1)).toEqual([ID, AHORA]);
    });

    it('enviado: completa el id del mensaje solo si faltaba', async () => {
      // Arrange
      tx.query
        .mockResolvedValueOnce([fila()])
        .mockResolvedValueOnce([[fila()], 1]);

      // Act
      await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: 'msg-9' },
        evento(TipoEventoEntrega.ENVIADO, { proveedorMensajeId: 'msg-9' }),
        comoTx(),
      );

      // Assert
      expect(sql(1)).toContain(`SET "proveedor_mensaje_id" = $2`);
      expect(sql(1)).toContain(`AND "proveedor_mensaje_id" IS NULL`);
      expect(sql(1)).not.toContain(`"estado" =`);
      expect(parametros(1)).toEqual([ID, 'msg-9', 'resend']);
    });

    it('enviado sin id de mensaje: nada que escribir', async () => {
      // Arrange
      tx.query.mockResolvedValueOnce([fila()]);

      // Act
      const resultado = await repositorio.registrarEventoEntrega(
        { recordatorioId: ID, proveedorMensajeId: null },
        evento(TipoEventoEntrega.ENVIADO, { proveedorMensajeId: null }),
        comoTx(),
      );

      // Assert
      expect(resultado).toEqual({ recordatorio: fila(), aplicado: false });
      expect(tx.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('contadores', () => {
    const DESDE = new Date('2026-10-03T00:00:00.000Z');
    const HASTA = new Date('2026-10-04T00:00:00.000Z');

    it('contarEnviadosEntre: por enviado_en, de toda la plataforma', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ total: 37 }]);

      // Act
      const total = await repositorio.contarEnviadosEntre(
        DESDE,
        HASTA,
        comoTx(),
      );

      // Assert
      expect(total).toBe(37);
      expect(sql()).toContain(`"enviado_en" >= $1 AND "enviado_en" < $2`);
      expect(sql()).not.toContain('tenant_id');
      expect(parametros()).toEqual([DESDE, HASTA]);
    });

    it('contarEnviadosDeTenantEntre: además por tenant', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ total: 4 }]);

      // Act
      const total = await repositorio.contarEnviadosDeTenantEntre(
        TENANT,
        DESDE,
        HASTA,
        comoTx(),
      );

      // Assert
      expect(total).toBe(4);
      expect(sql()).toContain(`AND "tenant_id" = $3`);
      expect(parametros()).toEqual([DESDE, HASTA, TENANT]);
    });

    it('contarDesenlacesEntre: entregados y fallidos por actualizado_en', async () => {
      // Arrange
      tx.query.mockResolvedValue([{ entregados: 19, fallidos: 1 }]);

      // Act
      const conteo = await repositorio.contarDesenlacesEntre(
        DESDE,
        HASTA,
        comoTx(),
      );

      // Assert
      expect(conteo).toEqual({ entregados: 19, fallidos: 1 });
      expect(sql()).toContain(`"estado" IN ('entregado', 'fallido')`);
      expect(sql()).toContain(`"actualizado_en" >= $1`);
    });

    it('debería rechazar un periodo inválido sin consultar', async () => {
      // Act & Assert
      await expect(
        repositorio.contarEnviadosEntre(HASTA, DESDE, comoTx()),
      ).rejects.toThrow(RangeError);
      expect(tx.query).not.toHaveBeenCalled();
    });
  });
});
