import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RolUsuario } from '../usuario/domain/usuario.entity';
import {
  VerificacionSesion,
  VerificarSesionService,
} from './application/verificar-sesion.service';
import { JwtPayload } from './jwt-payload.interface';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const PAYLOAD: JwtPayload = {
    sub: 'usuario-1',
    email: 'admin@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.ADMINISTRADOR,
    iat: 1_793_448_000,
    exp: 1_793_534_400,
  };

  let verificar: jest.Mock<Promise<VerificacionSesion>>;
  let strategy: JwtStrategy;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    verificar = jest.fn<Promise<VerificacionSesion>, unknown[]>();
    const config = {
      getOrThrow: jest.fn().mockReturnValue('secreto-de-prueba'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(config, {
      verificar,
    } as unknown as VerificarSesionService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifica la sesión con el sub, el tenant y el iat del token', async () => {
    // Arrange
    verificar.mockResolvedValue({ vigente: true });

    // Act
    await strategy.validate(PAYLOAD);

    // Assert
    expect(verificar).toHaveBeenCalledWith(
      'usuario-1',
      'tenant-1',
      1_793_448_000,
    );
  });

  it('vigente → el mismo AuthenticatedUser de antes, sin log', async () => {
    // Arrange
    verificar.mockResolvedValue({ vigente: true });

    // Act
    const usuario = await strategy.validate(PAYLOAD);

    // Assert — sin iat ni exp en req.user
    expect(usuario).toStrictEqual({
      userId: 'usuario-1',
      email: 'admin@demo.com',
      tenantId: 'tenant-1',
      rol: RolUsuario.ADMINISTRADOR,
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each(['anterior_al_corte', 'usuario_inexistente'] as const)(
    'no vigente (%s) → UnauthorizedException y log auth.sesion_cortada solo con ids',
    async (motivo) => {
      // Arrange
      verificar.mockResolvedValue({ vigente: false, motivo });

      // Act & Assert
      await expect(strategy.validate(PAYLOAD)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith({
        evento: 'auth.sesion_cortada',
        usuarioId: 'usuario-1',
        tenantId: 'tenant-1',
        motivo,
      });
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain('admin@demo.com');
    },
  );

  it('si la verificación falla (base caída), el error sube tal cual (500, no 401)', async () => {
    // Arrange
    const caida = new Error('conexión perdida');
    verificar.mockRejectedValue(caida);

    // Act & Assert
    await expect(strategy.validate(PAYLOAD)).rejects.toBe(caida);
  });
});
