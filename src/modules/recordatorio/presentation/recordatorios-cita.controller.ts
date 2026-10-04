import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CitaDeRecordatoriosNoEncontradaError } from '../application/cita-de-recordatorios-no-encontrada.error';
import { ConsultarRecordatoriosService } from '../application/consultar-recordatorios.service';
import { RecordatorioCitaDto } from './dto/recordatorio-cita.dto';

/**
 * `GET /api/citas/:citaId/recordatorios` (ADR-13 §1, §17): el estado de los
 * recordatorios de una cita. Lo sirve ESTE módulo, no `cita` (que no sabe
 * que los recordatorios existen).
 *
 * Filtrado por el tenant del token: una cita de otra organización → 404,
 * igual que una que no existe. Sin destinatario ni id del proveedor.
 * No compite con `GET /citas/:id` (aquella ruta tiene un segmento menos).
 */
@Controller('citas/:citaId/recordatorios')
@UseGuards(JwtAuthGuard)
export class RecordatoriosCitaController {
  constructor(private readonly servicio: ConsultarRecordatoriosService) {}

  @Get()
  async listar(
    @Param('citaId', ParseUUIDPipe) citaId: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<RecordatorioCitaDto[]> {
    try {
      const recordatorios = await this.servicio.listarDeCita(
        citaId,
        usuario.tenantId,
      );
      return recordatorios.map((r) => RecordatorioCitaDto.desde(r));
    } catch (error: unknown) {
      if (error instanceof CitaDeRecordatoriosNoEncontradaError) {
        throw new NotFoundException('Cita no encontrada');
      }
      throw error;
    }
  }
}
