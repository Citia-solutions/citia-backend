import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

import { typeOrmTestConfig } from '../../../../../test/typeorm-test.config';
import { EstadoEventoSalida } from '../../../application/eventos-salida.repository';
import {
  POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
  PoliticaReintentoSalida,
} from '../../../application/politica-reintento-salida';
import {
  EventoEntregado,
  SuscriptorEventos,
} from '../../../application/suscriptor-eventos';
import { TransactionContext } from '../../../application/transaction-runner';
import { TypeOrmTransactionRunner } from '../../typeorm-transaction-runner';
import { DespachadorEventosSalida } from '../despachador-eventos-salida';
import { EventoSalidaOrmEntity } from '../evento-salida.orm-entity';
import { PurgaEventosSalida } from '../purga-eventos-salida';
import { RegistroSuscriptores } from '../registro-suscriptores';
import {
  CLAVE_CANDADO_PURGA_SALIDA,
  TypeOrmEventosSalidaRepository,
} from '../typeorm-eventos-salida.repository';

/**
 * Despachador, reintentos y purga del outbox contra PostgreSQL real
 * (ADR-12 §3–§5, US-03 paso 6).
 *
 * Las piezas se arman a mano (sin SharedModule) para inyectar un reloj de
 * prueba: así se recorre la política de reintentos sin esperar de verdad.
 * Para simular dos procesos se usan DOS DataSource (dos pools) sobre la misma
 * base.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 */

const HECHO = 'HechoDePrueba';
const MS_POR_DIA = 86_400_000;

/** Política determinista (sin variación) y corta, para recorrerla entera. */
const POLITICA: PoliticaReintentoSalida = {
  maxIntentos: 3,
  esperaBaseMs: 10_000,
  esperaMaximaMs: 3_600_000,
  variacion: 0,
};

/** Tabla de trabajo de los suscriptores de prueba (ADR-12 §4 regla 4). */
const TABLA_TRABAJO = 'trabajo_suscriptor_prueba';

const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/** Reloj controlado: el despachador y la purga lo reciben inyectado. */
class RelojDePrueba {
  constructor(private actual: Date) {}

  readonly ahora = (): Date => new Date(this.actual.getTime());

  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

/** Escribe una fila en la tabla de trabajo con el `tx` del despachador. */
async function escribirTrabajo(
  tx: TransactionContext,
  eventoId: string,
  autor: string,
): Promise<void> {
  await (tx as EntityManager).query(
    `INSERT INTO ${TABLA_TRABAJO} (evento_id, autor) VALUES ($1, $2)`,
    [eventoId, autor],
  );
}

/**
 * Cuenta las entregas de cada hecho (compartido entre los dos "procesos"),
 * tarda un poco en cada una y deja su trabajo en la tabla con el `tx`.
 */
class SuscriptorContador extends SuscriptorEventos {
  readonly eventos = [HECHO];

  constructor(
    private readonly autor: string,
    private readonly entregas: Map<string, number>,
    private readonly concurrencia: { actual: number; maxima: number },
    private readonly demoraMs: number,
  ) {
    super();
  }

  async manejar(evento: EventoEntregado, tx: TransactionContext) {
    this.entregas.set(evento.id, (this.entregas.get(evento.id) ?? 0) + 1);
    this.concurrencia.actual++;
    this.concurrencia.maxima = Math.max(
      this.concurrencia.maxima,
      this.concurrencia.actual,
    );
    try {
      await esperar(this.demoraMs);
      await escribirTrabajo(tx, evento.id, this.autor);
    } finally {
      this.concurrencia.actual--;
    }
  }
}

/** Error cuyo MENSAJE trae datos personales: nunca deben llegar a la base. */
class ErrorProveedorCaido extends Error {
  constructor() {
    super('El proveedor rechazó a maria.perez@correo.cl (RUT 12.345.678-5)');
    this.name = 'ErrorProveedorCaido';
  }
}

class SuscriptorQueFalla extends SuscriptorEventos {
  readonly eventos = [HECHO];
  llamadas = 0;

  manejar(): Promise<void> {
    this.llamadas++;
    return Promise.reject(new ErrorProveedorCaido());
  }
}

/** Escribe con el `tx` recibido y termina bien. */
class SuscriptorQueEscribe extends SuscriptorEventos {
  readonly eventos = [HECHO];

