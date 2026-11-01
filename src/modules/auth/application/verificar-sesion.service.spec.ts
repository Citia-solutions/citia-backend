import { VerificarSesionService } from './verificar-sesion.service';

describe('VerificarSesionService', () => {
  const USUARIO = '11111111-1111-4111-8111-111111111111';
  const TENANT = '22222222-2222-4222-8222-222222222222';
  const CORTE = new Date('2026-10-31T12:00:00.000Z');
  const CORTE_SEG = CORTE.getTime() / 1000;

  let estadoSesion: jest.Mock;
  let service: VerificarSesionService;

  beforeEach(() => {
    estadoSesion = jest.fn();
    service = new VerificarSesionService({
      findByEmailAndTenant: jest.fn(),
      guardar: jest.fn(),
      findById: jest.fn(),
      actualizarPerfil: jest.fn(),
      cambiarContrasena: jest.fn(),
      estadoSesion,
    });
  });

  it('consulta el estado del usuario del token en su organización', async () => {
    // Arrange
    estadoSesion.mockResolvedValue({ sesionesValidasDesde: null });

    // Act
    await service.vigente(USUARIO, TENANT, CORTE_SEG);

    // Assert
    expect(estadoSesion).toHaveBeenCalledTimes(1);
    expect(estadoSesion).toHaveBeenCalledWith(USUARIO, TENANT);
  });

  it('usuario inexistente (estado null) → no vigente, motivo usuario_inexistente', async () => {
    // Arrange
    estadoSesion.mockResolvedValue(null);

    // Act & Assert
    await expect(service.vigente(USUARIO, TENANT, CORTE_SEG)).resolves.toBe(
      false,
    );
    await expect(
      service.verificar(USUARIO, TENANT, CORTE_SEG),
    ).resolves.toEqual({ vigente: false, motivo: 'usuario_inexistente' });
  });

  it('sin corte (NULL) → vigente, también sin iat', async () => {
    // Arrange
    estadoSesion.mockResolvedValue({ sesionesValidasDesde: null });

    // Act & Assert
    await expect(service.vigente(USUARIO, TENANT, CORTE_SEG)).resolves.toBe(
      true,
    );
    await expect(service.vigente(USUARIO, TENANT)).resolves.toBe(true);
    await expect(service.verificar(USUARIO, TENANT)).resolves.toEqual({
      vigente: true,
    });
  });

  it.each<[string, number | undefined, boolean]>([
    ['iat igual al corte', CORTE_SEG, true],
    ['iat posterior al corte', CORTE_SEG + 60, true],
    ['iat un segundo antes del corte', CORTE_SEG - 1, false],
    ['sin iat', undefined, false],
  ])('con corte: %s → vigente %s', async (_caso, iat, esperado) => {
    // Arrange
    estadoSesion.mockResolvedValue({ sesionesValidasDesde: CORTE });

    // Act & Assert
    await expect(service.vigente(USUARIO, TENANT, iat)).resolves.toBe(esperado);
  });

  it('token anterior al corte → motivo anterior_al_corte', async () => {
    // Arrange
    estadoSesion.mockResolvedValue({ sesionesValidasDesde: CORTE });

    // Act & Assert
    await expect(
      service.verificar(USUARIO, TENANT, CORTE_SEG - 1),
    ).resolves.toEqual({ vigente: false, motivo: 'anterior_al_corte' });
  });

  it('si la base falla, el error sube (sin dar la sesión por buena)', async () => {
    // Arrange
    estadoSesion.mockRejectedValue(new Error('conexión perdida'));

    // Act & Assert
    await expect(service.vigente(USUARIO, TENANT, CORTE_SEG)).rejects.toThrow(
      'conexión perdida',
    );
  });
});
