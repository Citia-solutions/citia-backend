import { ConfigService } from '@nestjs/config';

import type { Entorno } from '../../../../shared/infrastructure/config/entorno';
import { OpcionesEnvio } from '../../application/enviar-recordatorios.service';
import { OpcionesReconciliacion } from '../../application/reconciliar-recordatorios.service';
import { OpcionesTasaFallo } from '../../application/tasa-fallo-recordatorios.service';
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
  RECORDATORIO_EXIGIR_CONSENTIMIENTO: false,
  RECORDATORIO_MAX_DIARIO_POR_TENANT: 40,
  RESEND_CUOTA_DIARIA: 100,
  RESEND_CUOTA_MENSUAL: 3000,
  CUOTA_UMBRAL_AVISO: 0.8,
  RECORDATORIO_MAX_INTENTOS: 5,
  RECORDATORIO_LOTE: 20,
  RECORDATORIO_INTERVALO_SEG: 60,
  RECORDATORIO_UMBRAL_TASA_FALLO: 0.05,
  RECORDATORIO_UMBRAL_MUESTRA_MIN: 20,
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

/** Parámetros del envío (ADR-13 §7, §8, §11, §15). */
export function leerOpcionesEnvio(
  config: ConfigService<Entorno, true>,
): OpcionesEnvio {
  const base = leerOpcionesRecordatorios(config);
  return {
    tz: base.parametros.tz,
    silencio: base.parametros.silencio,
    exigirConsentimiento: leer(
      config,
      'RECORDATORIO_EXIGIR_CONSENTIMIENTO',
      POR_DEFECTO.RECORDATORIO_EXIGIR_CONSENTIMIENTO,
    ),
    maxDiarioPorTenant: leer(
      config,
      'RECORDATORIO_MAX_DIARIO_POR_TENANT',
      POR_DEFECTO.RECORDATORIO_MAX_DIARIO_POR_TENANT,
    ),
    cuotaDiaria: leer(
      config,
      'RESEND_CUOTA_DIARIA',
      POR_DEFECTO.RESEND_CUOTA_DIARIA,
    ),
    cuotaMensual: leer(
      config,
      'RESEND_CUOTA_MENSUAL',
      POR_DEFECTO.RESEND_CUOTA_MENSUAL,
    ),
    umbralAvisoCuota: leer(
      config,
      'CUOTA_UMBRAL_AVISO',
      POR_DEFECTO.CUOTA_UMBRAL_AVISO,
    ),
    maxReintentos: leer(
      config,
      'RECORDATORIO_MAX_INTENTOS',
      POR_DEFECTO.RECORDATORIO_MAX_INTENTOS,
    ),
    antelacionesPredeterminadasMin: base.antelacionesPredeterminadasMin,
  };
}

/** Tamaño y cadencia del job de envío (`RECORDATORIO_LOTE` / `_INTERVALO_SEG`). */
export function leerCadenciaEnvio(config: ConfigService<Entorno, true>): {
  lote: number;
  intervaloSeg: number;
} {
  return {
    lote: leer(config, 'RECORDATORIO_LOTE', POR_DEFECTO.RECORDATORIO_LOTE),
    intervaloSeg: leer(
      config,
      'RECORDATORIO_INTERVALO_SEG',
      POR_DEFECTO.RECORDATORIO_INTERVALO_SEG,
    ),
  };
}

/** Umbral y muestra de la alerta de tasa de fallo (ADR-13 §16). */
export function leerOpcionesTasaFallo(
  config: ConfigService<Entorno, true>,
): OpcionesTasaFallo {
  return {
    umbral: leer(
      config,
      'RECORDATORIO_UMBRAL_TASA_FALLO',
      POR_DEFECTO.RECORDATORIO_UMBRAL_TASA_FALLO,
    ),
    muestraMinima: leer(
      config,
      'RECORDATORIO_UMBRAL_MUESTRA_MIN',
      POR_DEFECTO.RECORDATORIO_UMBRAL_MUESTRA_MIN,
    ),
  };
}
