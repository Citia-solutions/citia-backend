import { describirPlan, PLAN_PILOTO } from './plan';

describe('describirPlan (US-10, ADR-15 §3)', () => {
  it('el plan del piloto es free', () => {
    expect(PLAN_PILOTO).toBe('free');
  });

  it('free → "Plan piloto" (provisional, Q18) y "Sin cobro durante el piloto"', () => {
    expect(describirPlan('free')).toEqual({
      nombre: 'Plan piloto',
      descripcion: 'Sin cobro durante el piloto',
    });
  });

  it.each(['pro', 'FREE', ''])(
    'un código desconocido (%p) → el código tal cual, sin descripción',
    (codigo) => {
      expect(describirPlan(codigo)).toEqual({
        nombre: codigo,
        descripcion: null,
      });
    },
  );

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'no confunde %p con un plan (el catálogo no tiene prototipo)',
    (codigo) => {
      expect(describirPlan(codigo)).toEqual({
        nombre: codigo,
        descripcion: null,
      });
    },
  );

  it('devuelve una copia: modificarla no cambia el catálogo', () => {
    // Arrange
    const plan = describirPlan('free');

    // Act
    plan.nombre = 'otro';

    // Assert
    expect(describirPlan('free').nombre).toBe('Plan piloto');
  });
});
