import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';

import { CABECERA_ENLACE_CITA } from '../../../shared/presentation/cabecera-enlace-cita';
import { LimitarTasa } from '../../../shared/presentation/limitar-tasa.decorator';
import { SinCacheNiReferrer } from '../../../shared/presentation/sin-cache-ni-referrer.interceptor';
import { EnlaceCitaNoValidoError } from '../../cita/application/enlace-cita-no-valido.error';
import { TransicionEstadoInvalidaError } from '../../cita/domain/exceptions/transicion-estado-invalida.error';
import { VersionTerminosNoVigenteError } from '../../paciente/domain/exceptions/version-terminos-no-vigente.error';
import { MENSAJE_VERSION_TERMINOS_NO_VIGENTE } from '../../paciente/presentation/dto/version-terminos.decorator';
import { ReagendamientoYaSolicitadoError } from '../../solicitud/domain/reagendamiento-ya-solicitado.error';
import { AccionNoDisponibleError } from '../application/accion-no-disponible.error';
import { PortalPacienteService } from '../application/portal-paciente.service';
import { AceptarTerminosDto } from './dto/aceptar-terminos.dto';
import { CancelarCitaPacienteDto } from './dto/cancelar-cita-paciente.dto';
import { PedirOtraHoraDto } from './dto/pedir-otra-hora.dto';
import { VistaCitaPacienteDto } from './dto/vista-cita-paciente.dto';

/**
 * Cuerpo EXACTO de todo enlace no válido (ausente, mal formado, inexistente,
 * revocado, cita terminal, inicio ya pasado). Idéntico en todos los casos y
 * en todas las rutas: la respuesta no debe permitir distinguirlos.
 */
export const CUERPO_ENLACE_NO_VALIDO = Object.freeze({
  statusCode: HttpStatus.NOT_FOUND,
  message: 'Enlace no válido o vencido',
});

/** Cuerpo EXACTO de una acción no permitida con un enlace válido. */
export const CUERPO_ACCION_NO_DISPONIBLE = Object.freeze({
  statusCode: HttpStatus.CONFLICT,
  message: 'Esta acción ya no está disponible',
});

/**
 * Cuerpo EXACTO de una versión de los términos que no recibe aceptaciones
 * (US-11), cuando llega al caso de uso sin pasar por el DTO (defensa). El
 * mismo mensaje fijo que el 400 del `ValidationPipe`.
 */
export const CUERPO_VERSION_TERMINOS_NO_VIGENTE = Object.freeze({
  statusCode: HttpStatus.BAD_REQUEST,
  message: MENSAJE_VERSION_TERMINOS_NO_VIGENTE,
});

/**
 * Portal del paciente (Fase 3, contrato §3.4). Prefijo global `/api`.
 *
 * SIN JWT a propósito: quien llama es el paciente, sin cuenta. Su única
 * credencial es el token del enlace, que llega en la cabecera `X-Enlace-Cita`
 * (nunca en la URL de la API; S3). Ninguna ruta acepta ids del cliente: todo
 * es token → enlace → cita → tenant.
 *
 * - Límite de tasa: 30/min por IP en todas las rutas (clase) y, además,
 *   5/hora por enlace en cada POST.
 * - `Cache-Control: no-store` y `Referrer-Policy: no-referrer` en todas las
 *   respuestas, también en los errores.
 * - Errores: 404, 409 y el 400 de la versión de los términos con cuerpo fijo;
 *   cualquier otro, el 500 genérico de Nest. Nada de detalles internos.
 */
@Controller('publico/cita')
@LimitarTasa('portalPorIp')
@SinCacheNiReferrer()
export class PortalPacienteController {
  constructor(private readonly portal: PortalPacienteService) {}

