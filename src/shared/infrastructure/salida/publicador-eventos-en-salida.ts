import { Injectable } from '@nestjs/common';

import { EventosSalidaRepository } from '../../application/eventos-salida.repository';
import {
  EventoDominio,
  PublicadorEventos,
} from '../../application/publicador-eventos';
import { TransactionContext } from '../../application/transaction-runner';

/**
 * Adaptador de `PublicadorEventos` sobre el outbox (ADR-12 §2): escribe el
 * hecho en `eventos_salida` con la transacción del caso de uso. O se confirman
 * el cambio y el hecho, o ninguno: sin hechos fantasma ni perdidos (DT-27).
 *
 * La entrega a los suscriptores la hace después `DespachadorEventosSalida`.
 */
@Injectable()
export class PublicadorEventosEnSalida extends PublicadorEventos {
  constructor(private readonly salida: EventosSalidaRepository) {
    super();
  }

  async publicar(evento: EventoDominio, tx: TransactionContext): Promise<void> {
    // `TransactionContext` es `unknown`: el tipo no impide pasar `undefined`.
    // Sin transacción se perdería la atomicidad en silencio.
    if (tx === undefined || tx === null) {
      throw new Error(
        `PublicadorEventos.publicar(${evento.nombre}) requiere la transacción del caso de uso (ADR-12 §2)`,
      );
    }
    await this.salida.insertar(evento, tx);
  }
}
