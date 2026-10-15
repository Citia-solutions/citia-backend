import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
  //rawBody: ademas del cuerpo parseado (req.body, que sigue usando el
  //ValidationPipe), guarda el cuerpo crudo en req.rawBody. Lo necesita la
  //verificacion de la firma Svix de POST /api/webhooks/resend (ADR-13 §10):
  //re-serializar el JSON romperia la firma.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  //Railway pone un proxy delante: la conexion llega SIEMPRE desde el proxy y
  //la IP real del cliente viene en X-Forwarded-For. Con 'trust proxy' = 1,
  //Express confia en UN salto y toma como req.ip la ultima entrada de esa
  //cabecera (la que agrega el proxy de Railway). Sin esto, el limite de tasa
  //por IP (LimiteTasaModule) veria a todos los clientes como uno solo. No
  //confiar en mas saltos: un cliente podria inventar su IP mandando su propio
  //X-Forwarded-For.
  app.set('trust proxy', 1);

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
  //Cabeceras permitidas en lista explicita, incluida X-Enlace-Cita (Fase 3).
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
