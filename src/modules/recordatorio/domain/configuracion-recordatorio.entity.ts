import { normalizarCorreo } from '../../../shared/domain/correo';
import type {
  ConfiguracionRecordatorioGuardada,
  DatosConfiguracionRecordatorio,
} from './configuracion-recordatorio.repository';
import { ConfiguracionRecordatorioInvalidaError } from './exceptions/configuracion-recordatorio-invalida.error';
import { CanalRecordatorio } from './recordatorio.entity';

/** Reglas de ADR-13 §3. */
export const ANTELACION_MINIMA_MIN = 30;
/** 7 días. */
export const ANTELACION_MAXIMA_MIN = 10_080;
export const MAX_ANTELACIONES = 3;
export const LARGO_MAXIMO_TELEFONO_CONTACTO = 30;
/** RFC 5321; el mismo tope que el correo del paciente. */
export const LARGO_MAXIMO_CORREO_RESPUESTA = 254;

/**
 * 24 h y 2 h antes (confirmado 2026-09-30). Respaldo del dominio: en la app
 * manda `RECORDATORIO_ANTELACIONES_MIN`, que se valida al arrancar con estas
 * mismas reglas.
 */
export const ANTELACIONES_PREDETERMINADAS_MIN: readonly number[] = [1440, 120];

// Forma mínima de un correo. El formato fino lo valida la capa de
// presentación con `@IsEmail()` (paso 12); el dominio no importa
// class-validator (ADR-02) pero tampoco acepta cualquier cosa.
const FORMATO_CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export interface PropsConfiguracionRecordatorio {
  tenantId: string;
  /** El profesional DUEÑO de las citas. */
  usuarioId: string;
  activo: boolean;
  /** Solo `email` en la Fase 2; por defecto `email`. */
  canal?: CanalRecordatorio;
  /** Minutos antes del inicio: de 1 a 3, distintos, entre 30 y 10.080. */
  antelacionesMin: readonly number[];
  /** "Cómo contactar" en el mensaje; vacío = sin teléfono. */
  telefonoContacto?: string | null;
  /** `Reply-To` (opción E2); vacío = sin `Reply-To` y el texto lo dice. */
  correoRespuesta?: string | null;
}

/**
 * Configuración de recordatorios de un profesional (ADR-13 §3).
 *
 * - **Sin fila se aplica la predeterminada** (`predeterminada`): activa, con
 *   las antelaciones del entorno (24 h y 2 h) y sin contacto. No se guarda:
 *   la fila nace la primera vez que el profesional guarda (`crear`).
 * - **`crear` valida y normaliza** (antelaciones de mayor a menor, teléfono
 *   recortado, correo con `normalizarCorreo`; vacío → `null`).
 * - **`reconstituir` no valida:** la fila ya pasó por `crear`, y la
 *   reconciliación no debe quedar trabada por una fila tocada a mano.
 */
export class ConfiguracionRecordatorio {
  private constructor(
    /** `null` si es la predeterminada (no hay fila guardada). */
    readonly id: string | null,
    readonly tenantId: string,
    readonly usuarioId: string,
    readonly activo: boolean,
    readonly canal: CanalRecordatorio,
    readonly antelacionesMin: readonly number[],
    readonly telefonoContacto: string | null,
    readonly correoRespuesta: string | null,
  ) {}

  /** Lo que el profesional guarda: valida las reglas de ADR-13 §3. */
  static crear(
    props: PropsConfiguracionRecordatorio,
  ): ConfiguracionRecordatorio {
    if (typeof props.activo !== 'boolean') {
      throw new ConfiguracionRecordatorioInvalidaError(
        'activo',
        'debe ser verdadero o falso',
      );
    }
    const canal = props.canal ?? CanalRecordatorio.EMAIL;
    if (canal !== CanalRecordatorio.EMAIL) {
      throw new ConfiguracionRecordatorioInvalidaError(
        'canal',
        'el único canal disponible es email',
      );
    }
    return new ConfiguracionRecordatorio(
      null,
      props.tenantId,
      props.usuarioId,
      props.activo,
      canal,
      validarAntelaciones(props.antelacionesMin),
      normalizarTelefono(props.telefonoContacto),
      normalizarCorreoRespuesta(props.correoRespuesta),
    );
  }

