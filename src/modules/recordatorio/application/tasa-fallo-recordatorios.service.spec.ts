import { randomUUID } from 'node:crypto';

import { ContadorTransacciones } from '../../../../test/support/in-memory-repositories';
import { BitacoraEnMemoria } from '../../../../test/support/mensajeria-falsa';
import { RecordatorioRepositoryEnMemoria } from '../../../../test/support/recordatorios-en-memoria';
import {
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import { AlertaRecordatorios } from './bitacora-recordatorios';
import { TasaFalloRecordatoriosService } from './tasa-fallo-recordatorios.service';

const AHORA = new Date('2026-10-10T15:00:00Z');
const HORA = 3_600_000;

describe('TasaFalloRecordatoriosService (ADR-13 §16)', () => {
  let recordatorios: RecordatorioRepositoryEnMemoria;
  let bitacora: BitacoraEnMemoria;
  let servicio: TasaFalloRecordatoriosService;

  /** Desenlaces con `actualizadoEn` = `cuando`. */
  function sembrar(
    entregados: number,
    fallidos: number,
    cuando = new Date(AHORA.getTime() - HORA),
  ): void {
    const base = {
      tenantId: randomUUID(),
      antelacionMin: 120,
      inicioCita: AHORA,
      programadoPara: AHORA,
      actualizadoEn: cuando,
    };
    for (let i = 0; i < entregados; i++) {
      recordatorios.sembrar({
        ...base,
        citaId: randomUUID(),
        estado: EstadoRecordatorio.ENTREGADO,
      });
    }
    for (let i = 0; i < fallidos; i++) {
      recordatorios.sembrar({
        ...base,
        citaId: randomUUID(),
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.REBOTE,
      });
    }
  }

  beforeEach(() => {
    recordatorios = new RecordatorioRepositoryEnMemoria(() => AHORA);
    bitacora = new BitacoraEnMemoria();
    servicio = new TasaFalloRecordatoriosService(
      new ContadorTransacciones(),
      recordatorios,
      bitacora,
      { umbral: 0.05, muestraMinima: 20 },
      () => AHORA,
    );
  });

  it('sobre el 5 % con n ≥ 20 → alerta recordatorios.tasa_fallo (error)', async () => {
    // Arrange — 2 de 20 = 10 %
    sembrar(18, 2);

    // Act
    const resultado = await servicio.medir();

    // Assert
    expect(resultado).toMatchObject({
      entregados: 18,
      fallidos: 2,
      muestra: 20,
      tasa: 0.1,
      alerta: true,
      desde: new Date(AHORA.getTime() - 24 * HORA),
      hasta: AHORA,
    });
    const alertas = bitacora.alertas(AlertaRecordatorios.TASA_FALLO);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      nivel: 'error',
      campos: { tasa: 0.1, muestra: 20 },
    });
  });

  it('con muestra insuficiente no alerta aunque la tasa sea alta', async () => {
    // Arrange — 5 de 19
    sembrar(14, 5);

    // Act
    const resultado = await servicio.medir();

    // Assert
    expect(resultado.alerta).toBe(false);
    expect(bitacora.alertas(AlertaRecordatorios.TASA_FALLO)).toEqual([]);
  });

  it('justo en el 5 % no alerta (debe SUPERARLO)', async () => {
    // Arrange — 1 de 20
    sembrar(19, 1);

    // Act & Assert
    expect((await servicio.medir()).alerta).toBe(false);
  });

  it('no cuenta cancelados ni omitidos, ni lo de hace más de 24 h', async () => {
    // Arrange
    sembrar(18, 0);
    sembrar(0, 10, new Date(AHORA.getTime() - 25 * HORA));
    recordatorios.sembrar({
      tenantId: randomUUID(),
      citaId: randomUUID(),
      antelacionMin: 120,
      inicioCita: AHORA,
      programadoPara: AHORA,
      estado: EstadoRecordatorio.OMITIDO,
      motivo: MotivoRecordatorio.SIN_CORREO,
      actualizadoEn: new Date(AHORA.getTime() - HORA),
    });

    // Act
    const resultado = await servicio.medir();

    // Assert
    expect(resultado).toMatchObject({ muestra: 18, fallidos: 0, tasa: 0 });
  });

  it('siempre deja la medición como métrica (info)', async () => {
    // Act
    await servicio.medir();

    // Assert
    const medidas = bitacora.de('recordatorios.tasa_fallo_medida');
    expect(medidas).toHaveLength(1);
    expect(medidas[0]).toMatchObject({
      nivel: 'info',
      campos: { muestra: 0, tasa: 0 },
    });
  });
});
