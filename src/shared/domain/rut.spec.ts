import { esRutValido, formatearRut, normalizarRut } from './rut';

describe('normalizarRut', () => {
  it('quita puntos y guion y baja la k a minuscula', () => {
    expect(normalizarRut('12.345.678-K')).toBe('12345678k');
  });

  it('deja igual un rut ya canonico', () => {
    expect(normalizarRut('123456785')).toBe('123456785');
  });

  it('tolera espacios y separadores sueltos', () => {
    expect(normalizarRut(' 12 345 678 - 5 ')).toBe('123456785');
  });

  it('devuelve cadena vacia si no hay nada aprovechable', () => {
    expect(normalizarRut('sin digitos')).toBe('');
  });
});

describe('esRutValido', () => {
  // Ruts con digito verificador correcto, calculados con modulo 11.
  it.each(['11.111.111-1', '12.345.678-5', '18.765.432-7', '6.666.666-2'])(
    'acepta %s',
    (rut) => {
      expect(esRutValido(rut)).toBe(true);
    },
  );

  it('acepta un rut cuyo verificador es k', () => {
    expect(esRutValido('20.347.878-k')).toBe(true);
  });

  it('acepta la k en mayuscula', () => {
    expect(esRutValido('20.347.878-K')).toBe(true);
  });

  it('rechaza un rut con el verificador cambiado', () => {
    expect(esRutValido('12.345.678-9')).toBe(false);
  });

  it('rechaza texto que no es un rut', () => {
    expect(esRutValido('no soy un rut')).toBe(false);
  });

  it('rechaza cadena vacia', () => {
    expect(esRutValido('')).toBe(false);
  });

  it('rechaza un cuerpo demasiado corto', () => {
    expect(esRutValido('123-5')).toBe(false);
  });

  it('rechaza una k en el cuerpo', () => {
    expect(esRutValido('1k345678-5')).toBe(false);
  });

  describe('forma escrita, antes de normalizar', () => {
    it.each([
      ['con puntos y guion', '12.345.678-5'],
      ['sin puntos, con guion', '12345678-5'],
      ['canonico, como lo envia el frontend', '123456785'],
      ['canonico con k', '20347878k'],
      ['de 7 digitos con puntos', '6.666.666-2'],
      ['con espacios alrededor', '  12.345.678-5 '],
    ])('acepta un rut %s: %p', (_caso, rut) => {
      expect(esRutValido(rut)).toBe(true);
    });

    it('rechaza 17.890.123-X, que normalizado pasaba como el rut 1.789.012-3', () => {
      // La X se perdia al normalizar y el resto calzaba con otro RUT valido.
      expect(normalizarRut('17.890.123-X')).toBe(normalizarRut('1.789.012-3'));
      expect(esRutValido('1.789.012-3')).toBe(true);

      expect(esRutValido('17.890.123-X')).toBe(false);
    });

    // Todos pasarian el modulo 11 si solo se normalizaran.
    it.each([
      ['una letra en el cuerpo', '12a345678-5'],
      ['algo despues del verificador', '12.345.678-5x'],
      ['dos guiones', '12.345.678--5'],
      ['otro separador', '12/345/678/5'],
      ['espacios dentro', '12 345 678-5'],
      ['puntos mal puestos', '1.2345.678-5'],
      ['guion sin verificador', '17.890.123-'],
      ['puntos sin verificador', '17.890.123'],
      ['un guion al inicio', '-12.345.678-5'],
    ])('rechaza %s: %p', (_caso, rut) => {
      expect(normalizarRut(rut).length).toBeGreaterThan(7);
      expect(esRutValido(rut)).toBe(false);
    });
  });
});

describe('formatearRut', () => {
  it('agrega puntos y guion, con la k en mayuscula', () => {
    expect(formatearRut('20347878k')).toBe('20.347.878-K');
  });

  it('formatea un cuerpo de 7 digitos', () => {
    expect(formatearRut('66666662')).toBe('6.666.666-2');
  });

  it('devuelve la entrada tal cual si no tiene forma de rut', () => {
    expect(formatearRut('cualquier cosa')).toBe('cualquier cosa');
  });
});
