import { randomUUID } from 'node:crypto';

import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

import {
  BitacoraEnMemoria,
  aceptado,
} from '../../../../test/support/mensajeria-falsa';
import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { TransactionContext } from '../../../shared/application/transaction-runner';
import { TypeOrmTransactionRunner } from '../../../shared/infrastructure/typeorm-transaction-runner';
import { CitaOrmEntity } from '../../cita/infrastructure/persistence/cita.orm-entity';
import { EstadoCita } from '../../cita/domain/cita.entity';
import { PacienteOrmEntity } from '../../paciente/infrastructure/persistence/paciente.orm-entity';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import {
  EnviarRecordatoriosService,
  OpcionesEnvio,
} from '../application/enviar-recordatorios.service';
import { ReconciliarRecordatoriosService } from '../application/reconciliar-recordatorios.service';
import {
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
} from '../domain/canal-mensajeria';
import { calcularHashCorreo } from '../domain/hash-correo';
import { HORAS_SIN_ENVIO_POR_DEFECTO } from '../domain/horas-sin-envio';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoCancelacion,
  MotivoFallo,
  MotivoOmision,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import {
  DatosRecordatorio,
  NuevoRecordatorio,
  TipoEventoEntrega,
} from '../domain/recordatorio.repository';
import { MotivoSupresion } from '../domain/supresion-correo.repository';
import { ConfiguracionRecordatorioOrmEntity } from '../infrastructure/persistence/configuracion-recordatorio.orm-entity';
import { RecordatorioOrmEntity } from '../infrastructure/persistence/recordatorio.orm-entity';
import { SqlLectorCitas } from '../infrastructure/persistence/sql-lector-citas';
import { SupresionCorreoOrmEntity } from '../infrastructure/persistence/supresion-correo.orm-entity';
import { TypeOrmConfiguracionRecordatorioRepository } from '../infrastructure/persistence/typeorm-configuracion-recordatorio.repository';
import { TypeOrmRecordatorioRepository } from '../infrastructure/persistence/typeorm-recordatorio.repository';
import { TypeOrmSupresionCorreoRepository } from '../infrastructure/persistence/typeorm-supresion-correo.repository';

/**
 * Adaptadores de recordatorio contra PostgreSQL real (ADR-13 §2, §6, §7, §9,
 * §10; US-03 pasos 7 y 14). Lo que los dobles en memoria NO reproducen:
 *
 *  - los CHECK de estado, motivo y canal (incluido `motivo NULL`);
 *  - la clave única PARCIAL + `ON CONFLICT` (también tras anular, y entre dos
 *    transacciones a la vez);
 *  - `FOR UPDATE SKIP LOCKED` con dos procesos de envío: cada recordatorio
 *    sale UNA vez;
 *  - el candado consultivo por cita entre dos conexiones;
 *  - las supresiones por hash (y su CHECK de formato);
 *  - los eventos de entrega monótonos, también cuando un envío en curso tiene
 *    la fila tomada.
 *
 * Dos DataSource = dos "procesos", cada uno con su pool. El reloj de los
 * casos de uso es FIJO (`AHORA`, mediodía en Santiago): el resultado no
 * depende de la hora a la que corra el test.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 * Corre con `npm run test:integration` (en serie: comparte `citia_test`).
 */

const ENTIDADES = [
  TenantOrmEntity,
  UsuarioOrmEntity,
  PacienteOrmEntity,
  CitaOrmEntity,
  RecordatorioOrmEntity,
  ConfiguracionRecordatorioOrmEntity,
  SupresionCorreoOrmEntity,
];

const MIN = 60_000;
const HORA = 60 * MIN;
const TZ = 'America/Santiago';
/** 12:00 en Santiago (CLST, UTC-3): lejos de las horas sin envío y de la medianoche UTC. */
const AHORA = new Date('2026-10-14T15:00:00.000Z');

const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/** Error de Postgres tal como lo deja TypeORM (`QueryFailedError`). */
interface ErrorPostgres {
  code?: string;
  constraint?: string;
}

/** Ejecuta y devuelve el error de Postgres; falla si NO lanzó. */
async function errorDe(promesa: Promise<unknown>): Promise<ErrorPostgres> {
  try {
    await promesa;
  } catch (error: unknown) {
    const e = error as ErrorPostgres & { driverError?: ErrorPostgres };
    return {
      code: e.code ?? e.driverError?.code,
      constraint: e.constraint ?? e.driverError?.constraint,
    };
  }
  throw new Error('se esperaba que la base rechazara la sentencia');
}

/** Para saber si una promesa ya terminó sin esperarla. */
function observar<T>(promesa: Promise<T>): {
  promesa: Promise<T>;
  terminada: () => boolean;
} {
  let terminada = false;
  const envuelta = promesa.finally(() => {
    terminada = true;
  });
  // Evita "unhandled rejection" mientras nadie la espera todavía.
  envuelta.catch(() => undefined);
  return { promesa: envuelta, terminada: () => terminada };
}

/** Canal que tarda un poco y anota cada envío (compartido entre "procesos"). */
class CanalLento extends CanalMensajeria {
  constructor(
    private readonly envios: Map<string, number>,
    private readonly concurrencia: { actual: number; maxima: number },
    private readonly demoraMs: number,
  ) {
    super();
  }

  async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    const clave = mensaje.claveIdempotencia;
    this.envios.set(clave, (this.envios.get(clave) ?? 0) + 1);
    this.concurrencia.actual++;
    this.concurrencia.maxima = Math.max(
      this.concurrencia.maxima,
      this.concurrencia.actual,
    );
    try {
      await esperar(this.demoraMs);
      return aceptado(`msg_${clave}`);
    } finally {
      this.concurrencia.actual--;
    }
  }
}

