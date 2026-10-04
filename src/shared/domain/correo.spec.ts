import { normalizarCorreo } from './correo';

describe('normalizarCorreo', () => {
  it.each([
    ['ana@mail.com', 'ana@mail.com'],
    ['  ana@mail.com  ', 'ana@mail.com'],
    ['Ana.Soto@Mail.CL', 'ana.soto@mail.cl'],
    ['\tANA@MAIL.COM\n', 'ana@mail.com'],
  ])('debería normalizar "%s" a "%s"', (entrada, esperado) => {
    expect(normalizarCorreo(entrada)).toBe(esperado);
  });

  it('debería dejar vacío un correo hecho solo de espacios', () => {
    expect(normalizarCorreo('   ')).toBe('');
  });
});
