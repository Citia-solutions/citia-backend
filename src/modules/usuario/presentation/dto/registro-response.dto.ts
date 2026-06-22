import { RolUsuario } from '../../domain/usuario.entity';

export class RegistroResponseDto {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
  tenantId: string;
  creadoEn: Date;

  constructor(partial: RegistroResponseDto) {
    Object.assign(this, partial);
  }
}
