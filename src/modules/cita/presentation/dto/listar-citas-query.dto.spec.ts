import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListarCitasQueryDto } from './listar-citas-query.dto';

// Valida como lo hace el ValidationPipe global (transform + whitelist) y
// devuelve, por propiedad, los constraints que fallaron.
const errores = async (
  query: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const dto = plainToInstance(ListarCitasQueryDto, query);
  const resultado = await validate(dto, { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('ListarCitasQueryDto', () => {
  it('debería aceptar dos fechas YYYY-MM-DD reales', async () => {
    // Act & Assert
    expect(await errores({ desde: '2026-09-21', hasta: '2026-09-27' })).toEqual(
      {},
    );
  });

  it('debería aceptar el 29 de febrero de un año bisiesto', async () => {
    expect(await errores({ desde: '2028-02-29', hasta: '2028-02-29' })).toEqual(
      {},
    );
  });

  it('debería rechazar cuando faltan desde y hasta', async () => {
    // Act
    const result = await errores({});

    // Assert
    expect(Object.keys(result).sort()).toEqual(['desde', 'hasta']);
  });

  it.each(['2026-9-21', '21-09-2026', '2026/09/21', '20260921', 'hoy', ''])(
    'debería rechazar el formato "%s" (no es YYYY-MM-DD)',
    async (fecha) => {
      // Act
      const result = await errores({ desde: fecha, hasta: '2026-09-27' });

      // Assert
      expect(result.desde).toContain('matches');
      expect(result.hasta).toBeUndefined();
    },
  );

  it.each([
    '2026-02-30',
    '2026-02-29',
    '2026-13-01',
    '2026-04-31',
    '2026-00-10',
  ])(
    'debería rechazar la fecha inexistente "%s" aunque tenga la forma correcta',
    async (fecha) => {
      // Act
      const result = await errores({ desde: '2026-02-01', hasta: fecha });

      // Assert — la forma pasa; falla la validación estricta de calendario
      expect(result.hasta).toEqual(['isIso8601']);
    },
  );

  it.each([
    '2026-09-21T00:00:00Z',
    '2026-09-21T00:00:00-03:00',
    '2026-09-21T10:00',
  ])(
    'debería rechazar un instante "%s" en vez de una fecha',
    async (instante) => {
      // Act
      const result = await errores({ desde: instante, hasta: '2026-09-27' });

      // Assert
      expect(result.desde).toContain('matches');
    },
  );

  it('debería usar el mensaje de formato del contrato', async () => {
    // Arrange
    const dto = plainToInstance(ListarCitasQueryDto, {
      desde: '2026-9-1',
      hasta: '2026-09-27',
    });

    // Act
    const [error] = await validate(dto);

    // Assert
    expect(error.constraints?.matches).toBe(
      'desde debe tener el formato YYYY-MM-DD',
    );
  });
});
