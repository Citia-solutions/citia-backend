import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CambiarContrasenaDto } from './cambiar-contrasena.dto';

const transformar = (body: Record<string, unknown>): CambiarContrasenaDto =>
  plainToInstance(CambiarContrasenaDto, body);

// Valida como el ValidationPipe global y devuelve los constraints por campo.
const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const resultado = await validate(transformar(body), { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

const VALIDO = {
  contrasenaActual: 'actual-segura',
  contrasenaNueva: 'nueva-segura',
};

describe('CambiarContrasenaDto (PUT /usuarios/me/contrasena)', () => {
  it('acepta un cuerpo válido', async () => {
    expect(await errores(VALIDO)).toEqual({});
  });

  it('acepta una nueva de 8', async () => {
    expect(await errores({ ...VALIDO, contrasenaNueva: '12345678' })).toEqual(
      {},
    );
  });

  it('una nueva de 7 → 400 (minLength)', async () => {
    expect(
      (await errores({ ...VALIDO, contrasenaNueva: '1234567' }))
        .contrasenaNueva,
    ).toContain('minLength');
  });

  it.each([
    [undefined, 'isString'],
    [null, 'isString'],
    [12345678, 'isString'],
    ['x'.repeat(1025), 'maxLength'],
  ])('nueva %p → 400 (%s)', async (contrasenaNueva, regla) => {
    expect(
      (await errores({ ...VALIDO, contrasenaNueva })).contrasenaNueva,
    ).toContain(regla);
  });

  it.each([
    [undefined, 'isNotEmpty'],
    ['', 'isNotEmpty'],
    [123, 'isString'],
    ['x'.repeat(1025), 'maxLength'],
  ])('actual %p → 400 (%s)', async (contrasenaActual, regla) => {
    expect(
      (await errores({ ...VALIDO, contrasenaActual })).contrasenaActual,
    ).toContain(regla);
  });

  it('no recorta las contraseñas', () => {
    // Arrange
    const dto = transformar({
      contrasenaActual: '  actual  ',
      contrasenaNueva: ' nueva-segura ',
    });

    // Assert
    expect(dto.contrasenaActual).toBe('  actual  ');
    expect(dto.contrasenaNueva).toBe(' nueva-segura ');
  });

  it('el tope de 72 bytes NO es del DTO (lo valida el dominio)', async () => {
    expect(
      await errores({ ...VALIDO, contrasenaNueva: 'ñ'.repeat(37) }),
    ).toEqual({});
  });
});
