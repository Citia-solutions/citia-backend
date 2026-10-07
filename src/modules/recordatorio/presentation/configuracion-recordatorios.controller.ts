import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import {
  ConfiguracionRecordatoriosService,
  ProfesionalAutenticado,
} from '../application/configuracion-recordatorios.service';
import { ConfiguracionRecordatorioInvalidaError } from '../domain/exceptions/configuracion-recordatorio-invalida.error';
import { ConfiguracionRecordatoriosDto } from './dto/configuracion-recordatorios.dto';
import { GuardarConfiguracionRecordatoriosDto } from './dto/guardar-configuracion-recordatorios.dto';

/**
 * Configuración de recordatorios del profesional del TOKEN (ADR-13 §3, §17).
 * Nunca recibe `tenantId` ni `usuarioId` en el cuerpo.
 *
 * - `GET  /api/recordatorios/configuracion` → la guardada o la predeterminada.
 * - `PUT  /api/recordatorios/configuracion` → la reemplaza y publica
 *   `ConfiguracionRecordatorioActualizada` (reprograma o anula sus citas
 *   futuras de forma asíncrona, por el outbox).
 */
@Controller('recordatorios/configuracion')
@UseGuards(JwtAuthGuard)
export class ConfiguracionRecordatoriosController {
  constructor(private readonly servicio: ConfiguracionRecordatoriosService) {}

  @Get()
  async obtener(
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<ConfiguracionRecordatoriosDto> {
    return ConfiguracionRecordatoriosDto.desde(
      await this.servicio.obtener(profesional(usuario)),
    );
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async guardar(
    @Body() dto: GuardarConfiguracionRecordatoriosDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<ConfiguracionRecordatoriosDto> {
    try {
      return ConfiguracionRecordatoriosDto.desde(
        await this.servicio.guardar(profesional(usuario), {
          activo: dto.activo,
          antelacionesMin: dto.antelacionesMin,
          telefonoContacto: dto.telefonoContacto ?? null,
          correoRespuesta: dto.correoRespuesta ?? null,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof ConfiguracionRecordatorioInvalidaError) {
        // El mensaje nombra el campo y la regla, nunca el valor recibido.
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function profesional(usuario: AuthenticatedUser): ProfesionalAutenticado {
  return { tenantId: usuario.tenantId, usuarioId: usuario.userId };
}