describe('Recordatorios contra PostgreSQL (integration)', () => {
  // Dos "procesos": cada uno con su propio pool de conexiones.
  let baseA: DataSource;
  let baseB: DataSource;
  const repo = new TypeOrmRecordatorioRepository();
  const supresiones = new TypeOrmSupresionCorreoRepository();
  const configuraciones = new TypeOrmConfiguracionRecordatorioRepository();
  const lector = new SqlLectorCitas();

  let tenantId: string;
  let otroTenantId: string;
  let usuarioId: string;

  /** Corre `trabajo` en una transacción de `base` (commit al terminar). */
  const enTx = <T>(
    trabajo: (tx: EntityManager) => Promise<T>,
    base: DataSource = baseA,
  ): Promise<T> => base.transaction((manager) => trabajo(manager));

  /** Todos los recordatorios de la cita (también cancelados), por el adaptador. */
  const filas = async (citaId: string): Promise<DatosRecordatorio[]> => {
    const [cita] = await baseA.query<{ tenant_id: string }[]>(
      'SELECT tenant_id FROM citas WHERE id = $1',
      [citaId],
    );
    return enTx((tx) =>
      repo.listarPorCita(citaId, cita?.tenant_id ?? tenantId, tx),
    );
  };

  const leer = async (id: string): Promise<DatosRecordatorio> => {
    const [fila] = await baseA.query<{ cita_id: string; tenant_id: string }[]>(
      'SELECT cita_id, tenant_id FROM recordatorios WHERE id = $1',
      [id],
    );
    const lista = await enTx((tx) =>
      repo.listarPorCita(fila.cita_id, fila.tenant_id, tx),
    );
    const encontrado = lista.find((r) => r.id === id);
    if (!encontrado) throw new Error(`recordatorio ${id} no encontrado`);
    return encontrado;
  };

  /** Paciente + cita, como los dejaría el módulo de citas. */
  const crearCita = async (
    opciones: {
      inicio?: Date;
      correo?: string | null;
      estado?: EstadoCita;
      tenant?: string;
      usuario?: string;
    } = {},
  ): Promise<{ citaId: string; inicio: Date; pacienteId: string }> => {
    const tenant = opciones.tenant ?? tenantId;
    const inicio = opciones.inicio ?? new Date(AHORA.getTime() + 3 * HORA);
    const paciente = await baseA.getRepository(PacienteOrmEntity).save({
      nombre: 'Paciente Integración',
      telefono: '+56 9 0000 0000',
      correo:
        opciones.correo === undefined
          ? `p-${randomUUID().slice(0, 8)}@correo.cl`
          : opciones.correo,
      consentimiento: true,
      rut: null,
      tenantId: tenant,
    });
    const cita = await baseA.getRepository(CitaOrmEntity).save({
      inicio,
      duracionMin: 45,
      tipoConsulta: 'Control',
      estado: opciones.estado ?? EstadoCita.PENDIENTE,
      tenantId: tenant,
      pacienteId: paciente.id,
      usuarioId: opciones.usuario ?? usuarioId,
    });
    return { citaId: cita.id, inicio, pacienteId: paciente.id };
  };

  /** Un `programado` listo para la cola (vencido y vigente a `AHORA`). */
  const nuevoProgramado = (
    citaId: string,
    inicio: Date,
    extra: Partial<{
      antelacionMin: number;
      programadoPara: Date;
      proximoIntentoEn: Date;
      venceEn: Date;
      tenant: string;
    }> = {},
  ): NuevoRecordatorio => {
    const antelacionMin = extra.antelacionMin ?? 120;
    const programadoPara =
      extra.programadoPara ?? new Date(inicio.getTime() - antelacionMin * MIN);
    return {
      tenantId: extra.tenant ?? tenantId,
      citaId,
      canal: CanalRecordatorio.EMAIL,
      antelacionMin,
      inicioCita: inicio,
      programadoPara,
      venceEn: extra.venceEn ?? new Date(inicio.getTime() - 30 * MIN),
      estado: EstadoRecordatorio.PROGRAMADO,
      motivo: null,
      proximoIntentoEn: extra.proximoIntentoEn ?? programadoPara,
    };
  };

  /** INSERT directo (sin el adaptador) con estado y motivo a medida. */
  const insertarCrudo = (
    citaId: string,
    estado: string,
    motivo: string | null,
    extra: { antelacionMin?: number; canal?: string } = {},
  ): Promise<unknown> =>
    baseA.query(
      `INSERT INTO recordatorios
         (tenant_id, cita_id, canal, antelacion_min, inicio_cita,
          programado_para, vence_en, estado, motivo, proximo_intento_en)
       VALUES ($1, $2, $3, $4, $5, $5, $5, $6, $7, $5)`,
      [
        tenantId,
        citaId,
        extra.canal ?? 'email',
        extra.antelacionMin ?? 120,
        AHORA,
        estado,
        motivo,
      ],
    );

  /** Espera a que alguna conexión de la base de test quede esperando un candado. */
  const esperarBloqueadas = async (cuantas = 1): Promise<number> => {
    const limite = Date.now() + 5_000;
    for (;;) {
      const [{ n }] = await baseA.query<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_locks l
           JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE NOT l.granted
            AND a.datname = current_database()`,
      );
      if (n >= cuantas) return n;
      if (Date.now() > limite) {
        throw new Error(`se esperaban ${cuantas} conexiones bloqueadas`);
      }
      await esperar(20);
    }
  };

  beforeAll(async () => {
    baseA = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: ENTIDADES,
    });
    await baseA.initialize();
    // El segundo proceso NO toca el esquema: ya lo dejó listo el primero.
    baseB = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      entities: ENTIDADES,
      synchronize: false,
      dropSchema: false,
    });
    await baseB.initialize();

    const [tenant, otro] = await baseA.getRepository(TenantOrmEntity).save([
      { nombre: 'Clínica Recordatorios', slug: 'clinica-recordatorios-int' },
      { nombre: 'Otra Clínica', slug: 'otra-clinica-recordatorios-int' },
    ]);
    tenantId = tenant.id;
    otroTenantId = otro.id;
    const usuario = await baseA.getRepository(UsuarioOrmEntity).save({
      email: 'profesional@recordatorios-int.cl',
      passwordHash: '$2b$10$hash-de-prueba',
      nombreCompleto: 'Dra. Integración',
      rol: RolUsuario.PROFESIONAL,
      tenantId,
    });
    usuarioId = usuario.id;
  });

  beforeEach(async () => {
    await baseA.query(
      'TRUNCATE recordatorios, supresiones_correo, configuraciones_recordatorio, citas, pacientes',
    );
  });

  afterAll(async () => {
    await baseB?.destroy();
    await baseA?.destroy();
  });

  // ---------------------------------------------------------------------------
  describe('CHECK de estado, motivo y canal', () => {
    let citaId: string;

    beforeEach(async () => {
      ({ citaId } = await crearCita());
    });

    it.each([
      ['programado', null],
      ['enviado', null],
      ['entregado', null],
      ['cancelado', 'cita_terminal'],
      ['cancelado', 'desactivado'],
      ['omitido', 'sin_correo'],
      ['omitido', 'limite_tenant'],
      ['fallido', 'cuota_agotada'],
      ['fallido', 'rebote'],
    ])('debería aceptar estado %s con motivo %p', async (estado, motivo) => {
      await expect(
        insertarCrudo(citaId, estado, motivo),
      ).resolves.toBeDefined();
    });

    it.each([
      // motivo NULL donde el estado lo exige (NULL IN (...) daría NULL y el
      // CHECK lo daría por cumplido sin el `IS NOT NULL`)
      ['cancelado', null],
      ['omitido', null],
      ['fallido', null],
      // motivo donde el estado no lleva
      ['programado', 'sin_correo'],
      ['enviado', 'rebote'],
      ['entregado', 'cita_terminal'],
      // motivo de OTRO estado
      ['omitido', 'rebote'],
      ['cancelado', 'vencido'],
      ['fallido', 'reprogramado'],
      // motivo inventado
      ['fallido', 'inventado'],
    ])(
      'debería rechazar estado %s con motivo %p (CHK_recordatorios_motivo)',
      async (estado, motivo) => {
        // Act
        const error = await errorDe(insertarCrudo(citaId, estado, motivo));

        // Assert
        expect(error).toEqual({
          code: '23514',
          constraint: 'CHK_recordatorios_motivo',
        });
      },
    );

    it('debería rechazar un estado fuera del vocabulario (CHK_recordatorios_estado)', async () => {
      // Postgres evalúa los CHECK en orden alfabético: estado antes que motivo.
      expect(await errorDe(insertarCrudo(citaId, 'enviando', null))).toEqual({
        code: '23514',
        constraint: 'CHK_recordatorios_estado',
      });
    });

    it('debería rechazar un canal distinto de email (CHK_recordatorios_canal)', async () => {
      expect(
        await errorDe(
          insertarCrudo(citaId, 'programado', null, { canal: 'sms' }),
        ),
      ).toEqual({ code: '23514', constraint: 'CHK_recordatorios_canal' });
    });

    it('debería ser la última defensa también por el adaptador: un motivo forzado de otro estado no se escribe', async () => {
      // Arrange
      const [r] = await enTx((tx) =>
        repo.insertarSiNoExisten(
          [nuevoProgramado(citaId, new Date(AHORA.getTime() + 3 * HORA))],
          tx,
        ),
      );

      // Act — el tipo lo impide; un `as` o un dato de fuera, no.
      const errores = [
        await errorDe(
          enTx((tx) =>
            repo.anular(
              [r.id],
              tenantId,
              MotivoRecordatorio.SIN_CORREO as unknown as MotivoCancelacion,
              tx,
            ),
          ),
        ),
        await errorDe(
          enTx((tx) =>
            repo.anular(
              [r.id],
              tenantId,
              null as unknown as MotivoCancelacion,
              tx,
            ),
          ),
        ),
        await errorDe(
          enTx((tx) =>
            repo.omitir(
              r.id,
              tenantId,
              MotivoRecordatorio.REBOTE as unknown as MotivoOmision,
              tx,
            ),
          ),
        ),
        await errorDe(
          enTx((tx) =>
            repo.registrarFallo(
              r.id,
              tenantId,
              {
                motivo:
                  MotivoRecordatorio.CITA_TERMINAL as unknown as MotivoFallo,
                ultimoError: null,
                contarIntento: false,
              },
              tx,
            ),
          ),
        ),
      ];

      // Assert
      expect(errores).toEqual(
        Array(4).fill({
          code: '23514',
          constraint: 'CHK_recordatorios_motivo',
        }),
      );
      expect(await leer(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        motivo: null,
      });
    });

    it('debería rechazar en supresiones un valor que no es un SHA-256 hex y un motivo fuera del vocabulario', async () => {
      // Arrange
      const insertar = (hash: string, motivo: string) =>
        baseA.query(
          'INSERT INTO supresiones_correo (correo_hash, motivo) VALUES ($1, $2)',
          [hash, motivo],
        );
      const hash = calcularHashCorreo('paciente@correo.cl');

      // Act & Assert
      for (const valor of [
        'paciente@correo.cl',
        hash.toUpperCase(),
        hash.slice(1),
        `${hash}0`,
      ]) {
        expect(await errorDe(insertar(valor, 'rebote'))).toEqual({
          code: '23514',
          constraint: 'CHK_supresiones_correo_hash',
        });
      }
      expect(await errorDe(insertar(hash, 'otro'))).toEqual({
        code: '23514',
        constraint: 'CHK_supresiones_correo_motivo',
      });
    });

    it('debería rechazar en configuraciones otro canal y una segunda fila del mismo profesional', async () => {
      // Arrange
      const insertar = (canal: string) =>
        baseA.query(
          `INSERT INTO configuraciones_recordatorio
             (tenant_id, usuario_id, canal, antelaciones_min)
           VALUES ($1, $2, $3, '{1440,120}')`,
          [tenantId, usuarioId, canal],
        );

      // Act & Assert
      expect(await errorDe(insertar('sms'))).toEqual({
        code: '23514',
        constraint: 'CHK_configuraciones_recordatorio_canal',
      });
      await insertar('email');
      expect(await errorDe(insertar('email'))).toEqual({
        code: '23505',
        constraint: 'uq_configuracion_recordatorio_tenant_usuario',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('clave única parcial + ON CONFLICT DO NOTHING', () => {
    let citaId: string;
    let inicio: Date;

    beforeEach(async () => {
      ({ citaId, inicio } = await crearCita());
    });

    it('debería insertar una sola vez la misma clave, aunque llegue repetida en el mismo lote o en otra transacción', async () => {
      // Arrange
      const nuevo = nuevoProgramado(citaId, inicio);

      // Act
      const primera = await enTx((tx) =>
        repo.insertarSiNoExisten([nuevo, { ...nuevo }], tx),
      );
      const segunda = await enTx((tx) => repo.insertarSiNoExisten([nuevo], tx));

      // Assert
      expect(primera).toHaveLength(1);
      expect(segunda).toEqual([]);
      expect(await filas(citaId)).toHaveLength(1);
    });

    it('debería insertar claves distintas (otra antelación u otra hora planificada)', async () => {
      // Act
      const insertados = await enTx((tx) =>
        repo.insertarSiNoExisten(
          [
            nuevoProgramado(citaId, inicio, { antelacionMin: 120 }),
            nuevoProgramado(citaId, inicio, { antelacionMin: 1440 }),
            nuevoProgramado(citaId, inicio, {
              antelacionMin: 120,
              programadoPara: new Date(inicio.getTime() - 121 * MIN),
            }),
          ],
          tx,
        ),
      );

      // Assert
      expect(insertados).toHaveLength(3);
    });

    it('debería volver a insertar la clave después de anular (los cancelado no ocupan la clave)', async () => {
      // Arrange
      const nuevo = nuevoProgramado(citaId, inicio);
      const [original] = await enTx((tx) =>
        repo.insertarSiNoExisten([nuevo], tx),
      );

      // Act — anular y reinsertar dos veces (reagendar y volver a la hora)
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        const vivo = (await filas(citaId)).find(
          (r) => r.estado === EstadoRecordatorio.PROGRAMADO,
        );
        await enTx((tx) =>
          repo.anular(
            [vivo?.id ?? ''],
            tenantId,
            MotivoRecordatorio.REPROGRAMADO,
            tx,
          ),
        );
        const reinsertados = await enTx((tx) =>
          repo.insertarSiNoExisten([nuevo], tx),
        );
        expect(reinsertados).toHaveLength(1);
      }

      // Assert — dos cancelado con la MISMA clave conviven con un programado
      const lista = await filas(citaId);
      expect(lista.map((r) => r.estado).sort()).toEqual([
        EstadoRecordatorio.CANCELADO,
        EstadoRecordatorio.CANCELADO,
        EstadoRecordatorio.PROGRAMADO,
      ]);
      expect(lista.find((r) => r.id === original.id)?.motivo).toBe(
        MotivoRecordatorio.REPROGRAMADO,
      );
      expect(
        new Set(
          lista.map(
            (r) =>
              `${r.antelacionMin}/${r.programadoPara.toISOString()}/${r.canal}`,
          ),
        ).size,
      ).toBe(1);
    });

    it.each([
      ['enviado', null],
      ['entregado', null],
      ['fallido', 'rebote'],
      ['omitido', 'creada_tarde'],
    ])(
      'debería bloquear la clave un %s (no se recuerda dos veces la misma hora)',
      async (estado, motivo) => {
        // Arrange
        await baseA.query(
          `INSERT INTO recordatorios
             (tenant_id, cita_id, canal, antelacion_min, inicio_cita,
              programado_para, vence_en, estado, motivo, proximo_intento_en)
           VALUES ($1, $2, 'email', 120, $3, $4, $5, $6, $7, $4)`,
          [
            tenantId,
            citaId,
            inicio,
            new Date(inicio.getTime() - 120 * MIN),
            new Date(inicio.getTime() - 30 * MIN),
            estado,
            motivo,
          ],
        );

        // Act
        const insertados = await enTx((tx) =>
          repo.insertarSiNoExisten([nuevoProgramado(citaId, inicio)], tx),
        );

        // Assert
        expect(insertados).toEqual([]);
        expect(await filas(citaId)).toHaveLength(1);
      },
    );

    it('sin ON CONFLICT, el índice único rechaza el duplicado (uq_recordatorio_clave)', async () => {
      // Arrange
      await insertarCrudo(citaId, 'programado', null);

      // Act & Assert
      expect(await errorDe(insertarCrudo(citaId, 'programado', null))).toEqual({
        code: '23505',
        constraint: 'uq_recordatorio_clave',
      });
      await expect(
        insertarCrudo(citaId, 'cancelado', 'reprogramado'),
      ).resolves.toBeDefined();
    });

    it('debería esperar a la otra transacción que inserta la misma clave y no duplicar al confirmar ella', async () => {
      // Arrange — A inserta y NO confirma todavía
      const nuevo = nuevoProgramado(citaId, inicio);
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        const deA = await repo.insertarSiNoExisten([nuevo], a.manager);
        expect(deA).toHaveLength(1);

        // Act — B intenta la misma clave desde otro proceso: queda esperando
        const deB = observar(
          enTx((tx) => repo.insertarSiNoExisten([nuevo], tx), baseB),
        );
        await esperarBloqueadas();
        expect(deB.terminada()).toBe(false);
        await a.commitTransaction();

        // Assert — B ve el conflicto ya confirmado: no inserta nada
        expect(await deB.promesa).toEqual([]);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      expect(await filas(citaId)).toHaveLength(1);
    });

    it('debería insertar la de la otra transacción si la primera se revierte', async () => {
      // Arrange
      const nuevo = nuevoProgramado(citaId, inicio);
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        await repo.insertarSiNoExisten([nuevo], a.manager);
        const deB = observar(
          enTx((tx) => repo.insertarSiNoExisten([nuevo], tx), baseB),
        );
        await esperarBloqueadas();

        // Act
        await a.rollbackTransaction();

        // Assert
        expect(await deB.promesa).toHaveLength(1);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
      expect(await filas(citaId)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('reclamo con FOR UPDATE SKIP LOCKED', () => {
    it('debería saltar las filas que otra transacción tiene tomadas, sin esperar, y devolverlas a la cola si esta revierte', async () => {
      // Arrange — tres vencidos (en orden), uno futuro y uno ya enviado
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { citaId, inicio } = await crearCita();
        const [r] = await enTx((tx) =>
          repo.insertarSiNoExisten(
            [
              nuevoProgramado(citaId, inicio, {
                proximoIntentoEn: new Date(AHORA.getTime() - (3 - i) * MIN),
              }),
            ],
            tx,
          ),
        );
        ids.push(r.id);
      }
      const futuro = await crearCita();
      await enTx((tx) =>
        repo.insertarSiNoExisten(
          [
            nuevoProgramado(futuro.citaId, futuro.inicio, {
              proximoIntentoEn: new Date(AHORA.getTime() + MIN),
            }),
          ],
          tx,
        ),
      );
      const yaEnviado = await crearCita();
      await insertarCrudo(yaEnviado.citaId, 'enviado', null);

      const a = baseA.createQueryRunner();
      const b = baseB.createQueryRunner();
      const c = baseB.createQueryRunner();
      for (const qr of [a, b, c]) {
        await qr.connect();
        await qr.startTransaction();
      }
      try {
        // Act
        const deA = await repo.reclamarProximoProgramado(AHORA, a.manager);
        const deB = await repo.reclamarProximoProgramado(AHORA, b.manager);
        const deC = await repo.reclamarProximoProgramado(AHORA, c.manager);
        const deD = await enTx(
          (tx) => repo.reclamarProximoProgramado(AHORA, tx),
          baseB,
        );

        // Assert — cada uno el siguiente libre, en orden de proximo_intento_en
        expect([deA?.id, deB?.id, deC?.id]).toEqual(ids);
        expect(deD).toBeNull();

        // A confirma el envío; B revierte (p. ej. el proceso murió)
        await repo.registrarEnvio(
          ids[0],
          tenantId,
          { proveedor: 'falso', proveedorMensajeId: 'msg_a' },
          AHORA,
          a.manager,
        );
        await a.commitTransaction();
        await b.rollbackTransaction();

        // El de B vuelve a la cola; el enviado no
        const otraVez = await enTx(
          (tx) => repo.reclamarProximoProgramado(AHORA, tx),
          baseA,
        );
        expect(otraVez?.id).toBe(ids[1]);
      } finally {
        for (const qr of [a, b, c]) {
          if (qr.isTransactionActive) await qr.rollbackTransaction();
          await qr.release();
        }
      }
      expect((await leer(ids[0])).estado).toBe(EstadoRecordatorio.ENVIADO);
    });

    it('dos procesos de envío a la vez: cada recordatorio sale UNA sola vez', async () => {
      // Arrange — N recordatorios vencidos, cada uno de una cita distinta
      const N = 12;
      const ids: string[] = [];
      for (let i = 0; i < N; i++) {
        const { citaId, inicio } = await crearCita();
        const [r] = await enTx((tx) =>
          repo.insertarSiNoExisten(
            [
              nuevoProgramado(citaId, inicio, {
                proximoIntentoEn: new Date(AHORA.getTime() - (N - i) * 1_000),
              }),
            ],
            tx,
          ),
        );
        ids.push(r.id);
      }
      const envios = new Map<string, number>();
      const concurrencia = { actual: 0, maxima: 0 };
      const opciones: OpcionesEnvio = {
        tz: TZ,
        silencio: HORAS_SIN_ENVIO_POR_DEFECTO,
        exigirConsentimiento: false,
        maxDiarioPorTenant: 1_000,
        cuotaDiaria: 1_000,
        cuotaMensual: 3_000,
        umbralAvisoCuota: 0.8,
        maxReintentos: 5,
        antelacionesPredeterminadasMin: [1440, 120],
        pausaEntreEnviosMs: 0,
      };
      const proceso = (base: DataSource) =>
        new EnviarRecordatoriosService(
          {
            transacciones: new TypeOrmTransactionRunner(base),
            recordatorios: repo,
            configuraciones,
            supresiones,
            lector,
            canal: new CanalLento(envios, concurrencia, 25),
            bitacora: new BitacoraEnMemoria(),
          },
          opciones,
          () => AHORA,
        );

      // Act
      const [deA, deB] = await Promise.all([
        proceso(baseA).enviarLote({ lote: N }),
        proceso(baseB).enviarLote({ lote: N }),
      ]);

      // Assert — nadie envió dos veces ni se saltó ninguno
      expect([...envios.keys()].sort()).toEqual(
        ids.map((id) => `recordatorio/${id}`).sort(),
      );
      expect([...envios.values()].every((veces) => veces === 1)).toBe(true);
      expect(deA.enviados + deB.enviados).toBe(N);
      // Los dos trabajaron, y A LA VEZ (sin SKIP LOCKED el segundo esperaría)
      expect(deA.enviados).toBeGreaterThan(0);
      expect(deB.enviados).toBeGreaterThan(0);
      expect(concurrencia.maxima).toBe(2);
      for (const id of ids) {
        expect(await leer(id)).toMatchObject({
          estado: EstadoRecordatorio.ENVIADO,
          intentos: 1,
          enviadoEn: AHORA,
          proveedorMensajeId: `msg_recordatorio/${id}`,
        });
      }
      // Un tercer tick no encuentra nada
      expect(await proceso(baseA).enviarLote({ lote: N })).toMatchObject({
        procesados: 0,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('candado consultivo por cita', () => {
    it('debería serializar la misma cita entre dos conexiones sin hacer esperar a otra cita', async () => {
      // Arrange
      const cita1 = randomUUID();
      const cita2 = randomUUID();
      const a = baseA.createQueryRunner();
      await a.connect();
      await a.startTransaction();
      try {
        await repo.bloquearCitaParaReconciliar(cita1, a.manager);

        // Act — otro proceso pide la MISMA cita…
        const misma = observar(
          enTx((tx) => repo.bloquearCitaParaReconciliar(cita1, tx), baseB),
        );
        await esperarBloqueadas();
        // …y otra cita, mientras tanto
        const inicioOtra = Date.now();
        await enTx((tx) => repo.bloquearCitaParaReconciliar(cita2, tx), baseB);
        const demoraOtra = Date.now() - inicioOtra;

        // Assert
        expect(demoraOtra).toBeLessThan(2_000);
        await esperar(100);
        expect(misma.terminada()).toBe(false);
        const [{ modo }] = await baseA.query<{ modo: string }[]>(
          `SELECT l.mode AS modo
             FROM pg_locks l
             JOIN pg_stat_activity s ON s.pid = l.pid
            WHERE l.locktype = 'advisory' AND NOT l.granted
              AND s.datname = current_database()`,
        );
        expect(modo).toBe('ExclusiveLock');

        // El candado es de TRANSACCIÓN: al confirmar A, B sigue
        await a.commitTransaction();
        await misma.promesa;
        expect(misma.terminada()).toBe(true);
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        await a.release();
      }
    });

    it('debería soltarse también al revertir y no quedar tomado fuera de la transacción', async () => {
      // Arrange
      const cita = randomUUID();
      await expect(
        enTx(async (tx) => {
          await repo.bloquearCitaParaReconciliar(cita, tx);
          throw new Error('revertir');
        }),
      ).rejects.toThrow('revertir');

      // Act & Assert — otra conexión lo toma enseguida
      await enTx((tx) => repo.bloquearCitaParaReconciliar(cita, tx), baseB);
      const [{ n }] = await baseA.query<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_locks
          WHERE locktype = 'advisory'
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      expect(n).toBe(0);
    });

    it('debería exigir transacción (sin ella el candado se soltaría al instante)', async () => {
      await expect(
        repo.bloquearCitaParaReconciliar(randomUUID(), undefined),
      ).rejects.toThrow(/requiere una transacción/);
    });

    it('dos reconciliaciones simultáneas de la misma cita, desde dos procesos, dejan un solo juego de recordatorios', async () => {
      // Arrange — cita en 3 días, con la configuración predeterminada
      const { citaId } = await crearCita({
        inicio: new Date(AHORA.getTime() + 3 * 24 * HORA),
      });
      const reconciliacion = new ReconciliarRecordatoriosService(
        repo,
        configuraciones,
        lector,
        {
          parametros: {
            tz: TZ,
            silencio: HORAS_SIN_ENVIO_POR_DEFECTO,
            margenMinimoMin: 30,
            antelacionMinimaTardiaMin: 60,
          },
          antelacionesPredeterminadasMin: [1440, 120],
        },
        () => AHORA,
      );

      // Act — cuatro a la vez, repartidas entre los dos procesos
      const resultados = await Promise.all(
        [baseA, baseB, baseA, baseB].map((base) =>
          enTx(
            (tx) => reconciliacion.reconciliarCita(citaId, tenantId, tx),
            base,
          ),
        ),
      );

      // Assert — solo UNA insertó; las demás ya vieron lo existente
      expect(resultados.map((r) => r.insertados.length).sort()).toEqual([
        0, 0, 0, 2,
      ]);
      const lista = await filas(citaId);
      expect(lista.map((r) => [r.antelacionMin, r.estado])).toEqual([
        [1440, EstadoRecordatorio.PROGRAMADO],
        [120, EstadoRecordatorio.PROGRAMADO],
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('supresiones por hash', () => {
    const CORREO = ' Paciente.Suprimido@Correo.CL ';

    it('debería guardar solo el hash del correo normalizado, igual al de SQL, y encontrarlo con cualquier forma de la dirección', async () => {
      // Arrange
      const hash = calcularHashCorreo(CORREO);

      // Act
      const agregada = await enTx((tx) =>
        supresiones.agregar(
          {
            correoHash: hash,
            motivo: MotivoSupresion.REBOTE,
            origenRecordatorioId: null,
          },
          tx,
        ),
      );

      // Assert
      expect(agregada).toBe(true);
      expect(
        await enTx((tx) =>
          supresiones.existe(
            calcularHashCorreo('paciente.suprimido@correo.cl'),
            tx,
          ),
        ),
      ).toBe(true);
      expect(
        await enTx((tx) =>
          supresiones.existe(calcularHashCorreo('otra@correo.cl'), tx),
        ),
      ).toBe(false);
      // El equivalente SQL documentado en hash-correo.ts da lo mismo
      const [{ sql }] = await baseA.query<{ sql: string }[]>(
        `SELECT encode(sha256(convert_to(lower(btrim($1)), 'UTF8')), 'hex') AS sql`,
        [CORREO],
      );
      expect(sql).toBe(hash);
      // En la tabla no hay ninguna dirección en claro
      const guardadas = await baseA.query<{ correo_hash: string }[]>(
        'SELECT correo_hash FROM supresiones_correo',
      );
      expect(guardadas).toEqual([{ correo_hash: hash }]);
      expect(JSON.stringify(guardadas)).not.toMatch(/@|correo\.cl/i);
    });

    it('debería ser idempotente: la segunda vez no agrega y conserva el primer motivo', async () => {
      // Arrange
      const hash = calcularHashCorreo(CORREO);
      const origen = randomUUID();
      await enTx((tx) =>
        supresiones.agregar(
          {
            correoHash: hash,
            motivo: MotivoSupresion.REBOTE,
            origenRecordatorioId: origen,
          },
          tx,
        ),
      );

      // Act
      const otra = await enTx((tx) =>
        supresiones.agregar(
          {
            correoHash: hash,
            motivo: MotivoSupresion.QUEJA,
            origenRecordatorioId: null,
          },
          tx,
        ),
      );

      // Assert
      expect(otra).toBe(false);
      expect(
        await baseA.query(
          'SELECT motivo, origen_recordatorio_id FROM supresiones_correo',
        ),
      ).toEqual([{ motivo: 'rebote', origen_recordatorio_id: origen }]);
    });

    it('dos procesos suprimiendo la misma dirección a la vez: una fila, un solo true', async () => {
      // Arrange
      const hash = calcularHashCorreo(CORREO);
      const agregar = (base: DataSource, motivo: MotivoSupresion) =>
        enTx(
          (tx) =>
            supresiones.agregar(
              { correoHash: hash, motivo, origenRecordatorioId: null },
              tx,
            ),
          base,
        );

      // Act
      const resultados = await Promise.all([
        agregar(baseA, MotivoSupresion.REBOTE),
        agregar(baseB, MotivoSupresion.QUEJA),
        agregar(baseA, MotivoSupresion.QUEJA),
      ]);

      // Assert
      expect(resultados.filter(Boolean)).toHaveLength(1);
      const [{ n }] = await baseA.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM supresiones_correo',
      );
      expect(n).toBe(1);
    });

    it('debería rechazar una dirección en claro ANTES de tocar la base, sin repetirla en el error', async () => {
      // Act
      const error = await enTx((tx) =>
        supresiones.agregar(
          {
            correoHash: 'paciente@correo.cl',
            motivo: MotivoSupresion.REBOTE,
            origenRecordatorioId: null,
          },
          tx,
        ),
      ).catch((e: unknown) => e as Error);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('paciente@correo.cl');
      const [{ n }] = await baseA.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM supresiones_correo',
      );
      expect(n).toBe(0);
      await expect(
        enTx((tx) => supresiones.existe('paciente@correo.cl', tx)),
      ).rejects.toThrow(/hash SHA-256/);
    });
  });

  // ---------------------------------------------------------------------------
  describe('registrarEventoEntrega (monótono)', () => {
    const T1 = new Date(AHORA.getTime() + MIN);
    const T2 = new Date(AHORA.getTime() + 2 * MIN);
    const T3 = new Date(AHORA.getTime() + 3 * MIN);

    const evento = (
      tipo: TipoEventoEntrega,
      ocurridoEn: Date,
      proveedorMensajeId: string | null = 'msg_1',
    ) => ({ tipo, proveedor: 'resend', proveedorMensajeId, ocurridoEn });

    const aplicar = (
      id: string | null,
      tipo: TipoEventoEntrega,
      ocurridoEn: Date,
      proveedorMensajeId: string | null = 'msg_1',
      base: DataSource = baseA,
    ) =>
      enTx(
        (tx) =>
          repo.registrarEventoEntrega(
            { recordatorioId: id, proveedorMensajeId },
            evento(tipo, ocurridoEn, proveedorMensajeId),
            tx,
          ),
        base,
      );

    /** Un recordatorio ya `enviado` (proveedor aceptó a AHORA, id msg_1). */
    const enviado = async (
      proveedorMensajeId: string | null = 'msg_1',
    ): Promise<string> => {
      const { citaId, inicio } = await crearCita();
      const [r] = await enTx((tx) =>
        repo.insertarSiNoExisten([nuevoProgramado(citaId, inicio)], tx),
      );
      await enTx((tx) =>
        repo.registrarEnvio(
          r.id,
          tenantId,
          { proveedor: 'resend', proveedorMensajeId },
          AHORA,
          tx,
        ),
      );
      return r.id;
    };

    it('enviado → entregado una vez; repetirlo o un rebote/fallo posterior no lo hacen retroceder', async () => {
      // Arrange
      const id = await enviado();

      // Act
      const primero = await aplicar(id, TipoEventoEntrega.ENTREGADO, T1);
      const tras = await leer(id);
      const repetido = await aplicar(id, TipoEventoEntrega.ENTREGADO, T2);
      const rebote = await aplicar(id, TipoEventoEntrega.REBOTADO, T3);
      const fallo = await aplicar(id, TipoEventoEntrega.RECHAZADO, T3);

      // Assert
      expect(primero.aplicado).toBe(true);
      expect(tras).toMatchObject({
        estado: EstadoRecordatorio.ENTREGADO,
        entregadoEn: T1,
        enviadoEn: AHORA,
        motivo: null,
      });
      for (const r of [repetido, rebote, fallo]) {
        expect(r.aplicado).toBe(false);
        expect(r.recordatorio?.estado).toBe(EstadoRecordatorio.ENTREGADO);
      }
      // Ni siquiera tocó actualizado_en
      expect(await leer(id)).toEqual(tras);
    });

    it('queja: fija queja_en UNA vez y no cambia el estado', async () => {
      // Arrange
      const id = await enviado();
      await aplicar(id, TipoEventoEntrega.ENTREGADO, T1);

      // Act
      const primera = await aplicar(id, TipoEventoEntrega.QUEJA, T2);
      const segunda = await aplicar(id, TipoEventoEntrega.QUEJA, T3);

      // Assert
      expect(primera.aplicado).toBe(true);
      expect(segunda.aplicado).toBe(false);
      expect(await leer(id)).toMatchObject({
        estado: EstadoRecordatorio.ENTREGADO,
        quejaEn: T2,
      });
    });

    it('enviado → fallido (rebote); un entregado posterior no lo revive', async () => {
      // Arrange
      const id = await enviado();

      // Act
      const rebote = await aplicar(id, TipoEventoEntrega.REBOTADO, T1);
      const tarde = await aplicar(id, TipoEventoEntrega.ENTREGADO, T2);
      const otroRebote = await aplicar(id, TipoEventoEntrega.REBOTADO, T3);

      // Assert
      expect([rebote.aplicado, tarde.aplicado, otroRebote.aplicado]).toEqual([
        true,
        false,
        false,
      ]);
      expect(await leer(id)).toMatchObject({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.REBOTE,
        entregadoEn: null,
      });
    });

    it('enviado → fallido (rechazado) con email.failed', async () => {
      const id = await enviado();
      await aplicar(id, TipoEventoEntrega.RECHAZADO, T1);
      expect(await leer(id)).toMatchObject({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.RECHAZADO,
      });
    });

    it('programado (caída tras la aceptación) + entregado → entregado, completando enviado_en y el id del mensaje', async () => {
      // Arrange
      const { citaId, inicio } = await crearCita();
      const [r] = await enTx((tx) =>
        repo.insertarSiNoExisten([nuevoProgramado(citaId, inicio)], tx),
      );

      // Act
      const resultado = await aplicar(
        r.id,
        TipoEventoEntrega.ENTREGADO,
        T1,
        're_123',
      );

      // Assert
      expect(resultado.aplicado).toBe(true);
      expect(await leer(r.id)).toMatchObject({
        estado: EstadoRecordatorio.ENTREGADO,
        enviadoEn: T1,
        entregadoEn: T1,
        proveedor: 'resend',
        proveedorMensajeId: 're_123',
      });
      // …y ya no está en la cola del envío
      expect(
        await enTx((tx) => repo.reclamarProximoProgramado(AHORA, tx)),
      ).toBeNull();
    });

    it.each([
      ['cancelado', 'reprogramado'],
      ['omitido', 'sin_correo'],
      ['fallido', 'vencido'],
    ])('un %s no avanza con ningún evento', async (estado, motivo) => {
      // Arrange
      const { citaId } = await crearCita();
      await insertarCrudo(citaId, estado, motivo);
      const [{ id }] = await baseA.query<{ id: string }[]>(
        'SELECT id FROM recordatorios WHERE cita_id = $1',
        [citaId],
      );
      const antes = await leer(id);

      // Act
      const resultados = [
        await aplicar(id, TipoEventoEntrega.ENTREGADO, T1),
        await aplicar(id, TipoEventoEntrega.REBOTADO, T1),
        await aplicar(id, TipoEventoEntrega.RECHAZADO, T1),
      ];

      // Assert
      expect(resultados.map((r) => r.aplicado)).toEqual([false, false, false]);
      expect(await leer(id)).toEqual(antes);
    });

    it('email.sent completa el id del mensaje solo si faltaba', async () => {
      // Arrange — `posible_duplicado`: enviado sin id
      const id = await enviado(null);

      // Act
      const primero = await aplicar(id, TipoEventoEntrega.ENVIADO, T1, 're_a');
      const segundo = await aplicar(id, TipoEventoEntrega.ENVIADO, T2, 're_b');

      // Assert
      expect([primero.aplicado, segundo.aplicado]).toEqual([true, false]);
      expect(await leer(id)).toMatchObject({
        estado: EstadoRecordatorio.ENVIADO,
        proveedorMensajeId: 're_a',
      });
    });

    it('sin etiqueta (o con una que no es un UUID o no existe) encuentra la fila por el id del mensaje; un id desconocido no toca nada', async () => {
      // Arrange
      const id = await enviado('re_buscado');

      // Act
      const sinEtiqueta = await aplicar(
        null,
        TipoEventoEntrega.QUEJA,
        T1,
        're_buscado',
      );
      const etiquetaRota = await aplicar(
        'no-es-uuid',
        TipoEventoEntrega.ENTREGADO,
        T2,
        're_buscado',
      );
      const desconocido = await aplicar(
        randomUUID(),
        TipoEventoEntrega.ENTREGADO,
        T2,
        're_que_no_existe',
      );

      // Assert
      expect(sinEtiqueta).toMatchObject({ aplicado: true });
      expect(sinEtiqueta.recordatorio?.id).toBe(id);
      expect(etiquetaRota).toMatchObject({ aplicado: true });
      expect(desconocido).toEqual({ recordatorio: null, aplicado: false });
      expect(await leer(id)).toMatchObject({
        estado: EstadoRecordatorio.ENTREGADO,
        quejaEn: T1,
      });
    });

    it('si un envío en curso tiene la fila tomada, el webhook ESPERA al commit y se aplica sobre el estado confirmado', async () => {
      // Arrange — el proceso de envío reclamó la fila y está "llamando al proveedor"
      const { citaId, inicio } = await crearCita();
      const [r] = await enTx((tx) =>
        repo.insertarSiNoExisten(
          [
            nuevoProgramado(citaId, inicio, {
              proximoIntentoEn: new Date(AHORA.getTime() - MIN),
            }),
          ],
          tx,
        ),
      );
      const envio = baseA.createQueryRunner();
      await envio.connect();
      await envio.startTransaction();
      try {
        const tomada = await repo.reclamarProximoProgramado(
          AHORA,
          envio.manager,
        );
        expect(tomada?.id).toBe(r.id);

        // Act — llega el `delivered` antes del commit del envío
        const webhook = observar(
          aplicar(r.id, TipoEventoEntrega.ENTREGADO, T1, 'msg_1', baseB),
        );
        await esperarBloqueadas();
        expect(webhook.terminada()).toBe(false);
        await repo.registrarEnvio(
          r.id,
          tenantId,
          { proveedor: 'resend', proveedorMensajeId: 'msg_1' },
          AHORA,
          envio.manager,
        );
        await envio.commitTransaction();

        // Assert — se aplicó sobre `enviado` y conservó el enviado_en del envío
        expect((await webhook.promesa).aplicado).toBe(true);
      } finally {
        if (envio.isTransactionActive) await envio.rollbackTransaction();
        await envio.release();
      }
      expect(await leer(r.id)).toMatchObject({
        estado: EstadoRecordatorio.ENTREGADO,
        enviadoEn: AHORA,
        entregadoEn: T1,
        intentos: 1,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('contadores (cuota, fusible por tenant y tasa de fallo)', () => {
    it('cuentan enviado_en en [desde, hasta), por tenant cuando corresponde', async () => {
      // Arrange
      const sembrarEnviado = async (tenant: string, enviadoEn: Date) => {
        const { citaId, inicio } = await crearCita({ tenant });
        const [r] = await enTx((tx) =>
          repo.insertarSiNoExisten(
            [nuevoProgramado(citaId, inicio, { tenant })],
            tx,
          ),
        );
        await enTx((tx) =>
          repo.registrarEnvio(
            r.id,
            tenant,
            { proveedor: 'resend', proveedorMensajeId: null },
            enviadoEn,
            tx,
          ),
        );
      };
      const desde = AHORA;
      const hasta = new Date(AHORA.getTime() + HORA);
      await sembrarEnviado(tenantId, desde); // dentro (borde inferior)
      await sembrarEnviado(tenantId, new Date(hasta.getTime() - 1)); // dentro
      await sembrarEnviado(tenantId, hasta); // fuera (borde superior)
      await sembrarEnviado(otroTenantId, desde); // dentro, otro tenant

      // Act
      // (en serie: una transacción es UNA conexión)
      const [global, delTenant, delOtro] = await enTx(async (tx) => [
        await repo.contarEnviadosEntre(desde, hasta, tx),
        await repo.contarEnviadosDeTenantEntre(tenantId, desde, hasta, tx),
        await repo.contarEnviadosDeTenantEntre(otroTenantId, desde, hasta, tx),
      ]);

      // Assert
      expect([global, delTenant, delOtro]).toEqual([3, 2, 1]);
    });

    it('la tasa de fallo cuenta solo entregados y fallidos (no cancelados ni omitidos)', async () => {
      // Arrange
      const { citaId } = await crearCita();
      await insertarCrudo(citaId, 'entregado', null, { antelacionMin: 1 });
      await insertarCrudo(citaId, 'fallido', 'rebote', { antelacionMin: 2 });
      await insertarCrudo(citaId, 'fallido', 'vencido', { antelacionMin: 3 });
      await insertarCrudo(citaId, 'cancelado', 'reprogramado', {
        antelacionMin: 4,
      });
      await insertarCrudo(citaId, 'omitido', 'sin_correo', {
        antelacionMin: 5,
      });
      const [{ ahora }] = await baseA.query<{ ahora: Date }[]>(
        'SELECT now() AS ahora',
      );

      // Act
      const conteo = await enTx((tx) =>
        repo.contarDesenlacesEntre(
          new Date(ahora.getTime() - HORA),
          new Date(ahora.getTime() + HORA),
          tx,
        ),
      );

      // Assert
      expect(conteo).toEqual({ entregados: 1, fallidos: 2 });
    });
  });

  // ---------------------------------------------------------------------------
  describe('lector SQL de citas (solo lectura)', () => {
    it('obtenerDatosEnvio: filtra por tenant y trata un correo en blanco como ausente', async () => {
      // Arrange
      const conCorreo = await crearCita({ correo: 'Paciente@Correo.cl' });
      const enBlanco = await crearCita({ correo: '   ' });
      const sinCorreo = await crearCita({ correo: null });

      // Act
      const [datos, otroTenant, blanco, nulo] = await enTx(async (tx) => [
        await lector.obtenerDatosEnvio(conCorreo.citaId, tenantId, tx),
        await lector.obtenerDatosEnvio(conCorreo.citaId, otroTenantId, tx),
        await lector.obtenerDatosEnvio(enBlanco.citaId, tenantId, tx),
        await lector.obtenerDatosEnvio(sinCorreo.citaId, tenantId, tx),
      ]);

      // Assert
      expect(datos).toMatchObject({
        cita: { id: conCorreo.citaId, vigente: true, estado: 'pendiente' },
        paciente: { correo: 'Paciente@Correo.cl', consentimiento: true },
        profesional: { nombreCompleto: 'Dra. Integración' },
        organizacion: { nombre: 'Clínica Recordatorios' },
      });
      expect(otroTenant).toBeNull();
      expect(blanco?.paciente.correo).toBeNull();
      expect(nulo?.paciente.correo).toBeNull();
    });

    it('listarVigentesSinRecordatorio (respaldo): solo vigentes del rango sin ninguna fila para su inicio ACTUAL, paginando por cursor', async () => {
      // Arrange
      const base = AHORA.getTime() + 24 * HORA;
      const sinNada1 = await crearCita({ inicio: new Date(base + 1 * HORA) });
      const sinNada2 = await crearCita({ inicio: new Date(base + 2 * HORA) });
      const conRecordatorio = await crearCita({
        inicio: new Date(base + 3 * HORA),
      });
      await enTx((tx) =>
        repo.insertarSiNoExisten(
          [nuevoProgramado(conRecordatorio.citaId, conRecordatorio.inicio)],
          tx,
        ),
      );
      // Reagendada: sus filas son de un inicio anterior → vuelve a aparecer
      const reagendada = await crearCita({ inicio: new Date(base + 4 * HORA) });
      await enTx((tx) =>
        repo.insertarSiNoExisten(
          [nuevoProgramado(reagendada.citaId, new Date(base + 5 * HORA))],
          tx,
        ),
      );
      // Cancelada sin recordatorios → no
      await crearCita({
        inicio: new Date(base + 6 * HORA),
        estado: EstadoCita.CANCELADA,
      });
      // Fuera del rango → no
      await crearCita({ inicio: new Date(base + 10 * 24 * HORA) });
      // Otro tenant (BARRIDO GLOBAL) → sí
      const deOtro = await crearCita({
        inicio: new Date(base + 7 * HORA),
        tenant: otroTenantId,
      });

      const consulta = {
        desde: AHORA,
        hasta: new Date(AHORA.getTime() + 8 * 24 * HORA),
        limite: 2,
      };

      // Act — dos páginas de 2
      const pagina1 = await enTx((tx) =>
        lector.listarVigentesSinRecordatorio(consulta, tx),
      );
      const ultima = pagina1[pagina1.length - 1];
      const pagina2 = await enTx((tx) =>
        lector.listarVigentesSinRecordatorio(
          { ...consulta, despuesDe: { inicio: ultima.inicio, id: ultima.id } },
          tx,
        ),
      );

      // Assert
      expect([...pagina1, ...pagina2].map((c) => c.id)).toEqual([
        sinNada1.citaId,
        sinNada2.citaId,
        reagendada.citaId,
        deOtro.citaId,
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('transacción obligatoria', () => {
    it('ningún adaptador opera sin tx', async () => {
      const sinTx = undefined as TransactionContext;
      await expect(
        repo.reclamarProximoProgramado(AHORA, sinTx),
      ).rejects.toThrow(/requiere una transacción/);
      await expect(repo.insertarSiNoExisten([], sinTx)).rejects.toThrow(
        /requiere una transacción/,
      );
      await expect(
        supresiones.existe(calcularHashCorreo('a@b.cl'), sinTx),
      ).rejects.toThrow(/requiere una transacción/);
      await expect(
        lector.obtenerCita(randomUUID(), tenantId, sinTx),
      ).rejects.toThrow(/requiere una transacción/);
    });
  });
});
