import { RolUsuario } from '../../../usuario/domain/usuario.entity';

export class LoginUsuarioDto {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
  tenantId: string;
  // Slug público de la organización, para que el frontend arme el enlace
  // `/agendar-cita/<slug>` (cierre de Fase 1 §d). Aditivo. NO va dentro del
  // JWT: no autoriza nada y cambiar los claims obligaría a re-emitir tokens.
  tenantSlug: string;
  // Nombre visible de la organización (`tenants.nombre`), para el sidebar del
  // frontend. Aditivo, mismo criterio que `tenantSlug`: sale del tenant ya
  // resuelto por slug (sin consulta extra) y NO va dentro del JWT.
  tenantNombre: string;
}

export class LoginResponseDto {
  accessToken: string;
  usuario: LoginUsuarioDto;

  constructor(partial: LoginResponseDto) {
    Object.assign(this, partial);
  }
}
