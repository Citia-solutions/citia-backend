import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  //Para arrancar la aplicacion es NestFactory
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api'); //Registra un prefijo para todas las "api"

  const configService = app.get(ConfigService);

  app.enableCors({
    //Cors habilitado
    origin:
      configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173', //Esta es la url que acepta nuestro backend
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }), //Valida los dto automaticamente en cada request
  );

  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port);
}

void bootstrap();
