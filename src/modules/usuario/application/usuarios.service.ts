import * as bcrypt from 'bcrypt';

import { TipoTenant } from '../../tenant/domain/tenant.entity';
import { ITenantRepository } from '../../tenant/domain/tenant.repository';
import { EmailYaRegistradoError } from '../domain/exceptions/email-ya-registrado.error';
import { RolUsuario } from '../domain/usuario.entity';
import { IUsuarioRepository } from '../domain/usuario.repository';
import { RegistroResponseDto } from '../presentation/dto/registro-response.dto';
import { RegistroUsuarioDto } from '../presentation/dto/registro-usuario.dto';

export class UsuariosService {
  constructor(
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly tenantRepository: ITenantRepository,
  ) {}

  async registrar(dto: RegistroUsuarioDto): Promise<RegistroResponseDto> {
    const tenant = await this.tenantRepository.guardar({
      nombre: dto.nombreTenant,
      tipo: dto.tipoTenant ?? TipoTenant.INDEPENDIENTE,
    });

    const existing = await this.usuarioRepository.findByEmailAndTenant(
      dto.email,
      tenant.id,
    );
    if (existing) {
      throw new EmailYaRegistradoError(dto.email);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const saved = await this.usuarioRepository.guardar({
      email: dto.email,
      passwordHash,
      nombreCompleto: dto.nombreCompleto,
      tenantId: tenant.id,
      rol: RolUsuario.ADMINISTRADOR,
    });

    return new RegistroResponseDto({
      id: saved.id,
      email: saved.email,
      nombreCompleto: saved.nombreCompleto,
      rol: saved.rol,
      tenantId: saved.tenantId,
      creadoEn: saved.creadoEn,
    });
  }
}
