import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacienteNoEncontradoError } from '../application/paciente-no-encontrado.error';
import { PacientesService } from '../application/pacientes.service';
import { CambioContactoVacioError } from '../domain/exceptions/cambio-contacto-vacio.error';
import { CorreoPacienteRequeridoError } from '../domain/exceptions/correo-paciente-requerido.error';
import { ActualizarPacienteDto } from './dto/actualizar-paciente.dto';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { PacienteResponseDto } from './dto/paciente-response.dto';

@Controller('pacientes')
@UseGuards(JwtAuthGuard)
export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  // POST /api/pacientes
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CrearPacienteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PacienteResponseDto> {
    return this.ejecutar(() =>
      this.pacientesService.crearPaciente(dto, user.tenantId),
    );
  }

  // PATCH /api/pacientes/:id -> 200 con el paciente (mismo DTO que el alta).
  // Solo `telefono` y `correo` (ADR-13 §14).
  @Patch(':id')
  async actualizarContacto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPacienteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PacienteResponseDto> {
    return this.ejecutar(() =>
      this.pacientesService.actualizarContacto(id, dto, user.tenantId),
    );
  }

  // Traduccion unica de errores de dominio/aplicacion a HTTP.
  private async ejecutar<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      // Inexistente u otro tenant -> 404 (no se distinguen; nunca 403).
      if (error instanceof PacienteNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      // RUT con digito verificador incorrecto -> 400.
      if (error instanceof RutInvalidoError) {
        throw new BadRequestException(error.message);
      }
      // Correo ausente o en blanco al crear o al cambiarlo -> 400.
      if (error instanceof CorreoPacienteRequeridoError) {
        throw new BadRequestException(error.message);
      }
      // PATCH sin `telefono` ni `correo` -> 400.
      if (error instanceof CambioContactoVacioError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