  /**
   * La que se aplica a un profesional sin fila: activa, con
   * `antelacionesMin` (las del entorno) y sin contacto ni `Reply-To`.
   */
  static predeterminada(
    tenantId: string,
    usuarioId: string,
    antelacionesMin: readonly number[] = ANTELACIONES_PREDETERMINADAS_MIN,
  ): ConfiguracionRecordatorio {
    return ConfiguracionRecordatorio.crear({
      tenantId,
      usuarioId,
      activo: true,
      antelacionesMin,
    });
  }

  /** Desde la fila guardada, tal cual. */
  static reconstituir(
    guardada: ConfiguracionRecordatorioGuardada,
  ): ConfiguracionRecordatorio {
    return new ConfiguracionRecordatorio(
      guardada.id,
      guardada.tenantId,
      guardada.usuarioId,
      guardada.activo,
      guardada.canal,
      [...guardada.antelacionesMin],
      guardada.telefonoContacto,
      guardada.correoRespuesta,
    );
  }

  /** `true` si no hay fila guardada para el profesional. */
  get esPredeterminada(): boolean {
    return this.id === null;
  }

  /** En la forma del puerto, para `ConfiguracionRecordatorioRepository.guardar`. */
  aDatos(): DatosConfiguracionRecordatorio {
    return {
      tenantId: this.tenantId,
      usuarioId: this.usuarioId,
      activo: this.activo,
      canal: this.canal,
      antelacionesMin: [...this.antelacionesMin],
      telefonoContacto: this.telefonoContacto,
      correoRespuesta: this.correoRespuesta,
    };
  }
}

/** De 1 a 3 enteros distintos entre 30 y 10.080; devuelve de mayor a menor. */
function validarAntelaciones(antelaciones: readonly number[]): number[] {
  // Sobre `unknown`: `Array.isArray` estrecharía `readonly number[]` a `any[]`.
  const valor: unknown = antelaciones;
  if (
    !Array.isArray(valor) ||
    antelaciones.length < 1 ||
    antelaciones.length > MAX_ANTELACIONES
  ) {
    throw new ConfiguracionRecordatorioInvalidaError(
      'antelacionesMin',
      `debe haber entre 1 y ${MAX_ANTELACIONES} momentos de aviso`,
    );
  }
  for (const a of antelaciones) {
    if (
      !Number.isInteger(a) ||
      a < ANTELACION_MINIMA_MIN ||
      a > ANTELACION_MAXIMA_MIN
    ) {
      throw new ConfiguracionRecordatorioInvalidaError(
        'antelacionesMin',
        `cada momento debe ser un número entero de minutos entre ${ANTELACION_MINIMA_MIN} y ${ANTELACION_MAXIMA_MIN}`,
      );
    }
  }
  if (new Set(antelaciones).size !== antelaciones.length) {
    throw new ConfiguracionRecordatorioInvalidaError(
      'antelacionesMin',
      'los momentos de aviso no pueden repetirse',
    );
  }
  return [...antelaciones].sort((a, b) => b - a);
}

function normalizarTelefono(
  telefono: string | null | undefined,
): string | null {
  if (telefono === undefined || telefono === null) return null;
  const recortado = telefono.trim();
  if (recortado === '') return null;
  if (Array.from(recortado).length > LARGO_MAXIMO_TELEFONO_CONTACTO) {
    throw new ConfiguracionRecordatorioInvalidaError(
      'telefonoContacto',
      `debe tener como máximo ${LARGO_MAXIMO_TELEFONO_CONTACTO} caracteres`,
    );
  }
  return recortado;
}

function normalizarCorreoRespuesta(
  correo: string | null | undefined,
): string | null {
  if (correo === undefined || correo === null) return null;
  const normalizado = normalizarCorreo(correo);
  if (normalizado === '') return null;
  if (
    normalizado.length > LARGO_MAXIMO_CORREO_RESPUESTA ||
    !FORMATO_CORREO.test(normalizado)
  ) {
    throw new ConfiguracionRecordatorioInvalidaError(
      'correoRespuesta',
      'no tiene formato de correo',
    );
  }
  return normalizado;
}
