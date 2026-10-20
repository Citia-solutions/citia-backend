import { Cita, ESTADOS_VIGENTES } from './cita.entity';

/**
 * Enlace del paciente a su cita (Fase 3, contrato §2.1 y §3.1).
 *
 * El token NO vive aquí: se recalcula con HMAC a partir de (cita, versión) y
 * en la entidad solo está su `tokenHash` (SHA-256 hex). Así, la misma
 * (cita, versión) da siempre el mismo token (E2) y un volcado de la base no
 * sirve para abrir enlaces.
 *
 * Reglas:
 *  - Un enlace activo por cita (E1); la base lo garantiza con un índice único
 *    parcial. Invalidar (S1) revoca el actual; el siguiente es `max(version) + 1`.
 *  - El `id` es el `actor_id` del paciente en la bitácora de la cita.
 *  - Una fila nunca cambia su versión ni su hash: lo único mutable es la
 *    revocación y la primera apertura (US-07.01, H5). Cada una va por su
 *    propio método del puerto (`guardar` y `registrarPrimeraApertura`), y
 *    ninguno pisa la columna del otro.
 */
export enum MotivoRevocacionEnlace {
  /** El profesional lo invalidó desde el voucher (S1). */
  INVALIDADO = 'invalidado',
}

/** SHA-256 en hexadecimal (minúsculas): 64 caracteres. */
export const FORMATO_HASH_TOKEN_ENLACE = /^[0-9a-f]{64}$/;

export interface EmitirEnlaceCitaProps {
  citaId: string;
  tenantId: string;
  /** Entero ≥ 1. Usa `EnlaceCita.siguienteVersion(max)` para calcularla. */
  version: number;
  /** `sha256(token)` en hex. Nunca el token. */
  tokenHash: string;
}

export interface ReconstituirEnlaceCitaProps extends EmitirEnlaceCitaProps {
  id: string;
  emitidoEn: Date;
  revocadoEn: Date | null;
  motivoRevocacion: MotivoRevocacionEnlace | null;
  revocadoPor: string | null;
  primeraAperturaEn: Date | null;
}

export class EnlaceCita {
  /** Lo asigna la base al insertar; `undefined` en un enlace recién emitido. */
  id: string;
  citaId: string;
  tenantId: string;
  version: number;
  tokenHash: string;
  /** Lo asigna la base (`DEFAULT now()`); `undefined` antes de insertar. */
  emitidoEn: Date;

  private _revocadoEn: Date | null;
  private _motivoRevocacion: MotivoRevocacionEnlace | null;
  private _revocadoPor: string | null;
  private _primeraAperturaEn: Date | null;

  private constructor() {
    // Se construye vía emitir() o reconstituir().
  }

  /**
   * Versión del próximo enlace de una cita: 1 si nunca tuvo uno; si no, la
   * mayor versión existente (activa o revocada) + 1.
   */
  static siguienteVersion(maxVersion: number | null): number {
    if (maxVersion === null) return 1;
    EnlaceCita.exigirVersion(maxVersion);
    return maxVersion + 1;
  }

  /**
   * Fábrica de un enlace nuevo, activo. La versión la decide quien llama
   * (`siguienteVersion`) porque el hash depende de ella: primero se calcula la
   * versión, luego el token y su hash, y por último se emite.
   *
   * @throws RangeError si la versión no es un entero ≥ 1 o el hash no es un
   *   SHA-256 hex (p. ej. si por error llega el token en claro).
   */
  static emitir(props: EmitirEnlaceCitaProps): EnlaceCita {
    EnlaceCita.exigirVersion(props.version);
    if (!FORMATO_HASH_TOKEN_ENLACE.test(props.tokenHash)) {
      // No se repite el valor recibido: podría ser el token en claro.
      throw new RangeError(
        'EnlaceCita: tokenHash debe ser el SHA-256 hex del token (64 caracteres en minúsculas)',
      );
    }
    const enlace = new EnlaceCita();
    enlace.citaId = props.citaId;
    enlace.tenantId = props.tenantId;
    enlace.version = props.version;
    enlace.tokenHash = props.tokenHash;
    enlace._revocadoEn = null;
    enlace._motivoRevocacion = null;
    enlace._revocadoPor = null;
    // Un enlace nuevo (también la versión siguiente tras invalidar) empieza
    // sin apertura: se registra por versión.
    enlace._primeraAperturaEn = null;
    return enlace;
  }

