// Planificación de recordatorios (ADR-13 §5): funciones PURAS, sin reloj, sin
// base y sin framework. `ahora` llega por parámetro.
//
//   planificar      → reglas a–d: qué recordatorios corresponden a la cita y a
//                     qué hora (aritmética de instantes, horas sin envío,
//                     fusión, vencimiento).
//   resolverTardios → reglas e–f: cuáles nacen `programado` y cuáles
//                     `omitido`, y el tardío único. Produce `NuevoRecordatorio`.
//
// La comparación con lo que ya existe (anular / insertar) está en
// `reconciliacion.ts`.
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from './recordatorio.entity';
import type {
  DatosRecordatorio,
  NuevoRecordatorio,
} from './recordatorio.repository';
import {
  HorasSinEnvio,
  adelantarAntesDelSilencio,
  proximoInstantePermitido,
} from './horas-sin-envio';

const MINUTO_MS = 60_000;

/**
 * Regla d: dos recordatorios de la misma cita a menos de esto entre sí se
 * fusionan (queda el de menor antelación). Fijo en ADR-13 ("a menos de 30
 * minutos"); distinto de `margenMinimoMin` aunque hoy valgan lo mismo.
 */
export const SEPARACION_MINIMA_FUSION_MIN = 30;

/** Parámetros globales (entorno) de la planificación. */
export interface ParametrosPlanificacion {
  /** `APP_TZ` hoy; de la organización cuando se cierre DT-17. */
  tz: string;
  /** `RECORDATORIO_SILENCIO_DESDE` / `HASTA`. */
  silencio: HorasSinEnvio;
  /** `RECORDATORIO_MARGEN_MINIMO_MIN` (30): el último vence esto antes del inicio. */
  margenMinimoMin: number;
  /** `RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN` (60): umbral del tardío. */
  antelacionMinimaTardiaMin: number;
}

export interface EntradaPlanificacion {
  inicio: Date;
  antelacionesMin: readonly number[];
  /** Configuración del profesional encendida. */
  activo: boolean;
  /** La cita sigue siendo un compromiso abierto (ADR-04). */
  vigente: boolean;
  ahora: Date;
  parametros: ParametrosPlanificacion;
}

/** Lo que debería existir para un `inicio`, antes de mirar el reloj (salvo la regla a). */
export interface RecordatorioPlanificado {
  antelacionMin: number;
  /** Hora PLANIFICADA, ya fuera de las horas sin envío. Es parte de la clave (5.f). */
  programadoPara: Date;
  /** Después de esto ya no sirve (5.d). */
  venceEn: Date;
  /** Quedó a menos de 30 min de uno de menor antelación (5.d): nace `omitido`. */
  fusionado: boolean;
}

/**
 * Regla a, parte de tiempo: la cita está tan cerca (o ya pasó) que no tiene
 * sentido planificar nada. Incluye las citas agendadas en el pasado (DT-13).
 */
export function fueraDeMargen(
  inicio: Date,
  ahora: Date,
  margenMinimoMin: number,
): boolean {
  return inicio.getTime() - margenMinimoMin * MINUTO_MS <= ahora.getTime();
}

interface Candidato {
  antelacionMin: number;
  programadoPara: Date;
}

// Cronológico; a igual hora, primero el de MAYOR antelación (el "anterior").
function porHora(a: Candidato, b: Candidato): number {
  return (
    a.programadoPara.getTime() - b.programadoPara.getTime() ||
    b.antelacionMin - a.antelacionMin
  );
}

/**
 * Reglas a–d de ADR-13 §5. Devuelve los recordatorios de la cita en orden
 * cronológico, o `[]` si no corresponde ninguno (cita no vigente,
 * configuración apagada o `inicio − margen ≤ ahora`).
 *
 * - **b.** `inicio − antelación`, en instantes: 24 h son 24 horas reales. La
 *   noche del cambio de horario eso cae una hora antes o después en el reloj
 *   de pared, y se acepta.
 * - **c.** Si cae en horas sin envío, se ADELANTA al último minuto antes del
 *   silencio (20:59), calculado en la zona de la clínica (DST-safe).
 * - **d.** Fusión: de menor a mayor antelación, uno que quede a menos de
 *   `SEPARACION_MINIMA_FUSION_MIN` de otro conservado se marca `fusionado`
 *   (se conserva el de menor antelación). Vencimiento: cada conservado vence
 *   cuando toca el siguiente; el último, `margen` antes del inicio. Un
 *   fusionado vence con el que lo absorbió.
 *
 * **Desvío de ADR-13 (anotado):** el último vence `max(inicio − margen,
 * min(inicio, programadoPara + margen))`. Con la regla literal, una antelación
 * de 30 min con margen de 30 vencería en el mismo instante en que toca y no
 * saldría nunca; así cada recordatorio tiene al menos `margen` minutos para
 * salir, sin pasar del inicio. Para antelaciones ≥ 2 × margen da lo mismo que
 * ADR-13.
 */
