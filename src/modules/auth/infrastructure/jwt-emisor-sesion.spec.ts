import { JwtService } from '@nestjs/jwt';

import {
  inicioSesionesValidas,
  tokenEmitidoVigente,
} from '../../usuario/domain/sesiones';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { JwtPayload } from '../jwt-payload.interface';
import { JwtEmisorSesion } from './jwt-emisor-sesion';
import { JwtTokenSigner } from './jwt-token-signer';

describe('JwtEmisorSesion', () => {
  const UN_DIA_SEG = 86_400;
  const usuario = {
    id: 'usuario-1',
    email: 'admin@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.ADMINISTRADOR,
  };

  // El mismo JwtService que registra FirmaJwtModule (secreto + 1d).
  const jwt = new JwtService({
    secret: 'secreto-de-prueba',
    signOptions: { expiresIn: '1d' },
  });
  const emisor = new JwtEmisorSesion(new JwtTokenSigner(jwt));

  it('firma con iat = ⌊emitidoEn / 1000⌋, exp desde ese iat y los claims del login', () => {
    // Arrange
    const corte = inicioSesionesValidas(new Date('2026-10-31T12:00:00.700Z'));

    // Act
    const token = emisor.emitir(usuario, corte);

    // Assert
    const claims = jwt.decode<JwtPayload>(token);
    const iat = Date.parse('2026-10-31T12:00:00.000Z') / 1000;
    expect(claims).toStrictEqual({
      sub: 'usuario-1',
      email: 'admin@demo.com',
      tenantId: 'tenant-1',
      rol: RolUsuario.ADMINISTRADOR,
      iat,
      exp: iat + UN_DIA_SEG,
    });
  });

  it('con un emitidoEn con milisegundos, el iat se trunca al segundo', () => {
    // Act
    const token = emisor.emitir(usuario, new Date('2026-10-31T12:00:00.999Z'));

    // Assert
    expect(jwt.decode<JwtPayload>(token).iat).toBe(
      Date.parse('2026-10-31T12:00:00.000Z') / 1000,
    );
  });

  it('el token nuevo vale con su propio corte (y se verifica con el mismo secreto)', () => {
    // Arrange
    const corte = inicioSesionesValidas(new Date());

    // Act
    const token = emisor.emitir(usuario, corte);

    // Assert
    const claims = jwt.verify<JwtPayload>(token);
    expect(tokenEmitidoVigente(claims.iat, corte)).toBe(true);
    expect(claims.sub).toBe('usuario-1');
  });

  it('firma lo mismo que el login más el iat (un solo armado de claims)', () => {
    // Arrange
    const sign = jest.fn<string, [JwtPayload]>().mockReturnValue('firmado');
    const conDoble = new JwtEmisorSesion({ sign });
    const corte = new Date('2026-10-31T12:00:00.000Z');

    // Act
    const token = conDoble.emitir(
      { ...usuario, passwordHash: '$2b$10$hash' } as typeof usuario,
      corte,
    );

    // Assert
    expect(token).toBe('firmado');
    expect(sign).toHaveBeenCalledWith({
      sub: 'usuario-1',
      email: 'admin@demo.com',
      tenantId: 'tenant-1',
      rol: RolUsuario.ADMINISTRADOR,
      iat: corte.getTime() / 1000,
    });
    expect(sign.mock.calls[0][0]).not.toHaveProperty('passwordHash');
  });
});
