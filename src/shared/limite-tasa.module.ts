import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import type { Entorno } from './infrastructure/config/entorno';
import { crearOpcionesLimiteTasa } from './infrastructure/limite-tasa/opciones-limite-tasa';

/**
 * Límite de tasa (contrato de la Fase 3 §6, DT-18) con `@nestjs/throttler` y
 * almacén en memoria. Se importa UNA vez, en `AppModule`: registra el
 * `ThrottlerGuard` como guard GLOBAL (`APP_GUARD`).
 *
 * El guard global no limita nada por sí solo: cada ruta pide sus límites con
 * `@LimitarTasa(...)` (`shared/presentation/limitar-tasa.decorator.ts`). Las
 * e2e que arman módulos parciales no importan este módulo, así que en ellas
 * el decorador no hace nada; y con `LIMITE_TASA_ACTIVO=false` (default en
 * `NODE_ENV=test`) tampoco limita aunque esté cargado.
 *
 * Necesita `ConfigModule` (global, validado). La IP del cliente depende de
 * `app.set('trust proxy', 1)` en `main.ts`.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) =>
        crearOpcionesLimiteTasa({
          activo: config.get('LIMITE_TASA_ACTIVO', { infer: true }),
        }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class LimiteTasaModule {}
