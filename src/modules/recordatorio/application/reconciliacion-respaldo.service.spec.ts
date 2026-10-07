import { randomUUID } from 'node:crypto';

import { ContadorTransacciones } from '../../../../test/support/in-memory-repositories';
import {
  ConfiguracionRecordatorioRepositoryEnMemoria,
  LectorCitasEnMemoria,
  RecordatorioRepositoryEnMemoria,
  citaLeida,
} from '../../../../test/support/recordatorios-en-memoria';
import { CitaLeida } from '../domain/lector-citas';
import {
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import {
  ReconciliacionRespaldoService,
  codigoDeError,
} from './reconciliacion-respaldo.service';
import { ReconciliarRecordatoriosService } from './reconciliar-recordatorios.service';

const d = (iso: string): Date => new Date(iso);
const AHORA = d('2026-10-10T12:00:00Z');
const HORA_MS = 3_600_000;

describe('ReconciliacionRespaldoService (ADR-13 §6)', () => {
  let transacciones: ContadorTransacciones;
  let recordatorios: RecordatorioRepositoryEnMemoria;
  let lector: LectorCitasEnMemoria;
  let reconciliacion: ReconciliarRecordatoriosService;
  let respaldo: ReconciliacionRespaldoService;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  function crear(tamanoPagina = 2): ReconciliacionRespaldoService {
    return new ReconciliacionRespaldoService(
      transacciones,
      lector,
      reconciliacion,
      { margenMinimoMin: 30, tamanoPagina },
      () => AHORA,
    );
  }

  /** Un servicio real sobre los mismos dobles. */
  function crearReconciliacion(): ReconciliarRecordatoriosService {
    return new ReconciliarRecordatoriosService(
      recordatorios,
      configuraciones,
      lector,
      {
        parametros: {
          tz: 'America/Santiago',
          silencio: { desde: '21:00', hasta: '08:00' },
          margenMinimoMin: 30,
          antelacionMinimaTardiaMin: 60,
        },
        antelacionesPredeterminadasMin: [1440, 120],
      },
      () => AHORA,
    );
  }

  let configuraciones: ConfiguracionRecordatorioRepositoryEnMemoria;

  beforeEach(() => {
    transacciones = new ContadorTransacciones();
    recordatorios = new RecordatorioRepositoryEnMemoria(() => AHORA);
    configuraciones = new ConfiguracionRecordatorioRepositoryEnMemoria();
    lector = new LectorCitasEnMemoria(recordatorios);
    reconciliacion = crearReconciliacion();
    respaldo = crear();
  });

  /** Cita vigente a `horas` de AHORA, en el tenant dado. */
  function sembrar(
    horas: number,
    tenantId = tenantA,
    estado = 'pendiente',
  ): CitaLeida {
    return lector.sembrarCita(
      citaLeida({
        tenantId,
        usuarioId: randomUUID(),
        inicio: new Date(AHORA.getTime() + horas * HORA_MS),
        estado,
      }),
    );
  }

  const conRecordatorios = (citaId: string): number =>
    recordatorios.todos().filter((r) => r.citaId === citaId).length;

  it('pide [ahora + margen, ahora + 8 días) de a páginas, con cursor (inicio, id)', async () => {
    // Arrange — 5 citas en la ventana (página de 2 → 3 consultas)
    const citas = [26, 30, 50, 72, 100].map((h) => sembrar(h));
    const listar = jest.spyOn(lector, 'listarVigentesSinRecordatorio');

    // Act
    const resultado = await respaldo.ejecutar();

    // Assert
    expect(listar).toHaveBeenCalledTimes(3);
    const consultas = listar.mock.calls.map(([consulta]) => consulta);
    expect(consultas[0]).toEqual({
      desde: d('2026-10-10T12:30:00Z'),
      hasta: d('2026-10-18T12:00:00Z'),
      limite: 2,
      despuesDe: null,
    });
    expect(consultas[1].despuesDe).toEqual({
      inicio: citas[1].inicio,
      id: citas[1].id,
    });
    expect(consultas[2].despuesDe).toEqual({
      inicio: citas[3].inicio,
      id: citas[3].id,
    });
    expect(resultado).toEqual({
      paginas: 3,
      revisadas: 5,
      conCambios: 5,
      fallidas: [],
      interrumpido: false,
    });
    for (const cita of citas) {
      expect(conRecordatorios(cita.id)).toBe(2);
    }
  });

  it('con la última página llena hace una consulta más, que vuelve vacía', async () => {
    // Arrange
    [30, 40, 50, 60].forEach((h) => sembrar(h));

    // Act
    const resultado = await respaldo.ejecutar();

    // Assert
    expect(resultado.paginas).toBe(3);
    expect(resultado.revisadas).toBe(4);
  });

  it('reconcilia cada cita en SU transacción y con SU tenant', async () => {
    // Arrange
    const a = sembrar(30, tenantA);
    const b = sembrar(40, tenantB);
    const reconciliar = jest.spyOn(reconciliacion, 'reconciliarCita');

    // Act
    await crear(10).ejecutar();

    // Assert — 1 transacción para la página + 1 por cita
    expect(transacciones.abiertas).toBe(3);
    expect(
      reconciliar.mock.calls.map(([citaId, tenantId]) => [citaId, tenantId]),
    ).toEqual([
      [a.id, tenantA],
      [b.id, tenantB],
    ]);
    const txs = reconciliar.mock.calls.map(([, , tx]) => tx);
    expect(txs[0]).not.toBe(txs[1]);
  });

  it('ignora lo que el lector no trae: fuera de la ventana, no vigentes o ya con recordatorios', async () => {
    // Arrange
    const dentroDelMargen = sembrar(0.25); // 15 min
    const lejana = sembrar(24 * 9);
    const cancelada = sembrar(30, tenantA, 'cancelada');
    const conAlgo = sembrar(48);
    recordatorios.sembrar({
      tenantId: tenantA,
      citaId: conAlgo.id,
      antelacionMin: 120,
      inicioCita: conAlgo.inicio,
      programadoPara: new Date(conAlgo.inicio.getTime() - 2 * HORA_MS),
      estado: EstadoRecordatorio.CANCELADO,
      motivo: MotivoRecordatorio.REPROGRAMADO,
    });

    // Act
    const resultado = await respaldo.ejecutar();

    // Assert
    expect(resultado.revisadas).toBe(0);
    for (const cita of [dentroDelMargen, lejana, cancelada]) {
      expect(conRecordatorios(cita.id)).toBe(0);
    }
  });

  it('una cita que falla se registra (sin mensaje) y el barrido sigue', async () => {
    // Arrange
    const [a, b, c] = [30, 40, 50].map((h) => sembrar(h));
    const real = crearReconciliacion();
    jest
      .spyOn(reconciliacion, 'reconciliarCita')
      .mockImplementation((citaId, tenantId, tx) => {
        if (citaId === b.id) {
          const error = new Error('detalle con datos que no deben salir');
          error.name = 'QueryFailedError';
          return Promise.reject(Object.assign(error, { code: '40001' }));
        }
        return real.reconciliarCita(citaId, tenantId, tx);
      });

    // Act
    const resultado = await respaldo.ejecutar();

    // Assert
    expect(resultado.fallidas).toEqual([
      { citaId: b.id, tenantId: tenantA, error: 'QueryFailedError:40001' },
    ]);
    expect(resultado.revisadas).toBe(3);
    expect(conRecordatorios(a.id)).toBe(2);
    expect(conRecordatorios(c.id)).toBe(2);
  });

  it('si falla la lectura de una página, lanza (fallo de infraestructura)', async () => {
    // Arrange
    jest
      .spyOn(lector, 'listarVigentesSinRecordatorio')
      .mockRejectedValueOnce(new Error('connection refused'));

    // Act & Assert
    await expect(respaldo.ejecutar()).rejects.toThrow('connection refused');
  });

  it('con continuar() = false no consulta nada (apagado ordenado)', async () => {
    // Arrange
    sembrar(30);
    const listar = jest.spyOn(lector, 'listarVigentesSinRecordatorio');

    // Act
    const resultado = await respaldo.ejecutar({ continuar: () => false });

    // Assert
    expect(listar).not.toHaveBeenCalled();
    expect(resultado.interrumpido).toBe(true);
  });

  it('se corta entre citas si llega el apagado a mitad de página', async () => {
    // Arrange
    const [a, b] = [30, 40].map((h) => sembrar(h));
    let llamadas = 0;

    // Act — permite la página y la primera cita
    const resultado = await crear(10).ejecutar({
      continuar: () => ++llamadas <= 2,
    });

    // Assert
    expect(resultado).toMatchObject({ revisadas: 1, interrumpido: true });
    expect(conRecordatorios(a.id)).toBe(2);
    expect(conRecordatorios(b.id)).toBe(0);
  });

  it('una segunda pasada no encuentra nada: las citas ya tienen recordatorios', async () => {
    // Arrange
    [30, 40, 50].forEach((h) => sembrar(h));
    await respaldo.ejecutar();

    // Act
    const segunda = await respaldo.ejecutar();

    // Assert
    expect(segunda).toMatchObject({ paginas: 1, revisadas: 0 });
  });

  describe('codigoDeError', () => {
    it.each([
      [
        Object.assign(new Error('x'), {
          name: 'QueryFailedError',
          code: '23505',
        }),
        'QueryFailedError:23505',
      ],
      [new RangeError('x'), 'RangeError'],
      [
        Object.assign(new Error('x'), { name: 'con espacios y datos' }),
        'Error',
      ],
      ['texto suelto', 'Desconocido'],
      [null, 'Desconocido'],
    ])('%p → %s', (error, codigo) => {
      expect(codigoDeError(error)).toBe(codigo);
    });
  });
});
