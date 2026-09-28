import { validate } from 'class-validator';

import { IsInstanteConZona } from './is-instante-con-zona.decorator';

class ConZona {
  @IsInstanteConZona()
  inicio: string;
}

class ConMensajePropio {
  @IsInstanteConZona({ message: 'hora inválida' })
  inicio: string;
}

const constraints = async (
  instancia: object,
): Promise<Record<string, string>> => {
  const [error] = await validate(instancia);
  return error?.constraints ?? {};
};

const con = <T extends object>(Clase: new () => T, inicio: string): T =>
  Object.assign(new Clase(), { inicio });

describe('IsInstanteConZona', () => {
  it.each([
    '2026-09-18T13:00:00Z',
    '2026-09-18T10:00:00-03:00',
    '2026-09-18T10:00:00-0300',
    '2026-09-18T10:00:00.123+00:00',
  ])('debería aceptar "%s"', async (inicio) => {
    expect(await constraints(con(ConZona, inicio))).toEqual({});
  });

  it('debería rechazar un instante ISO válido sin zona SOLO por "matches"', async () => {
    // Act
    const result = await constraints(con(ConZona, '2026-09-18T10:00:00'));

    // Assert
    expect(Object.keys(result)).toEqual(['matches']);
  });

  it('debería aplicar ambos validadores cuando no es ISO ni tiene zona', async () => {
    // Act
    const result = await constraints(con(ConZona, 'no es una fecha'));

    // Assert
    expect(Object.keys(result).sort()).toEqual(['isIso8601', 'matches']);
  });

  it('debería respetar las ValidationOptions recibidas (mensaje propio)', async () => {
    // Act
    const result = await constraints(
      con(ConMensajePropio, '2026-09-18T10:00:00'),
    );

    // Assert
    expect(result.matches).toBe('hora inválida');
  });
});
