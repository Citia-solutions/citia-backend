import { normalizarCorreo } from '../../../shared/domain/correo';
import { FORMATO_HASH_CORREO, calcularHashCorreo } from './hash-correo';

describe('hash-correo (ADR-13 §2)', () => {
  // SHA-256("abc"), vector de prueba de FIPS 180-2.
  const SHA256_ABC =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  describe('calcularHashCorreo', () => {
    it('debería ser el SHA-256 hex del correo normalizado', () => {
      // Act & Assert
      expect(calcularHashCorreo(' ABC ')).toBe(SHA256_ABC);
    });

    it('debería hashear la misma forma con la que se guarda el correo del paciente', () => {
      // Arrange
      const guardado = normalizarCorreo('  Ana.Soto@Mail.CL ');

      // Act & Assert
      expect(calcularHashCorreo(guardado)).toBe(
        calcularHashCorreo('ana.soto@mail.cl'),
      );
    });

    it('debería dar el mismo hash para variantes de mayúsculas y espacios', () => {
      // Act & Assert
      expect(calcularHashCorreo('Ana@Mail.cl')).toBe(
        calcularHashCorreo('  ana@mail.CL'),
      );
    });

    it('debería dar hashes distintos para correos distintos', () => {
      // Act & Assert
      expect(calcularHashCorreo('ana@mail.cl')).not.toBe(
        calcularHashCorreo('ana2@mail.cl'),
      );
    });

    it('debería tener la forma que exige la columna correo_hash', () => {
      // Act
      const hash = calcularHashCorreo('juan.perez@example.com');

      // Assert
      expect(hash).toMatch(FORMATO_HASH_CORREO);
      expect(hash).not.toContain('@');
    });

    it.each(['', '   '])('debería rechazar un correo vacío (%p)', (correo) => {
      // Act & Assert
      expect(() => calcularHashCorreo(correo)).toThrow(RangeError);
    });
  });
});