  async manejar(evento: EventoEntregado, tx: TransactionContext) {
    await escribirTrabajo(tx, evento.id, 'escribe');
  }
}

/** Escribe con el `tx` recibido y DESPUÉS lanza. */
class SuscriptorQueEscribeYFalla extends SuscriptorEventos {
  readonly eventos = [HECHO];
  filasVistasAntesDeFallar = -1;

  async manejar(evento: EventoEntregado, tx: TransactionContext) {
    await escribirTrabajo(tx, evento.id, 'escribe-y-falla');
    const [{ n }] = await (tx as EntityManager).query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${TABLA_TRABAJO} WHERE evento_id = $1`,
      [evento.id],
    );
    this.filasVistasAntesDeFallar = n;
    throw new Error('falla después de escribir');
  }
}

/** Guarda el orden en que recibe los hechos. */
class SuscriptorQueAnota extends SuscriptorEventos {
  readonly eventos = [HECHO];
  readonly recibidos: EventoEntregado[] = [];

  manejar(evento: EventoEntregado): Promise<void> {
    this.recibidos.push(evento);
    return Promise.resolve();
  }
}

describe('DespachadorEventosSalida + PurgaEventosSalida (integration)', () => {
  let modulo: TestingModule;
  // Dos "procesos": cada uno con su propio pool de conexiones.
  let baseA: DataSource;
  let baseB: DataSource;
  const salida = new TypeOrmEventosSalidaRepository();
  let reloj: RelojDePrueba;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  const repoSalida = () => baseA.getRepository(EventoSalidaOrmEntity);
  const leer = (id: string) => repoSalida().findOneByOrFail({ id });

  const despachadorCon = (
    suscriptores: SuscriptorEventos[],
    base: DataSource = baseA,
  ): DespachadorEventosSalida => {
    const registro = new RegistroSuscriptores();
    suscriptores.forEach((s) => registro.registrar(s));
    return new DespachadorEventosSalida(
      new TypeOrmTransactionRunner(base),
      salida,
      registro,
      reloj.ahora,
    );
  };

  /** Publica `n` hechos como lo haría un caso de uso: con su transacción. */
  const publicarHechos = async (n: number): Promise<string[]> => {
    const runner = new TypeOrmTransactionRunner(baseA);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(
        await runner.run((tx) =>
          salida.insertar(
            {
              nombre: HECHO,
              tenantId: randomUUID(),
              ocurridoEn: new Date(reloj.ahora().getTime() - (n - i) * 1_000),
              payload: { indice: i },
            },
            tx,
          ),
        ),
      );
    }
    return ids;
  };

  const filasTrabajo = (): Promise<{ evento_id: string; autor: string }[]> =>
    baseA.query(`SELECT evento_id, autor FROM ${TABLA_TRABAJO}`);

  beforeAll(async () => {
    modulo = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(typeOrmTestConfig)],
    }).compile();
    baseA = modulo.get(DataSource);

    // El segundo proceso NO toca el esquema: ya lo dejó listo el primero.
    baseB = new DataSource({
      ...(typeOrmTestConfig as DataSourceOptions),
      synchronize: false,
      dropSchema: false,
    });
    await baseB.initialize();

    await baseA.query(
      `CREATE TABLE IF NOT EXISTS ${TABLA_TRABAJO} (
         evento_id uuid NOT NULL,
         autor varchar NOT NULL,
         PRIMARY KEY (evento_id, autor)
       )`,
    );
  });

  beforeEach(async () => {
    await baseA.query(`TRUNCATE eventos_salida, ${TABLA_TRABAJO}`);
    // Un minuto por delante del reloj de la base: los hechos recién
    // publicados (proximo_intento_en = now() de Postgres) ya están vencidos
    // aunque el reloj del contenedor y el del host difieran un poco.
    const [{ ahora }] = await baseA.query<{ ahora: Date }[]>(
      'SELECT now() AS ahora',
    );
    reloj = new RelojDePrueba(new Date(ahora.getTime() + 60_000));

    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await baseA.query(`DROP TABLE IF EXISTS ${TABLA_TRABAJO}`);
    await baseB.destroy();
    await modulo.close();
  });

  describe('entrega', () => {
    it('debería entregar en orden de ocurrido_en y marcar entregado con la hora del reloj', async () => {
      // Arrange
      const ids = await publicarHechos(3);
      const anotador = new SuscriptorQueAnota();
      const despachador = despachadorCon([anotador]);

      // Act
      const resultado = await despachador.despachar({
        lote: 10,
        politica: POLITICA,
      });

      // Assert
      expect(resultado).toEqual({
        procesados: 3,
        entregados: 3,
        reintentos: 0,
        cartasMuertas: 0,
        resueltosPorOtro: 0,
      });
      expect(anotador.recibidos.map((e) => e.id)).toEqual(ids);
      for (const id of ids) {
        const fila = await leer(id);
        expect(fila.estado).toBe(EstadoEventoSalida.ENTREGADO);
        expect(fila.entregadoEn?.getTime()).toBe(reloj.ahora().getTime());
        expect(fila.intentos).toBe(0);
      }
    });
  });

  describe('concurrencia (FOR UPDATE SKIP LOCKED)', () => {
    it('debería entregar cada hecho UNA sola vez cuando dos despachadores corren a la vez', async () => {
      // Arrange
      const N = 30;
      const ids = await publicarHechos(N);
      const entregas = new Map<string, number>();
      const concurrencia = { actual: 0, maxima: 0 };
      const despachadorA = despachadorCon(
        [new SuscriptorContador('A', entregas, concurrencia, 15)],
        baseA,
      );
      const despachadorB = despachadorCon(
        [new SuscriptorContador('B', entregas, concurrencia, 15)],
        baseB,
      );

      // Act
      const [resultadoA, resultadoB] = await Promise.all([
        despachadorA.despachar({ lote: N, politica: POLITICA }),
        despachadorB.despachar({ lote: N, politica: POLITICA }),
      ]);

      // Assert: nadie entregó dos veces ni se saltó ninguno.
      expect(entregas.size).toBe(N);
      expect([...entregas.values()].every((veces) => veces === 1)).toBe(true);
      expect(resultadoA.entregados + resultadoB.entregados).toBe(N);
      expect(resultadoA.reintentos + resultadoB.reintentos).toBe(0);
      // Los dos trabajaron, y A LA VEZ: cada uno con una fila distinta
      // bloqueada (sin SKIP LOCKED el segundo esperaría al primero).
      expect(resultadoA.entregados).toBeGreaterThan(0);
      expect(resultadoB.entregados).toBeGreaterThan(0);
      expect(concurrencia.maxima).toBe(2);

      // En la base: todos entregados y un trabajo por hecho.
      const filas = await repoSalida().find();
      expect(filas).toHaveLength(N);
      expect(
        filas.every((f) => f.estado === EstadoEventoSalida.ENTREGADO),
      ).toBe(true);
      const trabajos = await filasTrabajo();
      expect(trabajos.map((t) => t.evento_id).sort()).toEqual([...ids].sort());
      expect(new Set(trabajos.map((t) => t.autor))).toEqual(
        new Set(['A', 'B']),
      );
    });
  });

  describe('reintentos y carta muerta', () => {
    it('debería reintentar con espera creciente, guardar solo el código corto y pasar a fallido con alerta al agotar los intentos', async () => {
      // Arrange
      const [id] = await publicarHechos(1);
      const suscriptor = new SuscriptorQueFalla();
      const despachador = despachadorCon([suscriptor]);
      const despachar = () =>
        despachador.despachar({ lote: 10, politica: POLITICA });
      const CODIGO = 'SuscriptorQueFalla:ErrorProveedorCaido';

      // Act + Assert — 1.er fallo: espera la base (10 s).
      const t1 = reloj.ahora().getTime();
      expect(await despachar()).toMatchObject({ procesados: 1, reintentos: 1 });
      let fila = await leer(id);
      expect(fila).toMatchObject({
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 1,
        ultimoError: CODIGO,
        entregadoEn: null,
      });
      expect(fila.proximoIntentoEn.getTime()).toBe(t1 + 10_000);
      expect(warnLog).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'eventos_salida.reintento',
          eventoId: id,
          intentos: 1,
          codigo: CODIGO,
        }),
      );

      // No se reintenta antes de tiempo.
      reloj.avanzar(9_999);
      expect(await despachar()).toMatchObject({ procesados: 0 });
      expect(suscriptor.llamadas).toBe(1);

      // 2.º fallo, justo al vencer: la espera se duplica (20 s).
      reloj.avanzar(1);
      const t2 = reloj.ahora().getTime();
      expect(await despachar()).toMatchObject({ procesados: 1, reintentos: 1 });
      fila = await leer(id);
      expect(fila.intentos).toBe(2);
      expect(fila.estado).toBe(EstadoEventoSalida.PENDIENTE);
      expect(fila.proximoIntentoEn.getTime()).toBe(t2 + 20_000);

      reloj.avanzar(19_999);
      expect(await despachar()).toMatchObject({ procesados: 0 });

      // 3.er fallo = maxIntentos: carta muerta.
      reloj.avanzar(1);
      expect(await despachar()).toMatchObject({
        procesados: 1,
        reintentos: 0,
        cartasMuertas: 1,
      });
      fila = await leer(id);
      expect(fila).toMatchObject({
        estado: EstadoEventoSalida.FALLIDO,
        intentos: 3,
        ultimoError: CODIGO,
        entregadoEn: null,
      });
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({
          alerta: 'eventos_salida.fallido',
          eventoId: id,
          nombre: HECHO,
          intentos: 3,
          codigo: CODIGO,
        }),
      );

      // Ni la base ni los logs llevan el mensaje del error.
      const logs = JSON.stringify([warnLog.mock.calls, errorLog.mock.calls]);
      for (const texto of [fila.ultimoError ?? '', logs]) {
        expect(texto).not.toContain('maria.perez');
        expect(texto).not.toContain('12.345.678');
        expect(texto).not.toContain('rechazó');
      }

      // Un fallido no se vuelve a tomar.
      reloj.avanzar(10 * 3_600_000);
      expect(await despachar()).toMatchObject({ procesados: 0 });
      expect(suscriptor.llamadas).toBe(3);
    });

    it('con la política por defecto (variación 0.2) el primer reintento cae entre 8 s y 10 s', async () => {
      // Arrange
      const [id] = await publicarHechos(1);
      const despachador = despachadorCon([new SuscriptorQueFalla()]);
      const t = reloj.ahora().getTime();

      // Act
      await despachador.despachar({
        lote: 1,
        politica: POLITICA_REINTENTO_SALIDA_POR_DEFECTO,
      });

      // Assert
      const fila = await leer(id);
      expect(fila.estado).toBe(EstadoEventoSalida.PENDIENTE);
      expect(fila.intentos).toBe(1);
      const espera = fila.proximoIntentoEn.getTime() - t;
      expect(espera).toBeGreaterThanOrEqual(8_000);
      expect(espera).toBeLessThanOrEqual(10_000);
    });
  });

  describe('suscriptores que escriben con el tx recibido', () => {
    it('debería confirmar el trabajo del suscriptor junto con la marca de entregado', async () => {
      // Arrange
      const [id] = await publicarHechos(1);
      const despachador = despachadorCon([new SuscriptorQueEscribe()]);

      // Act
      await despachador.despachar({ lote: 1, politica: POLITICA });

      // Assert
      expect(await filasTrabajo()).toEqual([
        { evento_id: id, autor: 'escribe' },
      ]);
      expect((await leer(id)).estado).toBe(EstadoEventoSalida.ENTREGADO);
    });

    it('debería revertir lo que escribió el suscriptor cuando lanza después de escribir', async () => {
      // Arrange
      const [id] = await publicarHechos(1);
      const suscriptor = new SuscriptorQueEscribeYFalla();
      const despachador = despachadorCon([suscriptor]);

      // Act
      const resultado = await despachador.despachar({
        lote: 1,
        politica: POLITICA,
      });

      // Assert: la escritura existió dentro de la transacción…
      expect(suscriptor.filasVistasAntesDeFallar).toBe(1);
      // …y se revirtió con ella; el hecho sigue pendiente para reintentar.
      expect(resultado).toMatchObject({ entregados: 0, reintentos: 1 });
      expect(await filasTrabajo()).toEqual([]);
      expect(await leer(id)).toMatchObject({
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 1,
        ultimoError: 'SuscriptorQueEscribeYFalla:Error',
      });
    });

    it('debería revertir también lo escrito por OTRO suscriptor del mismo hecho que sí terminó bien', async () => {
      // Arrange: el primero escribe y termina; el segundo escribe y lanza.
      const [id] = await publicarHechos(1);
      const despachador = despachadorCon([
        new SuscriptorQueEscribe(),
        new SuscriptorQueEscribeYFalla(),
      ]);

      // Act
      await despachador.despachar({ lote: 1, politica: POLITICA });

      // Assert
      expect(await filasTrabajo()).toEqual([]);
      expect(await leer(id)).toMatchObject({
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 1,
        ultimoError: 'SuscriptorQueEscribeYFalla:Error',
      });
    });
  });

  describe('purga', () => {
    const RETENCION_DIAS = 14;

    /** Siembra una fila con estado y fechas a medida. */
    const sembrar = async (
      estado: EstadoEventoSalida,
      haceDias: number,
    ): Promise<string> => {
      const id = randomUUID();
      const instante = new Date(
        reloj.ahora().getTime() - haceDias * MS_POR_DIA,
      );
      await repoSalida().insert({
        id,
        nombre: HECHO,
        tenantId: randomUUID(),
        payload: {},
        ocurridoEn: instante,
        estado,
        intentos: estado === EstadoEventoSalida.FALLIDO ? 10 : 0,
        entregadoEn: estado === EstadoEventoSalida.ENTREGADO ? instante : null,
      });
      return id;
    };

    it('debería borrar solo los entregados más viejos que la retención, sin tocar pendientes ni fallidos', async () => {
      // Arrange
      const entregadoViejo = await sembrar(EstadoEventoSalida.ENTREGADO, 15);
      const entregadoEnElLimite = await sembrar(
        EstadoEventoSalida.ENTREGADO,
        RETENCION_DIAS,
      );
      const entregadoReciente = await sembrar(EstadoEventoSalida.ENTREGADO, 13);
      const pendienteViejo = await sembrar(EstadoEventoSalida.PENDIENTE, 30);
      const fallidoViejo = await sembrar(EstadoEventoSalida.FALLIDO, 30);
      const purga = new PurgaEventosSalida(
        new TypeOrmTransactionRunner(baseA),
        salida,
        reloj.ahora,
      );

      // Act
      const resultado = await purga.purgar(RETENCION_DIAS);

      // Assert
      expect(resultado).toEqual({ ejecutada: true, borrados: 1 });
      const quedan = (await repoSalida().find()).map((f) => f.id).sort();
      expect(quedan).toEqual(
        [
          entregadoEnElLimite,
          entregadoReciente,
          pendienteViejo,
          fallidoViejo,
        ].sort(),
      );
      expect(quedan).not.toContain(entregadoViejo);
    });

    it('no debería borrar nada mientras otro proceso tiene el candado consultivo de la purga', async () => {
      // Arrange: el "otro proceso" (baseB) toma el candado en su transacción.
      await sembrar(EstadoEventoSalida.ENTREGADO, 30);
      const purga = new PurgaEventosSalida(
        new TypeOrmTransactionRunner(baseA),
        salida,
        reloj.ahora,
      );
      const otro = baseB.createQueryRunner();
      await otro.connect();
      await otro.startTransaction();
      try {
        await otro.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          CLAVE_CANDADO_PURGA_SALIDA,
        ]);

        // Act
        const mientrasTanto = await purga.purgar(RETENCION_DIAS);

        // Assert
        expect(mientrasTanto).toEqual({ ejecutada: false, borrados: 0 });
        expect(await repoSalida().count()).toBe(1);
      } finally {
        await otro.rollbackTransaction();
        await otro.release();
      }

      // Al soltarse (fin de la transacción), la siguiente purga sí corre.
      expect(await purga.purgar(RETENCION_DIAS)).toEqual({
        ejecutada: true,
        borrados: 1,
      });
    });
  });
});
