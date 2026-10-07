import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { LectorCitas } from '../domain/lector-citas';
import {
  DatosRecordatorio,
  RecordatorioRepository,
} from '../domain/recordatorio.repository';
import { CitaDeRecordatoriosNoEncontradaError } from './cita-de-recordatorios-no-encontrada.error';

/**
 * Estado de los recordatorios de una cita para el profesional (ADR-13 §17,
 * `GET /citas/:citaId/recordatorios`).
 *
 * Filtrado por el tenant del TOKEN: una cita de otra organización (o que no
 * existe) es `CitaDeRecordatoriosNoEncontradaError` → 404, sin distinguir.
 * Devuelve TODOS, también los cancelados (son el historial), en el orden del
 * puerto. La presentación decide qué campos salen: nunca el destinatario ni
 * el id del proveedor.
 */
export class ConsultarRecordatoriosService {
  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly lector: LectorCitas,
    private readonly recordatorios: RecordatorioRepository,
  ) {}

  listarDeCita(citaId: string, tenantId: string): Promise<DatosRecordatorio[]> {
    // Los puertos exigen `tx` también para leer (ADR-13).
    return this.transacciones.run(async (tx) => {
      const cita = await this.lector.obtenerCita(citaId, tenantId, tx);
      if (!cita) {
        throw new CitaDeRecordatoriosNoEncontradaError(citaId);
      }
      return this.recordatorios.listarPorCita(citaId, tenantId, tx);
    });
  }
}
