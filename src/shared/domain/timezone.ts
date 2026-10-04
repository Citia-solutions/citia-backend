// Utilidades de zona horaria. La BD guarda instantes en UTC (columnas
// `timestamptz`), pero el "día" y la "hora" que ve la clínica dependen de SU
// zona horaria, no de la del servidor (el contenedor corre en UTC). Estas
// funciones son puras (sin dependencias de framework) y usan `Intl` para
// resolver la zona, incluido el horario de verano (DST).

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

// Lo que marca el reloj de pared de una zona en un instante.
interface PartesLocales {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

// Un formateador por zona: construir `Intl.DateTimeFormat` es caro y estas
// funciones se llaman varias veces por cita (planificación de recordatorios).
// Las zonas en uso son pocas (APP_TZ), así que el caché no crece.
const formateadoresDePartes = new Map<string, Intl.DateTimeFormat>();

function formateadorDePartes(tz: string): Intl.DateTimeFormat {
  let dtf = formateadoresDePartes.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formateadoresDePartes.set(tz, dtf);
  }
  return dtf;
}

function partesEnZona(instante: Date, tz: string): PartesLocales {
  const partes: Record<string, number> = {};
  for (const p of formateadorDePartes(tz).formatToParts(instante)) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  return {
    anio: partes.year,
    mes: partes.month,
    dia: partes.day,
    // Algunas plataformas devuelven hour=24 a medianoche; normalizamos a 0.
    hora: partes.hour % 24,
    minuto: partes.minute,
    segundo: partes.second,
  };
}

// Offset de `tz` respecto de UTC, en minutos, en el instante dado.
// Positivo si la hora local va por delante de UTC. Chile: -240 (UTC-4) o
// -180 (UTC-3, verano). Se calcula formateando el instante en la zona y
// comparándolo con su representación UTC.
function offsetMinutos(instante: Date, tz: string): number {
  const p = partesEnZona(instante, tz);
  const comoUTC = Date.UTC(
    p.anio,
    p.mes - 1,
    p.dia,
    p.hora,
    p.minuto,
    p.segundo,
  );
  return (comoUTC - instante.getTime()) / MINUTO_MS;
}

// Año/mes/día del instante interpretado EN la zona `tz`.
function ymdEnZona(instante: Date, tz: string): [number, number, number] {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const partes: Record<string, number> = {};
  for (const p of dtf.formatToParts(instante)) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  return [partes.year, partes.month, partes.day];
}

// Instante UTC en que EMPIEZA el día local `y-m-d` de la zona `tz`.
// Normalmente es las 00:00 local. DST-safe: se prueban los dos offsets
// posibles (el de la estimación y el del candidato) y se queda el primero que
// de verdad cae en ese día local. Hace falta porque en Chile el cambio a
// horario de verano ocurre justo a medianoche: ese día las 00:00 NO existen
// (se salta de 23:59 a 01:00) y el día empieza a las 01:00 locales; corregir
// solo con el segundo offset aterrizaba en las 23:00 del día anterior.
function inicioDelDiaLocalEnUTC(
  y: number,
  m: number,
  d: number,
  tz: string,
): Date {
  // Estimación: interpretamos 00:00 como si fuera UTC y corregimos por el
  // offset de la zona en ese instante.
  const estimado = Date.UTC(y, m - 1, d, 0, 0, 0);
  const off1 = offsetMinutos(new Date(estimado), tz);
  const c1 = estimado - off1 * 60000;
  const off2 = offsetMinutos(new Date(c1), tz);
  const c2 = estimado - off2 * 60000;
  const delDia = [c1, c2].filter((c) => {
    const [cy, cm, cd] = ymdEnZona(new Date(c), tz);
    return cy === y && cm === m && cd === d;
  });
  // Sin candidato válido (no ocurre en zonas reales) conservamos la
  // corrección clásica de segunda pasada.
  return new Date(delDia.length > 0 ? Math.min(...delDia) : c2);
}

