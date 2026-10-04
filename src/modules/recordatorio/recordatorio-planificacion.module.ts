import { Module } from '@nestjs/common';

import { PlanificadorRecordatorios } from './infrastructure/planificacion/planificador-recordatorios';
import { RecordatorioModule } from './recordatorio.module';

/**
 * Jobs de recordatorios (ADR-12 §5, ADR-13 §6–§7): el "módulo hermano" de
 * `PlanificacionModule`. Se importa SOLO desde `AppModule`, junto a él, para
 * que las e2e que cargan `RecordatorioModule` no levanten jobs ni necesiten
 * `ScheduleModule` o `Latidos`.
 *
 * Necesita `SchedulerRegistry` (global, de `ScheduleModule.forRoot()` en
 * `PlanificacionModule`), `Latidos` (global, `ObservabilidadModule`) y
 * `ConfigModule` (global). Con `PLANIFICADOR_ACTIVO=false` no programa nada.
 */
@Module({
  imports: [RecordatorioModule],
  providers: [PlanificadorRecordatorios],
})
export class RecordatorioPlanificacionModule {}
