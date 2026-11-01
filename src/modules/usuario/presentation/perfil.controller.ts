import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { LimitarTasa } from '../../../shared/presentation/limitar-tasa.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { CambiarContrasenaService } from '../application/cambiar-contrasena.service';
import { PerfilService, UsuarioDeSesion } from '../application/perfil.service';
import { ContrasenaActualIncorrectaError } from '../domain/exceptions/contrasena-actual-incorrecta.error';
import { ContrasenaCambiadaEnParaleloError } from '../domain/exceptions/contrasena-cambiada-en-paralelo.error';
import { ContrasenaNoValidaError } from '../domain/exceptions/contrasena-no-valida.error';
import { ContrasenaRepetidaError } from '../domain/exceptions/contrasena-repetida.error';
import { PerfilInvalidoError } from '../domain/exceptions/perfil-invalido.error';
import { UsuarioNoEncontradoError } from '../domain/exceptions/usuario-no-encontrado.error';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { ContrasenaCambiadaDto } from './dto/contrasena-cambiada.dto';
import { PerfilDto } from './dto/perfil.dto';

/**
 * Cuenta del usuario de la sesión (US-10, ADR-15 §1 y §4). Todo sale del
 * TOKEN (`@CurrentUser()`), nunca del cuerpo.
 *
 * - `GET   /api/usuarios/me`            → 200 `PerfilDto` · 401.
 * - `PATCH /api/usuarios/me`            → 200 `PerfilDto` · 400 · 401.
 * - `PUT   /api/usuarios/me/contrasena` → 200 `{ accessToken }` · 400 · 401 ·
 *   409 · 429 (cubo `cambioContrasena`: 5 por hora por IP).
 *
 * Es OTRO controller que `UsuariosController` a propósito: el registro
 * (`POST /api/usuarios`) sigue público; aquí el guard va en la clase.
 *
 * La contraseña actual incorrecta es **400, nunca 401**: el frontend cierra la
 * sesión con cualquier 401. El 401 queda para la sesión que apunta a nadie.
 */
@Controller('usuarios/me')
@UseGuards(JwtAuthGuard)
export class PerfilController {
  private readonly logger = new Logger(PerfilController.name);

  constructor(
    private readonly perfil: PerfilService,
    private readonly contrasenas: CambiarContrasenaService,
  ) {}

  @Get()
  async obtener(@CurrentUser() usuario: AuthenticatedUser): Promise<PerfilDto> {
    try {
      return await this.perfil.obtener(sesionDe(usuario));
    } catch (error: unknown) {
      throw aHttp(error);
    }
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async actualizar(
    @Body() dto: ActualizarPerfilDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<PerfilDto> {
    try {
      return await this.perfil.actualizar(sesionDe(usuario), dto);
    } catch (error: unknown) {
      throw aHttp(error);
    }
  }

  @Put('contrasena')
  @HttpCode(HttpStatus.OK)
  @LimitarTasa('cambioContrasena')
  async cambiarContrasena(
    @Body() dto: CambiarContrasenaDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ): Promise<ContrasenaCambiadaDto> {
    let respuesta: ContrasenaCambiadaDto;
    try {
      respuesta = await this.contrasenas.cambiar(sesionDe(usuario), dto);
    } catch (error: unknown) {
      throw aHttp(error);
    }
    // Solo ids: nunca las contraseñas, el token ni el correo.
    this.logger.log({
      evento: 'usuarios.contrasena_cambiada',
      usuarioId: usuario.userId,
      tenantId: usuario.tenantId,
    });
    return respuesta;
  }
}

function sesionDe(usuario: AuthenticatedUser): UsuarioDeSesion {
  return { userId: usuario.userId, tenantId: usuario.tenantId };
}

/** Errores de dominio → HTTP. Lo demás sigue igual (500). */
function aHttp(error: unknown): unknown {
  if (error instanceof UsuarioNoEncontradoError) {
    return new UnauthorizedException();
  }
  if (
    error instanceof PerfilInvalidoError ||
    error instanceof ContrasenaActualIncorrectaError ||
    error instanceof ContrasenaNoValidaError ||
    error instanceof ContrasenaRepetidaError
  ) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ContrasenaCambiadaEnParaleloError) {
    return new ConflictException(error.message);
  }
  return error;
}