// Instante UTC en que empieza (00:00 local, salvo salto DST) el día al que
// pertenece `instante` en la zona `tz`.
function medianocheLocalEnUTC(instante: Date, tz: string): Date {
  const [y, m, d] = ymdEnZona(instante, tz);
  return inicioDelDiaLocalEnUTC(y, m, d, tz);
}

// "YYYY-MM-DD" -> [año, mes, día]. Las fechas llegan ya validadas por el DTO;
// esto solo protege a la función pura de un uso incorrecto.
function parsearFecha(fecha: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) {
    throw new RangeError(`Fecha inválida (se esperaba YYYY-MM-DD): "${fecha}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// "HH:mm" (24 h) -> [hora, minuto].
function parsearHora(hora: string): [number, number] {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  if (!match) {
    throw new RangeError(`Hora inválida (se esperaba HH:mm): "${hora}"`);
  }
  return [Number(match[1]), Number(match[2])];
}

// Aritmética de CALENDARIO (sin zona): `y-m-d` más `dias` días. Se hace en
// UTC, donde todos los días duran 24h, así que no la afecta ningún DST.
function sumarDias(
  y: number,
  m: number,
  d: number,
  dias: number,
): [number, number, number] {
  const resultado = new Date(Date.UTC(y, m - 1, d + dias));
  return [
    resultado.getUTCFullYear(),
    resultado.getUTCMonth() + 1,
    resultado.getUTCDate(),
  ];
}

function diaSiguiente(
  y: number,
  m: number,
  d: number,
): [number, number, number] {
  return sumarDias(y, m, d, 1);
}

function aFecha(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(
    d,
  ).padStart(2, '0')}`;
}

// Rango semiabierto [00:00, día+1 00:00) del día de `instante` en la zona `tz`,
// expresado como instantes UTC para consultar una columna `timestamptz`.
export function rangoDelDiaEnZona(
  instante: Date,
  tz: string,
): { desde: Date; hasta: Date } {
  const desde = medianocheLocalEnUTC(instante, tz);
  // +26h aterriza siempre dentro del día siguiente (aun con días de 23h o 25h
  // por DST); recomputamos la medianoche local de ese día.
  const alDiaSiguiente = new Date(desde.getTime() + 26 * 60 * 60 * 1000);
  const hasta = medianocheLocalEnUTC(alDiaSiguiente, tz);
  return { desde, hasta };
}

// "HH:mm" (24h) del instante EN la zona `tz`, para mostrar en la tarjeta.
export function formatearHoraEnZona(instante: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instante);
}

// "YYYY-MM-DD" del instante EN la zona `tz`: la fecha de la clínica, que puede
// no coincidir con la fecha UTC (22:00 del 30-jun en Santiago = 01-jul UTC).
export function formatearFechaEnZona(instante: Date, tz: string): string {
  const [y, m, d] = ymdEnZona(instante, tz);
  return aFecha(y, m, d);
}

// Fecha larga en español de Chile, en la zona `tz`, para el texto de un
// recordatorio (ADR-13 §12): "martes 14 de octubre, 10:30". Sin año: los
// recordatorios salen como mucho 7 días antes de la cita. Con
// `{ conHora: false }`, solo "martes 14 de octubre".
//
// Se arma desde las partes de `Intl` y no con `format()`, que en es-CL pone
// una coma después del día de la semana ("martes, 14 de octubre") y puede
// variar entre versiones de ICU.
export function formatearFechaLargaEnZona(
  instante: Date,
  tz: string,
  opciones: { conHora?: boolean } = {},
): string {
  const partes: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('es-CL', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(instante)) {
    if (p.type !== 'literal') partes[p.type] = p.value;
  }
  const fecha = `${partes.weekday} ${partes.day} de ${partes.month}`;
  return opciones.conHora === false
    ? fecha
    : `${fecha}, ${formatearHoraEnZona(instante, tz)}`;
}

