import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { UsuariosService } from '../application/usuarios.service';
import { EmailYaRegistradoError } from '../domain/exceptions/email-ya-registrado.error';
import { RegistroResponseDto } from './dto/registro-response.dto';
import { RegistroUsuarioDto } from './dto/registro-usuario.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