  /**
   * GET /api/publico/cita → 200. Abrir la página no ejecuta ninguna acción
   * (S3): no cambia la cita ni su bitácora; solo anota la primera apertura del
   * enlace (US-07.01). Misma respuesta y mismo 404 de siempre.
   */
  @Get()
  async ver(
    @Headers(CABECERA_ENLACE_CITA) token: string | undefined,
  ): Promise<VistaCitaPacienteDto> {
    return this.ejecutar(() => this.portal.ver(token));
  }

  /** POST /api/publico/cita/confirmar → 200 (sin cuerpo). */
  @Post('confirmar')
  @HttpCode(HttpStatus.OK)
  @LimitarTasa('portalPorEnlace')
  async confirmar(
    @Headers(CABECERA_ENLACE_CITA) token: string | undefined,
  ): Promise<VistaCitaPacienteDto> {
    return this.ejecutar(() => this.portal.confirmar(token));
  }

  /** POST /api/publico/cita/cancelar `{ motivo? }` → 200. */
  @Post('cancelar')
  @HttpCode(HttpStatus.OK)
  @LimitarTasa('portalPorEnlace')
  async cancelar(
    @Headers(CABECERA_ENLACE_CITA) token: string | undefined,
    @Body() dto: CancelarCitaPacienteDto,
  ): Promise<VistaCitaPacienteDto> {
    return this.ejecutar(() => this.portal.cancelar(token, dto.motivo));
  }

  /** POST /api/publico/cita/otra-hora `{ preferencia, motivo? }` → 201. */
  @Post('otra-hora')
  @HttpCode(HttpStatus.CREATED)
  @LimitarTasa('portalPorEnlace')
  async pedirOtraHora(
    @Headers(CABECERA_ENLACE_CITA) token: string | undefined,
    @Body() dto: PedirOtraHoraDto,
  ): Promise<VistaCitaPacienteDto> {
    return this.ejecutar(() =>
      this.portal.pedirOtraHora(token, {
        preferencia: dto.preferencia,
        motivo: dto.motivo,
      }),
    );
  }

  /**
   * POST /api/publico/cita/aceptar-terminos `{ terminosVersion }` → 200 con
   * la vista (`terminosPendientes: false`). US-11, ADR-16 §8. Idempotente;
   * sin 409 (no es una acción sobre la cita). Comparte el cubo
   * `portalPorEnlace` con confirmar, cancelar y pedir otra hora.
   */
  @Post('aceptar-terminos')
  @HttpCode(HttpStatus.OK)
  @LimitarTasa('portalPorEnlace')
  async aceptarTerminos(
    @Headers(CABECERA_ENLACE_CITA) token: string | undefined,
    @Body() dto: AceptarTerminosDto,
  ): Promise<VistaCitaPacienteDto> {
    return this.ejecutar(() =>
      this.portal.aceptarTerminos(token, dto.terminosVersion),
    );
  }

  /**
   * Traducción ÚNICA de errores a HTTP, con cuerpos fijos (se pasan como
   * objeto para que Nest no agregue `error`). La transacción ya se revirtió
   * cuando el error llega aquí.
   */
  private async ejecutar<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (error instanceof EnlaceCitaNoValidoError) {
        throw new NotFoundException({ ...CUERPO_ENLACE_NO_VALIDO });
      }
      if (
        error instanceof AccionNoDisponibleError ||
        // Defensa: la entidad rechazó la transición aunque el portal la
        // creyera permitida.
        error instanceof TransicionEstadoInvalidaError ||
        // Carrera con otra petición de otra hora para la misma cita (R5).
        error instanceof ReagendamientoYaSolicitadoError
      ) {
        throw new ConflictException({ ...CUERPO_ACCION_NO_DISPONIBLE });
      }
      // US-11: la versión de los términos no recibe aceptaciones. El DTO ya
      // lo rechaza antes de mirar el token; esto es la defensa.
      if (error instanceof VersionTerminosNoVigenteError) {
        throw new BadRequestException({
          ...CUERPO_VERSION_TERMINOS_NO_VIGENTE,
        });
      }
      throw error;
    }
  }
}
