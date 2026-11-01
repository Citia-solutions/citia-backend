import { TipoTenant, Tenant } from '../../tenant/domain/tenant.entity';
import { PerfilInvalidoError } from '../domain/exceptions/perfil-invalido.error';
import { UsuarioNoEncontradoError } from '../domain/exceptions/usuario-no-encontrado.error';
import { RolUsuario, Usuario } from '../domain/usuario.entity';
import { PerfilDto } from '../presentation/dto/perfil.dto';
import { PerfilService, UsuarioDeSesion } from './perfil.service';

const TX = { tx: 'contexto' };
const SESION: UsuarioDeSesion = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
};

function usuario(cambios: Partial<Usuario> = {}): Usuario {
  const u = new Usuario();
  u.id = SESION.userId;
  u.email = 'ana@clinica.cl';
  u.passwordHash = '$2b$10$hash';
  u.nombreCompleto = 'Ana Pérez';
  u.especialidad = null;
  u.rol = RolUsuario.ADMINISTRADOR;
  u.tenantId = SESION.tenantId;
  u.sesionesValidasDesde = null;
  u.creadoEn = new Date('2026-06-22T12:00:00Z');
  u.actualizadoEn = new Date('2026-06-22T12:00:00Z');
  Object.assign(u, cambios);
  return u;
}

function tenant(): Tenant {
  const t = new Tenant();
  t.id = SESION.tenantId;
  t.nombre = 'Clínica Demo';
  t.slug = 'clinica-demo';
  t.tipo = TipoTenant.CLINICA;
  t.plan = 'free';
  t.creadoEn = new Date('2026-06-22T11:00:00Z');
  return t;
}

