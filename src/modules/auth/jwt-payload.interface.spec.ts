import { RolUsuario } from '../usuario/domain/usuario.entity';
import { crearPayloadJwt } from './jwt-payload.interface';

describe('crearPayloadJwt', () => {
  const usuario = {
    id: 'usuario-1',
    email: 'admin@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.ADMINISTRADOR,
  };

  it('sin emitidoEn (login): solo los cuatro claims, sin iat ni exp', () => {
    // Act
    const payload = crearPayloadJwt(usuario);

    // Assert — el iat lo pone jsonwebtoken al firmar
    expect(payload).toStrictEqual({
      sub: 'usuario-1',
      email: 'admin@demo.com',
      tenantId: 'tenant-1',
      rol: RolUsuario.ADMINISTRADOR,
    });
  });

  it('con emitidoEn: iat = ⌊emitidoEn / 1000⌋, sin exp', () => {
    // Act
    const payload = crearPayloadJwt(
      usuario,
      new Date('2026-10-31T12:00:00.999Z'),
    );

    // Assert
    expect(payload).toStrictEqual({
      sub: 'usuario-1',
      email: 'admin@demo.com',
      tenantId: 'tenant-1',
      rol: RolUsuario.ADMINISTRADOR,
      iat: Date.parse('2026-10-31T12:00:00.000Z') / 1000,
    });
  });

  it('no copia otros campos del usuario (nunca el hash de la contraseña)', () => {
    // Arrange
    const completo = {
      ...usuario,
      passwordHash: '$2b$10$hash',
      nombreCompleto: 'Admin Demo',
      especialidad: null,
    };

    // Act
    const payload = crearPayloadJwt(completo);

    // Assert
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'rol',
      'sub',
      'tenantId',
    ]);
  });

  it('rechaza un emitidoEn que no es una fecha válida', () => {
    expect(() => crearPayloadJwt(usuario, new Date(NaN))).toThrow(
      'emitidoEn no es una fecha válida',
    );
  });
});