export function planificar(
  entrada: EntradaPlanificacion,
): RecordatorioPlanificado[] {
  const { inicio, antelacionesMin, activo, vigente, ahora, parametros } =
    entrada;
  const { tz, silencio, margenMinimoMin } = parametros;
  if (!vigente || !activo || fueraDeMargen(inicio, ahora, margenMinimoMin)) {
    return [];
  }

  // b + c, de menor a mayor antelación (de la más cercana a la cita a la más lejana).
  const candidatos: Candidato[] = [...new Set(antelacionesMin)]
    .sort((a, b) => a - b)
    .map((antelacionMin) => ({
      antelacionMin,
      programadoPara: adelantarAntesDelSilencio(
        new Date(inicio.getTime() - antelacionMin * MINUTO_MS),
        silencio,
        tz,
      ),
    }));

  // d: fusión. Gana el de menor antelación, que se visita primero.
  const conservados: Candidato[] = [];
  const absorbidoPor = new Map<Candidato, Candidato>();
  for (const candidato of candidatos) {
    const cercano = conservados.find(
      (c) =>
        Math.abs(
          c.programadoPara.getTime() - candidato.programadoPara.getTime(),
        ) <
        SEPARACION_MINIMA_FUSION_MIN * MINUTO_MS,
    );
    if (cercano) {
      absorbidoPor.set(candidato, cercano);
    } else {
      conservados.push(candidato);
    }
  }

  // d: vencimiento de los conservados, en orden cronológico.
  const venceEn = new Map<Candidato, Date>();
  const cronologicos = [...conservados].sort(porHora);
  cronologicos.forEach((actual, i) => {
    const siguiente = cronologicos[i + 1];
    venceEn.set(
      actual,
      siguiente
        ? siguiente.programadoPara
        : vencimientoDelUltimo(inicio, actual.programadoPara, margenMinimoMin),
    );
  });

  return [...candidatos].sort(porHora).map((candidato) => {
    const absorbente = absorbidoPor.get(candidato);
    return {
      antelacionMin: candidato.antelacionMin,
      programadoPara: candidato.programadoPara,
      venceEn: venceEn.get(absorbente ?? candidato) as Date,
      fusionado: absorbente !== undefined,
    };
  });
}

function vencimientoDelUltimo(
  inicio: Date,
  programadoPara: Date,
  margenMinimoMin: number,
): Date {
  const margen = margenMinimoMin * MINUTO_MS;
  return new Date(
    Math.max(
      inicio.getTime() - margen,
      Math.min(inicio.getTime(), programadoPara.getTime() + margen),
    ),
  );
}

/** Lo que `resolverTardios` necesita además de lo planificado. */
export interface ContextoTardios {
  citaId: string;
  tenantId: string;
  canal: CanalRecordatorio;
  /** El inicio para el que se planificó. */
  inicio: Date;
  ahora: Date;
  /**
   * Recordatorios no cancelados de la cita (`listarVigentesDeCita`). Si alguno
   * PARA ESTE INICIO ya salió (`enviado` / `entregado`), no hay tardío: el
   * paciente ya recibió un aviso de esta hora.
   */
  existentes: readonly Pick<DatosRecordatorio, 'inicioCita' | 'estado'>[];
  parametros: ParametrosPlanificacion;
}

