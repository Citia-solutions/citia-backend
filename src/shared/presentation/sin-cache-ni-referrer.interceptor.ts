import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Cabeceras de las respuestas públicas con datos de una cita (contrato de la
 * Fase 3, S3):
 *
 *  - `Cache-Control: no-store`: ni el navegador ni un proxy guardan la
 *    respuesta (la vista de la cita del paciente).
 *  - `Referrer-Policy: no-referrer`: el navegador no envía la URL de origen
 *    a terceros.
 */
export const CABECERAS_SIN_CACHE_NI_REFERRER: Readonly<Record<string, string>> =
  {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };

/**
 * Pone las cabeceras ANTES de ejecutar la ruta, así salen también en las
 * respuestas de error que arma el filtro de excepciones (el 404 "Enlace no
 * válido o vencido", el 409, un 400 de validación). No alcanza a lo que
 * corta un guard antes de los interceptores (el 429 del límite de tasa, que
 * no lleva datos).
 */
@Injectable()
export class SinCacheNiReferrerInterceptor implements NestInterceptor {
  intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Observable<unknown> {
    if (contexto.getType() === 'http') {
      const respuesta = contexto.switchToHttp().getResponse<Response>();
      for (const [nombre, valor] of Object.entries(
        CABECERAS_SIN_CACHE_NI_REFERRER,
      )) {
        respuesta.setHeader(nombre, valor);
      }
    }
    return siguiente.handle();
  }
}

/**
 * En un controller (todas sus rutas) o en una ruta:
 *
 *     @Controller('publico/cita')
 *     @SinCacheNiReferrer()
 *     export class PortalPacienteController { … }
 */
export function SinCacheNiReferrer(): ClassDecorator & MethodDecorator {
  return UseInterceptors(SinCacheNiReferrerInterceptor);
}
