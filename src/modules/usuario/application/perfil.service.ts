import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { Tenant } from '../../tenant/domain/tenant.entity';
import { ITenantRepository } from '../../tenant/domain/tenant.repository';
import { UsuarioNoEncontradoError } from '../domain/exceptions/usuario-no-encontrado.error';
import {
  normalizarCambiosPerfil,
  sinCambiosPerfil,
  Usuario,
} from '../domain/usuario.entity';
import { IUsuarioRepository } from '../domain/usuario.repository';
import { ActualizarPerfilDto } from '../presentation/dto/actualizar-perfil.dto';
import { PerfilDto } from '../presentation/dto/perfil.dto';

/**
 * El usuario de la sesión, tal como sale del token (`@CurrentUser()`). Nunca
 * del cuerpo de la petición.
 */
export interface UsuarioDeSesion {
  userId: string;
  tenantId: string;
}

/**
 * Perfil del usuario de la sesión (US-10, ADR-15 §1 y §2):
 * `GET` y `PATCH /api/usuarios/me`.
 *
 * Clase plana (ADR-02): `UsuariosModule` la arma con `useFactory`.
 */
export class PerfilService {
  constructor(
    private readonly usuarios: IUsuarioRepository,
    private readonly tenants: ITenantRepository,
    private readonly tx: TransactionRunner,
  ) {}

  /**
   * El perfil con su organización. Usuario u organización inexistentes →
   * `UsuarioNoEncontradoError` (401; tras la estrategia JWT, solo en una
   * carrera).
   */
  async obtener(sesion: UsuarioDeSesion): Promise<PerfilDto> {
    // Primero el usuario: su `findById` no consulta con un id que no es UUID,
    // y si no existe no hace falta leer la organización.
    const usuario = await this.usuarios.findById(
      sesion.userId,
      sesion.tenantId,
    );
    if (!usuario) {
      throw new UsuarioNoEncontradoError();
    }
    const tenant = await this.tenants.findById(sesion.tenantId);
    return armarPerfil(usuario, tenant);
  }

  /**
   * Cambia solo el nombre y la especialidad presentes (normalizados por el
   * dominio: `PerfilInvalidoError` antes de tocar la base). Sin ningún campo,
   * no escribe y devuelve el perfil actual.
   */
  async actualizar(
    sesion: UsuarioDeSesion,
    dto: ActualizarPerfilDto,
  ): Promise<PerfilDto> {
    const cambios = normalizarCambiosPerfil({
      nombreCompleto: dto.nombreCompleto,
      especialidad: dto.especialidad,
    });
    if (sinCambiosPerfil(cambios)) {
      return this.obtener(sesion);
    }

    return this.tx.run(async (tx) => {
      const usuario = await this.usuarios.actualizarPerfil(
        sesion.userId,
        sesion.tenantId,
        cambios,
        tx,
      );
      if (!usuario) {
        throw new UsuarioNoEncontradoError();
      }
      const tenant = await this.tenants.findById(sesion.tenantId, tx);
      return armarPerfil(usuario, tenant);
    });
  }
}

function armarPerfil(usuario: Usuario, tenant: Tenant | null): PerfilDto {
  if (!tenant) {
    throw new UsuarioNoEncontradoError();
  }
  return new PerfilDto({
    id: usuario.id,
    email: usuario.email,
    nombreCompleto: usuario.nombreCompleto,
    especialidad: usuario.especialidad,
    rol: usuario.rol,
    tenantId: usuario.tenantId,
    tenantSlug: tenant.slug,
    tenantNombre: tenant.nombre,
    creadoEn: usuario.creadoEn,
  });
}
