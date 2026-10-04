import { ConfigService } from '@nestjs/config';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import { OpcionesReconciliacion } from '../../application/reconciliar-recordatorios.service';
import { ANTELACIONES_PREDETERMINADAS_MIN } from '../../domain/configuracion-recordatorio.entity';
import { HORAS_SIN_ENVIO_POR_DEFECTO } from '../../domain/horas-sin-envio';

/**
 * Valores por defecto si la variable no está en la configuración. En la app
 * nunca se usan: `validarEntorno` ya rellena los mismos defaults al arrancar
 * (ADR-13 §18). Sirven para las e2e que arman módulos parciales con un
 * `ConfigModule` sin `validate`.
 */
const POR_DEFECTO = {
  APP_TZ: 'America/Santiago',
  RECORDATORIO_MARGEN_MINIMO_MIN: 30,
  RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN: 60,
} as const;

type Clave = keyof Entorno;

function leer<K extends Clave>(
  config: ConfigService<Entorno, true>,
  clave: K,
  defecto: NonNullable<Entorno[K]>,
): NonNullable<Entorno[K]> {
  // El tipo dice "siempre definido" (entorno validado); en una e2e parcial
  // sin `validate` puede faltar igual.
  return config.get(clave, { infer: true }) ?? defecto;
}

/** Parámetros de planificación y configuración predeterminada, del entorno. */
export function leerOpcionesRecordatorios(
  config: ConfigService<Entorno, true>,
): OpcionesReconciliacion {
  return {
    parametros: {
      tz: leer(config, 'APP_TZ', POR_DEFECTO.APP_TZ),
      silencio: {
        desde: leer(
          config,
          'RECORDATORIO_SILENCIO_DESDE',
          HORAS_SIN_ENVIO_POR_DEFECTO.desde,
        ),
        hasta: leer(
          config,
          'RECORDATORIO_SILENCIO_HASTA',
          HORAS_SIN_ENVIO_POR_DEFECTO.hasta,
        ),
      },
      margenMinimoMin: leer(
        config,
        'RECORDATORIO_MARGEN_MINIMO_MIN',
        POR_DEFECTO.RECORDATORIO_MARGEN_MINIMO_MIN,
      ),
      antelacionMinimaTardiaMin: leer(
        config,
        'RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN',
        POR_DEFECTO.RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN,
      ),
    },
    antelacionesPredeterminadasMin: leer(
      config,
      'RECORDATORIO_ANTELACIONES_MIN',
      ANTELACIONES_PREDETERMINADAS_MIN,
    ),
  };
}
