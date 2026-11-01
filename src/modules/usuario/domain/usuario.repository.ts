import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Usuario } from './usuario.entity';

/**
 * Cambios del perfil (US-10, `PATCH /api/usuarios/me`). Ausente (`undefined`)
 * = no cambia. `especialidad: null` la borra. Llegan ya normalizados por el
 * dominio (recortados, en rango, especialidad vacía → `null`).
 */
export interface CambiosPerfil {
  nombreCompleto?: string;
  especialidad?: string | null;
}

/**
 * Cambio de contraseña (US-10, ADR-15 §4 y §5). `hashAnterior` es el hash que
 * leyó el caso de uso: el UPDATE solo escribe si sigue siendo ese.
 */
export interface CambioContrasena {
  hashAnterior: string;
  hashNuevo: string;
  /** El corte, ya truncado al segundo (`inicioSesionesValidas`). */
  sesionesValidasDesde: Date;
}

/** Lo único que necesita la estrategia JWT para decidir si un token vale. */
export interface EstadoSesionUsuario {
  sesionesValidasDesde: Date | null;
}

export abstract class IUsuarioRepository {
  abstract findByEmailAndTenant(
    email: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Usuario | null>;
  abstract guardar(
    usuario: Partial<Usuario>,
    tx?: TransactionContext,
  ): Promise<Usuario>;

  /** El usuario de esa organización, o `null` (también si el id no es un UUID). */
  abstract findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Usuario | null>;

  /**
   * Actualiza solo los campos presentes de `cambios` y `actualizado_en`;
   * devuelve la fila completa o `null` si no existe en esa organización. Sin
   * ningún campo presente no escribe: devuelve el usuario tal como está.
   */
  abstract actualizarPerfil(
    id: string,
    tenantId: string,
    cambios: CambiosPerfil,
    tx?: TransactionContext,
  ): Promise<Usuario | null>;

  /**
   * UPDATE CONDICIONAL al hash anterior: escribe `password_hash`,
   * `sesiones_validas_desde` y `actualizado_en` solo si el hash guardado
   * sigue siendo `cambio.hashAnterior`. `true` si escribió; `false` si el
   * usuario no existe en esa organización o su contraseña cambió entretanto.
   */
  abstract cambiarContrasena(
    id: string,
    tenantId: string,
    cambio: CambioContrasena,
    tx?: TransactionContext,
  ): Promise<boolean>;

  /**
   * Solo la columna del corte (no carga el hash); `null` si el usuario no
   * existe en esa organización. Lo llama la estrategia JWT en cada petición
   * autenticada (ADR-15 §5): sin transacción.
   */
  abstract estadoSesion(
    id: string,
    tenantId: string,
  ): Promise<EstadoSesionUsuario | null>;
}
