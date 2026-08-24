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
