import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CitaNoEncontradaError } from '../../cita/application/cita-no-encontrada.error';
import { TransicionEstadoInvalidaError } from '../../cita/domain/exceptions/transicion-estado-invalida.error';
import { BandejaSolicitudesService } from '../application/bandeja-solicitudes.service';
import { DatosAceptacionIncompletosError } from '../application/datos-aceptacion-incompletos.error';
import { SolicitudNoEncontradaError } from '../application/solicitud-no-encontrada.error';
import { EstadoSolicitud } from '../domain/solicitud-cita.entity';
import { TransicionSolicitudInvalidaError } from '../domain/transicion-solicitud-invalida.error';
import { AceptarSolicitudDto } from './dto/aceptar-solicitud.dto';
import { ListarSolicitudesQueryDto } from './dto/listar-solicitudes-query.dto';
import { SolicitudAceptadaDto } from './dto/solicitud-aceptada.dto';
import { SolicitudBandejaDto } from './dto/solicitud-bandeja.dto';

/**
 * Bandeja de solicitudes del profesional (autenticada). Convive con
 * `SolicitudesPublicasController` (`publico/:tenantSlug/solicitudes`, anónima)
 * sin colisión de rutas.
 *
 * `tenantId` y `usuarioId` salen SIEMPRE del token (ADR-01 §2).
 */
@Controller('solicitudes')
@UseGuards(JwtAuthGuard)
export class SolicitudesController {
  constructor(private readonly bandeja: BandejaSolicitudesService) {}

  // GET /api/solicitudes?estado=recibida|aceptada|rechazada|descartada
  // (defecto: recibida) &citaOrigenId=<uuid> (opcional, Fase 3 R4).
  @Get()
  async listar(
    @Query() query: ListarSolicitudesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SolicitudBandejaDto[]> {
    return this.bandeja.listar(query.estado ?? EstadoSolicitud.RECIBIDA, user, {
      citaOrigenId: query.citaOrigenId,
    });
  }

  /**
   * POST /api/solicitudes/:id/aceptar -> 201 `{ solicitud, cita }`.
   * POST y no PATCH: crea otro recurso (la cita) o mueve la de origen (una
   * de reagendamiento, Fase 3) y no es idempotente.
   */
  @Post(':id/aceptar')
  @HttpCode(HttpStatus.CREATED)
  async aceptar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AceptarSolicitudDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SolicitudAceptadaDto> {
    return this.ejecutar(() => this.bandeja.aceptar(id, dto, user));
  }

  /**
   * POST /api/solicitudes/:id/rechazar -> 200. Sin cuerpo: no se lee ninguno
   * (no se guarda motivo de rechazo, DT-26).
   */
  @Post(':id/rechazar')
  @HttpCode(HttpStatus.OK)
  async rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SolicitudBandejaDto> {
    return this.ejecutar(() => this.bandeja.rechazar(id, user));
  }

  // Traducción única de errores de aplicación/dominio a HTTP.
  private async ejecutar<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      // Inexistente u otro tenant -> 404 (no se distinguen).
      if (error instanceof SolicitudNoEncontradaError) {
        throw new NotFoundException(error.message);
      }
      // Ya aceptada, rechazada o descartada -> 409. El cliente recarga la bandeja.
      if (error instanceof TransicionSolicitudInvalidaError) {
        throw new ConflictException(error.message);
      }
      // Una `nueva` sin duracionMin o tipoConsulta -> 400 (Fase 3: son
      // opcionales en el DTO porque un reagendamiento no los usa).
      if (error instanceof DatosAceptacionIncompletosError) {
        throw new BadRequestException(error.message);
      }
      // Reagendamiento: la cita de origen ya terminó -> 409; no existe en el
      // tenant -> 404.
      if (error instanceof TransicionEstadoInvalidaError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof CitaNoEncontradaError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
