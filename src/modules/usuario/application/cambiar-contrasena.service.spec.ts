import * as bcrypt from 'bcrypt';

import { EmisorSesion, UsuarioSesion } from '../domain/emisor-sesion';
import { ContrasenaActualIncorrectaError } from '../domain/exceptions/contrasena-actual-incorrecta.error';
import { ContrasenaCambiadaEnParaleloError } from '../domain/exceptions/contrasena-cambiada-en-paralelo.error';
import { ContrasenaNoValidaError } from '../domain/exceptions/contrasena-no-valida.error';
import { ContrasenaRepetidaError } from '../domain/exceptions/contrasena-repetida.error';
import { UsuarioNoEncontradoError } from '../domain/exceptions/usuario-no-encontrado.error';
import { RolUsuario, Usuario } from '../domain/usuario.entity';
import { ContrasenaCambiadaDto } from '../presentation/dto/contrasena-cambiada.dto';
import { CambiarContrasenaService } from './cambiar-contrasena.service';
import { UsuarioDeSesion } from './perfil.service';

jest.mock('bcrypt');

/**
 * bcrypt falso y determinista: el "hash" de `x` es `hash:x` y `compare`
 * reconoce justo ese. Así cada prueba razona como con el real, sin su costo.
 */
const hashFalso = (texto: string): string => `hash:${texto}`;
const bcryptCompare = bcrypt.compare as jest.Mock;
const bcryptHash = bcrypt.hash as jest.Mock;

const ACTUAL = 'actual-segura';
const NUEVA = 'nueva-segura';
const TX = { tx: 'contexto' };
const SESION: UsuarioDeSesion = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
};
/** El reloj de la app, con milisegundos: el corte se guarda truncado. */
const AHORA = new Date('2026-10-31T12:00:00.700Z');
const CORTE = new Date('2026-10-31T12:00:00.000Z');

function usuario(): Usuario {
  const u = new Usuario();
  u.id = SESION.userId;
  u.email = 'ana@clinica.cl';
  u.passwordHash = hashFalso(ACTUAL);
  u.nombreCompleto = 'Ana Pérez';
  u.especialidad = null;
  u.rol = RolUsuario.ADMINISTRADOR;
  u.tenantId = SESION.tenantId;
  u.sesionesValidasDesde = null;
  u.creadoEn = new Date('2026-06-22T12:00:00Z');
  u.actualizadoEn = new Date('2026-06-22T12:00:00Z');
  return u;
}

class EmisorFalso extends EmisorSesion {
  readonly emitir = jest.fn(
    (u: UsuarioSesion, emitidoEn: Date) =>
      `token:${u.id}:${emitidoEn.toISOString()}`,
  );
}

