import * as bcrypt from 'bcrypt';

import { slugify } from '../../tenant/domain/slug';
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
    const slug = await this.generarSlugUnico(dto.nombreTenant);

    const tenant = await this.tenantRepository.guardar({
      nombre: dto.nombreTenant,
      slug,
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
      nombreTenant: tenant.nombre,
      tenantSlug: tenant.slug,
      creadoEn: saved.creadoEn,
    });
  }

  /**
   * Genera un slug unico para el tenant a partir de su nombre.
   * Si el slug base ya existe, anade un sufijo incremental (-2, -3, ...).
   */
  private async generarSlugUnico(nombreTenant: string): Promise<string> {
    const base = slugify(nombreTenant);

    let candidato = base;
    let intento = 2;
    while (await this.tenantRepository.findBySlug(candidato)) {
      candidato = `${base}-${intento}`;
      intento += 1;
    }

    return candidato;
  }
}
