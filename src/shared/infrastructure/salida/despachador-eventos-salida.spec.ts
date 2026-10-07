import { Logger } from '@nestjs/common';

import {
  EstadoEventoSalida,
  EventoSalida,
  EventosSalidaRepository,
  ResultadoPurgaSalida,
} from '../../application/eventos-salida.repository';
import {
  PoliticaReintentoSalida,
  agotoIntentos,
  calcularEsperaReintentoMs,
} from '../../application/politica-reintento-salida';
import {
  EventoEntregado,
  SuscriptorEventos,
} from '../../application/suscriptor-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../application/transaction-runner';
import {
  DespachadorEventosSalida,
  codigoDeFallo,
} from './despachador-eventos-salida';
import { RegistroSuscriptores } from './registro-suscriptores';

const AHORA = new Date('2026-10-01T12:00:00Z');
const POLITICA: PoliticaReintentoSalida = {
  maxIntentos: 3,
  esperaBaseMs: 10_000,
  esperaMaximaMs: 3_600_000,
  variacion: 0,
};

/** Transacción falsa: un objeto distinto por `run`, para comparar identidades. */
class TransaccionesFalsas extends TransactionRunner {
  readonly abiertas: TransactionContext[] = [];
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const tx = { n: this.abiertas.length + 1 };
    this.abiertas.push(tx);
    return work(tx);
  }
}

/** Outbox en memoria con la misma semántica que el adaptador TypeORM. */
class SalidaEnMemoria extends EventosSalidaRepository {
  readonly filas: EventoSalida[] = [];
  readonly llamadas: {
    metodo: string;
    tx: TransactionContext;
    args: unknown[];
  }[] = [];
  fallarReclamo?: Error;
  fallarRegistro?: Error;
  fallarMarcado?: Error;
  resolverPorOtro = false;

  agregar(nombre: string, extra: Partial<EventoSalida> = {}): EventoSalida {
    const fila: EventoSalida = {
      id: `evento-${this.filas.length + 1}`,
      nombre,
      tenantId: 'tenant-1',
      payload: { citaId: `cita-${this.filas.length + 1}` },
      ocurridoEn: new Date(AHORA.getTime() - 60_000 + this.filas.length),
      estado: EstadoEventoSalida.PENDIENTE,
      intentos: 0,
      proximoIntentoEn: new Date(AHORA.getTime() - 1_000),
      ultimoError: null,
      entregadoEn: null,
      creadoEn: AHORA,
      ...extra,
    };
    this.filas.push(fila);
    return fila;
  }

  insertar(): Promise<string> {
    throw new Error('no se usa');
  }

