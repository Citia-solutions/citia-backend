import { RolUsuario } from '../../domain/usuario.entity';

/**
 * Respuesta de `GET` y `PATCH /api/usuarios/me` (US-10, ADR-15 §1 y §2, T5).
 *
 * Los nombres de `LoginUsuarioDto` (`auth`) más `especialidad` y `creadoEn`:
 * el frontend refresca `citia.user` con el mismo mapeo del login. El enlace
 * público lo arma el frontend con `tenantSlug` (opción H2). Nunca lleva el
 * hash de la contraseña ni el corte de sesiones.
 */
export class PerfilDto {
  id: string;
  email: string;
  nombreCompleto: string;
  /** Solo se muestra en el perfil (ADR-15 §1). `null` = sin especialidad. */
  especialidad: string | null;
  rol: RolUsuario;
  tenantId: string;
  /** El frontend arma el enlace `/agendar-cita/<slug>`. */
  tenantSlug: string;
  tenantNombre: string;
  creadoEn: Date;

  constructor(datos: PerfilDto) {
    Object.assign(this, datos);
  }
}
