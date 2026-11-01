import { RolUsuario, Usuario } from '../usuario/domain/usuario.entity';

/**
 * Claims firmados dentro del JWT: `{ sub, email, tenantId, rol }` más los
 * estándar que pone `jsonwebtoken` (`iat` y `exp`, en SEGUNDOS).
 *
 * `sub` es el identificador estandar del subject (id del usuario). Los claims
 * se arman SOLO con `crearPayloadJwt` (login y emisor de sesión, ADR-15 §6).
 */
export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  rol: RolUsuario;
  /**
   * Emitido en (segundos). Lo pone `jsonwebtoken` al firmar; si el payload ya
   * lo trae, lo respeta y calcula `exp` desde él. La estrategia lo compara
   * con el corte de sesiones del usuario (ADR-15 §5).
   */
  iat?: number;
  /** Vence en (segundos). Lo calcula `jsonwebtoken` con `JWT_EXPIRES_IN`. */
  exp?: number;
}

/**
 * Los claims de un usuario, en un solo lugar (ADR-15 §6).
 *
 *  - Sin `emitidoEn` (login): sin `iat`; lo pone `jsonwebtoken` con la hora
 *    de la firma.
 *  - Con `emitidoEn` (token nuevo tras cambiar la contraseña): `iat =
 *    ⌊emitidoEn / 1000⌋`, que con el corte truncado al segundo es exactamente
 *    el corte; `jsonwebtoken` calcula `exp` desde ese `iat`.
 *
 * Nunca pone `exp`: `jsonwebtoken` rechaza un payload con `exp` si además hay
 * `expiresIn` (lo hay, `JWT_EXPIRES_IN`).
 */
export function crearPayloadJwt(
  usuario: Pick<Usuario, 'id' | 'email' | 'tenantId' | 'rol'>,
  emitidoEn?: Date,
): JwtPayload {
  const payload: JwtPayload = {
    sub: usuario.id,
    email: usuario.email,
    tenantId: usuario.tenantId,
    rol: usuario.rol,
  };
  if (emitidoEn !== undefined) {
    const ms = emitidoEn.getTime();
    if (!Number.isFinite(ms)) {
      throw new Error('crearPayloadJwt: emitidoEn no es una fecha válida');
    }
    payload.iat = Math.floor(ms / 1000);
  }
  return payload;
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