  reclamarProximoPendiente(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<EventoSalida | null> {
    this.llamadas.push({ metodo: 'reclamar', tx, args: [ahora] });
    if (this.fallarReclamo) return Promise.reject(this.fallarReclamo);
    const fila = this.filas.find(
      (f) =>
        f.estado === EstadoEventoSalida.PENDIENTE &&
        f.proximoIntentoEn.getTime() <= ahora.getTime(),
    );
    return Promise.resolve(fila ? { ...fila } : null);
  }

  marcarEntregado(
    id: string,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    this.llamadas.push({ metodo: 'marcar', tx, args: [id] });
    if (this.fallarMarcado) return Promise.reject(this.fallarMarcado);
    const fila = this.filas.find((f) => f.id === id);
    if (!fila || fila.estado !== EstadoEventoSalida.PENDIENTE) {
      return Promise.resolve(false);
    }
    fila.estado = EstadoEventoSalida.ENTREGADO;
    fila.entregadoEn = ahora;
    return Promise.resolve(true);
  }

  registrarFallo(
    id: string,
    error: string,
    ahora: Date,
    politica: PoliticaReintentoSalida,
    tx: TransactionContext,
  ): Promise<EventoSalida | null> {
    this.llamadas.push({ metodo: 'registrarFallo', tx, args: [id, error] });
    if (this.fallarRegistro) return Promise.reject(this.fallarRegistro);
    if (this.resolverPorOtro) return Promise.resolve(null);
    const fila = this.filas.find(
      (f) => f.id === id && f.estado === EstadoEventoSalida.PENDIENTE,
    );
    if (!fila) return Promise.resolve(null);
    const previos = fila.intentos;
    fila.intentos += 1;
    fila.ultimoError = error;
    if (agotoIntentos(fila.intentos, politica)) {
      fila.estado = EstadoEventoSalida.FALLIDO;
    } else {
      fila.proximoIntentoEn = new Date(
        ahora.getTime() + calcularEsperaReintentoMs(previos, politica),
      );
    }
    return Promise.resolve({ ...fila });
  }

  purgarEntregadosAntiguos(): Promise<ResultadoPurgaSalida> {
    throw new Error('no se usa');
  }

  txDe(metodo: string): TransactionContext[] {
    return this.llamadas.filter((l) => l.metodo === metodo).map((l) => l.tx);
  }
}

class SuscriptorQueAnota extends SuscriptorEventos {
  readonly recibidos: { evento: EventoEntregado; tx: TransactionContext }[] =
    [];
  constructor(readonly eventos: readonly string[]) {
    super();
  }
  manejar(evento: EventoEntregado, tx: TransactionContext): Promise<void> {
    this.recibidos.push({ evento, tx });
    return Promise.resolve();
  }
}

class SuscriptorQueFalla extends SuscriptorEventos {
  readonly eventos = ['CitaCreada'];
  constructor(private readonly error: Error) {
    super();
  }
  manejar(): Promise<void> {
    return Promise.reject(this.error);
  }
}

describe('DespachadorEventosSalida', () => {
  let salida: SalidaEnMemoria;
  let transacciones: TransaccionesFalsas;
  let registro: RegistroSuscriptores;
  let despachador: DespachadorEventosSalida;
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    salida = new SalidaEnMemoria();
    transacciones = new TransaccionesFalsas();
    registro = new RegistroSuscriptores();
    despachador = new DespachadorEventosSalida(
      transacciones,
      salida,
      registro,
      () => AHORA,
    );
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const despachar = (lote = 10, continuar?: () => boolean) =>
    despachador.despachar({ lote, politica: POLITICA, continuar });

  describe('sin suscriptores', () => {
    it('marca entregados todos los hechos listos, uno por transacción', async () => {
      salida.agregar('CitaCreada');
      salida.agregar('CitaReagendada');

      const resultado = await despachar();

      expect(resultado).toEqual({
        procesados: 2,
        entregados: 2,
        reintentos: 0,
        cartasMuertas: 0,
        resueltosPorOtro: 0,
      });
      expect(salida.filas.map((f) => f.estado)).toEqual([
        EstadoEventoSalida.ENTREGADO,
        EstadoEventoSalida.ENTREGADO,
      ]);
      // 2 hechos + 1 reclamo vacío que corta el lote.
      expect(transacciones.abiertas).toHaveLength(3);
      // Reclamo y marca de cada hecho van en la MISMA transacción.
      expect(salida.txDe('marcar')).toEqual(
        salida.txDe('reclamar').slice(0, 2),
      );
    });

    it('sin trabajo no hace nada', async () => {
      const resultado = await despachar();
      expect(resultado.procesados).toBe(0);
      expect(transacciones.abiertas).toHaveLength(1);
    });

    it('no toca los hechos cuyo próximo intento es futuro', async () => {
      salida.agregar('CitaCreada', {
        proximoIntentoEn: new Date(AHORA.getTime() + 60_000),
      });
      expect((await despachar()).procesados).toBe(0);
    });
  });

  describe('con suscriptores', () => {
    it('entrega a los interesados con el id del hecho y el MISMO tx del reclamo', async () => {
      const citas = new SuscriptorQueAnota(['CitaCreada']);
      const otros = new SuscriptorQueAnota(['SolicitudCitaRechazada']);
      registro.registrar(citas);
      registro.registrar(otros);
      const fila = salida.agregar('CitaCreada');

      await despachar();

      expect(citas.recibidos).toHaveLength(1);
      expect(citas.recibidos[0].evento).toEqual({
        id: fila.id,
        nombre: 'CitaCreada',
        tenantId: 'tenant-1',
        ocurridoEn: fila.ocurridoEn,
        payload: fila.payload,
      });
      expect(citas.recibidos[0].tx).toBe(salida.txDe('reclamar')[0]);
      expect(citas.recibidos[0].tx).toBe(salida.txDe('marcar')[0]);
      expect(otros.recibidos).toHaveLength(0);
      expect(salida.filas[0].estado).toBe(EstadoEventoSalida.ENTREGADO);
    });
  });

  describe('suscriptor que falla', () => {
    it('registra el fallo en OTRA transacción con un código corto, sin el mensaje', async () => {
      registro.registrar(
        new SuscriptorQueFalla(new TypeError('rut 12.345.678-5 inválido')),
      );
      salida.agregar('CitaCreada');
      salida.agregar('CitaConfirmada'); // nadie lo escucha: se entrega igual

      const resultado = await despachar();

      expect(resultado).toMatchObject({
        procesados: 2,
        entregados: 1,
        reintentos: 1,
        cartasMuertas: 0,
      });
      const [registroFallo] = salida.llamadas.filter(
        (l) => l.metodo === 'registrarFallo',
      );
      expect(registroFallo.args).toEqual([
        'evento-1',
        'SuscriptorQueFalla:TypeError',
      ]);
      expect(registroFallo.tx).not.toBe(salida.txDe('reclamar')[0]);
      // No se marcó entregado y queda para más tarde (10 s, sin variación).
      expect(salida.filas[0]).toMatchObject({
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 1,
        ultimoError: 'SuscriptorQueFalla:TypeError',
        proximoIntentoEn: new Date(AHORA.getTime() + 10_000),
      });
      expect(salida.txDe('marcar')).toHaveLength(1); // solo el segundo hecho
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'eventos_salida.reintento',
          eventoId: 'evento-1',
          nombre: 'CitaCreada',
          intentos: 1,
        }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('12.345.678-5');
      expect(error).not.toHaveBeenCalled();
    });

    it('incluye el código SQLSTATE si el error lo trae', async () => {
      registro.registrar(
        new SuscriptorQueFalla(
          Object.assign(new Error('duplicate key'), {
            name: 'QueryFailedError',
            code: '23505',
          }),
        ),
      );
      salida.agregar('CitaCreada');

      await despachar();

      expect(salida.filas[0].ultimoError).toBe(
        'SuscriptorQueFalla:QueryFailedError:23505',
      );
    });

    it('al agotar los intentos pasa a fallido y emite la alerta eventos_salida.fallido', async () => {
      registro.registrar(new SuscriptorQueFalla(new Error('x')));
      salida.agregar('CitaCreada', { intentos: POLITICA.maxIntentos - 1 });

      const resultado = await despachar();

      expect(resultado.cartasMuertas).toBe(1);
      expect(salida.filas[0].estado).toBe(EstadoEventoSalida.FALLIDO);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          alerta: 'eventos_salida.fallido',
          eventoId: 'evento-1',
          nombre: 'CitaCreada',
          intentos: POLITICA.maxIntentos,
          codigo: 'SuscriptorQueFalla:Error',
        }),
      );
    });

