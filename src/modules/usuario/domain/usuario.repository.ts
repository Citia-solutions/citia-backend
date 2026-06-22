import { Usuario } from './usuario.entity';

export abstract class IUsuarioRepository {
  abstract findByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<Usuario | null>;
  abstract guardar(usuario: Partial<Usuario>): Promise<Usuario>;
}
