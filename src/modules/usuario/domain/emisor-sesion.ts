import { Usuario } from './usuario.entity';

/**
 * Lo que necesita el emisor para firmar una sesión: los claims del token. No
 * pide el hash de la contraseña; un `Usuario` completo también sirve.
 */
export type UsuarioSesion = Pick<Usuario, 'id' | 'email' | 'tenantId' | 'rol'>;

/**
 * Puerto para emitir el token de una sesión nueva (US-10, ADR-15 §6, opción
 * D3). Lo usa el cambio de contraseña de `usuario` para devolverle un token
 * nuevo a la sesión actual sin depender de `auth`.
 *
 * El adaptador (`JwtEmisorSesion`, en `auth/infrastructure`) lo provee
 * `FirmaJwtModule`; las dependencias van de `auth` hacia `usuario`, nunca al
 * revés. Clase abstracta: es también el token de inyección.
 */
export abstract class EmisorSesion {
  /**
   * Firma un token para `usuario` con `iat` = `emitidoEn` en segundos (y `exp`
   * calculado desde él). `emitidoEn` debe ser el corte ya truncado al segundo
   * (`inicioSesionesValidas`): así el token nuevo vale con su propio corte.
   */
  abstract emitir(usuario: UsuarioSesion, emitidoEn: Date): string;
}
