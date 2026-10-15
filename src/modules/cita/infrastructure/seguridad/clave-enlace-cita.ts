import { ConfigService } from '@nestjs/config';

import {
  ENLACE_CITA_CLAVE_DESARROLLO,
  Entorno,
} from '../../../../shared/infrastructure/config/entorno';

/**
 * `ENLACE_CITA_CLAVE` del entorno validado (`validarEntorno` la exige en
 * producción, fuerte y distinta de `JWT_SECRET`).
 *
 * El respaldo existe SOLO para las e2e que montan `CitaModule` con un
 * `ConfigModule` sin `validate`: fuera de producción usa el mismo valor de
 * desarrollo que `validarEntorno`. En producción, sin clave, lanza (nunca
 * debería llegar aquí: el arranque ya habría fallado).
 */
export function claveEnlaceCita(config: ConfigService<Entorno, true>): string {
  const clave = config.get('ENLACE_CITA_CLAVE', { infer: true });
  if (clave) return clave;

  const nodeEnv = config.get('NODE_ENV', { infer: true });
  if ((nodeEnv ?? process.env.NODE_ENV) === 'production') {
    throw new Error('ENLACE_CITA_CLAVE es obligatoria en producción');
  }
  return ENLACE_CITA_CLAVE_DESARROLLO;
}
