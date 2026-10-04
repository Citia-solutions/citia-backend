// Reconciliación de una cita (ADR-13 §6): compara lo que DEBERÍA existir
// según el estado actual de la cita y la configuración de su profesional con
// lo que YA existe, y decide qué anular y qué insertar. Pura: los datos llegan
// ya leídos y la decisión la aplica quien llama, con su transacción.
//
// No aplica deltas (ADR-12 §4 regla 2): el hecho que la dispara no importa,
// solo el estado actual. Por eso es idempotente: con lo insertado la primera
// vez, la segunda no decide nada.
import {
  ParametrosPlanificacion,
  fueraDeMargen,
  planificar,
  resolverTardios,
} from './planificacion';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoCancelacion,
  MotivoRecordatorio,
  Recordatorio,
} from './recordatorio.entity';
import type {
  DatosRecordatorio,
  NuevoRecordatorio,
} from './recordatorio.repository';

/** La cita tal como se releyó (`LectorCitas.obtenerCita`). */
export interface CitaAReconciliar {
  id: string;
  tenantId: string;
  inicio: Date;
  vigente: boolean;
}

/** La configuración del profesional DUEÑO de la cita (o la predeterminada). */
export interface ConfiguracionAplicable {
  activo: boolean;
  canal: CanalRecordatorio;
  antelacionesMin: readonly number[];
}

export interface EntradaReconciliacion {
  /** `null` si la cita no existe en ese tenant. */
  cita: CitaAReconciliar | null;
  /** `null` solo si no hay cita (no se sabe de quién leerla). */
  configuracion: ConfiguracionAplicable | null;
  /** `listarVigentesDeCita`: todos menos los `cancelado`, de cualquier inicio. */
  existentes: readonly DatosRecordatorio[];
  ahora: Date;
  parametros: ParametrosPlanificacion;
}

export interface DecisionReconciliacion {
  /** Ids de `programado` que ya no corresponden. */
  anular: string[];
  /** Un solo motivo por decisión (cada rama tiene uno). */
  motivoAnulacion: MotivoCancelacion;
  /** Lo que falta. `insertarSiNoExisten` es la última defensa ante la clave. */
  insertar: NuevoRecordatorio[];
}

/**
 * Decide qué anular y qué insertar para una cita (ADR-13 §6):
 *
 * | Situación                              | Anula (solo `programado`)      | Inserta |
 * |----------------------------------------|--------------------------------|---------|
 * | la cita no existe o no está vigente    | todos (`cita_terminal`)        | nada    |
 * | configuración apagada                  | todos (`desactivado`)          | nada    |
 * | `inicio − margen ≤ ahora`              | los de OTRO inicio (`reprogramado`) | nada |
 * | si no                                  | los que no coinciden con el plan (`reprogramado`) | lo que falta del plan |
 *
 * Cuándo un existente "coincide" con un planificado (mismo canal, antelación
 * e `inicioCita` = inicio actual):
 *  - con la misma `programadoPara` (la clave única), en cualquier estado: se
 *    conserva tal cual;
 *  - con otra `programadoPara` pero ya resuelto (`enviado`, `entregado`,
 *    `fallido`, `omitido`): el planificado se da por cubierto y no se inserta
 *    (no se recuerda dos veces la misma antelación de la misma hora aunque
 *    cambie el silencio global entre despliegues);
 *  - un `programado` con otra `programadoPara` NO coincide: se anula y se
 *    inserta el nuevo.
 *
 * Un existente de OTRO inicio (la cita se reagendó) nunca coincide, aunque su
 * `programadoPara` sea la misma (p. ej. dos inicios que el silencio adelanta a
 * las mismas 20:59): se anula si sigue `programado` y se inserta el nuevo, que
 * ya no choca con la clave porque el anulado pasa a `cancelado` antes.
 */
export function reconciliar(
  entrada: EntradaReconciliacion,
): DecisionReconciliacion {
  const { cita, configuracion, existentes, ahora, parametros } = entrada;
  const programados = existentes.filter((e) =>
    Recordatorio.reconstituir(e).estaProgramado(),
  );
  const ids = (filas: readonly DatosRecordatorio[]): string[] =>
    filas.map((f) => f.id);

  if (!cita || !cita.vigente) {
    return {
      anular: ids(programados),
      motivoAnulacion: MotivoRecordatorio.CITA_TERMINAL,
      insertar: [],
    };
  }
  if (!configuracion || !configuracion.activo) {
    return {
      anular: ids(programados),
      motivoAnulacion: MotivoRecordatorio.DESACTIVADO,
      insertar: [],
    };
  }

  const delInicio = existentes.filter((e) =>
    Recordatorio.reconstituir(e).esParaInicio(cita.inicio),
  );
  if (fueraDeMargen(cita.inicio, ahora, parametros.margenMinimoMin)) {
    // Demasiado tarde para planificar: los del inicio actual siguen su curso
    // (el envío los vence); solo sobran los de un inicio anterior.
    return {
      anular: ids(programados.filter((p) => !delInicio.includes(p))),
      motivoAnulacion: MotivoRecordatorio.REPROGRAMADO,
      insertar: [],
    };
  }

  const planificados = planificar({
    inicio: cita.inicio,
    antelacionesMin: configuracion.antelacionesMin,
    activo: configuracion.activo,
    vigente: cita.vigente,
    ahora,
    parametros,
  });
  const nuevos = resolverTardios(planificados, {
    citaId: cita.id,
    tenantId: cita.tenantId,
    canal: configuracion.canal,
    inicio: cita.inicio,
    ahora,
    existentes: delInicio,
    parametros,
  });

  const conservados = new Set<string>();
  const insertar: NuevoRecordatorio[] = [];
  for (const nuevo of nuevos) {
    const mismoTipo = (e: DatosRecordatorio): boolean =>
      e.canal === nuevo.canal && e.antelacionMin === nuevo.antelacionMin;
    const exacto = delInicio.find(
      (e) =>
        mismoTipo(e) &&
        e.programadoPara.getTime() === nuevo.programadoPara.getTime(),
    );
    if (exacto) {
      conservados.add(exacto.id);
      continue;
    }
    const yaResuelto = delInicio.some(
      (e) => mismoTipo(e) && e.estado !== EstadoRecordatorio.PROGRAMADO,
    );
    if (!yaResuelto) {
      insertar.push(nuevo);
    }
  }

  return {
    anular: ids(programados.filter((p) => !conservados.has(p.id))),
    motivoAnulacion: MotivoRecordatorio.REPROGRAMADO,
    insertar,
  };
}
