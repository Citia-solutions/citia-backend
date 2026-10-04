/**
 * Vocabulario y máquina de estados del recordatorio (ADR-13 §2 y §4).
 *
 * - Los enums los usa también la persistencia, para sus CHECK y la firma de
 *   sus puertos.
 * - La clase `Recordatorio` (al final) es la máquina de estados: estado
 *   privado, transiciones con guarda y `TransicionRecordatorioInvalidaError`
 *   si es ilegal; misma disciplina que `Cita` (ADR-04).
 *
 * Si se agrega un estado o un motivo, hay que cambiar también el CHECK de la
 * tabla con una migración nueva (`CHK_recordatorios_estado` /
 * `CHK_recordatorios_motivo`, migración 1750000010000).
 */
import { TransicionRecordatorioInvalidaError } from './exceptions/transicion-recordatorio-invalida.error';
import type {
  DatosRecordatorio,
  EnvioAceptado,
} from './recordatorio.repository';

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

/**
 * Estados finales: ninguna transición los cambia. `entregado` solo puede
 * recibir una queja, que fija `quejaEn` sin cambiar el estado.
 */
const ESTADOS_FINALES: ReadonlySet<EstadoRecordatorio> = new Set([
  EstadoRecordatorio.ENTREGADO,
  EstadoRecordatorio.FALLIDO,
  EstadoRecordatorio.CANCELADO,
  EstadoRecordatorio.OMITIDO,
]);

/** Motivos de `fallido` que puede traer un recordatorio ya `enviado` (webhook). */
const MOTIVOS_FALLO_TRAS_ENVIO: ReadonlySet<MotivoRecordatorio> = new Set([
  MotivoRecordatorio.REBOTE,
  MotivoRecordatorio.RECHAZADO,
]);

/** Opciones de `fallar`. */
export interface OpcionesFallo {
  /** Código del proveedor (nunca datos personales). Sin él se conserva el anterior. */
  ultimoError?: string | null;
  /** `true` si el fallo vino de una llamada al proveedor y suma un intento. */
  contarIntento?: boolean;
}

/**
 * Un recordatorio de una cita para un canal y una antelación (ADR-13 §2, §4).
 *
 * Se reconstituye desde la fila (`DatosRecordatorio`). NACE en la base, no
 * aquí: la planificación produce `NuevoRecordatorio` (`programado` u
 * `omitido`) y el repositorio genera el id.
 *
 * Transiciones (ADR-13 §4):
 *
 * | Desde                | Método                        | Hacia                      |
 * |----------------------|-------------------------------|----------------------------|
 * | programado           | registrarEnvio                | enviado                    |
 * | programado · enviado | registrarEntrega              | entregado                  |
 * | programado           | anular(motivo)                | cancelado                  |
 * | programado           | omitir(motivo)                | omitido                    |
 * | programado           | fallar(motivo)                | fallido                    |
 * | enviado              | fallar(rebote · rechazado)    | fallido                    |
 * | programado           | registrarReintento · posponer | programado                 |
 * | enviado · entregado  | registrarQueja                | (sin cambio; fija quejaEn) |
 *
 * `fallar` desde `programado` admite cualquier motivo de fallo: además de los
 * de la tabla de ADR-13, un rebote que llega por webhook antes de que se
 * confirme el envío (el mismo caso que `registrarEntrega` desde `programado`,
 * ADR-13 §9.4).
 *
 * Las mismas guardas están en el SQL del adaptador (`WHERE estado = …`): la
 * entidad es la regla y la base la última defensa.
 */
export class Recordatorio {
  private readonly datos: DatosRecordatorio;

  private constructor(datos: DatosRecordatorio) {
    this.datos = { ...datos };
  }

  /** Desde la fila guardada; no valida transiciones (las filas ya pasaron por ellas). */
  static reconstituir(datos: DatosRecordatorio): Recordatorio {
    return new Recordatorio(datos);
  }

  get id(): string {
    return this.datos.id;
  }

  get tenantId(): string {
    return this.datos.tenantId;
  }

  get citaId(): string {
    return this.datos.citaId;
  }

  get canal(): CanalRecordatorio {
    return this.datos.canal;
  }

  get antelacionMin(): number {
    return this.datos.antelacionMin;
  }

  get inicioCita(): Date {
    return this.datos.inicioCita;
  }

  get programadoPara(): Date {
    return this.datos.programadoPara;
  }

  get venceEn(): Date {
    return this.datos.venceEn;
  }

  get estado(): EstadoRecordatorio {
    return this.datos.estado;
  }

  get motivo(): MotivoRecordatorio | null {
    return this.datos.motivo;
  }

  get intentos(): number {
    return this.datos.intentos;
  }

  get proximoIntentoEn(): Date {
    return this.datos.proximoIntentoEn;
  }

  get ultimoError(): string | null {
    return this.datos.ultimoError;
  }

  get enviadoEn(): Date | null {
    return this.datos.enviadoEn;
  }

  get entregadoEn(): Date | null {
    return this.datos.entregadoEn;
  }

  get quejaEn(): Date | null {
    return this.datos.quejaEn;
  }

  /** Sigue en la cola del envío. Es lo único que la reconciliación puede anular. */
  estaProgramado(): boolean {
    return this.datos.estado === EstadoRecordatorio.PROGRAMADO;
  }

