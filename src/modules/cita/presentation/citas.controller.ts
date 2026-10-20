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
  Query,
  UseGuards,
} from '@nestjs/common';

import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacienteNoEncontradoError } from '../../paciente/application/paciente-no-encontrado.error';
import { CorreoPacienteRequeridoError } from '../../paciente/domain/exceptions/correo-paciente-requerido.error';
import { CitaNoEncontradaError } from '../application/cita-no-encontrada.error';
import { DatosPacienteRequeridosError } from '../application/datos-paciente-requeridos.error';
import { RangoFechasInvalidoError } from '../application/rango-fechas-invalido.error';
import { CitasService } from '../application/citas.service';
import { EnlacesCitaService } from '../application/enlaces-cita.service';
import { CambioCita } from '../domain/cambio-cita.entity';
import { CitaAunNoComienzaError } from '../domain/exceptions/cita-aun-no-comienza.error';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { CitaDashboardDto } from './dto/cita-dashboard.dto';
import { CitaDetalleDto } from './dto/cita-detalle.dto';
import { CitaResponseDto } from './dto/cita-response.dto';
import { CrearCitaDto } from './dto/crear-cita.dto';
import { EditarCitaDto } from './dto/editar-cita.dto';
import { ListarCitasQueryDto } from './dto/listar-citas-query.dto';
import { MotivoCitaDto } from './dto/motivo-cita.dto';
import { ReagendarCitaDto } from './dto/reagendar-cita.dto';

@Controller('citas')
@UseGuards(JwtAuthGuard)
export class CitasController {
  constructor(
    private readonly citasService: CitasService,
    private readonly enlacesCita: EnlacesCitaService,
  ) {}

  // US-02: POST /api/citas
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CrearCitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.crearCita(dto, user));
  }

  // Agenda por rango: GET /api/citas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD.
  // Ruta sin segmento: no compite con `hoy` ni con `:id` (esas exigen un
  // segmento mas). Misma forma que `/hoy` (CitaDashboardDto[]).
  @Get()
  async listar(
    @Query() query: ListarCitasQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaDashboardDto[]> {
    return this.ejecutar(() =>
      this.citasService.listarEnRango(query.desde, query.hasta, user),
    );
  }

  // US-06 (RF-03): GET /api/citas/hoy -> dashboard del profesional logueado.
  @Get('hoy')
  async hoy(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaDashboardDto[]> {
    return this.citasService.citasDeHoy(user);
  }

  // US-02.08: GET /api/citas/:id -> detalle para el voucher (cita + paciente +
  // acciones permitidas). Declarado DESPUES de `hoy` a proposito: si fuera
  // antes, `hoy` se leeria como un :id (hoy lo frenaria el UUID pipe con un
  // 400, pero no conviene depender de eso).
  @Get(':id')
  async detalle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaDetalleDto> {
    return this.ejecutar(() => this.citasService.detalle(id, user));
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

  // Cuerpo `{ motivo?, pedidoPor? }` (US-07.01: quién pidió la cancelación).
  @Patch(':id/cancelar')
  async cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoCitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() =>
      this.citasService.cancelar(id, user, dto.motivo, dto.pedidoPor),
    );
  }

  // Desde `pendiente` o `confirmada`, y solo desde la hora de inicio (antes,
  // 409 con el mensaje de `CitaAunNoComienzaError`). US-07.01.
  @Patch(':id/asistencia')
  async marcarAsistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.marcarAsistencia(id, user));
  }

  // `confirmada → no_asistio` o `pendiente → ghosting` (lo decide el dominio);
  // la respuesta trae el estado real de destino. Misma guarda de la hora.
  @Patch(':id/inasistencia')
  async marcarInasistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CitaResponseDto> {
    return this.ejecutar(() => this.citasService.marcarInasistencia(id, user));
  }

  // No hay ruta `ghosting` (US-07.01, ADR-14 §9): `…/inasistencia` sobre una
  // `pendiente` la deja en `ghosting` (lo decide el dominio) y el job G1 cierra,
  // como sistema, las que nadie marcó (DT-11).

  // -------------------------------------------------------------------
  // Reagendar y editar (ADR-09 §5)
  // -------------------------------------------------------------------

  // Cuerpo `{ inicio, motivo?, pedidoPor? }` (US-07.01: quién pidió el cambio).
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

  // -------------------------------------------------------------------
  // Enlace del paciente (Fase 3, S1): el profesional lo invalida desde el
  // voucher. 204 tambien si no habia enlace activo (idempotente); 404 si la
  // cita no es del tenant del token. El siguiente recordatorio lleva la
  // version siguiente. No hay ruta para ver ni copiar el enlace (E4).
  // -------------------------------------------------------------------

  @Post(':id/enlace/invalidar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async invalidarEnlace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.ejecutar(() => this.enlacesCita.invalidar(id, user));
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
      // Asistencia o inasistencia antes de la hora de inicio -> 409, con su
      // mensaje (US-07.01): la cita existe y la peticion esta bien formada,
      // pero en este momento no admite la operacion.
      if (error instanceof CitaAunNoComienzaError) {
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
      // Paciente nuevo sin correo -> 400 (ADR-13 §14). El DTO ya lo rechaza;
      // esto cubre a quien llegue al caso de uso sin pasar por el.
      if (error instanceof CorreoPacienteRequeridoError) {
        throw new BadRequestException(error.message);
      }
      // Agenda por rango: `hasta` anterior a `desde` o mas de 42 dias -> 400.
      if (error instanceof RangoFechasInvalidoError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
