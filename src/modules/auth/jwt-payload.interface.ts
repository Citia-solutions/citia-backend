import { RolUsuario } from '../usuario/domain/usuario.entity';

/**
 * Claims firmados dentro del JWT.
 *
 * api-agent (auth.service del login) DEBE firmar el token con esta forma exacta:
 *   { sub, email, tenantId, rol }
 *
 * `sub` es el identificador estandar del subject (id del usuario).
 */
export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  rol: RolUsuario;
}

/**
 * Objeto que la JwtStrategy deja en `req.user` tras validar el token.
 * Renombra `sub` -> `userId` para uso ergonomico en controllers/services.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  rol: RolUsuario;
}
