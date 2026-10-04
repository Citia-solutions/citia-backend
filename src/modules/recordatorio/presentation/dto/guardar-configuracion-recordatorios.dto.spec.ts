import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GuardarConfiguracionRecordatoriosDto } from './guardar-configuracion-recordatorios.dto';

const transformar = (
  body: Record<string, unknown>,
): GuardarConfiguracionRecordatoriosDto =>
  plainToInstance(GuardarConfiguracionRecordatoriosDto, body);

// Valida como el ValidationPipe global y devuelve los constraints por campo.
const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const resultado = await validate(transformar(body), { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

const VALIDO = { activo: true, antelacionesMin: [1440, 120] };

describe('GuardarConfiguracionRecordatoriosDto (PUT /recordatorios/configuracion)', () => {
  it.each([
    VALIDO,
    { activo: false, antelacionesMin: [30] },
    { activo: true, antelacionesMin: [10080, 2880, 60] },
    { ...VALIDO, telefonoContacto: '+56 9 1234 5678' },
    { ...VALIDO, correoRespuesta: 'consulta@ana.cl' },
    { ...VALIDO, telefonoContacto: null, correoRespuesta: null },
    { ...VALIDO, telefonoContacto: '', correoRespuesta: '  ' },
  ])('debería aceptar %p', async (body) => {
    expect(await errores(body)).toEqual({});
  });

  describe('activo', () => {
    it.each([undefined, 'true', 1, null])('rechaza %p', async (activo) => {
      expect((await errores({ ...VALIDO, activo })).activo).toContain(
        'isBoolean',
      );
    });
  });

  describe('antelacionesMin', () => {
    it.each([
      [[], 'arrayMinSize'],
      [[60, 120, 180, 240], 'arrayMaxSize'],
      [[120, 120], 'arrayUnique'],
      [[29], 'min'],
      [[10081], 'max'],
      [[90.5], 'isInt'],
      [['120'], 'isInt'],
      ['1440,120', 'isArray'],
      [undefined, 'isArray'],
    ])('%p → %s', async (antelacionesMin, regla) => {
      expect(
        (await errores({ ...VALIDO, antelacionesMin })).antelacionesMin,
      ).toContain(regla);
    });
  });

  describe('telefonoContacto', () => {
    it('recorta y deja vacío como null', () => {
      expect(
        transformar({ ...VALIDO, telefonoContacto: '  +56 9 1 ' })
          .telefonoContacto,
      ).toBe('+56 9 1');
      expect(
        transformar({ ...VALIDO, telefonoContacto: '   ' }).telefonoContacto,
      ).toBeNull();
    });

    it('rechaza más de 30 caracteres o algo que no es texto', async () => {
      expect(
        (await errores({ ...VALIDO, telefonoContacto: '9'.repeat(31) }))
          .telefonoContacto,
      ).toContain('maxLength');
      expect(
        (await errores({ ...VALIDO, telefonoContacto: 123 })).telefonoContacto,
      ).toContain('isString');
    });
  });

  describe('correoRespuesta', () => {
    it('normaliza (trim + minúsculas) y deja vacío como null', () => {
      expect(
        transformar({ ...VALIDO, correoRespuesta: ' Consulta@Ana.CL ' })
          .correoRespuesta,
      ).toBe('consulta@ana.cl');
      expect(
        transformar({ ...VALIDO, correoRespuesta: '' }).correoRespuesta,
      ).toBeNull();
    });

    it.each(['no-es-correo', 'ana@', 42])('rechaza %p', async (correo) => {
      expect(
        (await errores({ ...VALIDO, correoRespuesta: correo })).correoRespuesta,
      ).toContain('isEmail');
    });
  });

  it('descarta campos desconocidos (whitelist): no se puede cambiar el canal ni el dueño', () => {
    // Arrange
    const dto = transformar({
      ...VALIDO,
      canal: 'whatsapp',
      usuarioId: 'otro',
      tenantId: 'otro',
    });

    // Act & Assert
    return validate(dto, { whitelist: true }).then((r) => {
      expect(r).toEqual([]);
      expect(dto).not.toHaveProperty('canal');
      expect(dto).not.toHaveProperty('usuarioId');
    });
  });
});