describe('CambiarContrasenaService (US-10, ADR-15 §4)', () => {
  let usuarios: {
    findByEmailAndTenant: jest.Mock;
    guardar: jest.Mock;
    findById: jest.Mock;
    actualizarPerfil: jest.Mock;
    cambiarContrasena: jest.Mock;
    estadoSesion: jest.Mock;
  };
  let tx: { run: jest.Mock };
  let dentroDeTx: boolean;
  let hashDentroDeTx: boolean[];
  let emisor: EmisorFalso;
  let reloj: jest.Mock<Date, []>;
  let servicio: CambiarContrasenaService;

  beforeEach(() => {
    jest.clearAllMocks();
    dentroDeTx = false;
    hashDentroDeTx = [];
    bcryptCompare.mockImplementation((texto: string, hash: string) =>
      Promise.resolve(hash === hashFalso(texto)),
    );
    bcryptHash.mockImplementation((texto: string) => {
      hashDentroDeTx.push(dentroDeTx);
      return Promise.resolve(hashFalso(texto));
    });

    usuarios = {
      findByEmailAndTenant: jest.fn(),
      guardar: jest.fn(),
      findById: jest.fn().mockResolvedValue(usuario()),
      actualizarPerfil: jest.fn(),
      cambiarContrasena: jest.fn().mockResolvedValue(true),
      estadoSesion: jest.fn(),
    };
    tx = {
      run: jest.fn(async (work: (t: unknown) => Promise<unknown>) => {
        dentroDeTx = true;
        try {
          return await work(TX);
        } finally {
          dentroDeTx = false;
        }
      }),
    };
    emisor = new EmisorFalso();
    reloj = jest.fn(() => AHORA);
    servicio = new CambiarContrasenaService(usuarios, tx, emisor, reloj);
  });

  /** Ningún efecto: ni hash, ni transacción, ni escritura, ni token. */
  function expectSinEscribir(): void {
    expect(bcryptHash).not.toHaveBeenCalled();
    expect(tx.run).not.toHaveBeenCalled();
    expect(usuarios.cambiarContrasena).not.toHaveBeenCalled();
    expect(emisor.emitir).not.toHaveBeenCalled();
  }

  describe('el cambio', () => {
    it('guarda el hash nuevo con el corte = el reloj truncado al segundo, condicional al hash leído', async () => {
      // Act
      await servicio.cambiar(SESION, {
        contrasenaActual: ACTUAL,
        contrasenaNueva: NUEVA,
      });

      // Assert
      expect(usuarios.cambiarContrasena).toHaveBeenCalledTimes(1);
      expect(usuarios.cambiarContrasena).toHaveBeenCalledWith(
        SESION.userId,
        SESION.tenantId,
        {
          hashAnterior: hashFalso(ACTUAL),
          hashNuevo: hashFalso(NUEVA),
          sesionesValidasDesde: CORTE,
        },
        TX,
      );
    });

    it('hashea con costo 10 FUERA de la transacción', async () => {
      // Act
      await servicio.cambiar(SESION, {
        contrasenaActual: ACTUAL,
        contrasenaNueva: NUEVA,
      });

      // Assert
      expect(bcryptHash).toHaveBeenCalledWith(NUEVA, 10);
      expect(hashDentroDeTx).toEqual([false]);
      expect(bcryptHash.mock.invocationCallOrder[0]).toBeLessThan(
        tx.run.mock.invocationCallOrder[0],
      );
    });

    it('firma el token nuevo con ESE corte (iat = corte) y lo devuelve', async () => {
      // Act
      const respuesta = await servicio.cambiar(SESION, {
        contrasenaActual: ACTUAL,
        contrasenaNueva: NUEVA,
      });

      // Assert
      expect(emisor.emitir).toHaveBeenCalledTimes(1);
      const [firmado, emitidoEn] = emisor.emitir.mock.calls[0];
      expect(firmado).toMatchObject({
        id: SESION.userId,
        email: 'ana@clinica.cl',
        tenantId: SESION.tenantId,
        rol: RolUsuario.ADMINISTRADOR,
      });
      expect(emitidoEn).toEqual(CORTE);
      const [, , cambio] = usuarios.cambiarContrasena.mock.calls[0] as [
        string,
        string,
        { sesionesValidasDesde: Date },
      ];
      expect(emitidoEn.getTime()).toBe(cambio.sesionesValidasDesde.getTime());
      expect(respuesta).toBeInstanceOf(ContrasenaCambiadaDto);
      expect(respuesta).toEqual({
        accessToken: `token:${SESION.userId}:2026-10-31T12:00:00.000Z`,
      });
    });

    it('lee el reloj una sola vez, después del hash', async () => {
      // Act
      await servicio.cambiar(SESION, {
        contrasenaActual: ACTUAL,
        contrasenaNueva: NUEVA,
      });

      // Assert
      expect(reloj).toHaveBeenCalledTimes(1);
      expect(reloj.mock.invocationCallOrder[0]).toBeGreaterThan(
        bcryptHash.mock.invocationCallOrder[0],
      );
    });

    it('sin reloj inyectado usa la hora actual, truncada al segundo', async () => {
      // Arrange
      const sinReloj = new CambiarContrasenaService(usuarios, tx, emisor);
      const antes = Math.floor(Date.now() / 1000) * 1000;

      // Act
      await sinReloj.cambiar(SESION, {
        contrasenaActual: ACTUAL,
        contrasenaNueva: NUEVA,
      });

      // Assert
      const [, emitidoEn] = emisor.emitir.mock.calls[0];
      expect(emitidoEn.getTime() % 1000).toBe(0);
      expect(emitidoEn.getTime()).toBeGreaterThanOrEqual(antes);
      expect(emitidoEn.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('el orden de las comprobaciones (cada error, sin escribir)', () => {
    it('1) usuario inexistente → UsuarioNoEncontradoError, sin comparar contraseñas', async () => {
      // Arrange
      usuarios.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: ACTUAL,
          contrasenaNueva: NUEVA,
        }),
      ).rejects.toBeInstanceOf(UsuarioNoEncontradoError);
      expect(usuarios.findById).toHaveBeenCalledWith(
        SESION.userId,
        SESION.tenantId,
      );
      expect(bcryptCompare).not.toHaveBeenCalled();
      expectSinEscribir();
    });

    it('2) actual incorrecta → ContrasenaActualIncorrectaError, antes que la política de la nueva', async () => {
      // Act & Assert — la nueva también es inválida (corta): gana la actual
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: 'otra-cosa',
          contrasenaNueva: 'corta',
        }),
      ).rejects.toBeInstanceOf(ContrasenaActualIncorrectaError);
      expect(bcryptCompare).toHaveBeenCalledTimes(1);
      expect(bcryptCompare).toHaveBeenCalledWith(
        'otra-cosa',
        hashFalso(ACTUAL),
      );
      expectSinEscribir();
    });

    it('3) nueva de 7 caracteres → ContrasenaNoValidaError', async () => {
      // Act & Assert
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: ACTUAL,
          contrasenaNueva: '1234567',
        }),
      ).rejects.toBeInstanceOf(ContrasenaNoValidaError);
      expectSinEscribir();
    });

    it('3) nueva de más de 72 bytes → ContrasenaNoValidaError', async () => {
      // Act & Assert — 37 ñ son 74 bytes (el DTO solo cuenta caracteres)
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: ACTUAL,
          contrasenaNueva: 'ñ'.repeat(37),
        }),
      ).rejects.toBeInstanceOf(ContrasenaNoValidaError);
      expectSinEscribir();
    });

    it('3) la política va antes que "distinta": una actual corta repetida es ContrasenaNoValidaError', async () => {
      // Arrange — usuario antiguo con una contraseña de 6 (la política es nueva)
      const corto = usuario();
      corto.passwordHash = hashFalso('123456');
      usuarios.findById.mockResolvedValue(corto);

      // Act & Assert
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: '123456',
          contrasenaNueva: '123456',
        }),
      ).rejects.toBeInstanceOf(ContrasenaNoValidaError);
      expectSinEscribir();
    });

    it('4) nueva = actual → ContrasenaRepetidaError, comprobado contra el HASH', async () => {
      // Act & Assert
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: ACTUAL,
          contrasenaNueva: ACTUAL,
        }),
      ).rejects.toBeInstanceOf(ContrasenaRepetidaError);
      expect(bcryptCompare).toHaveBeenCalledTimes(2);
      expect(bcryptCompare).toHaveBeenLastCalledWith(ACTUAL, hashFalso(ACTUAL));
      expectSinEscribir();
    });

    it('5) UPDATE condicional en false (otra petición la cambió) → ContrasenaCambiadaEnParaleloError, sin token', async () => {
      // Arrange
      usuarios.cambiarContrasena.mockResolvedValue(false);

      // Act & Assert
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: ACTUAL,
          contrasenaNueva: NUEVA,
        }),
      ).rejects.toBeInstanceOf(ContrasenaCambiadaEnParaleloError);
      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(emisor.emitir).not.toHaveBeenCalled();
    });

    it('si la transacción falla, el error sube y no se firma nada', async () => {
      // Arrange
      usuarios.cambiarContrasena.mockRejectedValue(new Error('db caída'));

      // Act & Assert
      await expect(
        servicio.cambiar(SESION, {
          contrasenaActual: ACTUAL,
          contrasenaNueva: NUEVA,
        }),
      ).rejects.toThrow('db caída');
      expect(emisor.emitir).not.toHaveBeenCalled();
    });
  });
});
