/**
 * Eventos de log con nombre estable (ADR-13 §16), para que las alertas de
 * Better Stack no dependan de textos. Puerto sin Nest (ADR-02): el adaptador
 * (`BitacoraRecordatoriosLogger`) los escribe con el logger de la app (pino,
 * con redacción).
 *
 * REGLA: en `campos` van solo ids, estados, motivos, códigos y números. Nunca
 * el destinatario, el cuerpo, el teléfono ni nombres (ADR-13 §12).
 */
export type NivelBitacora = 'debug' | 'info' | 'warn' | 'error';

/** Alertas de ADR-13 §16 (el campo `alerta` de los logs). */
export enum AlertaRecordatorios {
  /** Tasa de fallo > umbral con muestra suficiente (error). */
  TASA_FALLO = 'recordatorios.tasa_fallo',
  /** Se cruzó el 80 % de la cuota diaria o mensual (warn, una vez por periodo). */
  CUOTA_80 = 'recordatorios.cuota_80',
  /** Cuota agotada, local o del proveedor (error, una vez por periodo). */
  CUOTA_AGOTADA = 'recordatorios.cuota_agotada',
  /** El proveedor rechazó la credencial, el remitente o el dominio (error). */
  CONFIGURACION = 'recordatorios.configuracion',
}

export type ValorCampoBitacora = string | number | boolean | null;

export interface EntradaBitacora {
  nivel: NivelBitacora;
  /** Nombre estable, p. ej. `recordatorio.enviado`. */
  evento: string;
  alerta?: AlertaRecordatorios;
  campos?: Readonly<Record<string, ValorCampoBitacora>>;
  /** Texto para humanos. SIN datos interpolados (van en `campos`). */
  msg: string;
}

export abstract class BitacoraRecordatorios {
  /** Nunca lanza: un fallo del log no puede romper un envío. */
  abstract registrar(entrada: EntradaBitacora): void;
}
