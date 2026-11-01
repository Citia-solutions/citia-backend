import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { OrganizacionNoEncontradaError } from '../domain/exceptions/organizacion-no-encontrada.error';
import { SoloAdministradorError } from '../domain/exceptions/solo-administrador.error';
import { describirPlan } from '../domain/plan';
import { ITenantRepository } from '../domain/tenant.repository';
import { SuscripcionDto } from '../presentation/dto/suscripcion.dto';

/** Quién pide, tal como sale del token (`@CurrentUser()`). */
export interface SolicitanteSuscripcion {
  tenantId: string;
  rol: RolUsuario;
}

/**
 * Suscripción de la organización del token, en lectura (US-10, ADR-15 §3):
 * `GET /api/organizacion/suscripcion`.
 *
 * - No `ADMINISTRADOR` → `SoloAdministradorError` (403) ANTES de leer nada
 *   (opción G2: primera ruta que mira el rol, sin guard general, DT-02). El
 *   rol sale del token: un cambio de rol se ve con el próximo token.
 * - Organización inexistente → `OrganizacionNoEncontradaError` (401).
 * - Si no, el plan con su nombre legible, la fecha de alta y la renovación y
 *   el método de pago en `null` (no hay dinero en la v1).
 *
 * Clase plana (ADR-02): `TenantModule` la arma con `useFactory`.
 */
export class ConsultarSuscripcionService {
  constructor(private readonly tenants: ITenantRepository) {}

  async consultar(
    solicitante: SolicitanteSuscripcion,
  ): Promise<SuscripcionDto> {
    if (solicitante.rol !== RolUsuario.ADMINISTRADOR) {
      throw new SoloAdministradorError();
    }

    const tenant = await this.tenants.findById(solicitante.tenantId);
    if (!tenant) {
      throw new OrganizacionNoEncontradaError();
    }

    const plan = describirPlan(tenant.plan);
    return new SuscripcionDto({
      plan: tenant.plan,
      planNombre: plan.nombre,
      descripcion: plan.descripcion,
      altaEn: tenant.creadoEn,
      renovacionEn: null,
      metodoPago: null,
    });
  }
}
