import { Module } from '@nestjs/common';

import { PlanificadorSoporte } from './infrastructure/planificacion/planificador-soporte';
import { SoporteModule } from './soporte.module';

/**
 * Job `soporte.envio` (US-10, ADR-15 §7): el "módulo hermano" de
 * `PlanificacionModule`, con el patrón de `CitaPlanificacionModule`. Se
 * importa SOLO desde `AppModule`, junto a `PlanificacionModule`, para que las
 * e2e que cargan `SoporteModule` no levanten el job ni necesiten
 * `ScheduleModule`.
 *
 * Necesita `SchedulerRegistry` (global, de `ScheduleModule.forRoot()` en
 * `PlanificacionModule`) y `ConfigModule` (global). Con
 * `PLANIFICADOR_ACTIVO=false` o sin `SOPORTE_CORREO_DESTINO` no programa nada.
 * Sin latido (no usa `Latidos`).
 */
@Module({
  imports: [SoporteModule],
  providers: [PlanificadorSoporte],
})
export class SoportePlanificacionModule {}
