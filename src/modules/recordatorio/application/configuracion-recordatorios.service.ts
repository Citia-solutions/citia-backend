import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import { ConfiguracionRecordatorio } from '../domain/configuracion-recordatorio.entity';
import { ConfiguracionRecordatorioRepository } from '../domain/configuracion-recordatorio.repository';
import { CONFIGURACION_RECORDATORIO_ACTUALIZADA } from './suscriptor-recordatorios';

/** Quién pide: SIEMPRE del token, nunca del cuerpo. */
export interface ProfesionalAutenticado {
  tenantId: string;
  /** El profesional dueño de la configuración (y de sus citas). */
  usuarioId: string;
}

/** Lo que el profesional puede cambiar (PUT completo: lo que falta queda vacío). */
export interface CambiosConfiguracion {
  activo: boolean;
  antelacionesMin: readonly number[];
  telefonoContacto?: string | null;
  correoRespuesta?: string | null;
}

/**
 * Configuración de recordatorios del profesional del token (ADR-13 §3, §17).
 *
 * - `obtener`: la guardada o, si nunca guardó, la PREDETERMINADA del entorno
 *   (activa, `RECORDATORIO_ANTELACIONES_MIN`, sin contacto). No crea la fila.
 * - `guardar`: valida con la entidad (`ConfiguracionRecordatorioInvalidaError`
 *   → 400), hace upsert y publica `ConfiguracionRecordatorioActualizada`
 *   (`{ usuarioId }`) EN LA MISMA TRANSACCIÓN (outbox, ADR-12 §2). El
 *   suscriptor reconcilia después las citas futuras del profesional: cambiar
 *   los momentos o apagarla se aplica también a lo ya agendado.
 */
export class ConfiguracionRecordatoriosService {
  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly configuraciones: ConfiguracionRecordatorioRepository,
    private readonly eventos: PublicadorEventos,
    private readonly antelacionesPredeterminadasMin: readonly number[],
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  /** Lectura dentro de una transacción: el puerto exige `tx` (ADR-13). */
  obtener(
    profesional: ProfesionalAutenticado,
  ): Promise<ConfiguracionRecordatorio> {
    return this.transacciones.run((tx) => this.actual(profesional, tx));
  }

  async guardar(
    profesional: ProfesionalAutenticado,
    cambios: CambiosConfiguracion,
  ): Promise<ConfiguracionRecordatorio> {
    // Valida ANTES de abrir la transacción: un 400 no ocupa una conexión.
    const nueva = ConfiguracionRecordatorio.crear({
      tenantId: profesional.tenantId,
      usuarioId: profesional.usuarioId,
      activo: cambios.activo,
      antelacionesMin: cambios.antelacionesMin,
      telefonoContacto: cambios.telefonoContacto ?? null,
      correoRespuesta: cambios.correoRespuesta ?? null,
    });

    return this.transacciones.run(async (tx) => {
      const guardada = await this.configuraciones.guardar(nueva.aDatos(), tx);
      await this.eventos.publicar(
        {
          nombre: CONFIGURACION_RECORDATORIO_ACTUALIZADA,
          ocurridoEn: this.reloj(),
          tenantId: profesional.tenantId,
          // Solo ids (ADR-09 §3 regla 5): ni teléfono ni correo.
          payload: { usuarioId: profesional.usuarioId },
        },
        tx,
      );
      return ConfiguracionRecordatorio.reconstituir(guardada);
    });
  }

  private async actual(
    profesional: ProfesionalAutenticado,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorio> {
    const guardada = await this.configuraciones.obtener(
      profesional.tenantId,
      profesional.usuarioId,
      tx,
    );
    return guardada
      ? ConfiguracionRecordatorio.reconstituir(guardada)
      : ConfiguracionRecordatorio.predeterminada(
          profesional.tenantId,
          profesional.usuarioId,
          this.antelacionesPredeterminadasMin,
        );
  }
}
