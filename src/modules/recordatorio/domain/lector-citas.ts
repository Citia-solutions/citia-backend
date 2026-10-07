import { TransactionContext } from '../../../shared/application/transaction-runner';

/**
 * Lo que `recordatorio` necesita de una cita (ADR-13 §1, §6). Datos planos,
 * sin la entidad `Cita`: este módulo depende del ESQUEMA de `citas`, en
 * lectura, no del módulo `cita`.
 */
export interface CitaLeida {
  id: string;
  tenantId: string;
  /** El profesional DUEÑO de la cita: de él se lee la configuración (ADR-13 §6 paso 2). */
  usuarioId: string;
  pacienteId: string;
  inicio: Date;
  /** Estado tal cual (`pendiente`, `cancelada`, …). Para logs; las decisiones usan `vigente`. */
  estado: string;
  /** `true` si la cita sigue siendo un compromiso abierto (ESTADOS_VIGENTES de ADR-04). */
  vigente: boolean;
}

/**
 * Lo que el envío relee justo antes de mandar (ADR-13 §7 paso 2), en UNA
 * consulta. El contacto del profesional viene de su configuración
 * (`ConfiguracionRecordatorioRepository`), no de aquí.
 */
export interface DatosEnvioCita {
  cita: CitaLeida;
  paciente: {
    /** `null` también si está guardado vacío o en blanco → `omitido` (`sin_correo`). */
    correo: string | null;
    consentimiento: boolean;
  };
  profesional: { nombreCompleto: string };
  organizacion: { nombre: string };
}

/** Página del barrido de respaldo, por `(inicio, id)` ascendente. */
export interface ConsultaCitasSinRecordatorio {
  /** Cota inferior de `inicio`, inclusiva (típicamente `ahora + margen mínimo`). */
  desde: Date;
  /** Cota superior de `inicio`, exclusiva (`ahora + 8 días`, ADR-13 §6). */
  hasta: Date;
  /** Tamaño de la página (> 0). */
  limite: number;
  /**
   * Cursor: la última cita de la página anterior. Sin cursor, desde el
   * principio. Hace que el job avance aunque una página entera siga sin
   * recordatorios después de reconciliarla (p. ej. configuración apagada).
   */
  despuesDe?: { inicio: Date; id: string } | null;
}

/**
 * Puerto de SOLO LECTURA sobre `citas`, `pacientes`, `usuarios` y `tenants`
 * (ADR-13 §1). El adaptador es SQL directo; nunca escribe en esas tablas.
 *
 * Los métodos por cita filtran por `tenantId` (el del hecho o el de la fila
 * de recordatorio tomada). Un `citaId` que no sea UUID devuelve "no existe".
 *
 * `tx` obligatorio, como el resto de puertos del módulo.
 */
export abstract class LectorCitas {
  /** Para reconciliar (ADR-13 §6 paso 2) y para el 404 de la ruta de estado. */
  abstract obtenerCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<CitaLeida | null>;

  /** Cita + paciente + profesional + organización, en una sola consulta. */
  abstract obtenerDatosEnvio(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosEnvioCita | null>;

  /**
   * Citas vigentes del profesional con `inicio >= desde`, por `inicio`. Para
   * `ConfiguracionRecordatorioActualizada` (ADR-13 §6): reconciliar las
   * futuras de ese profesional.
   */
  abstract listarVigentesDeProfesionalDesde(
    tenantId: string,
    usuarioId: string,
    desde: Date,
    tx: TransactionContext,
  ): Promise<CitaLeida[]>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * Reconciliación de respaldo (ADR-13 §6): citas vigentes de TODOS los
   * tenants con `inicio` en `[desde, hasta)` que no tienen NINGÚN
   * recordatorio (de cualquier estado) para su `inicio` actual. Cada cita
   * trae su `tenantId`: lo que siga trabaja con él.
   */
  abstract listarVigentesSinRecordatorio(
    consulta: ConsultaCitasSinRecordatorio,
    tx: TransactionContext,
  ): Promise<CitaLeida[]>;
}
