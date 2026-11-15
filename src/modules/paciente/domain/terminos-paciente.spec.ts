import {
  CATALOGO_TERMINOS_PACIENTE,
  VersionTerminosPaciente,
  esVersionConocida,
  recibeAceptaciones,
  versionesQueCubren,
  versionesQueRecibenAceptaciones,
} from './terminos-paciente';

describe('Catálogo de los términos del paciente (US-11, ADR-16 §2)', () => {
  describe('las reglas del catálogo vigente', () => {
    it('la 1.0 recibe aceptaciones y cubre', () => {
      expect(CATALOGO_TERMINOS_PACIENTE).toContainEqual({
        version: '1.0',
        recibeAceptaciones: true,
        sigueCubriendo: true,
      });
    });

    it('versiones únicas y con el formato del CHECK de la base', () => {
      const versiones = CATALOGO_TERMINOS_PACIENTE.map((e) => e.version);
      expect(new Set(versiones).size).toBe(versiones.length);
      for (const v of versiones) expect(v).toMatch(/^[0-9]+\.[0-9]+$/);
    });

    it('recibeAceptaciones ⇒ sigueCubriendo, en todas', () => {
      for (const e of CATALOGO_TERMINOS_PACIENTE) {
        expect(!e.recibeAceptaciones || e.sigueCubriendo).toBe(true);
      }
    });

    it('al menos una versión recibe aceptaciones (si no, nada se podría aceptar)', () => {
      expect(versionesQueRecibenAceptaciones().length).toBeGreaterThan(0);
    });

    it('no se puede modificar en ejecución', () => {
      expect(Object.isFrozen(CATALOGO_TERMINOS_PACIENTE)).toBe(true);
      expect(Object.isFrozen(CATALOGO_TERMINOS_PACIENTE[0])).toBe(true);
    });
  });

  describe('consultas', () => {
    it.each([
      ['1.0', true],
      ['9.9', false],
      ['', false],
      [undefined, false],
      [null, false],
    ])('esVersionConocida(%p) = %p', (version, esperado) => {
      expect(esVersionConocida(version)).toBe(esperado);
    });

    // Un catálogo con una versión retirada, como quedaría en el paso 3 de un
    // cambio de versión.
    const conRetirada: VersionTerminosPaciente[] = [
      { version: '1.0', recibeAceptaciones: false, sigueCubriendo: false },
      { version: '1.1', recibeAceptaciones: true, sigueCubriendo: true },
    ];

    it('una versión retirada es conocida pero no recibe ni cubre', () => {
      expect(esVersionConocida('1.0', conRetirada)).toBe(true);
      expect(recibeAceptaciones('1.0', conRetirada)).toBe(false);
      expect(versionesQueRecibenAceptaciones(conRetirada)).toEqual(['1.1']);
      expect(versionesQueCubren(conRetirada)).toEqual(['1.1']);
    });
  });
});
