import { TransactionContext } from '../../../shared/application/transaction-runner';

/** Lo único que el paciente ve de quién lo atiende (contrato §3.4, S2). */
export interface NombresCita {
  /** `Usuario.nombreCompleto` del DUEÑO de la cita. */
  profesional: string;
  /** `Tenant.nombre`. */
  organizacion: string;
}

/**
 * Puerto de SOLO LECTURA sobre `usuarios` y `tenants` para la vista del
 * paciente. Un adaptador propio (SQL, una consulta) en lugar de importar
 * `UsuariosModule` / `TenantModule`: el puerto de usuarios no tiene búsqueda
 * por id y así el portal no amplía la superficie de esos módulos.
 *
 * Filtra por `tenantId`: un usuario de otra organización no existe (`null`).
 * `tx` obligatorio (corre dentro de la transacción de la acción).
 */
export abstract class LectorNombresCita {
  abstract leer(
    usuarioId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<NombresCita | null>;
}
