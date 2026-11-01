import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { OrganizacionNoEncontradaError } from '../domain/exceptions/organizacion-no-encontrada.error';
import { SoloAdministradorError } from '../domain/exceptions/solo-administrador.error';
import { Tenant, TipoTenant } from '../domain/tenant.entity';
import { SuscripcionDto } from '../presentation/dto/suscripcion.dto';
import { ConsultarSuscripcionService } from './consultar-suscripcion.service';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';

function tenant(plan = 'free'): Tenant {
  const t = new Tenant();
  t.id = TENANT_ID;
  t.nombre = 'Clínica Demo';
  t.slug = 'clinica-demo';
  t.tipo = TipoTenant.CLINICA;
  t.plan = plan;
  t.creadoEn = new Date('2026-06-22T11:00:00Z');
  return t;
}

describe('ConsultarSuscripcionService (US-10, ADR-15 §3)', () => {
  let tenants: {
    guardar: jest.Mock;
    findById: jest.Mock;
    findBySlug: jest.Mock;
  };
  let servicio: ConsultarSuscripcionService;

  beforeEach(() => {
    tenants = {
      guardar: jest.fn(),
      findById: jest.fn().mockResolvedValue(tenant()),
      findBySlug: jest.fn(),
    };
    servicio = new ConsultarSuscripcionService(tenants);
  });

  it('PROFESIONAL → SoloAdministradorError sin leer el repositorio', async () => {
    // Act & Assert
    await expect(
      servicio.consultar({ tenantId: TENANT_ID, rol: RolUsuario.PROFESIONAL }),
    ).rejects.toBeInstanceOf(SoloAdministradorError);
    expect(tenants.findById).not.toHaveBeenCalled();
  });

  it('un rol desconocido tampoco la ve (solo ADMINISTRADOR)', async () => {
    // Act & Assert
    await expect(
      servicio.consultar({
        tenantId: TENANT_ID,
        rol: 'SUPERUSUARIO' as RolUsuario,
      }),
    ).rejects.toBeInstanceOf(SoloAdministradorError);
    expect(tenants.findById).not.toHaveBeenCalled();
  });

  it('ADMINISTRADOR → el plan legible, el alta, y renovación y método de pago en null', async () => {
    // Act
    const suscripcion = await servicio.consultar({
      tenantId: TENANT_ID,
      rol: RolUsuario.ADMINISTRADOR,
    });

    // Assert
    expect(tenants.findById).toHaveBeenCalledWith(TENANT_ID);
    expect(suscripcion).toBeInstanceOf(SuscripcionDto);
    expect(suscripcion).toEqual({
      plan: 'free',
      planNombre: 'Plan piloto',
      descripcion: 'Sin cobro durante el piloto',
      altaEn: new Date('2026-06-22T11:00:00Z'),
      renovacionEn: null,
      metodoPago: null,
    });
  });

  it('un plan desconocido se muestra con su código, sin descripción', async () => {
    // Arrange
    tenants.findById.mockResolvedValue(tenant('pro'));

    // Act
    const suscripcion = await servicio.consultar({
      tenantId: TENANT_ID,
      rol: RolUsuario.ADMINISTRADOR,
    });

    // Assert
    expect(suscripcion).toMatchObject({
      plan: 'pro',
      planNombre: 'pro',
      descripcion: null,
      renovacionEn: null,
      metodoPago: null,
    });
  });

  it('no expone el resto de la organización (id, slug, nombre, tipo)', async () => {
    // Act
    const suscripcion = await servicio.consultar({
      tenantId: TENANT_ID,
      rol: RolUsuario.ADMINISTRADOR,
    });

    // Assert
    expect(Object.keys(suscripcion).sort()).toEqual(
      [
        'altaEn',
        'descripcion',
        'metodoPago',
        'plan',
        'planNombre',
        'renovacionEn',
      ].sort(),
    );
  });

  it('organización inexistente → OrganizacionNoEncontradaError', async () => {
    // Arrange
    tenants.findById.mockResolvedValue(null);

    // Act & Assert
    await expect(
      servicio.consultar({
        tenantId: TENANT_ID,
        rol: RolUsuario.ADMINISTRADOR,
      }),
    ).rejects.toBeInstanceOf(OrganizacionNoEncontradaError);
  });
});