  /** Reconstitución desde persistencia, sin validaciones. Uso exclusivo del adaptador. */
  static reconstituir(props: ReconstituirEnlaceCitaProps): EnlaceCita {
    const enlace = new EnlaceCita();
    enlace.id = props.id;
    enlace.citaId = props.citaId;
    enlace.tenantId = props.tenantId;
    enlace.version = props.version;
    enlace.tokenHash = props.tokenHash;
    enlace.emitidoEn = props.emitidoEn;
    enlace._revocadoEn = props.revocadoEn;
    enlace._motivoRevocacion = props.motivoRevocacion;
    enlace._revocadoPor = props.revocadoPor;
    enlace._primeraAperturaEn = props.primeraAperturaEn;
    return enlace;
  }

  get revocadoEn(): Date | null {
    return this._revocadoEn;
  }

  /**
   * La primera vez que el paciente abrió su enlace con un token válido
   * (US-07.01, H5), o `null` si nunca lo abrió. La escribe el portal con el
   * reloj de la app, una sola vez, por
   * `EnlaceCitaRepository.registrarPrimeraApertura`.
   */
  get primeraAperturaEn(): Date | null {
    return this._primeraAperturaEn;
  }

  get motivoRevocacion(): MotivoRevocacionEnlace | null {
    return this._motivoRevocacion;
  }

  get revocadoPor(): string | null {
    return this._revocadoPor;
  }

  /** No revocado. Que la cita siga abierta se evalúa en `permiteActuarSobre`. */
  estaActivo(): boolean {
    return this._revocadoEn === null;
  }

  /**
   * El profesional invalida el enlace (S1). Idempotente: si ya estaba
   * revocado no cambia nada (se conserva la primera revocación) y devuelve
   * `false`; si lo revoca ahora, `true`.
   *
   * `usuarioId = null` es una revocación del SISTEMA: hoy solo la
   * autocorrección de `asegurarActivo` cuando cambió `ENLACE_CITA_CLAVE`
   * (DT-45). El CHECK `CHK_enlaces_cita_revocacion` admite `revocado_por`
   * nulo con el motivo `invalidado`.
   */
  invalidar(usuarioId: string | null, ahora: Date): boolean {
    if (!this.estaActivo()) return false;
    this._revocadoEn = ahora;
    this._motivoRevocacion = MotivoRevocacionEnlace.INVALIDADO;
    this._revocadoPor = usuarioId;
    return true;
  }

  /**
   * Validez del enlace para LEER o ACTUAR sobre `cita` en `ahora` (contrato
   * §3.1). Se evalúa DENTRO de la transacción de la acción, con la cita ya
   * bloqueada:
   *  - el enlace no está revocado;
   *  - es de ESA cita (y del mismo tenant);
   *  - la cita sigue vigente (`pendiente` | `confirmada`): una cita terminal
   *    invalida el enlace sin revocarlo;
   *  - `ahora` es anterior al `inicio` VIGENTE de la cita (si se reagendó,
   *    cuenta la hora nueva). Sin tope de días.
   *
   * Si es `false`, la API responde el mismo 404 para todos los casos.
   */
  permiteActuarSobre(cita: Cita, ahora: Date): boolean {
    return (
      this.estaActivo() &&
      cita.id === this.citaId &&
      cita.tenantId === this.tenantId &&
      ESTADOS_VIGENTES.includes(cita.estado) &&
      ahora.getTime() < cita.inicio.getTime()
    );
  }

  private static exigirVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) {
      throw new RangeError(
        `EnlaceCita: la versión debe ser un entero ≥ 1 (llegó ${String(version)})`,
      );
    }
  }
}
