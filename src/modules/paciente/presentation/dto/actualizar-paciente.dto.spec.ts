import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ActualizarPacienteDto } from './actualizar-paciente.dto';

const transformar = (body: Record<string, unknown>): ActualizarPacienteDto =>
  plainToInstance(ActualizarPacienteDto, body);

// Valida como el ValidationPipe global y devuelve los constraints por campo.
const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const resultado = await validate(transformar(body), { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

// 255 caracteres: parte local de 64 (el máximo) y un dominio largo válido.
const CORREO_255 = [
  'a'.repeat(64),
  '@',
  'b'.repeat(63),
  '.',
  'c'.repeat(63),
  '.',
  'd'.repeat(59),
  '.cl',
].join('');

describe('ActualizarPacienteDto (PATCH /pacientes/:id)', () => {
  it.each([
    { telefono: '+56 9 2222 2222' },
    { correo: 'nuevo@mail.com' },
    { telefono: '+56 9 2222 2222', correo: 'nuevo@mail.com' },
  ])('debería aceptar %p', async (body) => {
    expect(await errores(body)).toEqual({});
  });

  it('debería dejar pasar el cuerpo vacío: "al menos uno" lo exige el dominio', async () => {
    expect(await errores({})).toEqual({});
  });

  describe('correo (mismas reglas que al crear)', () => {
    it.each(['no-es-correo', 'ana@', '', '   ', 42])(
      'debería rechazar %p',
      async (correo) => {
        expect((await errores({ correo })).correo).toContain('isEmail');
      },
    );

    it('debería rechazar null: el PATCH no borra el correo', async () => {
      expect((await errores({ correo: null })).correo).toContain('isEmail');
    });

    it('debería normalizar el correo (trim + minúsculas)', async () => {
      // Arrange
      const body = { correo: '  NUEVO@Mail.com ' };

      // Act & Assert
      expect(await errores(body)).toEqual({});
      expect(transformar(body).correo).toBe('nuevo@mail.com');
    });

    it('debería rechazar un correo de más de 254 caracteres', async () => {
      // Arrange
      expect(CORREO_255).toHaveLength(255);

      // Act & Assert
      expect((await errores({ correo: CORREO_255 })).correo).toEqual(
        expect.arrayContaining(['maxLength']),
      );
    });
  });

  describe('telefono (mismas reglas que al crear)', () => {
    it.each(['', 42, null])('debería rechazar %p', async (telefono) => {
      expect(Object.keys(await errores({ telefono }))).toEqual(['telefono']);
    });
  });
});
