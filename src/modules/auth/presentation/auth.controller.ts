import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from '../application/auth.service';
import { CredencialesInvalidasError } from '../domain/exceptions/credenciales-invalidas.error';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    try {
      return await this.authService.login(dto);
    } catch (error) {
      if (error instanceof CredencialesInvalidasError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }
}
