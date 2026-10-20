import { TransactionContext } from '../../../shared/application/transaction-runner';
import {
  CandidatasGhosting,
  ConteoCandidatasGhosting,
  CriterioCierreGhosting,
} from '../domain/candidatas-ghosting';
import { CORTE_GHOSTING } from '../domain/cierre-ghosting';
import { Cita, EstadoCita, OrigenCita } from '../domain/cita.entity';
import { CierreGhostingService } from './cierre-ghosting.service';
import { CitasService } from './citas.service';

/**
 * Caso de uso del job G1 con dobles del puerto `CandidatasGhosting` y de
 * `CitasService` (solo `cerrarPorGhostingEnTx`). La consulta real, `SKIP
 * LOCKED` y las dos réplicas se prueban contra Postgres (testing-agent).
 */

const TZ = 'America/Santiago';
// 2026-10-20 10:00 en Chile (UTC-3): el límite es el 20 a las 00:00 local.
const AHORA = new Date('2026-10-20T13:00:00.000Z');
const LIMITE = new Date('2026-10-20T03:00:00.000Z');

const citaPendiente = (id: string, tenantId = 'tenant-1'): Cita =>
  Cita.reconstituir({
    id,
    inicio: new Date('2026-10-18T13:00:00.000Z'),
    duracionMin: 30,
    tipoConsulta: 'Control',
    estado: EstadoCita.PENDIENTE,
    tenantId,
    pacienteId: 'paciente-1',
    usuarioId: 'usuario-1',
    origen: OrigenCita.MANUAL,
    creadoEn: new Date('2026-10-01T00:00:00Z'),
    actualizadoEn: new Date('2026-10-01T00:00:00Z'),
  });

/** Cola de candidatas: cada `reclamarSiguiente` saca la primera no excluida. */
class CandidatasFalsas extends CandidatasGhosting {
  readonly reclamos: {
    criterio: CriterioCierreGhosting;
    excluir: string[];
    tx: TransactionContext;
  }[] = [];
  readonly conteos: CriterioCierreGhosting[] = [];
  falloReclamo: Error | null = null;

  constructor(
    private readonly cola: Cita[],
    private readonly conteo: ConteoCandidatasGhosting = {
      candidatas: 0,
      masAntigua: null,
    },
  ) {
    super();
  }

  reclamarSiguiente(
    criterio: CriterioCierreGhosting,
    excluir: readonly string[],
    tx: TransactionContext,
  ): Promise<Cita | null> {
    this.reclamos.push({ criterio, excluir: [...excluir], tx });
    if (this.falloReclamo) return Promise.reject(this.falloReclamo);
    const i = this.cola.findIndex((c) => !excluir.includes(c.id));
    if (i < 0) return Promise.resolve(null);
    // Como el SQL: una cita cerrada deja de ser candidata (se saca al cerrar).
    return Promise.resolve(this.cola[i]);
  }

  sacar(id: string): void {
    const i = this.cola.findIndex((c) => c.id === id);
    if (i >= 0) this.cola.splice(i, 1);
  }

  contar(criterio: CriterioCierreGhosting): Promise<ConteoCandidatasGhosting> {
    this.conteos.push(criterio);
    return Promise.resolve(this.conteo);
  }
}

