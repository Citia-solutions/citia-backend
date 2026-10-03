/**
 * Vocabulario del recordatorio (ADR-13 §2 y §4).
 *
 * Paso 7 (database-agent): aquí viven SOLO los enums que la persistencia
 * necesita para sus CHECK y para la firma de sus puertos. La clase
 * `Recordatorio` con su máquina de estados (estado privado, transiciones con
 * guarda, error de dominio si es ilegal; misma disciplina que ADR-04) la
 * agrega el api-agent en el paso 8, en este mismo archivo (ADR-13 §1).
 *
 * Si se agrega un estado o un motivo, hay que cambiar también el CHECK de la
 * tabla con una migración nueva (`CHK_recordatorios_estado` /
 * `CHK_recordatorios_motivo`, migración 1750000010000).
 */

/** Canal del recordatorio. Fase 2: solo correo (ADR-13 §2). */
export enum CanalRecordatorio {
  EMAIL = 'email',
}

/** Los seis estados de ADR-13 §4. */
export enum EstadoRecordatorio {
  PROGRAMADO = 'programado',
  ENVIADO = 'enviado',
  ENTREGADO = 'entregado',
  FALLIDO = 'fallido',
  CANCELADO = 'cancelado',
  OMITIDO = 'omitido',
}

/**
 * Códigos de motivo de ADR-13 §4. Cada uno pertenece a un solo estado final
 * negativo (ver `MOTIVOS_POR_ESTADO`); `programado`, `enviado` y `entregado`
 * nunca llevan motivo.
 */
export enum MotivoRecordatorio {
  // cancelado: dejó de tener sentido (no es un fallo)
  CITA_TERMINAL = 'cita_terminal',
  REPROGRAMADO = 'reprogramado',
  DESACTIVADO = 'desactivado',
  // omitido: una regla decidió no enviarlo (no es un fallo del servicio)
  CREADA_TARDE = 'creada_tarde',
  FUSIONADO = 'fusionado',
  SIN_CORREO = 'sin_correo',
  CORREO_SUPRIMIDO = 'correo_suprimido',
  LIMITE_TENANT = 'limite_tenant',
  SIN_CONSENTIMIENTO = 'sin_consentimiento',
  // fallido: se intentó y no llegó (cuenta contra RNF-03)
  CORREO_INVALIDO = 'correo_invalido',
  RECHAZADO = 'rechazado',
  VENCIDO = 'vencido',
  CUOTA_AGOTADA = 'cuota_agotada',
  REBOTE = 'rebote',
}

export type MotivoCancelacion =
  | MotivoRecordatorio.CITA_TERMINAL
  | MotivoRecordatorio.REPROGRAMADO
  | MotivoRecordatorio.DESACTIVADO;

export type MotivoOmision =
  | MotivoRecordatorio.CREADA_TARDE
  | MotivoRecordatorio.FUSIONADO
  | MotivoRecordatorio.SIN_CORREO
  | MotivoRecordatorio.CORREO_SUPRIMIDO
  | MotivoRecordatorio.LIMITE_TENANT
  | MotivoRecordatorio.SIN_CONSENTIMIENTO;

export type MotivoFallo =
  | MotivoRecordatorio.CORREO_INVALIDO
  | MotivoRecordatorio.RECHAZADO
  | MotivoRecordatorio.VENCIDO
  | MotivoRecordatorio.CUOTA_AGOTADA
  | MotivoRecordatorio.REBOTE;

export const MOTIVOS_CANCELACION: readonly MotivoCancelacion[] = [
  MotivoRecordatorio.CITA_TERMINAL,
  MotivoRecordatorio.REPROGRAMADO,
  MotivoRecordatorio.DESACTIVADO,
];

export const MOTIVOS_OMISION: readonly MotivoOmision[] = [
  MotivoRecordatorio.CREADA_TARDE,
  MotivoRecordatorio.FUSIONADO,
  MotivoRecordatorio.SIN_CORREO,
  MotivoRecordatorio.CORREO_SUPRIMIDO,
  MotivoRecordatorio.LIMITE_TENANT,
  MotivoRecordatorio.SIN_CONSENTIMIENTO,
];

export const MOTIVOS_FALLO: readonly MotivoFallo[] = [
  MotivoRecordatorio.CORREO_INVALIDO,
  MotivoRecordatorio.RECHAZADO,
  MotivoRecordatorio.VENCIDO,
  MotivoRecordatorio.CUOTA_AGOTADA,
  MotivoRecordatorio.REBOTE,
];

/**
 * Qué motivos admite cada estado. Lista vacía = el estado NO lleva motivo
 * (`motivo IS NULL`). La base lo impone con `CHK_recordatorios_motivo`.
 */
export const MOTIVOS_POR_ESTADO: Readonly<
  Record<EstadoRecordatorio, readonly MotivoRecordatorio[]>
> = {
  [EstadoRecordatorio.PROGRAMADO]: [],
  [EstadoRecordatorio.ENVIADO]: [],
  [EstadoRecordatorio.ENTREGADO]: [],
  [EstadoRecordatorio.CANCELADO]: MOTIVOS_CANCELACION,
  [EstadoRecordatorio.OMITIDO]: MOTIVOS_OMISION,
  [EstadoRecordatorio.FALLIDO]: MOTIVOS_FALLO,
};