describe('PerfilService (US-10)', () => {
  let usuarios: {
    findByEmailAndTenant: jest.Mock;
    guardar: jest.Mock;
    findById: jest.Mock;
    actualizarPerfil: jest.Mock;
    cambiarContrasena: jest.Mock;
    estadoSesion: jest.Mock;
  };
  let tenants: {
    guardar: jest.Mock;
    findById: jest.Mock;
    findBySlug: jest.Mock;
  };
  let tx: { run: jest.Mock };
  let servicio: PerfilService;

  beforeEach(() => {
    usuarios = {
      findByEmailAndTenant: jest.fn(),
      guardar: jest.fn(),
      findById: jest.fn().mockResolvedValue(usuario()),
      actualizarPerfil: jest.fn(),
      cambiarContrasena: jest.fn(),
      estadoSesion: jest.fn(),
    };
    tenants = {
      guardar: jest.fn(),
      findById: jest.fn().mockResolvedValue(tenant()),
      findBySlug: jest.fn(),
    };
    tx = {
      run: jest.fn((work: (t: unknown) => Promise<unknown>) => work(TX)),
    };
    servicio = new PerfilService(usuarios, tenants, tx);
  });

  describe('obtener', () => {
    it('arma el perfil con la organización del usuario de la sesión', async () => {
      // Act
      const perfil = await servicio.obtener(SESION);

      // Assert
      expect(usuarios.findById).toHaveBeenCalledWith(
        SESION.userId,
        SESION.tenantId,
      );
      expect(tenants.findById).toHaveBeenCalledWith(SESION.tenantId);
      expect(perfil).toBeInstanceOf(PerfilDto);
      expect(perfil).toEqual({
        id: SESION.userId,
        email: 'ana@clinica.cl',
        nombreCompleto: 'Ana Pérez',
        especialidad: null,
        rol: RolUsuario.ADMINISTRADOR,
        tenantId: SESION.tenantId,
        tenantSlug: 'clinica-demo',
        tenantNombre: 'Clínica Demo',
        creadoEn: new Date('2026-06-22T12:00:00Z'),
      });
    });

    it('nunca expone el hash ni el corte de sesiones', async () => {
      // Arrange
      usuarios.findById.mockResolvedValue(
        usuario({ sesionesValidasDesde: new Date('2026-10-31T12:00:00Z') }),
      );

      // Act
      const perfil = await servicio.obtener(SESION);

      // Assert
      expect(perfil).not.toHaveProperty('passwordHash');
      expect(perfil).not.toHaveProperty('_passwordHash');
      expect(perfil).not.toHaveProperty('sesionesValidasDesde');
      expect(perfil).not.toHaveProperty('actualizadoEn');
    });

    it('usuario inexistente → UsuarioNoEncontradoError, sin leer la organización', async () => {
      // Arrange
      usuarios.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(servicio.obtener(SESION)).rejects.toBeInstanceOf(
        UsuarioNoEncontradoError,
      );
      expect(tenants.findById).not.toHaveBeenCalled();
    });

    it('organización inexistente → UsuarioNoEncontradoError', async () => {
      // Arrange
      tenants.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(servicio.obtener(SESION)).rejects.toBeInstanceOf(
        UsuarioNoEncontradoError,
      );
    });
  });

  describe('actualizar', () => {
    it('escribe solo lo presente, normalizado, en una transacción', async () => {
      // Arrange
      usuarios.actualizarPerfil.mockResolvedValue(
        usuario({ nombreCompleto: 'Ana María Pérez' }),
      );

      // Act
      const perfil = await servicio.actualizar(SESION, {
        nombreCompleto: '  Ana María Pérez  ',
      });

      // Assert
      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(usuarios.actualizarPerfil).toHaveBeenCalledWith(
        SESION.userId,
        SESION.tenantId,
        { nombreCompleto: 'Ana María Pérez' },
        TX,
      );
      const [, , cambios] = usuarios.actualizarPerfil.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(cambios).not.toHaveProperty('especialidad');
      expect(tenants.findById).toHaveBeenCalledWith(SESION.tenantId, TX);
      expect(perfil.nombreCompleto).toBe('Ana María Pérez');
      expect(perfil.tenantSlug).toBe('clinica-demo');
    });

    it('devuelve la fila que escribió el repositorio (con la especialidad)', async () => {
      // Arrange
      usuarios.actualizarPerfil.mockResolvedValue(
        usuario({ especialidad: 'Kinesiología' }),
      );

      // Act
      const perfil = await servicio.actualizar(SESION, {
        especialidad: ' Kinesiología ',
      });

      // Assert
      expect(usuarios.actualizarPerfil).toHaveBeenCalledWith(
        SESION.userId,
        SESION.tenantId,
        { especialidad: 'Kinesiología' },
        TX,
      );
      expect(perfil.especialidad).toBe('Kinesiología');
    });

    it.each([null, '', '   '])(
      'especialidad %p la borra (null al repositorio)',
      async (especialidad) => {
        // Arrange
        usuarios.actualizarPerfil.mockResolvedValue(usuario());

        // Act
        await servicio.actualizar(SESION, { especialidad });

        // Assert
        expect(usuarios.actualizarPerfil).toHaveBeenCalledWith(
          SESION.userId,
          SESION.tenantId,
          { especialidad: null },
          TX,
        );
      },
    );

    it('sin cambios no escribe ni abre transacción: devuelve el perfil actual', async () => {
      // Act
      const perfil = await servicio.actualizar(SESION, {});

      // Assert
      expect(tx.run).not.toHaveBeenCalled();
      expect(usuarios.actualizarPerfil).not.toHaveBeenCalled();
      expect(usuarios.findById).toHaveBeenCalledWith(
        SESION.userId,
        SESION.tenantId,
      );
      expect(perfil.nombreCompleto).toBe('Ana Pérez');
    });

    it('un nombre en blanco → PerfilInvalidoError, sin escribir', async () => {
      // Act & Assert
      await expect(
        servicio.actualizar(SESION, { nombreCompleto: '   ' }),
      ).rejects.toBeInstanceOf(PerfilInvalidoError);
      expect(tx.run).not.toHaveBeenCalled();
      expect(usuarios.actualizarPerfil).not.toHaveBeenCalled();
    });

    it('usuario inexistente → UsuarioNoEncontradoError', async () => {
      // Arrange
      usuarios.actualizarPerfil.mockResolvedValue(null);

      // Act & Assert
      await expect(
        servicio.actualizar(SESION, { nombreCompleto: 'Ana' }),
      ).rejects.toBeInstanceOf(UsuarioNoEncontradoError);
      expect(tenants.findById).not.toHaveBeenCalled();
    });

    it('usuario inexistente sin cambios → UsuarioNoEncontradoError', async () => {
      // Arrange
      usuarios.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(servicio.actualizar(SESION, {})).rejects.toBeInstanceOf(
        UsuarioNoEncontradoError,
      );
    });
  });
});
