import { ConfigService } from '@nestjs/config';

import {
  Entorno,
  validarEntorno,
} from '../../../../shared/infrastructure/config/entorno';
import { leerOpcionesRecordatorios } from './opciones-recordatorios';

function configDe(
  valores: Record<string, unknown>,
): ConfigService<Entorno, true> {
  return {
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService<Entorno, true>;
}

describe('leerOpcionesRecordatorios', () => {
  it('debería tomar los valores del entorno validado', () => {
    // Arrange
    const entorno = validarEntorno({
      JWT_SECRET: 'x',
      APP_TZ: 'America/Punta_Arenas',
      RECORDATORIO_ANTELACIONES_MIN: '2880,60',
      RECORDATORIO_SILENCIO_DESDE: '22:00',
      RECORDATORIO_SILENCIO_HASTA: '07:30',
      RECORDATORIO_MARGEN_MINIMO_MIN: '15',
      RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN: '90',
    });

    // Act
    const opciones = leerOpcionesRecordatorios(configDe(entorno));

    // Assert
    expect(opciones).toEqual({
      parametros: {
        tz: 'America/Punta_Arenas',
        silencio: { desde: '22:00', hasta: '07:30' },
        margenMinimoMin: 15,
        antelacionMinimaTardiaMin: 90,
      },
      antelacionesPredeterminadasMin: [2880, 60],
    });
  });

  it('sin entorno validado (e2e parcial) debería usar los mismos defaults de ADR-13 §18', () => {
    // Act
    const opciones = leerOpcionesRecordatorios(configDe({}));

    // Assert
    expect(opciones).toEqual({
      parametros: {
        tz: 'America/Santiago',
        silencio: { desde: '21:00', hasta: '08:00' },
        margenMinimoMin: 30,
        antelacionMinimaTardiaMin: 60,
      },
      antelacionesPredeterminadasMin: [1440, 120],
    });
    // …que son los mismos que pone validarEntorno.
    const entorno = validarEntorno({ JWT_SECRET: 'x' });
    expect(leerOpcionesRecordatorios(configDe(entorno))).toEqual(opciones);
  });
});
