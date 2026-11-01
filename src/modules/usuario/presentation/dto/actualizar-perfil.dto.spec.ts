import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ActualizarPerfilDto } from './actualizar-perfil.dto';

const transformar = (body: Record<string, unknown>): ActualizarPerfilDto =>
  plainToInstance(ActualizarPerfilDto, body);

// Valida como el ValidationPipe global y devuelve los constraints por campo.
const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const resultado = await validate(transformar(body), { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('ActualizarPerfilDto (PATCH /usuarios/me)', () => {
  it.each([
    {},
    { nombreCompleto: 'Ana Pérez' },
    { especialidad: 'Kinesiología' },
    { nombreCompleto: 'Ana', especialidad: null },
    { especialidad: '' },
    { especialidad: '   ' },
    { nombreCompleto: 'a'.repeat(120), especialidad: 'e'.repeat(100) },
  ])('debería aceptar %p', async (body) => {
    expect(await errores(body)).toEqual({});
  });

  describe('nombreCompleto', () => {
    it('recorta antes de validar', () => {
      expect(transformar({ nombreCompleto: '  Ana  ' }).nombreCompleto).toBe(
        'Ana',
      );
    });

    it.each([
      [null, 'isString'],
      ['', 'isNotEmpty'],
      ['   ', 'isNotEmpty'],
      [42, 'isString'],
      ['a'.repeat(121), 'maxLength'],
    ])('%p → 400 (%s)', async (nombreCompleto, regla) => {
      expect((await errores({ nombreCompleto })).nombreCompleto).toContain(
        regla,
      );
    });

    it('cuenta el largo tras recortar: 120 con espacios alrededor vale', async () => {
      expect(
        await errores({ nombreCompleto: `  ${'a'.repeat(120)}  ` }),
      ).toEqual({});
    });
  });

  describe('especialidad', () => {
    it('null y vacía son válidas (la borran); vacía llega recortada', () => {
      expect(transformar({ especialidad: null }).especialidad).toBeNull();
      expect(transformar({ especialidad: '   ' }).especialidad).toBe('');
    });

    it.each([
      ['e'.repeat(101), 'maxLength'],
      [42, 'isString'],
      [['Kine'], 'isString'],
    ])('%p → 400 (%s)', async (especialidad, regla) => {
      expect((await errores({ especialidad })).especialidad).toContain(regla);
    });
  });

  it('descarta en silencio el correo, el rol, la organización y el slug (whitelist)', async () => {
    // Arrange
    const dto = transformar({
      nombreCompleto: 'Ana',
      email: 'otro@correo.cl',
      rol: 'ADMINISTRADOR',
      tenantId: 'otro',
      tenantSlug: 'otro',
      slug: 'otro',
      passwordHash: 'x',
    });

    // Act
    const resultado = await validate(dto, { whitelist: true });

    // Assert
    expect(resultado).toEqual([]);
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('rol');
    expect(dto).not.toHaveProperty('tenantId');
    expect(dto).not.toHaveProperty('tenantSlug');
    expect(dto).not.toHaveProperty('slug');
    expect(dto).not.toHaveProperty('passwordHash');
  });
});
