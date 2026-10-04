import { randomUUID } from 'node:crypto';

import { ContadorTransacciones } from '../../../../test/support/in-memory-repositories';
import {
  LectorCitasEnMemoria,
  RecordatorioRepositoryEnMemoria,
  citaLeida,
} from '../../../../test/support/recordatorios-en-memoria';
import {
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import { CitaDeRecordatoriosNoEncontradaError } from './cita-de-recordatorios-no-encontrada.error';
import { ConsultarRecordatoriosService } from './consultar-recordatorios.service';

const INICIO = new Date('2026-10-14T13:30:00Z');

describe('ConsultarRecordatoriosService (ADR-13 §17)', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let transacciones: ContadorTransacciones;
  let recordatorios: RecordatorioRepositoryEnMemoria;
  let lector: LectorCitasEnMemoria;
  let servicio: ConsultarRecordatoriosService;

  beforeEach(() => {
    transacciones = new ContadorTransacciones();
    recordatorios = new RecordatorioRepositoryEnMemoria();
    lector = new LectorCitasEnMemoria(recordatorios);
    servicio = new ConsultarRecordatoriosService(
      transacciones,
      lector,
      recordatorios,
    );
  });

  it('lista todos los de la cita (también los cancelados), en una transacción', async () => {
    // Arrange
    const cita = lector.sembrarCita(
      citaLeida({ tenantId: tenantA, usuarioId: randomUUID(), inicio: INICIO }),
    );
    recordatorios.sembrar({
      tenantId: tenantA,
      citaId: cita.id,
      antelacionMin: 1440,
      inicioCita: INICIO,
      programadoPara: new Date(INICIO.getTime() - 86_400_000),
      estado: EstadoRecordatorio.CANCELADO,
      motivo: MotivoRecordatorio.REPROGRAMADO,
    });
    recordatorios.sembrar({
      tenantId: tenantA,
      citaId: cita.id,
      antelacionMin: 120,
      inicioCita: INICIO,
      programadoPara: new Date(INICIO.getTime() - 7_200_000),
    });

    // Act
    const lista = await servicio.listarDeCita(cita.id, tenantA);

    // Assert
    expect(lista.map((r) => r.antelacionMin)).toEqual([1440, 120]);
    expect(transacciones.abiertas).toBe(1);
  });

  it('cita sin recordatorios → lista vacía', async () => {
    // Arrange
    const cita = lector.sembrarCita(
      citaLeida({ tenantId: tenantA, usuarioId: randomUUID(), inicio: INICIO }),
    );

    // Act & Assert
    expect(await servicio.listarDeCita(cita.id, tenantA)).toEqual([]);
  });

  it('cita de otro tenant → CitaDeRecordatoriosNoEncontradaError (404)', async () => {
    // Arrange
    const cita = lector.sembrarCita(
      citaLeida({ tenantId: tenantB, usuarioId: randomUUID(), inicio: INICIO }),
    );

    // Act & Assert
    await expect(
      servicio.listarDeCita(cita.id, tenantA),
    ).rejects.toBeInstanceOf(CitaDeRecordatoriosNoEncontradaError);
  });

  it('cita inexistente → CitaDeRecordatoriosNoEncontradaError', async () => {
    await expect(
      servicio.listarDeCita(randomUUID(), tenantA),
    ).rejects.toBeInstanceOf(CitaDeRecordatoriosNoEncontradaError);
  });
});
