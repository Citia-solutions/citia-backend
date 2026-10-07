import { TransactionContext } from '../../../shared/application/transaction-runner';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoCancelacion,
  MotivoFallo,
  MotivoOmision,
  MotivoRecordatorio,
} from './recordatorio.entity';

/**
 * Fila de `recordatorios` tal como está guardada (ADR-13 §2).
 *
 * Tipo de datos PLANO a propósito: el puerto no conoce la clase `Recordatorio`
 * (paso 8, api-agent). El dominio la reconstituye desde aquí y vuelve a
 * hablar con el puerto en estos mismos términos.
 *
 * No hay destinatario ni contenido: el correo se lee del paciente al enviar
 * (`LectorCitas.obtenerDatosEnvio`) y el registro de entrega es el estado, las
 * fechas y el id del proveedor.
 */
export interface DatosRecordatorio {
  /** También la clave de idempotencia ante el proveedor (ADR-13 §9). */
  id: string;
  tenantId: string;
  citaId: string;
  canal: CanalRecordatorio;
  /** El "tipo": 1440 = 24 h, 120 = 2 h. */
  antelacionMin: number;
  /** Inicio de la cita para el que se calculó. */
  inicioCita: Date;
  /** Hora PLANIFICADA; forma parte de la clave única (ADR-13 §5.f). */
  programadoPara: Date;
  venceEn: Date;
  estado: EstadoRecordatorio;
  motivo: MotivoRecordatorio | null;
  /** Llamadas al proveedor hechas (éxito, reintento o fallo tras llamar). */
  intentos: number;
  /** Hora REAL de la cola (= programadoPara salvo tardíos y reintentos). */
  proximoIntentoEn: Date;
  /** Código del proveedor, truncado. Nunca datos personales. */
  ultimoError: string | null;
  proveedor: string | null;
  proveedorMensajeId: string | null;
  enviadoEn: Date | null;
  entregadoEn: Date | null;
  quejaEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

interface BaseNuevoRecordatorio {
  tenantId: string;
  citaId: string;
  canal: CanalRecordatorio;
  antelacionMin: number;
  inicioCita: Date;
  programadoPara: Date;
  venceEn: Date;
  proximoIntentoEn: Date;
}

/**
 * Lo que produce la planificación (`planificar` + `resolverTardios`, ADR-13 §5)
 * para insertar. Un recordatorio NACE `programado` (sin motivo) u `omitido`
 * (con `creada_tarde` / `fusionado` / …); nunca en otro estado (ADR-13 §4).
 * El id lo genera la base.
 */
export type NuevoRecordatorio =
  | (BaseNuevoRecordatorio & {
      estado: EstadoRecordatorio.PROGRAMADO;
      motivo: null;
    })
  | (BaseNuevoRecordatorio & {
      estado: EstadoRecordatorio.OMITIDO;
      motivo: MotivoOmision;
    });

/** Resultado aceptado por el proveedor (ADR-13 §8 `aceptado` / `posible_duplicado`). */
export interface EnvioAceptado {
  /** p. ej. `'resend'` o `'registro'`. */
  proveedor: string;
  /** `null` para `posible_duplicado`: lo completa el webhook `email.sent`. */
  proveedorMensajeId: string | null;
}

/** Error transitorio con reintento ya calculado por el dominio (ADR-13 §8). */
export interface ReintentoEnvio {
  ultimoError: string;
  proximoIntentoEn: Date;
}

/** Paso a `fallido` (ADR-13 §4). */
export interface FalloEnvio {
  motivo: MotivoFallo;
  /** `null` conserva el último error guardado (útil para `vencido`). */
  ultimoError: string | null;
  /**
   * `true` si este fallo vino de una llamada al proveedor (p. ej. 422) y debe
   * sumar un intento; `false` si lo decidió una política sin llamar
   * (`vencido`, `cuota_agotada`).
   */
  contarIntento: boolean;
}

/**
 * Cómo se encuentra la fila desde el webhook (ADR-13 §10): primero por la
 * etiqueta `recordatorio_id` y, si falta o no existe, por el id del mensaje.
 * Un `recordatorioId` que no sea un UUID se trata como ausente.
 */
export interface LocalizadorEntrega {
  recordatorioId: string | null;
  proveedorMensajeId: string | null;
}

/**
 * Eventos de entrega que cambian la fila (ADR-13 §10). `delivery_delayed`,
 * los rebotes transitorios, aperturas y clics no llegan aquí.
 */
export enum TipoEventoEntrega {
  /** `email.sent`: completa `proveedor_mensaje_id` si faltaba. */
  ENVIADO = 'enviado',
  /** `email.delivered`: `programado`/`enviado` → `entregado`. */
  ENTREGADO = 'entregado',
  /** `email.bounced` PERMANENTE: `programado`/`enviado` → `fallido` (`rebote`). */
  REBOTADO = 'rebotado',
  /** `email.failed`: `programado`/`enviado` → `fallido` (`rechazado`). */
  RECHAZADO = 'rechazado',
  /** `email.complained`: fija `queja_en` una vez; el estado no cambia. */
  QUEJA = 'queja',
}

export interface EventoEntrega {
  tipo: TipoEventoEntrega;
  /** p. ej. `'resend'`; se guarda si la fila aún no tenía proveedor. */
  proveedor: string;
  proveedorMensajeId: string | null;
  /** Hora del evento (la del proveedor o la de recepción; decide quien llama). */
  ocurridoEn: Date;
}

export interface ResultadoEventoEntrega {
  /** `null` = id desconocido (p. ej. un correo de prueba): 200 y se ignora. */
  recordatorio: DatosRecordatorio | null;
  /**
   * `false` si la fila existe pero el evento no la cambia (repetido o fuera de
   * orden: los efectos son monótonos). `recordatorio` trae entonces su estado
   * actual, p. ej. para la supresión de un rebote.
   */
  aplicado: boolean;
}

/** Desenlaces para la tasa de fallo de ADR-13 §16 (sin `cancelado` ni `omitido`). */
export interface ConteoDesenlaces {
  entregados: number;
  fallidos: number;
}

/**
 * Puerto de persistencia de `recordatorios` (ADR-13 §2, §6, §7, §9, §10, §11).
 *
 * TODOS los métodos exigen `tx` (mismo criterio que el outbox, ADR-12 §2):
 *  - las escrituras van en la transacción del suscriptor, del envío o del
 *    webhook;
 *  - el reclamo y el candado solo tienen sentido dentro de una transacción;
 *  - las lecturas también, para que nadie abra una segunda conexión del pool
 *    mientras retiene la primera. Una ruta GET abre una con
 *    `TransactionRunner.run`.
 * El adaptador lanza si recibe `undefined`.
 *
 * Reloj por parámetro: las fechas de negocio (`enviado_en`, `entregado_en`, la
 * hora de reclamo) llegan como argumento. `creado_en` / `actualizado_en` son
 * de auditoría y los pone la base (`now()` de la transacción).
 *
 * Las escrituras que cambian estado tienen GUARDA en el SQL (p. ej. solo
 * desde `programado`) y devuelven si aplicaron: una fila nunca retrocede.
 *
 * Los métodos marcados BARRIDO GLOBAL no filtran por tenant (ADR-12 §6): solo
 * los invoca el planificador y nunca se exponen por HTTP. Una vez tomada la
 * fila, todo lo que sigue usa su `tenantId`.
 */
export abstract class RecordatorioRepository {
  /**
   * Candado consultivo de TRANSACCIÓN sobre la cita (ADR-13 §6 paso 1):
   * `pg_advisory_xact_lock`, bloqueante. Serializa dos reconciliaciones de la
   * misma cita sin tocar la tabla `citas`; se suelta solo al terminar `tx`.
   */
  abstract bloquearCitaParaReconciliar(
    citaId: string,
    tx: TransactionContext,
  ): Promise<void>;

