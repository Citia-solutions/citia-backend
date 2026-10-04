import * as bcrypt from 'bcrypt';

import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
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
    private readonly tx: TransactionRunner,
  ) {}

  async registrar(dto: RegistroUsuarioDto): Promise<RegistroResponseDto> {
    return this.tx.run(async (tx) => {
      const slug = await this.generarSlugUnico(dto.nombreTenant, tx);

      const tenant = await this.tenantRepository.guardar(
        {
          nombre: dto.nombreTenant,
          slug,
          tipo: dto.tipoTenant ?? TipoTenant.INDEPENDIENTE,
        },
        tx,
      );

      const existing = await this.usuarioRepository.findByEmailAndTenant(
        dto.email,
        tenant.id,
        tx,
      );
      if (existing) {
        throw new EmailYaRegistradoError(dto.email);
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);

      const saved = await this.usuarioRepository.guardar(
        {
          email: dto.email,
          passwordHash,
          nombreCompleto: dto.nombreCompleto,
          tenantId: tenant.id,
          rol: RolUsuario.ADMINISTRADOR,
        },
        tx,
      );

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
    });
  }

  /**
   * Genera un slug unico para el tenant a partir de su nombre.
   * Si el slug base ya existe, anade un sufijo incremental (-2, -3, ...).
   */
  private async generarSlugUnico(
    nombreTenant: string,
    tx?: TransactionContext,
  ): Promise<string> {
    const base = slugify(nombreTenant);

    let candidato = base;
    let intento = 2;
    while (await this.tenantRepository.findBySlug(candidato, tx)) {
      candidato = `${base}-${intento}`;
      intento += 1;
    }

    return candidato;
  }
}
