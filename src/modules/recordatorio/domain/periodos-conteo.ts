// Periodos de conteo de envíos (ADR-13 §11), como rangos semiabiertos
// [desde, hasta) de instantes, listos para `RecordatorioRepository.contar*`.
// Funciones puras: el reloj llega por parámetro.
//
// - Cuota del proveedor: día y mes calendario en UTC (supuesto del diseño,
//   "a verificar" en ADR-13; si Resend reinicia de otra forma, cambia AQUÍ y
//   no en el adaptador).
// - Fusible por tenant: día en la zona de la clínica (APP_TZ).
import { rangoDelDiaEnZona } from '../../../shared/domain/timezone';

export interface Periodo {
  desde: Date;
  hasta: Date;
}

/** Día calendario UTC que contiene `ahora`: [00:00Z, día+1 00:00Z). */
export function periodoDiaUtc(ahora: Date): Periodo {
  const y = ahora.getUTCFullYear();
  const m = ahora.getUTCMonth();
  const d = ahora.getUTCDate();
  return {
    desde: new Date(Date.UTC(y, m, d)),
    hasta: new Date(Date.UTC(y, m, d + 1)),
  };
}

/** Mes calendario UTC que contiene `ahora`: [día 1 00:00Z, mes+1 día 1 00:00Z). */
export function periodoMesUtc(ahora: Date): Periodo {
  const y = ahora.getUTCFullYear();
  const m = ahora.getUTCMonth();
  return {
    desde: new Date(Date.UTC(y, m, 1)),
    hasta: new Date(Date.UTC(y, m + 1, 1)),
  };
}

/** Día de la clínica (zona `tz`) que contiene `ahora`; seguro ante DST. */
export function periodoDiaEnZona(ahora: Date, tz: string): Periodo {
  return rangoDelDiaEnZona(ahora, tz);
}
