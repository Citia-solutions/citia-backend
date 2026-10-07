import { ConfiguracionRecordatorio } from '../../domain/configuracion-recordatorio.entity';
import { CanalRecordatorio } from '../../domain/recordatorio.entity';

/**
 * Respuesta de `GET` y `PUT /api/recordatorios/configuracion` (ADR-13 §17).
 *
 * Sin ids internos, `tenantId` ni `usuarioId`: es SIEMPRE la del profesional
 * del token. `predeterminada = true` mientras nunca haya guardado una (se
 * aplica la del entorno: activa, 24 h y 2 h, sin contacto).
 */
export class ConfiguracionRecordatoriosDto {
  activo: boolean;
  canal: CanalRecordatorio;
  /** Minutos antes del inicio, de mayor a menor (p. ej. `[1440, 120]`). */
  antelacionesMin: number[];
  telefonoContacto: string | null;
  /** `Reply-To`; `null` = el mensaje dice que no recibe respuestas. */
  correoRespuesta: string | null;
  predeterminada: boolean;

  constructor(partial: ConfiguracionRecordatoriosDto) {
    Object.assign(this, partial);
  }

  static desde(
    configuracion: ConfiguracionRecordatorio,
  ): ConfiguracionRecordatoriosDto {
    return new ConfiguracionRecordatoriosDto({
      activo: configuracion.activo,
      canal: configuracion.canal,
      antelacionesMin: [...configuracion.antelacionesMin],
      telefonoContacto: configuracion.telefonoContacto,
      correoRespuesta: configuracion.correoRespuesta,
      predeterminada: configuracion.esPredeterminada,
    });
  }
}
