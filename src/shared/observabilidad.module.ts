import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { Latidos } from './application/latidos';
import type { Entorno } from './infrastructure/config/entorno';
import { LatidosBetterStack } from './infrastructure/observabilidad/latidos-better-stack';
import { crearParamsLogger } from './infrastructure/observabilidad/opciones-logger';
import { SaludController } from './presentation/salud.controller';

/**
 * Observabilidad transversal (ADR-13 §16, ADR-12 §5, DT-19). Se importa UNA
 * vez, en `AppModule`:
 *
 *  - Logs JSON con pino (`nestjs-pino`), id por petición y redacción.
 *    `main.ts` reemplaza el logger de Nest (`app.useLogger`), así que los
 *    `new Logger(...)` existentes ya salen por pino.
 *  - `GET /api/health` para el monitor de uptime.
 *  - `Latidos` para los jobs del planificador (global: cualquier módulo lo
 *    inyecta sin importarlo).
 *
 * Necesita `ConfigModule` (global) y la `DataSource` de TypeORM.
 */
@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) =>
        crearParamsLogger({
          LOG_NIVEL: config.get('LOG_NIVEL', { infer: true }),
          LOG_FORMATO: config.get('LOG_FORMATO', { infer: true }),
          BETTERSTACK_SOURCE_TOKEN: config.get('BETTERSTACK_SOURCE_TOKEN', {
            infer: true,
          }),
          BETTERSTACK_INGESTING_HOST: config.get('BETTERSTACK_INGESTING_HOST', {
            infer: true,
          }),
        }),
    }),
  ],
  controllers: [SaludController],
  providers: [
    {
      provide: Latidos,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) =>
        new LatidosBetterStack({
          salida: config.get('BETTERSTACK_HEARTBEAT_SALIDA_URL', {
            infer: true,
          }),
          recordatorios: config.get('BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL', {
            infer: true,
          }),
        }),
    },
  ],
  exports: [Latidos],
})
export class ObservabilidadModule {}
