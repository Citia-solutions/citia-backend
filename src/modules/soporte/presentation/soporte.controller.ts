import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';

import { LimitarTasa } from '../../../shared/presentation/limitar-tasa.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RegistrarMensajeSoporteService } from '../application/registrar-mensaje-soporte.service';
import { MensajeSoporteInvalidoError } from '../domain/exceptions/mensaje-soporte-invalido.error';
import { TopeMensajesSoporteError } from '../domain/exceptions/tope-mensajes-soporte.error';
import { CrearMensajeSoporteDto } from './dto/crear-mensaje-soporte.dto';
import { MensajeSoporteCreadoDto } from './dto/mensaje-soporte-creado.dto';

/**
 * Mensajes a soporte (US-10, P7; ADR-15 §7).
 *
 * - `POST /api/soporte/mensajes` → 201 `{ id, creadoEn }`. Guarda el mensaje
 *   `pendiente`; el correo sale después, por el job `soporte.envio`.
 *
 * Quién escribe sale SIEMPRE del token (`userId`, `tenantId`), nunca del
 * cuerpo. Errores: 400 (formato, o `MensajeSoporteInvalidoError` como red de
 * seguridad), 401 (sin sesión), 429 del cubo `soporte` (5 por hora por IP,
 * antes del 401) o del tope por organización (5 en 24 h, con su mensaje).
 *
 * **El texto nunca va al log** (puede traer datos de pacientes): solo ids y
 * la categoría. Ojo: la clave `mensaje` se redacta entera; aquí va `mensajeId`.
 */
@Controller('soporte')
@UseGuards(JwtAuthGuard)
export class SoporteController {
  private readonly logger = new Logger(SoporteController.name);

  constructor(private readonly registro: RegistrarMensajeSoporteService) {}

  @Post('mensajes')
  @HttpCode(HttpStatus.CREATED)
  @LimitarTasa('soporte')
  async crear(
    @Body() dto: CrearMensajeSoporteDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<MensajeSoporteCreadoDto> {
    try {
      const mensaje = await this.registro.registrar(
        { userId: usuario.userId, tenantId: usuario.tenantId },
        { categoria: dto.categoria, mensaje: dto.mensaje },
      );
      this.logger.log({
        evento: 'soporte.mensaje_recibido',
        mensajeId: mensaje.id,
        tenantId: usuario.tenantId,
        usuarioId: usuario.userId,
        categoria: mensaje.categoria,
      });
      return MensajeSoporteCreadoDto.desde(mensaje);
    } catch (error: unknown) {
      if (error instanceof TopeMensajesSoporteError) {
        this.logger.log({
          evento: 'soporte.tope_diario',
          tenantId: usuario.tenantId,
        });
        // Mismo formato que el 429 del límite de tasa, con el texto del tope.
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: error.message,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof MensajeSoporteInvalidoError) {
        // El mensaje nombra el campo y la regla, nunca el texto recibido.
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
