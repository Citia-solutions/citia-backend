import { Module } from '@nestjs/common';

import { CitaModule } from './cita.module';
import { PlanificadorCierreCitas } from './infrastructure/planificacion/planificador-cierre-citas';

/**
 * Job G1 de cierre de citas (US-07.01, DT-11): el "módulo hermano" de
 * `PlanificacionModule`, con el patrón de `RecordatorioPlanificacionModule`.
 * Se importa SOLO desde `AppModule`, junto a `PlanificacionModule`, para que
 * las e2e que cargan `CitaModule` no levanten el job ni necesiten
 * `ScheduleModule`.
 *
 * Necesita `SchedulerRegistry` (global, de `ScheduleModule.forRoot()` en
 * `PlanificacionModule`) y `ConfigModule` (global). Con
 * `PLANIFICADOR_ACTIVO=false` no programa nada. Sin latido (no usa `Latidos`).
 */
@Module({
  imports: [CitaModule],
  providers: [PlanificadorCierreCitas],
})
export class CitaPlanificacionModule {}
