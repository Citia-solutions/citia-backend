import {
  LIMITES_TASA,
  LimitarTasa,
  METADATA_LIMITES_TASA,
} from './limitar-tasa.decorator';

const metadatos = (objetivo: object): unknown =>
  Reflect.getMetadata(METADATA_LIMITES_TASA, objetivo);

/** El método de la clase, leído del prototipo (sin separarlo de su objeto). */
const metodo = (clase: new () => object, nombre: string): object =>
  Object.getOwnPropertyDescriptor(clase.prototype, nombre)?.value as object;

describe('LimitarTasa', () => {
  it('en una clase deja los nombres en la clase', () => {
    // Arrange & Act
    @LimitarTasa('portalPorIp')
    class Controlador {}

    // Assert
    expect(metadatos(Controlador)).toEqual(['portalPorIp']);
  });

  it('en un método deja los nombres en la función, no en la clase', () => {
    class Controlador {
      @LimitarTasa('portalPorEnlace')
      confirmar(): void {}
    }

    expect(metadatos(metodo(Controlador, 'confirmar'))).toEqual([
      'portalPorEnlace',
    ]);
    expect(metadatos(Controlador)).toBeUndefined();
  });

  it('varios sobre el mismo método se acumulan, sin repetir', () => {
    class Controlador {
      @LimitarTasa('portalPorIp')
      @LimitarTasa('portalPorEnlace', 'portalPorIp')
      cancelar(): void {}
    }

    expect(metadatos(metodo(Controlador, 'cancelar'))).toEqual([
      'portalPorEnlace',
      'portalPorIp',
    ]);
  });

  it('la tabla es la del contrato de la Fase 3 §6 más los dos cubos de US-10 (ADR-15 §8)', () => {
    const MINUTO = 60_000;
    const HORA = 60 * MINUTO;
    expect(LIMITES_TASA).toEqual({
      login: { limite: 5, ventanaMs: MINUTO, clave: 'ip' },
      registro: { limite: 5, ventanaMs: HORA, clave: 'ip' },
      solicitudPublica: { limite: 5, ventanaMs: HORA, clave: 'ip' },
      portalPorIp: { limite: 30, ventanaMs: MINUTO, clave: 'ip' },
      portalPorEnlace: { limite: 5, ventanaMs: HORA, clave: 'enlace' },
      cambioContrasena: { limite: 5, ventanaMs: HORA, clave: 'ip' },
      soporte: { limite: 5, ventanaMs: HORA, clave: 'ip' },
    });
  });
});
