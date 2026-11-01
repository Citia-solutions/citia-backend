import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CrearMensajeSoporteDto } from './crear-mensaje-soporte.dto';

const transformar = (body: Record<string, unknown>): CrearMensajeSoporteDto =>
  plainToInstance(CrearMensajeSoporteDto, body);

// Valida como el ValidationPipe global y devuelve los constraints por campo.
const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, Record<string, string>>> => {
  const resultado = await validate(transformar(body), { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, e.constraints ?? {}]),
  );
};

describe('CrearMensajeSoporteDto (POST /api/soporte/mensajes)', () => {
  it.each([
    { mensaje: 'No carga la agenda' },
    { mensaje: 'x' },
    { mensaje: 'a'.repeat(2000) },
    { mensaje: `  ${'a'.repeat(2000)}  ` },
    { categoria: 'problema', mensaje: 'Hola' },
    { categoria: 'consulta', mensaje: 'Hola' },
    { categoria: 'sugerencia', mensaje: 'Hola' },
    { categoria: 'otro', mensaje: 'Hola' },
    { categoria: null, mensaje: 'Hola' },
  ])('acepta %p', async (body) => {
    expect(await errores(body)).toEqual({});
  });

  it('recorta los extremos y conserva los saltos internos', () => {
    expect(transformar({ mensaje: '  Hola,\n\nno carga.  ' }).mensaje).toBe(
      'Hola,\n\nno carga.',
    );
  });

  describe('mensaje', () => {
    it.each([
      ['ausente', undefined, 'isString'],
      ['vacío', '', 'isNotEmpty'],
      ['en blanco', '   \n\t ', 'isNotEmpty'],
      ['2001 caracteres', 'a'.repeat(2001), 'maxLength'],
      ['un número', 42, 'isString'],
    ])('%s → 400 (%s)', async (_caso, mensaje, regla) => {
      expect(Object.keys((await errores({ mensaje })).mensaje)).toContain(
        regla,
      );
    });

    it('el error no repite el texto recibido', async () => {
      // Arrange
      const texto = `RUT 12.345.678-5 ${'x'.repeat(2000)}`;

      // Act
      const { mensaje } = await errores({ mensaje: texto });

      // Assert
      expect(JSON.stringify(mensaje)).not.toContain('12.345.678-5');
    });
  });

  describe('categoria', () => {
    it.each(['urgente', 'PROBLEMA', 1, ''])(
      'fuera de las cuatro (%p) → 400 con el mensaje en español',
      async (categoria) => {
        expect(
          (await errores({ categoria, mensaje: 'Hola' })).categoria,
        ).toEqual({
          isEnum: 'categoria debe ser problema, consulta, sugerencia u otro',
        });
      },
    );
  });
});
