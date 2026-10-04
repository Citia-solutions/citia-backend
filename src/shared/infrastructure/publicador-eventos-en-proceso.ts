import { Injectable, Logger } from '@nestjs/common';

import {
  EventoDominio,
  PublicadorEventos,
} from '../application/publicador-eventos';

/**
 * Adaptador de Fase 1: deja constancia del hecho y nada mas. No hay
 * suscriptores todavia.
 *
 * DEUDA CONOCIDA (DT-27): la publicacion ocurre FUERA de la transaccion que
 * persiste el cambio. Si el proceso muere en medio, el cambio queda guardado y
 * el hecho se pierde. Hoy es inofensivo porque nadie escucha; deja de serlo
 * cuando un evento perdido signifique un recordatorio que nunca se envia
 * (RNF-03 exige >=99% de entrega). La solucion es escribir el evento en la
 * misma transaccion, en una tabla de salida, y entregarlo desde un proceso
 * aparte con reintentos. Conviene hacerlo ANTES del primer suscriptor.
 */
@Injectable()
export class PublicadorEventosEnProceso extends PublicadorEventos {
  private readonly logger = new Logger(PublicadorEventosEnProceso.name);

  publicar(evento: EventoDominio): Promise<void> {
    this.logger.log(
      `evento=${evento.nombre} tenant=${evento.tenantId} payload=${JSON.stringify(evento.payload)}`,
    );
    return Promise.resolve();
  }
}