/**
 * Reglas e–f de ADR-13 §5: convierte lo planificado en filas a insertar.
 *
 * - Fusionado → `omitido` (`fusionado`).
 * - Con su hora en el futuro → `programado`, `proximoIntentoEn = programadoPara`.
 * - Con su hora ya pasada:
 *   - si otro conservado queda en el futuro → `omitido` (`creada_tarde`);
 *   - si NINGUNO queda en el futuro, sale UNO solo, el de menor antelación,
 *     `programado` lo antes posible fuera de las horas sin envío, siempre que
 *     a esa hora falten al menos `antelacionMinimaTardiaMin` para la cita y
 *     sea antes de su `venceEn`; los demás (o todos, si no) → `omitido`
 *     (`creada_tarde`).
 * - 5.f: el tardío conserva `programadoPara` = la hora que le tocaba (ya
 *   pasada) y solo `proximoIntentoEn` es la real. Así reconciliar dos veces
 *   no inserta un segundo tardío: choca con la clave.
 *
 * Los omitidos se insertan igual (el profesional ve por qué no salieron) y
 * ocupan la clave. Su `proximoIntentoEn` no se usa: vale `programadoPara`.
 *
 * **Precisión sobre ADR-13 (anotada):** "faltan al menos 60 min" se mide
 * desde la hora a la que el tardío saldría de verdad (el fin del silencio si
 * `ahora` cae dentro), no desde `ahora`. Fuera del silencio es lo mismo.
 */
export function resolverTardios(
  planificados: readonly RecordatorioPlanificado[],
  contexto: ContextoTardios,
): NuevoRecordatorio[] {
  const { citaId, tenantId, canal, inicio, ahora, existentes, parametros } =
    contexto;
  const pasado = (p: RecordatorioPlanificado): boolean =>
    p.programadoPara.getTime() < ahora.getTime();

  const conservados = planificados.filter((p) => !p.fusionado);
  const tardio = elegirTardio(conservados, contexto);
  const proximoTardio = proximoInstantePermitido(
    ahora,
    parametros.silencio,
    parametros.tz,
  );
  const yaSalioAlgo = existentes.some(
    (e) =>
      e.inicioCita.getTime() === inicio.getTime() &&
      (e.estado === EstadoRecordatorio.ENVIADO ||
        e.estado === EstadoRecordatorio.ENTREGADO),
  );

  return planificados.map((p): NuevoRecordatorio => {
    const base = {
      tenantId,
      citaId,
      canal,
      antelacionMin: p.antelacionMin,
      inicioCita: inicio,
      programadoPara: p.programadoPara,
      venceEn: p.venceEn,
    };
    if (p.fusionado) {
      return omitido(base, MotivoRecordatorio.FUSIONADO);
    }
    if (!pasado(p)) {
      return {
        ...base,
        estado: EstadoRecordatorio.PROGRAMADO,
        motivo: null,
        proximoIntentoEn: p.programadoPara,
      };
    }
    if (p === tardio && !yaSalioAlgo) {
      return {
        ...base,
        estado: EstadoRecordatorio.PROGRAMADO,
        motivo: null,
        proximoIntentoEn: proximoTardio,
      };
    }
    return omitido(base, MotivoRecordatorio.CREADA_TARDE);
  });
}

/** El candidato a tardío único, o `null` si no corresponde (regla e). */
function elegirTardio(
  conservados: readonly RecordatorioPlanificado[],
  { inicio, ahora, parametros }: ContextoTardios,
): RecordatorioPlanificado | null {
  if (conservados.length === 0) return null;
  if (conservados.some((p) => p.programadoPara.getTime() >= ahora.getTime())) {
    return null; // hay uno a tiempo: los pasados son `creada_tarde`
  }
  const menorAntelacion = conservados.reduce((a, b) =>
    b.antelacionMin < a.antelacionMin ? b : a,
  );
  const saldria = proximoInstantePermitido(
    ahora,
    parametros.silencio,
    parametros.tz,
  ).getTime();
  const faltaSuficiente =
    inicio.getTime() - saldria >=
    parametros.antelacionMinimaTardiaMin * MINUTO_MS;
  const llegaATiempo = saldria < menorAntelacion.venceEn.getTime();
  return faltaSuficiente && llegaATiempo ? menorAntelacion : null;
}

function omitido(
  base: Omit<NuevoRecordatorio, 'estado' | 'motivo' | 'proximoIntentoEn'>,
  motivo: MotivoRecordatorio.FUSIONADO | MotivoRecordatorio.CREADA_TARDE,
): NuevoRecordatorio {
  return {
    ...base,
    estado: EstadoRecordatorio.OMITIDO,
    motivo,
    proximoIntentoEn: base.programadoPara,
  };
}
