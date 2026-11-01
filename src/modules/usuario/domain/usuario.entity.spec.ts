import { PerfilInvalidoError } from './exceptions/perfil-invalido.error';
import {
  LARGO_MAXIMO_ESPECIALIDAD,
  LARGO_MAXIMO_NOMBRE,
  normalizarCambiosPerfil,
  sinCambiosPerfil,
} from './usuario.entity';
import type { CambiosPerfil } from './usuario.repository';

/** Captura el error de `fn` (o falla si no lanza). */
function errorDe(fn: () => unknown): PerfilInvalidoError {
  try {
    fn();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(PerfilInvalidoError);
    return error as PerfilInvalidoError;
  }
  throw new Error('se esperaba PerfilInvalidoError');
}

describe('normalizarCambiosPerfil (US-10, T6)', () => {
  it('fija los largos del plan: 120 para el nombre y 100 para la especialidad', () => {
    expect(LARGO_MAXIMO_NOMBRE).toBe(120);
    expect(LARGO_MAXIMO_ESPECIALIDAD).toBe(100);
  });

  it('recorta el nombre y la especialidad', () => {
    expect(
      normalizarCambiosPerfil({
        nombreCompleto: '  Ana Pérez  ',
        especialidad: ' Kinesiología ',
      }),
    ).toEqual({ nombreCompleto: 'Ana Pérez', especialidad: 'Kinesiología' });
  });

  it.each(['', '   ', '\t\n'])(
    'vacía la especialidad (null) con %p',
    (especialidad) => {
      expect(normalizarCambiosPerfil({ especialidad })).toEqual({
        especialidad: null,
      });
    },
  );

  it('null en la especialidad la borra', () => {
    expect(normalizarCambiosPerfil({ especialidad: null })).toEqual({
      especialidad: null,
    });
  });

  it('deja fuera lo ausente (no cambia)', () => {
    // Act
    const soloNombre = normalizarCambiosPerfil({ nombreCompleto: 'Ana' });
    const nada = normalizarCambiosPerfil({});
    const indefinidos = normalizarCambiosPerfil({
      nombreCompleto: undefined,
      especialidad: undefined,
    });

    // Assert
    expect(soloNombre).toEqual({ nombreCompleto: 'Ana' });
    expect(soloNombre).not.toHaveProperty('especialidad');
    expect(nada).toEqual({});
    expect(indefinidos).toEqual({});
    expect(indefinidos).not.toHaveProperty('nombreCompleto');
    expect(indefinidos).not.toHaveProperty('especialidad');
  });

  it.each(['', '   ', '\n\t '])(
    'rechaza un nombre en blanco (%p)',
    (nombre) => {
      const error = errorDe(() =>
        normalizarCambiosPerfil({ nombreCompleto: nombre }),
      );
      expect(error.campo).toBe('nombreCompleto');
    },
  );

  it('rechaza un nombre null: el nombre no se borra', () => {
    const error = errorDe(() =>
      normalizarCambiosPerfil({
        nombreCompleto: null as unknown as string,
      }),
    );
    expect(error.campo).toBe('nombreCompleto');
  });

  it('acepta un nombre de 120 y rechaza uno de 121 (contado tras recortar)', () => {
    // Arrange
    const de120 = 'a'.repeat(120);

    // Act & Assert
    expect(
      normalizarCambiosPerfil({ nombreCompleto: `  ${de120}  ` })
        .nombreCompleto,
    ).toBe(de120);
    expect(
      errorDe(() =>
        normalizarCambiosPerfil({ nombreCompleto: 'a'.repeat(121) }),
      ).campo,
    ).toBe('nombreCompleto');
  });

  it('acepta una especialidad de 100 y rechaza una de 101', () => {
    // Arrange
    const de100 = 'e'.repeat(100);

    // Act & Assert
    expect(normalizarCambiosPerfil({ especialidad: de100 }).especialidad).toBe(
      de100,
    );
    expect(
      errorDe(() => normalizarCambiosPerfil({ especialidad: 'e'.repeat(101) }))
        .campo,
    ).toBe('especialidad');
  });

  it('rechaza una especialidad que no es texto', () => {
    const error = errorDe(() =>
      normalizarCambiosPerfil({ especialidad: 42 as unknown as string }),
    );
    expect(error.campo).toBe('especialidad');
  });

  it('el mensaje no repite el valor recibido', () => {
    const error = errorDe(() =>
      normalizarCambiosPerfil({ especialidad: 'secreto'.repeat(20) }),
    );
    expect(error.message).not.toContain('secreto');
  });

  it('no muta la entrada', () => {
    // Arrange
    const entrada: CambiosPerfil = {
      nombreCompleto: '  Ana  ',
      especialidad: '  ',
    };

    // Act
    normalizarCambiosPerfil(entrada);

    // Assert
    expect(entrada).toEqual({ nombreCompleto: '  Ana  ', especialidad: '  ' });
  });
});

describe('sinCambiosPerfil', () => {
  it.each<[CambiosPerfil, boolean]>([
    [{}, true],
    [{ nombreCompleto: undefined, especialidad: undefined }, true],
    [{ nombreCompleto: 'Ana' }, false],
    [{ especialidad: null }, false],
    [{ especialidad: 'Kine' }, false],
  ])('%p → %p', (cambios, esperado) => {
    expect(sinCambiosPerfil(cambios)).toBe(esperado);
  });
});
