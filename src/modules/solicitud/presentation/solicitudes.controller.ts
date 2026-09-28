import {
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
import { BandejaSolicitudesService } from '../application/bandeja-solicitudes.service';
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

  // GET /api/solicitudes?estado=recibida|aceptada|rechazada (defecto: recibida)
  @Get()
  async listar(
    @Query() query: ListarSolicitudesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SolicitudBandejaDto[]> {
    return this.bandeja.listar(query.estado ?? EstadoSolicitud.RECIBIDA, user);
  }

  /**
   * POST /api/solicitudes/:id/aceptar -> 201 `{ solicitud, cita }`.
   * POST y no PATCH: crea otro recurso (la cita) y no es idempotente.
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
      // Ya aceptada o rechazada -> 409. El cliente recarga la bandeja.
      if (error instanceof TransicionSolicitudInvalidaError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
