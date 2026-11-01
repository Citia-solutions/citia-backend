import {
  Controller,
  ForbiddenException,
  Get,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { ConsultarSuscripcionService } from '../application/consultar-suscripcion.service';
import { OrganizacionNoEncontradaError } from '../domain/exceptions/organizacion-no-encontrada.error';
import { SoloAdministradorError } from '../domain/exceptions/solo-administrador.error';
import { SuscripcionDto } from './dto/suscripcion.dto';

/**
 * `GET /api/organizacion/suscripcion` (US-10, ADR-15 §3) → 200
 * `SuscripcionDto` · 401 · 403 (no `ADMINISTRADOR`).
 *
 * La ruta usa la palabra del producto, *organización*; el código sigue
 * diciendo *tenant*. La organización y el rol salen del TOKEN, nunca de la
 * petición. Sin límite de tasa: es barata y exige sesión.
 *
 * `JwtAuthGuard` no tiene dependencias: `TenantModule` no importa
 * `AuthModule` (que importa `TenantModule`); la estrategia `jwt` la registra
 * `AuthModule` en passport, como en `cita` o `paciente`.
 */
@Controller('organizacion')
@UseGuards(JwtAuthGuard)
export class SuscripcionController {
  constructor(private readonly suscripciones: ConsultarSuscripcionService) {}

  @Get('suscripcion')
  async consultar(
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<SuscripcionDto> {
    try {
      return await this.suscripciones.consultar({
        tenantId: usuario.tenantId,
        rol: usuario.rol,
      });
    } catch (error: unknown) {
      if (error instanceof SoloAdministradorError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof OrganizacionNoEncontradaError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
