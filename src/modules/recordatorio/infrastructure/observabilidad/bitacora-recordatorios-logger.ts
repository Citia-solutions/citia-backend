import { Logger } from '@nestjs/common';

import {
  BitacoraRecordatorios,
  EntradaBitacora,
} from '../../application/bitacora-recordatorios';

/**
 * `BitacoraRecordatorios` sobre el logger de Nest, que en la app sale por pino
 * (`main.ts`: `app.useLogger`), con la redacción de ADR-13 §16. Cada entrada
 * es UN objeto: `{ evento, alerta?, ...campos, msg }`, que Better Stack filtra
 * por `evento` o `alerta`.
 *
 * Nunca lanza: un fallo del log no puede romper un envío.
 */
export class BitacoraRecordatoriosLogger extends BitacoraRecordatorios {
  constructor(
    private readonly logger: Pick<
      Logger,
      'debug' | 'log' | 'warn' | 'error'
    > = new Logger('Recordatorios'),
  ) {
    super();
  }

  registrar(entrada: EntradaBitacora): void {
    const objeto = {
      evento: entrada.evento,
      ...(entrada.alerta ? { alerta: entrada.alerta } : {}),
      ...entrada.campos,
      msg: entrada.msg,
    };
    try {
      switch (entrada.nivel) {
        case 'debug':
          this.logger.debug(objeto);
          break;
        case 'info':
          this.logger.log(objeto);
          break;
        case 'warn':
          this.logger.warn(objeto);
          break;
        case 'error':
          this.logger.error(objeto);
          break;
      }
    } catch {
      // Ni el log puede romper el job.
    }
  }
}
