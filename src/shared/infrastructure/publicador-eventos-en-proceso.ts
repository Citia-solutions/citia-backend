import { Injectable, Logger } from '@nestjs/common';

import {
  EventoDominio,
  PublicadorEventos,
} from '../application/publicador-eventos';
import { TransactionContext } from '../application/transaction-runner';

/**
 * Adaptador de Fase 1: deja constancia del hecho en el log y nada mas. No hay
 * suscriptores todavia.
 *
 * TRANSITORIO (ADR-12 §2): ya recibe el `tx` del caso de uso pero lo IGNORA, asi
 * que sigue teniendo el problema de DT-27: escribe en el log antes del commit
 * y, si la transaccion se revierte despues, el log cuenta algo que no paso. Lo
 * reemplaza `PublicadorEventosEnSalida` (`shared/infrastructure/salida/`), que
 * inserta el hecho en `eventos_salida` con el `EntityManager` de ese mismo
 * `tx`. Entonces este archivo se borra.
 */
@Injectable()
export class PublicadorEventosEnProceso extends PublicadorEventos {
  private readonly logger = new Logger(PublicadorEventosEnProceso.name);

  publicar(evento: EventoDominio, tx: TransactionContext): Promise<void> {
    // Se ignora a proposito (ver arriba); el sustituto lo usara.
    void tx;
    this.logger.log(
      `evento=${evento.nombre} tenant=${evento.tenantId} payload=${JSON.stringify(evento.payload)}`,
    );
    return Promise.resolve();
  }
}
