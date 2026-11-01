import { tokenEmitidoVigente } from '../../usuario/domain/sesiones';
import { IUsuarioRepository } from '../../usuario/domain/usuario.repository';

/** Por qué un token bien firmado y no vencido deja de valer (ADR-15 §5). */
export type MotivoSesionCortada = 'anterior_al_corte' | 'usuario_inexistente';

export type VerificacionSesion =
  | { vigente: true }
  | { vigente: false; motivo: MotivoSesionCortada };

/**
 * ¿Sigue valiendo la sesión de un token? (US-10, ADR-15 §5, opción A1)
 *
 * Lo llama `JwtStrategy.validate` en cada petición autenticada, después de
 * que passport verificó la firma y el vencimiento. Lee solo la columna del
 * corte (`IUsuarioRepository.estadoSesion`, por clave primaria), **sin
 * caché** (opción C1): el corte es inmediato en todos los procesos.
 *
 *  - el usuario ya no existe en esa organización (o el id no es un UUID) → no
 *    vigente (`usuario_inexistente`);
 *  - el token es anterior al corte → no vigente (`anterior_al_corte`);
 *  - si no → vigente.
 *
 * Si la base no responde, el error sube (500), como todo lo que la usa.
 *
 * Clase plana (ADR-02): `AuthModule` la arma con `useFactory`.
 */
export class VerificarSesionService {
  constructor(private readonly usuarios: IUsuarioRepository) {}

  /** `true` si la sesión del token sigue valiendo (contrato del plan US-10). */
  async vigente(
    usuarioId: string,
    tenantId: string,
    iat?: number,
  ): Promise<boolean> {
    return (await this.verificar(usuarioId, tenantId, iat)).vigente;
  }

  /** Lo mismo que `vigente`, con el motivo cuando no vale (para el log). */
  async verificar(
    usuarioId: string,
    tenantId: string,
    iat?: number,
  ): Promise<VerificacionSesion> {
    const estado = await this.usuarios.estadoSesion(usuarioId, tenantId);
    if (estado === null) {
      return { vigente: false, motivo: 'usuario_inexistente' };
    }
    if (!tokenEmitidoVigente(iat, estado.sesionesValidasDesde)) {
      return { vigente: false, motivo: 'anterior_al_corte' };
    }
    return { vigente: true };
  }
}
