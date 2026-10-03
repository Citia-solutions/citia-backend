import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { PlanificadorSalida } from './infrastructure/planificacion/planificador-salida';
import { SharedModule } from './shared.module';

/**
 * Planificador en proceso (ADR-12 §5). Se importa SOLO desde `AppModule`: así
 * las e2e que arman módulos parciales no levantan jobs ni necesitan
 * `ScheduleModule`, `Latidos` o la configuración validada.
 *
 * Con `PLANIFICADOR_ACTIVO=false` (default en `NODE_ENV=test`) no se programa
 * nada aunque el módulo esté cargado.
 *
 * Los jobs de la etapa B (envío de recordatorios, reconciliación de respaldo)
 * se agregan aquí o en un módulo hermano con el mismo patrón.
 *
 * Necesita `ConfigModule` (validado) y `ObservabilidadModule` (`Latidos`),
 * ambos globales.
 */
@Module({
  imports: [ScheduleModule.forRoot(), SharedModule],
  providers: [PlanificadorSalida],
})
export class PlanificacionModule {}
