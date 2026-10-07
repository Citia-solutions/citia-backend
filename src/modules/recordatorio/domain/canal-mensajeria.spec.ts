import { TipoResultadoEnvio, claveIdempotencia } from './canal-mensajeria';

describe('canal-mensajeria (ADR-13 §8, §9)', () => {
  it('la clave de idempotencia es recordatorio/<id>', () => {
    // Act & Assert
    expect(claveIdempotencia('11111111-1111-4111-8111-111111111111')).toBe(
      'recordatorio/11111111-1111-4111-8111-111111111111',
    );
  });

  it('debería tener los seis resultados de ADR-13 §8', () => {
    // Act & Assert
    expect(Object.values(TipoResultadoEnvio)).toEqual([
      'aceptado',
      'transitorio',
      'cuota_agotada',
      'permanente',
      'configuracion',
      'posible_duplicado',
    ]);
  });
});
