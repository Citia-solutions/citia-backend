import { Logger } from '@nestjs/common';
import { Resend } from 'resend';

import type { AdaptadorMensajeria } from '../../../../shared/infrastructure/config/entorno';
import { CanalMensajeria } from '../../domain/canal-mensajeria';
import { RegistroCanalMensajeria } from './registro-canal-mensajeria';
import { ResendCanalMensajeria } from './resend-canal-mensajeria';

export interface ConfiguracionCanal {
  /** `MENSAJERIA_ADAPTADOR`; sin valor (e2e parcial sin entorno validado), `registro`. */
  adaptador: AdaptadorMensajeria | undefined;
  apiKey: string | undefined;
  remitente: string | undefined;
  produccion: boolean;
}

/** Remitente de pruebas de Resend (ADR-13 §18), si el entorno no trae uno. */
export const REMITENTE_POR_DEFECTO = 'Citia <onboarding@resend.dev>';

/**
 * Elige el adaptador de `CanalMensajeria` (ADR-13 §8, §13):
 *
 * - `resend` → `ResendCanalMensajeria` con el SDK oficial. Exige la clave (la
 *   validación de entorno ya lo hace; esto cubre un módulo armado a mano).
 * - `registro` → `RegistroCanalMensajeria`: no envía. En producción solo si
 *   se eligió EXPLÍCITAMENTE (la variable es obligatoria allí) y con un aviso
 *   al arrancar: los pacientes no recibirán nada.
 */
export function crearCanalMensajeria(
  configuracion: ConfiguracionCanal,
  logger: Pick<Logger, 'warn' | 'log'> = new Logger('CanalMensajeria'),
): CanalMensajeria {
  if (configuracion.adaptador === 'resend') {
    if (!configuracion.apiKey) {
      throw new Error(
        'MENSAJERIA_ADAPTADOR=resend requiere RESEND_API_KEY (ADR-13 §18)',
      );
    }
    logger.log({
      evento: 'mensajeria.adaptador',
      adaptador: 'resend',
      msg: 'Recordatorios: se envían por Resend',
    });
    return new ResendCanalMensajeria(new Resend(configuracion.apiKey), {
      remitente: configuracion.remitente ?? REMITENTE_POR_DEFECTO,
    });
  }

  if (configuracion.produccion) {
    logger.warn({
      evento: 'mensajeria.adaptador',
      adaptador: 'registro',
      msg: 'MENSAJERIA_ADAPTADOR=registro en producción: los recordatorios NO se envían a los pacientes',
    });
  }
  return new RegistroCanalMensajeria();
}
