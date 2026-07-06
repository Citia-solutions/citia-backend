// Utilidades de zona horaria. La BD guarda instantes en UTC (columnas
// `timestamptz`), pero el "día" y la "hora" que ve la clínica dependen de SU
// zona horaria, no de la del servidor (el contenedor corre en UTC). Estas
// funciones son puras (sin dependencias de framework) y usan `Intl` para
// resolver la zona, incluido el horario de verano (DST).

// Offset de `tz` respecto de UTC, en minutos, en el instante dado.
// Positivo si la hora local va por delante de UTC. Chile: -240 (UTC-4) o
// -180 (UTC-3, verano). Se calcula formateando el instante en la zona y
// comparándolo con su representación UTC.
function offsetMinutos(instante: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const partes: Record<string, number> = {};
  for (const p of dtf.formatToParts(instante)) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  // Algunas plataformas devuelven hour=24 a medianoche; normalizamos a 0.
  const hora = partes.hour % 24;
  const comoUTC = Date.UTC(
    partes.year,
    partes.month - 1,
    partes.day,
    hora,
    partes.minute,
    partes.second,
  );
  return (comoUTC - instante.getTime()) / 60000;
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

// Instante UTC correspondiente a las 00:00 hora local de `tz` del día al que
// pertenece `instante` en esa zona. DST-safe: corrige con una segunda pasada
// por si el offset cambió al cruzar un salto de horario de verano.
function medianocheLocalEnUTC(instante: Date, tz: string): Date {
  const [y, m, d] = ymdEnZona(instante, tz);
  // Estimación: interpretamos 00:00 como si fuera UTC y corregimos por el
  // offset de la zona en ese instante.
  const estimado = Date.UTC(y, m - 1, d, 0, 0, 0);
  const off1 = offsetMinutos(new Date(estimado), tz);
  let utc = estimado - off1 * 60000;
  const off2 = offsetMinutos(new Date(utc), tz);
  if (off2 !== off1) {
    utc = estimado - off2 * 60000;
  }
  return new Date(utc);
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