  /** Ninguna transición lo cambia (salvo la queja sobre un `entregado`). */
  esFinal(): boolean {
    return ESTADOS_FINALES.has(this.datos.estado);
  }

  /** `true` si la fila es para ese `inicio` de la cita (ADR-13 §7, política 1). */
  esParaInicio(inicio: Date): boolean {
    return this.datos.inicioCita.getTime() === inicio.getTime();
  }

  /** programado → enviado: el proveedor lo aceptó (o `posible_duplicado`). */
  registrarEnvio(envio: EnvioAceptado, ahora: Date): void {
    this.exigir(this.estaProgramado(), 'registrarEnvio');
    this.datos.estado = EstadoRecordatorio.ENVIADO;
    this.datos.enviadoEn = ahora;
    this.datos.proveedor = envio.proveedor;
    this.datos.proveedorMensajeId = envio.proveedorMensajeId;
    this.datos.intentos += 1;
  }

  /** programado · enviado → entregado (webhook `delivered`). */
  registrarEntrega(ahora: Date): void {
    this.exigir(
      this.estaProgramado() || this.datos.estado === EstadoRecordatorio.ENVIADO,
      'registrarEntrega',
    );
    this.datos.estado = EstadoRecordatorio.ENTREGADO;
    this.datos.entregadoEn = ahora;
    this.datos.enviadoEn ??= ahora;
  }

  /** programado → cancelado: dejó de tener sentido (no es un fallo). */
  anular(motivo: MotivoCancelacion): void {
    this.exigirMotivo(EstadoRecordatorio.CANCELADO, motivo, 'anular');
    this.exigir(this.estaProgramado(), `anular(${motivo})`);
    this.datos.estado = EstadoRecordatorio.CANCELADO;
    this.datos.motivo = motivo;
  }

  /** programado → omitido: una regla decidió no enviarlo (ADR-13 §7). */
  omitir(motivo: MotivoOmision): void {
    this.exigirMotivo(EstadoRecordatorio.OMITIDO, motivo, 'omitir');
    this.exigir(this.estaProgramado(), `omitir(${motivo})`);
    this.datos.estado = EstadoRecordatorio.OMITIDO;
    this.datos.motivo = motivo;
  }

  /**
   * programado → fallido (cualquier motivo de fallo), o enviado → fallido
   * (solo `rebote` / `rechazado`, por webhook). Cuenta contra RNF-03.
   */
  fallar(motivo: MotivoFallo, opciones: OpcionesFallo = {}): void {
    this.exigirMotivo(EstadoRecordatorio.FALLIDO, motivo, 'fallar');
    this.exigir(
      this.estaProgramado() ||
        (this.datos.estado === EstadoRecordatorio.ENVIADO &&
          MOTIVOS_FALLO_TRAS_ENVIO.has(motivo)),
      `fallar(${motivo})`,
    );
    this.datos.estado = EstadoRecordatorio.FALLIDO;
    this.datos.motivo = motivo;
    if (opciones.ultimoError !== undefined && opciones.ultimoError !== null) {
      this.datos.ultimoError = opciones.ultimoError;
    }
    if (opciones.contarIntento === true) {
      this.datos.intentos += 1;
    }
  }

  /** Sigue programado tras un error transitorio: suma un intento y reprograma. */
  registrarReintento(ultimoError: string, proximoIntentoEn: Date): void {
    this.exigir(this.estaProgramado(), 'registrarReintento');
    this.datos.intentos += 1;
    this.datos.ultimoError = ultimoError;
    this.datos.proximoIntentoEn = proximoIntentoEn;
  }

  /** Sigue programado, SIN sumar intento (horas sin envío, reinicio de cuota). */
  posponer(hasta: Date): void {
    this.exigir(this.estaProgramado(), 'posponer');
    this.datos.proximoIntentoEn = hasta;
  }

  /**
   * Queja del destinatario (webhook `complained`): fija `quejaEn` una sola vez
   * y no cambia el estado. Devuelve `false` si ya estaba fijada (monótono).
   */
  registrarQueja(ahora: Date): boolean {
    this.exigir(
      this.datos.estado === EstadoRecordatorio.ENVIADO ||
        this.datos.estado === EstadoRecordatorio.ENTREGADO,
      'registrarQueja',
    );
    if (this.datos.quejaEn !== null) {
      return false;
    }
    this.datos.quejaEn = ahora;
    return true;
  }

  /** Copia de los datos actuales, en la forma del puerto. */
  aDatos(): DatosRecordatorio {
    return { ...this.datos };
  }

  private exigir(permitido: boolean, evento: string): void {
    if (!permitido) {
      throw new TransicionRecordatorioInvalidaError(this.datos.estado, evento);
    }
  }

  // El tipo ya empareja estado y motivo; esto cubre un motivo forzado con
  // `as` o venido de fuera, que la base rechazaría con su CHECK.
  private exigirMotivo(
    hacia: EstadoRecordatorio,
    motivo: MotivoRecordatorio,
    evento: string,
  ): void {
    if (!MOTIVOS_POR_ESTADO[hacia].includes(motivo)) {
      throw new TransicionRecordatorioInvalidaError(
        this.datos.estado,
        `${evento}(${String(motivo)})`,
      );
    }
  }
}
