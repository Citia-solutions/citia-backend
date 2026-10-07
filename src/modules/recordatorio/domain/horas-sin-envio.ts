// Horas sin envío (ADR-13 §3, §5.c y política 4 de §7): ningún recordatorio
// sale entre `desde` y `hasta` (21:00–08:00 por defecto), todos los días, en
// la zona de la clínica.
//
// Funciones puras: el instante y la zona llegan por parámetro. Toda la
// conversión entre reloj de pared e instantes pasa por
// `shared/domain/timezone.ts`, que es DST-safe: en Chile el horario cambia a
// medianoche, DENTRO de la ventana de silencio, y restar horas de reloj de
// pared daría una hora de error esa noche.
import {
  formatearFechaEnZona,
  instanteDeHoraLocal,
  minutoDelDiaEnZona,
  sumarDiasAFecha,
} from '../../../shared/domain/timezone';

/** Ventana de silencio en hora local "HH:mm" (24 h): `[desde, hasta)`. */
export interface HorasSinEnvio {
  desde: string;
  hasta: string;
}

/** Confirmado 2026-09-30 (`RECORDATORIO_SILENCIO_DESDE` / `HASTA`). */
export const HORAS_SIN_ENVIO_POR_DEFECTO: Readonly<HorasSinEnvio> =
  Object.freeze({ desde: '21:00', hasta: '08:00' });

const MINUTO_MS = 60_000;
const HORA_HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Una ventana concreta de silencio, como instantes: `[desde, hasta)`. */
export interface VentanaSilencio {
  desde: Date;
  hasta: Date;
}

/** Lanza `RangeError` si las horas no tienen formato `HH:mm` o son iguales. */
export function validarHorasSinEnvio(horas: HorasSinEnvio): void {
  if (!HORA_HH_MM.test(horas.desde) || !HORA_HH_MM.test(horas.hasta)) {
    throw new RangeError(
      `Horas sin envío inválidas: se esperaba HH:mm (recibido "${horas.desde}"–"${horas.hasta}")`,
    );
  }
  if (horas.desde === horas.hasta) {
    throw new RangeError(
      'Horas sin envío inválidas: desde y hasta son iguales',
    );
  }
}

function aMinutos(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

/**
 * La ventana de silencio que contiene a `instante`, o `null` si a esa hora
 * se puede enviar. Si `desde > hasta` la ventana cruza la medianoche (el caso
 * por defecto): después de `desde` empezó hoy; antes de `hasta`, ayer.
 */
export function ventanaDeSilencio(
  instante: Date,
  horas: HorasSinEnvio,
  tz: string,
): VentanaSilencio | null {
  validarHorasSinEnvio(horas);
  const minuto = minutoDelDiaEnZona(instante, tz);
  const desde = aMinutos(horas.desde);
  const hasta = aMinutos(horas.hasta);
  const hoy = formatearFechaEnZona(instante, tz);

  const ventana = (diaDesde: string, diaHasta: string): VentanaSilencio => ({
    desde: instanteDeHoraLocal(diaDesde, horas.desde, tz),
    hasta: instanteDeHoraLocal(diaHasta, horas.hasta, tz),
  });

  if (desde > hasta) {
    if (minuto >= desde) return ventana(hoy, sumarDiasAFecha(hoy, 1));
    if (minuto < hasta) return ventana(sumarDiasAFecha(hoy, -1), hoy);
    return null;
  }
  return minuto >= desde && minuto < hasta ? ventana(hoy, hoy) : null;
}

export function estaEnHorasSinEnvio(
  instante: Date,
  horas: HorasSinEnvio,
  tz: string,
): boolean {
  return ventanaDeSilencio(instante, horas, tz) !== null;
}

/**
 * Regla 5.c: si `instante` cae en silencio, el último minuto permitido ANTES
 * de que empezara (20:59 con los valores por defecto). Adelantar nunca deja
 * el recordatorio más cerca de la cita de lo configurado. Fuera del silencio,
 * el mismo instante.
 */
export function adelantarAntesDelSilencio(
  instante: Date,
  horas: HorasSinEnvio,
  tz: string,
): Date {
  const ventana = ventanaDeSilencio(instante, horas, tz);
  return ventana ? new Date(ventana.desde.getTime() - MINUTO_MS) : instante;
}

/**
 * Lo antes posible fuera del silencio (regla 5.e y política 4): el fin de la
 * ventana si `instante` cae dentro (08:00 por defecto); si no, el mismo.
 */
export function proximoInstantePermitido(
  instante: Date,
  horas: HorasSinEnvio,
  tz: string,
): Date {
  return ventanaDeSilencio(instante, horas, tz)?.hasta ?? instante;
}
