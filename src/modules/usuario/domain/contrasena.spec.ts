import {
  BYTES_MAXIMOS_CONTRASENA,
  LARGO_MINIMO_CONTRASENA,
  validarContrasenaNueva,
} from './contrasena';
import { ContrasenaNoValidaError } from './exceptions/contrasena-no-valida.error';

describe('validarContrasenaNueva (US-10, ADR-15 §4, paso 4)', () => {
  it('fija la política del plan: al menos 8 caracteres y como mucho 72 bytes', () => {
    expect(LARGO_MINIMO_CONTRASENA).toBe(8);
    expect(BYTES_MAXIMOS_CONTRASENA).toBe(72);
  });

  it('rechaza 7 caracteres', () => {
    expect(() => validarContrasenaNueva('a'.repeat(7))).toThrow(
      ContrasenaNoValidaError,
    );
  });

  it('acepta 8 caracteres', () => {
    expect(() => validarContrasenaNueva('a'.repeat(8))).not.toThrow();
  });

  it('acepta 72 bytes', () => {
    expect(() => validarContrasenaNueva('a'.repeat(72))).not.toThrow();
  });

  it('rechaza 73 bytes', () => {
    expect(() => validarContrasenaNueva('a'.repeat(73))).toThrow(
      ContrasenaNoValidaError,
    );
  });

  it('cuenta BYTES con multibyte: 36 ñ (72 bytes) valen y 37 (74 bytes) no', () => {
    expect(() => validarContrasenaNueva('ñ'.repeat(36))).not.toThrow();
    expect(() => validarContrasenaNueva('ñ'.repeat(37))).toThrow(
      ContrasenaNoValidaError,
    );
  });

  it('el mínimo cuenta caracteres, no unidades UTF-16: 4 emojis no llegan a 8', () => {
    // '😀'.length === 2: cuatro suman 8 unidades UTF-16, pero son 4 caracteres.
    expect(() => validarContrasenaNueva('😀'.repeat(4))).toThrow(
      ContrasenaNoValidaError,
    );
    expect(() => validarContrasenaNueva('😀'.repeat(8))).not.toThrow();
  });

  it('rechaza lo que no es texto', () => {
    expect(() => validarContrasenaNueva(12345678 as unknown as string)).toThrow(
      ContrasenaNoValidaError,
    );
  });

  it.each(['secreta'.repeat(11), 'secreta'])(
    'el mensaje no repite la contraseña (%#)',
    (contrasena) => {
      // Act
      let mensaje = '';
      try {
        validarContrasenaNueva(contrasena);
      } catch (error: unknown) {
        mensaje = (error as Error).message;
      }

      // Assert
      expect(mensaje).not.toBe('');
      expect(mensaje).not.toContain('secreta');
    },
  );
});
