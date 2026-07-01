import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacientesService } from '../application/pacientes.service';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { PacienteResponseDto } from './dto/paciente-response.dto';

@Controller('pacientes')
@UseGuards(JwtAuthGuard)
export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CrearPacienteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PacienteResponseDto> {
    return this.pacientesService.crearPaciente(dto, user.tenantId);
  }
}
