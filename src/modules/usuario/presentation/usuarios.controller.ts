import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { UsuariosService } from '../application/usuarios.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async registerUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usuariosService.registerUser(dto);
  }
}
