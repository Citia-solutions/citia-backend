import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { EmisorSesion } from '../usuario/domain/emisor-sesion';
import { RolUsuario } from '../usuario/domain/usuario.entity';
import { ITokenSigner } from './domain/token-signer';
import { FirmaJwtModule } from './firma-jwt.module';
import { JwtPayload } from './jwt-payload.interface';

/**
 * `FirmaJwtModule` solo (sin base ni módulos de negocio): arma el JwtModule
 * con el entorno y exporta los tres proveedores que usan `AuthModule` y
 * `UsuariosModule` (ADR-15 §6).
 */
describe('FirmaJwtModule', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({ JWT_SECRET: 'secreto-de-prueba', JWT_EXPIRES_IN: '2h' }),
          ],
        }),
        FirmaJwtModule,
      ],
    }).compile();
  });

  afterAll(async () => {
    await modulo.close();
  });

  it('exporta JwtService, ITokenSigner y EmisorSesion', () => {
    expect(modulo.get(JwtService)).toBeInstanceOf(JwtService);
    expect(modulo.get(ITokenSigner)).toBeInstanceOf(ITokenSigner);
    expect(modulo.get(EmisorSesion)).toBeInstanceOf(EmisorSesion);
  });

  it('el emisor firma con JWT_SECRET y JWT_EXPIRES_IN del entorno', () => {
    // Arrange
    const corte = new Date(Math.floor(Date.now() / 1000) * 1000);

    // Act
    const token = modulo.get(EmisorSesion).emitir(
      {
        id: 'usuario-1',
        email: 'admin@demo.com',
        tenantId: 'tenant-1',
        rol: RolUsuario.ADMINISTRADOR,
      },
      corte,
    );

    // Assert — lo verifica el mismo JwtService (mismo secreto)
    const claims = modulo.get(JwtService).verify<JwtPayload>(token);
    expect(claims.iat).toBe(corte.getTime() / 1000);
    expect(claims.exp).toBe(corte.getTime() / 1000 + 2 * 3600);
    expect(() => {
      new JwtService({ secret: 'otro-secreto' }).verify<JwtPayload>(token);
    }).toThrow();
  });
});