describe('CierreGhostingService (job G1, US-07.01)', () => {
  let transacciones: { run: jest.Mock; abiertas: number };
  let cerrarPorGhostingEnTx: jest.Mock<Promise<Cita>, [Cita, unknown]>;
  let candidatas: CandidatasFalsas;

  const crear = (cola: Cita[], conteo?: ConteoCandidatasGhosting) => {
    candidatas = new CandidatasFalsas(cola, conteo);
    cerrarPorGhostingEnTx.mockImplementation((cita: Cita) => {
      candidatas.sacar(cita.id);
      return Promise.resolve(cita);
    });
    return new CierreGhostingService(
      transacciones,
      candidatas,
      { cerrarPorGhostingEnTx } as unknown as CitasService,
      TZ,
      () => AHORA,
    );
  };

  beforeEach(() => {
    transacciones = {
      abiertas: 0,
      run: jest.fn((trabajo: (tx: unknown) => Promise<unknown>) => {
        transacciones.abiertas++;
        return trabajo({ tx: transacciones.abiertas });
      }),
    };
    cerrarPorGhostingEnTx = jest.fn<Promise<Cita>, [Cita, unknown]>();
  });

  describe('apagado (CIERRE_GHOSTING_ACTIVO=false)', () => {
    it('no escribe: un solo contar, sin transacción, sin reclamar ni llamar a CitasService', async () => {
      // Arrange
      const masAntigua = new Date('2026-10-17T13:00:00.000Z');
      const servicio = crear([citaPendiente('c1')], {
        candidatas: 3,
        masAntigua,
      });

      // Act
      const resultado = await servicio.ejecutar({ activo: false, lote: 200 });

      // Assert
      expect(resultado).toEqual({
        modo: 'simulado',
        limite: LIMITE,
        candidatas: 3,
        masAntigua,
      });
      expect(candidatas.conteos).toEqual([
        { limite: LIMITE, corte: CORTE_GHOSTING },
      ]);
      expect(transacciones.run).not.toHaveBeenCalled();
      expect(candidatas.reclamos).toEqual([]);
      expect(cerrarPorGhostingEnTx).not.toHaveBeenCalled();
    });
  });

  describe('prendido (CIERRE_GHOSTING_ACTIVO=true)', () => {
    it('cierra todas las candidatas, una transacción por cita, con el límite de APP_TZ y el corte', async () => {
      // Arrange
      const servicio = crear([citaPendiente('c1'), citaPendiente('c2')]);

      // Act
      const resultado = await servicio.ejecutar({ activo: true, lote: 200 });

      // Assert — dos cierres + un reclamo vacío que termina el tick
      expect(resultado).toEqual({
        modo: 'activo',
        limite: LIMITE,
        cerradas: 2,
        interrumpido: false,
        fallidas: [],
      });
      expect(transacciones.run).toHaveBeenCalledTimes(3);
      expect(candidatas.reclamos.map((r) => r.criterio)).toEqual([
        { limite: LIMITE, corte: CORTE_GHOSTING },
        { limite: LIMITE, corte: CORTE_GHOSTING },
        { limite: LIMITE, corte: CORTE_GHOSTING },
      ]);
      // Reclamo y cierre en el MISMO tx
      expect(
        cerrarPorGhostingEnTx.mock.calls.map(([c, tx]) => [c.id, tx]),
      ).toEqual([
        ['c1', candidatas.reclamos[0].tx],
        ['c2', candidatas.reclamos[1].tx],
      ]);
    });

    it('se detiene en el lote aunque queden candidatas', async () => {
      // Arrange
      const servicio = crear([
        citaPendiente('c1'),
        citaPendiente('c2'),
        citaPendiente('c3'),
      ]);

      // Act
      const resultado = await servicio.ejecutar({ activo: true, lote: 2 });

      // Assert
      expect(resultado).toMatchObject({ cerradas: 2, interrumpido: false });
      expect(cerrarPorGhostingEnTx).toHaveBeenCalledTimes(2);
    });

    it('una cita que falla va a fallidas (solo el nombre del error), se excluye y el tick sigue', async () => {
      // Arrange
      const servicio = crear([
        citaPendiente('c1', 'tenant-a'),
        citaPendiente('c2', 'tenant-b'),
      ]);
      cerrarPorGhostingEnTx.mockImplementationOnce(() => {
        const error = new Error('detalle que no debe salir');
        error.name = 'ErrorDePrueba';
        return Promise.reject(error);
      });

      // Act
      const resultado = await servicio.ejecutar({ activo: true, lote: 200 });

      // Assert
      expect(resultado).toMatchObject({
        cerradas: 1,
        fallidas: [
          { citaId: 'c1', tenantId: 'tenant-a', error: 'ErrorDePrueba' },
        ],
      });
      expect(JSON.stringify(resultado)).not.toContain('detalle');
      // El reclamo siguiente ya excluye la que falló
      expect(candidatas.reclamos[1].excluir).toEqual(['c1']);
    });

    it('si falla el reclamo (infraestructura), el error sube', async () => {
      // Arrange
      const servicio = crear([citaPendiente('c1')]);
      candidatas.falloReclamo = new Error('conexión perdida');

      // Act & Assert
      await expect(
        servicio.ejecutar({ activo: true, lote: 200 }),
      ).rejects.toThrow('conexión perdida');
      expect(cerrarPorGhostingEnTx).not.toHaveBeenCalled();
    });

    it('continuar() en false corta el tick con interrumpido', async () => {
      // Arrange
      const servicio = crear([citaPendiente('c1'), citaPendiente('c2')]);
      let llamadas = 0;

      // Act — deja pasar una cita y corta antes de la segunda
      const resultado = await servicio.ejecutar({
        activo: true,
        lote: 200,
        continuar: () => llamadas++ < 1,
      });

      // Assert
      expect(resultado).toMatchObject({ cerradas: 1, interrumpido: true });
    });

    it('rechaza un lote que no es un entero ≥ 1', async () => {
      const servicio = crear([]);

      await expect(
        servicio.ejecutar({ activo: true, lote: 0 }),
      ).rejects.toBeInstanceOf(RangeError);
    });
  });
});
