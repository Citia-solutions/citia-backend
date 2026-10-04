import type { MotivoRecordatorio } from './recordatorio.entity';

/**
 * Un mensaje listo para salir (ADR-13 §8). El contenido lo genera la
 * plantilla AL ENVIAR (ADR-13 §12), no al programar.
 *
 * Datos personales: `destinatario` es el correo del paciente. NUNCA se
 * registra en logs ni se guarda (ADR-13 §2, §12).
 */
export interface MensajeSaliente {
  destinatario: string;
  /** Neutro: sin profesional ni organización (se ve con la pantalla bloqueada). */
  asunto: string;
  html: string;
  texto: string;
  /** `Reply-To`: el correo de respuesta del profesional, si configuró uno. */
  responderA: string | null;
  /** `claveIdempotencia(recordatorio.id)`: cabecera `Idempotency-Key` (ADR-13 §9.3). */
  claveIdempotencia: string;
  /** Etiquetas del proveedor; al menos `recordatorio_id` (ADR-13 §10). */
  etiquetas: Readonly<Record<string, string>>;
}

/** Los seis resultados de ADR-13 §8. El caso de uso solo conoce estos. */
export enum TipoResultadoEnvio {
  /** 200 con id → `enviado`. */
  ACEPTADO = 'aceptado',
  /** 5xx, tiempo agotado, red, 429 por ritmo, 409 concurrente → reintento acotado por `venceEn`. */
  TRANSITORIO = 'transitorio',
  /** 429 de cuota diaria o mensual → posponer al reinicio o `fallido` (`cuota_agotada`); corta el lote y alerta. */
  CUOTA_AGOTADA = 'cuota_agotada',
  /** 422 y similares → `fallido` (`correo_invalido` / `rechazado`), sin reintento. */
  PERMANENTE = 'permanente',
  /** 401/403, dominio no verificado → no se toca el recordatorio; corta el lote y alerta. */
  CONFIGURACION = 'configuracion',
  /** 409 de idempotencia con contenido distinto → `enviado` sin id; el webhook completa. */
  POSIBLE_DUPLICADO = 'posible_duplicado',
}

/** Alcance de una cuota agotada, si el proveedor lo dice. */
export type AlcanceCuota = 'dia' | 'mes' | 'desconocido';

/**
 * Resultado de un envío. `proveedor` va siempre (p. ej. `'resend'`,
 * `'registro'`); `codigo` es el código corto del proveedor, para
 * `ultimo_error` y los logs: nunca el mensaje ni datos personales.
 */
export type ResultadoEnvio =
  | {
      tipo: TipoResultadoEnvio.ACEPTADO;
      proveedor: string;
      proveedorMensajeId: string;
    }
  | { tipo: TipoResultadoEnvio.TRANSITORIO; proveedor: string; codigo: string }
  | {
      tipo: TipoResultadoEnvio.CUOTA_AGOTADA;
      proveedor: string;
      codigo: string;
      alcance: AlcanceCuota;
    }
  | {
      tipo: TipoResultadoEnvio.PERMANENTE;
      proveedor: string;
      codigo: string;
      motivo: MotivoRecordatorio.CORREO_INVALIDO | MotivoRecordatorio.RECHAZADO;
    }
  | {
      tipo: TipoResultadoEnvio.CONFIGURACION;
      proveedor: string;
      codigo: string;
    }
  | {
      tipo: TipoResultadoEnvio.POSIBLE_DUPLICADO;
      proveedor: string;
      codigo: string;
    };

/**
 * Puerto de salida de mensajes (ADR-13 §8). Adaptadores (paso 10):
 * `ResendCanalMensajeria` y `RegistroCanalMensajeria` (desarrollo y tests: no
 * envía, deja constancia sin datos personales y responde `aceptado`).
 * WhatsApp o SMS serían otro adaptador del mismo puerto.
 *
 * Contrato:
 *  - **No lanza por errores del proveedor:** los traduce a un
 *    `ResultadoEnvio`. Lanzar queda para fallos de programación.
 *  - Aplica su propio tiempo máximo (10 s, ADR-13 §7) y lo informa como
 *    `transitorio`.
 *  - Envía `claveIdempotencia` como `Idempotency-Key`.
 *  - No registra el destinatario ni el cuerpo.
 */
export abstract class CanalMensajeria {
  abstract enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio>;
}

/** `Idempotency-Key` de un recordatorio ante el proveedor (ADR-13 §9.3). */
export function claveIdempotencia(recordatorioId: string): string {
  return `recordatorio/${recordatorioId}`;
}
