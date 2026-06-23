import { RolUsuario } from '../../../usuario/domain/usuario.entity';

export class LoginUsuarioDto {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
  tenantId: string;
}

export class LoginResponseDto {
  accessToken: string;
  usuario: LoginUsuarioDto;

  constructor(partial: LoginResponseDto) {
    Object.assign(this, partial);
  }
}
