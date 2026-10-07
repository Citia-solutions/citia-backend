import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { RecordatorioRepository } from '../domain/recordatorio.repository';
import {
  AlertaRecordatorios,
  BitacoraRecordatorios,
} from './bitacora-recordatorios';

/** ADR-13 §16: la ventana de la tasa de fallo. */
export const VENTANA_TASA_FALLO_HORAS = 24;

export interface OpcionesTasaFallo {
  /** `RECORDATORIO_UMBRAL_TASA_FALLO` (0,05): alerta si la tasa lo SUPERA. */
  umbral: number;
  /** `RECORDATORIO_UMBRAL_MUESTRA_MIN` (20): sin esta muestra no se alerta. */
  muestraMinima: number;
  ventanaHoras?: number;
}

export interface ResultadoTasaFallo {
  desde: Date;
  hasta: Date;
  entregados: number;
  fallidos: number;
  /** `entregados + fallidos`. */
  muestra: number;
  /** `fallidos / muestra`; 0 sin muestra. */
  tasa: number;
  /** `true` si se emitió la alerta. */
  alerta: boolean;
}

/**
 * Tasa de fallo de los recordatorios (RNF-03 / RNF-08, ADR-13 §16): sobre las
 * últimas 24 h, `fallidos ÷ (entregados + fallidos)`, sin contar `cancelado`
 * ni `omitido`. Alerta (`alerta = recordatorios.tasa_fallo`, nivel error) si
 * supera el umbral (5 %) con al menos la muestra mínima (20). El umbral está
 * sobre el objetivo del 1 % a propósito: con 50 envíos al día un solo fallo
 * es un 2 %. El 1 % se mide mes a mes.
 *
 * Siempre deja la medición como métrica (`recordatorios.tasa_fallo_medida`,
 * info). La invoca el planificador cada 15 minutos; mientras siga sobre el
 * umbral, la alerta se repite en cada medición (el incidente sigue abierto).
 *
 * BARRIDO GLOBAL (ADR-12 §6): cuenta en todos los tenants.
 */
export class TasaFalloRecordatoriosService {
  private readonly ventanaHoras: number;

  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly recordatorios: RecordatorioRepository,
    private readonly bitacora: BitacoraRecordatorios,
    private readonly opciones: OpcionesTasaFallo,
    private readonly reloj: () => Date = () => new Date(),
  ) {
    this.ventanaHoras = opciones.ventanaHoras ?? VENTANA_TASA_FALLO_HORAS;
  }

  async medir(): Promise<ResultadoTasaFallo> {
    const hasta = this.reloj();
    const desde = new Date(hasta.getTime() - this.ventanaHoras * 3_600_000);
    const { entregados, fallidos } = await this.transacciones.run((tx) =>
      this.recordatorios.contarDesenlacesEntre(desde, hasta, tx),
    );
    const muestra = entregados + fallidos;
    const tasa = muestra === 0 ? 0 : fallidos / muestra;
    const alerta =
      muestra >= this.opciones.muestraMinima && tasa > this.opciones.umbral;

    const campos = {
      tasa: Math.round(tasa * 10_000) / 10_000,
      entregados,
      fallidos,
      muestra,
      ventanaHoras: this.ventanaHoras,
      umbral: this.opciones.umbral,
      muestraMinima: this.opciones.muestraMinima,
    };
    this.bitacora.registrar({
      nivel: 'info',
      evento: 'recordatorios.tasa_fallo_medida',
      campos,
      msg: 'Tasa de fallo de recordatorios en la ventana',
    });
    if (alerta) {
      this.bitacora.registrar({
        nivel: 'error',
        evento: 'recordatorios.tasa_fallo',
        alerta: AlertaRecordatorios.TASA_FALLO,
        campos,
        msg: 'La tasa de fallo de los recordatorios supera el umbral',
      });
    }
    return { desde, hasta, entregados, fallidos, muestra, tasa, alerta };
  }
}
