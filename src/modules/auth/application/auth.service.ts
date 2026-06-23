import * as bcrypt from 'bcrypt';

import { ITenantRepository } from '../../tenant/domain/tenant.repository';
import { IUsuarioRepository } from '../../usuario/domain/usuario.repository';
import { CredencialesInvalidasError } from '../domain/exceptions/credenciales-invalidas.error';
import { ITokenSigner } from '../domain/token-signer';
import { JwtPayload } from '../jwt-payload.interface';
import { LoginDto } from '../presentation/dto/login.dto';
import { LoginResponseDto } from '../presentation/dto/login-response.dto';

export class AuthService {
  constructor(
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly tokenSigner: ITokenSigner,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const tenant = await this.tenantRepository.findBySlug(dto.tenantSlug);
    if (!tenant) {
      throw new CredencialesInvalidasError();
    }

    const usuario = await this.usuarioRepository.findByEmailAndTenant(
      dto.email,
      tenant.id,
    );
    if (!usuario) {
      throw new CredencialesInvalidasError();
    }

    const passwordValido = await bcrypt.compare(
      dto.password,
      usuario.passwordHash,
    );
    if (!passwordValido) {
      throw new CredencialesInvalidasError();
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      tenantId: usuario.tenantId,
      rol: usuario.rol,
    };

    const accessToken = this.tokenSigner.sign(payload);

    return new LoginResponseDto({
      accessToken,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
        rol: usuario.rol,
        tenantId: usuario.tenantId,
      },
    });
  }
}
