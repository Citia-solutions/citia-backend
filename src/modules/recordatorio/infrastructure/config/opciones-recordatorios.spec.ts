import { ConfigService } from '@nestjs/config';

import {
  Entorno,
  validarEntorno,
} from '../../../../shared/infrastructure/config/entorno';
import {
  leerCadenciaEnvio,
  leerOpcionesEnvio,
  leerOpcionesRecordatorios,
  leerOpcionesTasaFallo,
} from './opciones-recordatorios';

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

describe('leerOpcionesEnvio / leerCadenciaEnvio / leerOpcionesTasaFallo', () => {
  it('toman los valores del entorno validado', () => {
    // Arrange
    const entorno = validarEntorno({
      JWT_SECRET: 'x',
      APP_TZ: 'America/Punta_Arenas',
      RECORDATORIO_EXIGIR_CONSENTIMIENTO: 'true',
      RECORDATORIO_MAX_DIARIO_POR_TENANT: '10',
      RESEND_CUOTA_DIARIA: '50',
      RESEND_CUOTA_MENSUAL: '500',
      CUOTA_UMBRAL_AVISO: '0.9',
      RECORDATORIO_MAX_INTENTOS: '3',
      RECORDATORIO_LOTE: '5',
      RECORDATORIO_INTERVALO_SEG: '30',
      RECORDATORIO_UMBRAL_TASA_FALLO: '0.1',
      RECORDATORIO_UMBRAL_MUESTRA_MIN: '50',
    });
    const config = configDe(entorno);

    // Act & Assert
    expect(leerOpcionesEnvio(config)).toEqual({
      tz: 'America/Punta_Arenas',
      silencio: { desde: '21:00', hasta: '08:00' },
      exigirConsentimiento: true,
      maxDiarioPorTenant: 10,
      cuotaDiaria: 50,
      cuotaMensual: 500,
      umbralAvisoCuota: 0.9,
      maxReintentos: 3,
      antelacionesPredeterminadasMin: [1440, 120],
    });
    expect(leerCadenciaEnvio(config)).toEqual({ lote: 5, intervaloSeg: 30 });
    expect(leerOpcionesTasaFallo(config)).toEqual({
      umbral: 0.1,
      muestraMinima: 50,
    });
  });

  it('sin entorno validado (e2e parcial) usan los mismos defaults de ADR-13 §18', () => {
    // Arrange
    const vacio = configDe({});
    const validado = configDe(validarEntorno({ JWT_SECRET: 'x' }));

    // Act & Assert
    expect(leerOpcionesEnvio(vacio)).toEqual(leerOpcionesEnvio(validado));
    expect(leerCadenciaEnvio(vacio)).toEqual({ lote: 20, intervaloSeg: 60 });
    expect(leerCadenciaEnvio(vacio)).toEqual(leerCadenciaEnvio(validado));
    expect(leerOpcionesTasaFallo(vacio)).toEqual({
      umbral: 0.05,
      muestraMinima: 20,
    });
    expect(leerOpcionesTasaFallo(vacio)).toEqual(
      leerOpcionesTasaFallo(validado),
    );
  });
});
