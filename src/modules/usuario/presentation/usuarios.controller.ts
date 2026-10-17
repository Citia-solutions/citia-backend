import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { LimitarTasa } from '../../../shared/presentation/limitar-tasa.decorator';
import { UsuariosService } from '../application/usuarios.service';
import { EmailYaRegistradoError } from '../domain/exceptions/email-ya-registrado.error';
import { RegistroResponseDto } from './dto/registro-response.dto';
import { RegistroUsuarioDto } from './dto/registro-usuario.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  /** Registro público: 5 por hora por IP (Fase 3 §6). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @LimitarTasa('registro')
  async registrar(
    @Body() dto: RegistroUsuarioDto,
  ): Promise<RegistroResponseDto> {
    try {
      return await this.usuariosService.registrar(dto);
    } catch (error) {
      if (error instanceof EmailYaRegistradoError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