// Minutos transcurridos en el RELOJ DE PARED de `tz` desde su medianoche, en
// [0, 1440). 21:00 -> 1260. Es la hora que "ve" la clínica, no el tiempo
// real transcurrido (el día del cambio de horario no son lo mismo).
export function minutoDelDiaEnZona(instante: Date, tz: string): number {
  const p = partesEnZona(instante, tz);
  return p.hora * 60 + p.minuto;
}

// Fecha de calendario "YYYY-MM-DD" desplazada `dias` días (negativo hacia
// atrás). Sin zona: son fechas, no instantes.
export function sumarDiasAFecha(fecha: string, dias: number): string {
  const [y, m, d] = parsearFecha(fecha);
  return aFecha(...sumarDias(y, m, d, dias));
}

// Instante en que el reloj de pared de `tz` marca `hora` ("HH:mm") el día
// local `fecha` ("YYYY-MM-DD"). DST-safe, con la desambiguación "compatible"
// de Temporal:
//  - hora que existe dos veces (se atrasa el reloj): la PRIMERA;
//  - hora que no existe (se adelanta el reloj): se corre hacia adelante lo
//    que dura el salto (00:30 en un salto de 00:00 a 01:00 -> 01:30).
// Se prueban los offsets vigentes un día antes, en y un día después de la
// estimación; cubre cualquier zona con a lo sumo un cambio por día.
export function instanteDeHoraLocal(
  fecha: string,
  hora: string,
  tz: string,
): Date {
  const [y, m, d] = parsearFecha(fecha);
  const [hh, mm] = parsearHora(hora);
  const comoUTC = Date.UTC(y, m - 1, d, hh, mm);
  const offsets = new Set(
    [-DIA_MS, 0, DIA_MS].map((delta) =>
      offsetMinutos(new Date(comoUTC + delta), tz),
    ),
  );
  const candidatos = [...offsets].map((o) => comoUTC - o * MINUTO_MS);
  const validos = candidatos.filter((c) => {
    const p = partesEnZona(new Date(c), tz);
    return (
      p.anio === y &&
      p.mes === m &&
      p.dia === d &&
      p.hora === hh &&
      p.minuto === mm
    );
  });
  // Sin candidato válido la hora cae en un salto: el offset de ANTES del
  // salto (el menor) da el instante más tardío, que es el "compatible".
  return new Date(
    validos.length > 0 ? Math.min(...validos) : Math.max(...candidatos),
  );
}

// Rango semiabierto [00:00 de `desde`, 00:00 del día siguiente a `hasta`) de
// días calendario de la clínica ("YYYY-MM-DD", inclusivos), expresado como
// instantes UTC para consultar una columna `timestamptz`. Mismo criterio que
// `rangoDelDiaEnZona`, pero el cliente manda fechas en vez de un instante.
export function rangoDeFechasEnZona(
  desde: string,
  hasta: string,
  tz: string,
): { desde: Date; hasta: Date } {
  const [dy, dm, dd] = parsearFecha(desde);
  const [hy, hm, hd] = diaSiguiente(...parsearFecha(hasta));
  return {
    desde: inicioDelDiaLocalEnUTC(dy, dm, dd, tz),
    hasta: inicioDelDiaLocalEnUTC(hy, hm, hd, tz),
  };
}

// Cantidad de días calendario entre `desde` y `hasta` ("YYYY-MM-DD"), contando
// ambos extremos: mismo día = 1, una semana lun-dom = 7. Si `hasta` es
// anterior a `desde` el resultado es <= 0 (lo interpreta quien llama). No
// depende de zona: son fechas de calendario, no instantes.
export function diasCalendarioInclusivos(desde: string, hasta: string): number {
  const [dy, dm, dd] = parsearFecha(desde);
  const [hy, hm, hd] = parsearFecha(hasta);
  const dias =
    (Date.UTC(hy, hm - 1, hd) - Date.UTC(dy, dm - 1, dd)) /
    (24 * 60 * 60 * 1000);
  return dias + 1;
}