  /**
   * Inserta los que no choquen con la clave única parcial
   * `(cita_id, canal, antelacion_min, programado_para) WHERE estado <> 'cancelado'`
   * (`ON CONFLICT DO NOTHING`, última defensa de ADR-13 §6 paso 5). Devuelve
   * SOLO los insertados; lista vacía si todos existían.
   */
  abstract insertarSiNoExisten(
    nuevos: readonly NuevoRecordatorio[],
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]>;

  /**
   * Los de la cita que ocupan la clave única: todos menos `cancelado`
   * (programado, enviado, entregado, fallido, omitido). Es lo "existente" que
   * la reconciliación compara con lo planificado. Por `programado_para`.
   */
  abstract listarVigentesDeCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]>;

  /**
   * Todos los de la cita, también los cancelados, por `programado_para` y
   * `creado_en`. Para `GET citas/:citaId/recordatorios` (la ruta NO debe
   * exponer `proveedorMensajeId` ni datos del destinatario).
   */
  abstract listarPorCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]>;

  /**
   * `programado` → `cancelado` con el motivo. Los que ya no estaban
   * programados (p. ej. se enviaron mientras tanto) no se tocan. Devuelve los
   * ids que sí se anularon. Si otro proceso tiene la fila bloqueada (envío en
   * curso), espera a que termine.
   */
  abstract anular(
    ids: readonly string[],
    tenantId: string,
    motivo: MotivoCancelacion,
    tx: TransactionContext,
  ): Promise<string[]>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * Toma y BLOQUEA el `programado` con `proximo_intento_en <= ahora` más
   * antiguo, saltando los que otro proceso tiene (`FOR UPDATE SKIP LOCKED`,
   * ADR-13 §7 paso 1). `null` si no queda ninguno libre. El bloqueo dura
   * hasta el fin de `tx`: el resultado del envío se registra en ese `tx`.
   */
  abstract reclamarProximoProgramado(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio | null>;

  /**
   * `programado` → `enviado`, `enviado_en = ahora`, `intentos + 1`, proveedor e
   * id del mensaje. `false` si ya no estaba programado.
   */
  abstract registrarEnvio(
    id: string,
    tenantId: string,
    envio: EnvioAceptado,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean>;

  /**
   * Sigue `programado`: `intentos + 1`, `ultimo_error` (truncado) y el
   * `proximo_intento_en` que calculó el dominio (1, 5, 15, 30, 60 min acotado
   * por `vence_en`). `false` si ya no estaba programado.
   */
  abstract registrarReintento(
    id: string,
    tenantId: string,
    reintento: ReintentoEnvio,
    tx: TransactionContext,
  ): Promise<boolean>;

  /**
   * Sigue `programado`, SIN sumar intento: mueve `proximo_intento_en` (horas
   * sin envío, reinicio de la cuota; políticas 4 y 9 de ADR-13 §7). `false` si
   * ya no estaba programado.
   */
  abstract posponer(
    id: string,
    tenantId: string,
    proximoIntentoEn: Date,
    tx: TransactionContext,
  ): Promise<boolean>;

  /** `programado` → `omitido` con el motivo. `false` si ya no estaba programado. */
  abstract omitir(
    id: string,
    tenantId: string,
    motivo: MotivoOmision,
    tx: TransactionContext,
  ): Promise<boolean>;

  /** `programado` → `fallido` con el motivo. `false` si ya no estaba programado. */
  abstract registrarFallo(
    id: string,
    tenantId: string,
    fallo: FalloEnvio,
    tx: TransactionContext,
  ): Promise<boolean>;

  // SIN FILTRO DE TENANT: webhook (ADR-13 §10, ADR-12 §6)
  /**
   * Aplica un evento de entrega con efectos MONÓTONOS (ADR-13 §9.4): bloquea
   * la fila (`FOR UPDATE`, espera si hay un envío en curso) y la actualiza
   * solo si el evento la hace avanzar. Repetido, fuera de orden o sobre un
   * estado final → `aplicado: false`, sin cambios. El tenant se deduce de la
   * fila (`recordatorio.tenantId`).
   */
  abstract registrarEventoEntrega(
    localizador: LocalizadorEntrega,
    evento: EventoEntrega,
    tx: TransactionContext,
  ): Promise<ResultadoEventoEntrega>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * Recordatorios con `enviado_en` en `[desde, hasta)`, de toda la plataforma:
   * el contador local de la cuota del proveedor (ADR-13 §11). Los periodos
   * (día y mes en UTC) los da `periodos-conteo.ts`.
   */
  abstract contarEnviadosEntre(
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<number>;

  /**
   * Igual, de un tenant: el fusible diario por organización (ADR-13 §11, día
   * en la zona de la clínica: `periodoDiaEnZona`).
   */
  abstract contarEnviadosDeTenantEntre(
    tenantId: string,
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<number>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * `entregado` y `fallido` cuyo `actualizado_en` (cuando llegaron a ese
   * estado) cae en `[desde, hasta)`. Para la tasa de fallo de ADR-13 §16.
   */
  abstract contarDesenlacesEntre(
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<ConteoDesenlaces>;
}
