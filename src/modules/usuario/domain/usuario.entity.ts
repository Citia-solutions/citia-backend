import { PerfilInvalidoError } from './exceptions/perfil-invalido.error';
import type { CambiosPerfil } from './usuario.repository';

export enum RolUsuario {
  PROFESIONAL = 'PROFESIONAL',
  ADMINISTRADOR = 'ADMINISTRADOR',
}

/** US-10 (T6): largo máximo del nombre editable en el perfil. */
export const LARGO_MAXIMO_NOMBRE = 120;

/** US-10 (P1): largo máximo de la especialidad (`VARCHAR(100)`). */
export const LARGO_MAXIMO_ESPECIALIDAD = 100;

export class Usuario {
  id: string;
  email: string;
  private _passwordHash: string;
  nombreCompleto: string;
  /**
   * US-10 (P1): texto libre opcional, hasta 100 caracteres. `null` = sin
   * especialidad; nunca vacía (CHECK `CHK_usuarios_especialidad_no_vacia`).
   * Solo se muestra en el perfil (ADR-15 §1).
   */
  especialidad: string | null;
  rol: RolUsuario;
  tenantId: string;
  /**
   * US-10 (ADR-15 §5): corte de sesiones. `null` = sin corte (valen todos los
   * tokens no vencidos). Solo lo escribe el cambio de contraseña, truncado al
   * segundo, con `IUsuarioRepository.cambiarContrasena`.
   */
  sesionesValidasDesde: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;

  get passwordHash(): string {
    return this._passwordHash;
  }

  set passwordHash(hash: string) {
    this._passwordHash = hash;
  }
}

/**
 * Reglas del perfil editable (US-10, ADR-15 §1, T6). Función pura: es la red
 * de seguridad del DTO, que ya valida lo mismo.
 *
 *  - Lo ausente (`undefined`) queda FUERA del resultado: no cambia.
 *  - `nombreCompleto`: se recorta; vacío tras recortar, `null` o más de
 *    `LARGO_MAXIMO_NOMBRE` → `PerfilInvalidoError` (el nombre no se borra).
 *  - `especialidad`: se recorta; `null` o vacía → `null` (se borra); más de
 *    `LARGO_MAXIMO_ESPECIALIDAD` → `PerfilInvalidoError`.
 *
 * Los largos cuentan unidades UTF-16 (`length`), como `@MaxLength` del DTO;
 * nunca son menos que los caracteres que cuenta `VARCHAR(100)`, así que lo que
 * pasa aquí cabe en la columna. No muta la entrada.
 */
export function normalizarCambiosPerfil(cambios: CambiosPerfil): CambiosPerfil {
  const normalizados: CambiosPerfil = {};

  if (cambios.nombreCompleto !== undefined) {
    if (typeof cambios.nombreCompleto !== 'string') {
      throw new PerfilInvalidoError(
        'nombreCompleto',
        'El nombre es obligatorio',
      );
    }
    const nombre = cambios.nombreCompleto.trim();
    if (nombre === '') {
      throw new PerfilInvalidoError(
        'nombreCompleto',
        'El nombre no puede quedar vacío',
      );
    }
    if (nombre.length > LARGO_MAXIMO_NOMBRE) {
      throw new PerfilInvalidoError(
        'nombreCompleto',
        `El nombre puede tener como máximo ${LARGO_MAXIMO_NOMBRE} caracteres`,
      );
    }
    normalizados.nombreCompleto = nombre;
  }

  if (cambios.especialidad !== undefined) {
    if (cambios.especialidad === null) {
      normalizados.especialidad = null;
    } else {
      if (typeof cambios.especialidad !== 'string') {
        throw new PerfilInvalidoError(
          'especialidad',
          'La especialidad debe ser un texto',
        );
      }
      const especialidad = cambios.especialidad.trim();
      if (especialidad.length > LARGO_MAXIMO_ESPECIALIDAD) {
        throw new PerfilInvalidoError(
          'especialidad',
          `La especialidad puede tener como máximo ${LARGO_MAXIMO_ESPECIALIDAD} caracteres`,
        );
      }
      normalizados.especialidad = especialidad === '' ? null : especialidad;
    }
  }

  return normalizados;
}

/** ¿No trae ningún cambio? (`PATCH` sin campos → 200 sin escribir). */
export function sinCambiosPerfil(cambios: CambiosPerfil): boolean {
  return (
    cambios.nombreCompleto === undefined && cambios.especialidad === undefined
  );
}
