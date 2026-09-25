import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { SolicitudesService } from '../application/solicitudes.service';
import { CrearSolicitudDto } from './dto/crear-solicitud.dto';
import { SolicitudRecibidaDto } from './dto/solicitud-recibida.dto';

/**
 * PRIMERA superficie de escritura anónima del sistema (ADR-09 §8).
 *
 * NO lleva JwtAuthGuard a propósito: la rellena un paciente que no tiene
 * cuenta. Solo escribe en `solicitudes_cita`; no toca `citas`, `pacientes` ni
 * `usuarios`.
 *
 * La organización llega en la ruta, no en el cuerpo. Es el transporte por
 * segmento de ruta que ADR-08 define para su fase 1, adoptado aquí primero:
 * esta superficie es nueva, así que puede usarlo sin alterar el contrato del
 * login, que ya está en uso.
 *
 * ⚠️ FALTA el límite de tasa (DT-18). Es la única defensa que ADR-09 §8 regla 4
 * exige y que todavía no existe en el proyecto: necesita una dependencia nueva.
 * NO publicar este enlace hasta tenerlo.
 */
@Controller('publico/:tenantSlug/solicitudes')
export class SolicitudesPublicasController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  /**
   * 202 y no 201: la respuesta es la misma exista o no la organización, y haya
   * o no una solicitud abierta con ese RUT. "Aceptado para revisión" es lo
   * único que se puede afirmar sin filtrar información.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async recibir(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: CrearSolicitudDto,
  ): Promise<SolicitudRecibidaDto> {
    try {
      await this.solicitudesService.recibir(tenantSlug, dto);
    } catch (error) {
      // Un RUT mal formado habla del dato que escribió el propio usuario, no
      // de qué existe en el sistema: se puede rechazar sin filtrar nada.
      if (error instanceof RutInvalidoError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return new SolicitudRecibidaDto();
  }
}
