import { TransactionContext } from '../../../shared/application/transaction-runner';
import { CanalRecordatorio } from './recordatorio.entity';

/**
 * Configuración de recordatorios de un profesional (ADR-13 §2–§3), como datos
 * PLANOS: la entidad `ConfiguracionRecordatorio`, que valida sus reglas (1 a 3
 * antelaciones distintas entre 30 y 10.080 min, canal `email`, teléfono de
 * hasta 30, formato del correo), es del api-agent (paso 8). Este puerto guarda
 * lo que recibe, sin validar.
 */
export interface DatosConfiguracionRecordatorio {
  tenantId: string;
  /** El profesional DUEÑO de las citas (`cita.usuarioId`), no quien hace la petición. */
  usuarioId: string;
  activo: boolean;
  canal: CanalRecordatorio;
  /** Minutos antes del inicio, p. ej. `[1440, 120]`. Se guarda en el orden recibido. */
  antelacionesMin: readonly number[];
  /** "Cómo contactar" en el mensaje. */
  telefonoContacto: string | null;
  /** `Reply-To` (opción E2). `null` = sin `Reply-To` y el texto lo dice. */
  correoRespuesta: string | null;
}

export interface ConfiguracionRecordatorioGuardada extends DatosConfiguracionRecordatorio {
  id: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

/**
 * Puerto de `configuraciones_recordatorio` (una fila por profesional, única
 * por `(tenant_id, usuario_id)`).
 *
 * Sin fila se aplica la predeterminada del entorno
 * (`RECORDATORIO_ANTELACIONES_MIN`, activa): lo decide quien llama al recibir
 * `null`. La fila nace la primera vez que el profesional guarda.
 *
 * `tx` obligatorio, como el resto de puertos del módulo: `guardar` va en la
 * misma transacción que publica `ConfiguracionRecordatorioActualizada`
 * (ADR-13 §3) y `obtener` se usa dentro de la reconciliación y del envío.
 */
export abstract class ConfiguracionRecordatorioRepository {
  abstract obtener(
    tenantId: string,
    usuarioId: string,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorioGuardada | null>;

  /**
   * Upsert por `(tenant_id, usuario_id)`: crea la fila o reemplaza `activo`,
   * `canal`, `antelaciones_min`, `telefono_contacto` y `correo_respuesta`.
   * Devuelve la fila resultante.
   */
  abstract guardar(
    datos: DatosConfiguracionRecordatorio,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorioGuardada>;
}