    it('si otro proceso ya lo resolvió (registrarFallo = null), sigue sin alertar', async () => {
      registro.registrar(new SuscriptorQueFalla(new Error('x')));
      salida.agregar('CitaCreada');
      salida.resolverPorOtro = true;

      const resultado = await despachar(1);

      expect(resultado).toMatchObject({ procesados: 1, resueltosPorOtro: 1 });
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('si falla la marca de entregado, el código es del despachador', async () => {
      salida.agregar('CitaCreada');
      salida.fallarMarcado = new Error('fallo al marcar');

      await despachar(1);

      expect(salida.filas[0].ultimoError).toBe(
        'DespachadorEventosSalida:Error',
      );
    });
  });

  describe('fallos de infraestructura (lanza: el tick falla)', () => {
    it('si no se puede reclamar', async () => {
      salida.fallarReclamo = new Error('connection refused');
      await expect(despachar()).rejects.toThrow('connection refused');
    });

    it('si no se puede registrar el fallo', async () => {
      registro.registrar(new SuscriptorQueFalla(new Error('x')));
      salida.agregar('CitaCreada');
      salida.fallarRegistro = new Error('base caída');

      await expect(despachar()).rejects.toThrow('base caída');
    });
  });

  describe('lote y apagado', () => {
    it('procesa como mucho EVENTOS_SALIDA_LOTE hechos por tick', async () => {
      for (let i = 0; i < 5; i++) salida.agregar('CitaCreada');

      const resultado = await despachar(3);

      expect(resultado.procesados).toBe(3);
      expect(
        salida.filas.filter((f) => f.estado === EstadoEventoSalida.PENDIENTE),
      ).toHaveLength(2);
    });

    it('deja de reclamar cuando continuar() devuelve false', async () => {
      for (let i = 0; i < 5; i++) salida.agregar('CitaCreada');
      let restantes = 2;

      const resultado = await despachar(10, () => restantes-- > 0);

      expect(resultado.procesados).toBe(2);
    });
  });

  describe('codigoDeFallo', () => {
    it.each([
      [
        new RangeError('mensaje con datos'),
        'DespachadorEventosSalida:RangeError',
      ],
      ['un string', 'DespachadorEventosSalida:Desconocido'],
      [
        { name: 'nombre con espacios y datos' },
        'DespachadorEventosSalida:Error',
      ],
      [
        { name: 'X', code: 'código raro con espacios' },
        'DespachadorEventosSalida:X',
      ],
    ])('%p → %s', (entrada, esperado) => {
      expect(codigoDeFallo(entrada)).toBe(esperado);
    });
  });
});
