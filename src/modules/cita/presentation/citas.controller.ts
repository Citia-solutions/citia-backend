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
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CitaNoEncontradaError } from '../application/cita-no-encontrada.error';
import { DatosPacienteRequeridosError } from '../application/datos-paciente-requeridos.error';
import { PacienteNoEncontradoError } from '../application/paciente-no-encontrado.error';
import { CitasService } from '../application/citas.service';
import { CambioCita } from '../domain/cambio-cita.entity';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CitaDashboardDto } from './dto/cita-dashboard.dto';
import { CitaResponseDto } from './dto/cita-response.dto';
import { CrearCitaDto } from './dto/crear-cita.dto';
import { EditarCitaDto } from './dto/editar-cita.dto';
import { MotivoCitaDto } from './dto/motivo-cita.dto';
import { ReagendarCitaDto } from './dto/reagendar-cita.dto';

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
    return this.ejecutar(() => this.citasService.crearCita(dto, user));
  }

  // US-06 (RF-03): GET /api/citas/hoy -> dashboard del profesional logueado.
  @Get('hoy')
  async hoy(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaDashboardDto[]> {
    return this.citasService.citasDeHoy(user);
  }

  // -------------------------------------------------------------------
  // Transiciones de estado (ADR-09 §4). Cada una expone un metodo de la
  // maquina de estados del dominio; la regla de que es legal vive alli.
  // -------------------------------------------------------------------

  @Patch(':id/confirmar')
  async confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.confirmar(id, user));
  }

  @Patch(':id/cancelar')
  async cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoCitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() =>
      this.citasService.cancelar(id, user, dto.motivo),
    );
  }

  @Patch(':id/asistencia')
  async marcarAsistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.marcarAsistencia(id, user));
  }

  @Patch(':id/inasistencia')
  async marcarInasistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.marcarInasistencia(id, user));
  }

  // `ghosting` no se expone: no lo dispara una persona, lo materializa el job
  // que cierra las citas vencidas (ADR-04 §4, DT-11).

  // -------------------------------------------------------------------
  // Reagendar y editar (ADR-09 §5)
  // -------------------------------------------------------------------

  @Patch(':id/reagendar')
  async reagendar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReagendarCitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.reagendar(id, dto, user));
  }

  @Patch(':id')
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarCitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.editar(id, dto, user));
  }

  @Get(':id/historial')
  async historial(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CambioCita[]> {
    return this.ejecutar(() => this.citasService.historial(id, user));
  }

  /**
   * Traduccion unica de errores de dominio a HTTP. Estaba repetida en cada
   * handler; con siete rutas dejaba de tener sentido copiarla.
   */
  private async ejecutar<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      // La cita no existe o es de otro tenant -> 404 (no se distinguen).
      if (error instanceof CitaNoEncontradaError) {
        throw new NotFoundException(error.message);
      }
      // Transicion de estado ilegal -> 409 Conflict.
      if (error instanceof TransicionEstadoInvalidaError) {
        throw new ConflictException(error.message);
      }
      // Paciente inexistente o de otro tenant -> 400 Bad Request.
      if (error instanceof PacienteNoEncontradoError) {
        throw new BadRequestException(error.message);
      }
      // No se indico a quien se agenda -> 400.
      if (error instanceof DatosPacienteRequeridosError) {
        throw new BadRequestException(error.message);
      }
      // RUT con digito verificador incorrecto -> 400.
      if (error instanceof RutInvalidoError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
