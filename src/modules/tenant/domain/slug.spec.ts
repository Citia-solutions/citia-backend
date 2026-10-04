import { slugify } from './slug';

describe('slugify', () => {
  it('debería remover acentos y reemplazar espacios por guiones cuando el nombre tiene tildes', () => {
    // Arrange
    const nombre = 'Clínica Demo';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('clinica-demo');
  });

  it('debería pasar a minúsculas cuando el nombre viene en mayúsculas', () => {
    // Arrange
    const nombre = 'TENANT MAYUSCULAS';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('tenant-mayusculas');
  });

  it('debería colapsar espacios y símbolos múltiples en un único guión', () => {
    // Arrange
    const nombre = 'Hola   Mundo @@@ Feliz!!!';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('hola-mundo-feliz');
  });

  it('debería podar los guiones de los extremos cuando el nombre empieza/termina con símbolos', () => {
    // Arrange
    const nombre = '  ---Clínica---  ';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('clinica');
  });

  it('debería usar el fallback "tenant" cuando el nombre queda vacío tras normalizar', () => {
    // Arrange
    const nombre = '!!!@@@   ###';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('tenant');
  });

  it('debería usar el fallback "tenant" cuando el nombre es una cadena vacía', () => {
    // Arrange
    const nombre = '';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('tenant');
  });

  it('debería conservar números y letras alfanuméricas', () => {
    // Arrange
    const nombre = 'Clínica 2025 Norte';

    // Act
    const result = slugify(nombre);

    // Assert
    expect(result).toBe('clinica-2025-norte');
  });
});
