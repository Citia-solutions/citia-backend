import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { Entorno } from './shared/infrastructure/config/entorno';
import {
  crearOpcionesCors,
  crearPoliticaCors,
} from './shared/infrastructure/config/origenes-cors';

async function bootstrap(): Promise<void> {
  //Para arrancar la aplicacion es NestFactory. bufferLogs: los logs del
  //arranque esperan a pino en lugar de salir por el logger de consola de Nest.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  //Todo `Logger` de Nest (incluidos los `new Logger(...)` de los servicios)
  //sale por pino: JSON, id por peticion y redaccion (ADR-13 §16).
  app.useLogger(app.get(Logger));

  //Apagado ordenado (ADR-12 §5, ADR-05): con SIGTERM (que tini reenvia) o
  //SIGINT, Nest corre los hooks de cierre; el planificador deja de tomar
  //trabajo y espera al tick en curso antes de que se cierre la base.
  app.enableShutdownHooks();

  app.setGlobalPrefix('api'); //Registra un prefijo para todas las "api"

  const config = app.get<ConfigService<Entorno, true>>(ConfigService);

  //CORS: FRONTEND_URL (origen canonico) + CORS_ORIGENES_EXTRA (exactos y el
  //comodin de vistas previas https://*.<proyecto>.pages.dev). credentials: true.
  app.enableCors(
    crearOpcionesCors(
      crearPoliticaCors(
        config.get('FRONTEND_URL', { infer: true }),
        config.get('CORS_ORIGENES_EXTRA', { infer: true }),
      ),
    ),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }), //Valida los dto automaticamente en cada request
  );

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
