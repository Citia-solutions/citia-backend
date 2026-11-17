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
import { VersionTerminosNoVigenteError } from '../domain/exceptions/version-terminos-no-vigente.error';
import { ActualizarPacienteDto } from './dto/actualizar-paciente.dto';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { PacienteResponseDto } from './dto/paciente-response.dto';
import { MENSAJE_VERSION_TERMINOS_NO_VIGENTE } from './dto/version-terminos.decorator';

@Controller('pacientes')
@UseGuards(JwtAuthGuard)
export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  // POST /api/pacientes. Exige `consentimiento: true` y `terminosVersion`
  // (US-11, D6): registra el paciente y su aceptación de canal `profesional`
  // a nombre del usuario del token, en una transacción.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CrearPacienteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PacienteResponseDto> {
    return this.ejecutar(() =>
      this.pacientesService.crearPaciente(dto, {
        userId: user.userId,
        tenantId: user.tenantId,
      }),
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
      // Versión de los términos que no recibe aceptaciones -> 400 con el
      // mensaje FIJO del DTO (US-11): el frontend lo reconoce por su texto.
      if (error instanceof VersionTerminosNoVigenteError) {
        throw new BadRequestException(MENSAJE_VERSION_TERMINOS_NO_VIGENTE);
      }
      throw error;
    }
  }
}
