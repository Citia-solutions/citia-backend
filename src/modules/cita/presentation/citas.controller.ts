import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacienteNoEncontradoError } from '../application/paciente-no-encontrado.error';
import { CitasService } from '../application/citas.service';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CitaDashboardDto } from './dto/cita-dashboard.dto';
import { CitaResponseDto } from './dto/cita-response.dto';
import { CrearCitaDto } from './dto/crear-cita.dto';

@Controller('citas')
@UseGuards(JwtAuthGuard)
export class CitasController {
  constructor(private readonly citasService: CitasService) {}

  // US-02: POST /api/citas
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CrearCitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    try {
      return await this.citasService.crearCita(dto, user);
    } catch (error) {
      // Paciente inexistente o de otro tenant -> 400 Bad Request.
      if (error instanceof PacienteNoEncontradoError) {
        throw new BadRequestException(error.message);
      }
      // Transicion de estado ilegal -> 409 Conflict (mismo patron que usuario).
      if (error instanceof TransicionEstadoInvalidaError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  // US-06 (RF-03): GET /api/citas/hoy -> dashboard del profesional logueado.
  @Get('hoy')
  async hoy(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaDashboardDto[]> {
    return this.citasService.citasDeHoy(user);
  }
}
