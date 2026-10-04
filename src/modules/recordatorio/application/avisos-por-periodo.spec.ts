import { periodoDiaUtc } from '../domain/periodos-conteo';
import { AvisosPorPeriodo, alcanzaUmbral } from './avisos-por-periodo';

describe('AvisosPorPeriodo', () => {
  const hoy = periodoDiaUtc(new Date('2026-10-10T12:00:00Z'));
  const manana = periodoDiaUtc(new Date('2026-10-11T12:00:00Z'));

  it('avisa una vez por clave y periodo', () => {
    // Arrange
    const avisos = new AvisosPorPeriodo();

    // Act & Assert
    expect(avisos.primeraVez('cuota_80:dia', hoy)).toBe(true);
    expect(avisos.primeraVez('cuota_80:dia', hoy)).toBe(false);
    expect(avisos.primeraVez('cuota_80:mes', hoy)).toBe(true);
    expect(avisos.primeraVez('cuota_80:dia', manana)).toBe(true);
    expect(avisos.primeraVez('cuota_80:dia', manana)).toBe(false);
  });
});

describe('alcanzaUmbral', () => {
  it.each([
    [79, 100, 0.8, false],
    [80, 100, 0.8, true],
    [2400, 3000, 0.8, true],
    [2399, 3000, 0.8, false],
    [1, 2, 0.8, false],
    [2, 2, 0.8, true],
    [70, 100, 0.7, true],
  ])('%i de %i con umbral %d → %p', (usados, cuota, umbral, esperado) => {
    expect(alcanzaUmbral(usados, cuota, umbral)).toBe(esperado);
  });
});
