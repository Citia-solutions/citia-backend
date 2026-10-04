import { Logger } from '@nestjs/common';

import {
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
  TipoResultadoEnvio,
} from '../../domain/canal-mensajeria';

export const PROVEEDOR_REGISTRO = 'registro';

/**
 * Adaptador de desarrollo y tests (ADR-13 §13, `MENSAJERIA_ADAPTADOR=registro`):
 * NO envía nada. Deja constancia en el log SIN datos personales (solo el id
 * del recordatorio y si llevaba `Reply-To`) y responde `aceptado` con un id
 * ficticio.
 *
 * El id se deriva de la clave de idempotencia: el mismo recordatorio da
 * siempre el mismo id, como haría el proveedor con la misma
 * `Idempotency-Key`.
 */
export class RegistroCanalMensajeria extends CanalMensajeria {
  private readonly logger = new Logger(RegistroCanalMensajeria.name);

  enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    const recordatorioId = mensaje.etiquetas.recordatorio_id ?? null;
    this.logger.log({
      evento: 'mensajeria.registro',
      recordatorioId,
      conReplyTo: mensaje.responderA !== null,
      msg: 'MENSAJERIA_ADAPTADOR=registro: el correo NO se envió (solo constancia)',
    });
    return Promise.resolve({
      tipo: TipoResultadoEnvio.ACEPTADO,
      proveedor: PROVEEDOR_REGISTRO,
      proveedorMensajeId: idFicticio(mensaje.claveIdempotencia),
    });
  }
}

/** `recordatorio/<uuid>` → `registro_recordatorio_<uuid>`. */
export function idFicticio(claveIdempotencia: string): string {
  return `${PROVEEDOR_REGISTRO}_${claveIdempotencia.replace(/[^A-Za-z0-9-]/g, '_')}`;
}
