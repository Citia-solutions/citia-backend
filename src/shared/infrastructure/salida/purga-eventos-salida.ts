import { Logger } from '@nestjs/common';

import {
  EventosSalidaRepository,
  ResultadoPurgaSalida,
} from '../../application/eventos-salida.repository';
import { TransactionRunner } from '../../application/transaction-runner';

/**
 * Purga diaria de `eventos_salida` (ADR-12 §3, §5): borra los `entregado` más
 * viejos que `EVENTOS_SALIDA_RETENCION_DIAS`. Los `pendiente` y `fallido` no se
 * tocan.
 *
 * El repositorio toma un candado consultivo: si otro proceso está purgando,
 * devuelve `ejecutada: false` y no es un error.
 *
 * BARRIDO GLOBAL (ADR-12 §6): solo la invoca el planificador.
 */
export class PurgaEventosSalida {
  private readonly logger = new Logger(PurgaEventosSalida.name);

  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly salida: EventosSalidaRepository,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  /** Lanza si falla la base. */
  async purgar(retencionDias: number): Promise<ResultadoPurgaSalida> {
    const resultado = await this.transacciones.run((tx) =>
      this.salida.purgarEntregadosAntiguos(this.reloj(), retencionDias, tx),
    );
    if (resultado.ejecutada) {
      this.logger.log({
        evento: 'eventos_salida.purga',
        borrados: resultado.borrados,
        retencionDias,
        msg: `Purga de eventos_salida: ${resultado.borrados} entregados borrados`,
      });
    } else {
      this.logger.debug({
        evento: 'eventos_salida.purga_omitida',
        msg: 'Otro proceso tiene el candado de la purga',
      });
    }
    return resultado;
  }
}
