import { EntornoInvalidoError, validarEntorno } from './entorno';

const SECRETO_FUERTE = 'x'.repeat(40);

/** Lo mínimo que exige producción. */
const PRODUCCION = {
  NODE_ENV: 'production',
  DB_HOST: 'db.interna',
  DB_PORT: '5432',
  DB_USER: 'citia',
  DB_PASS: 'clave-db',
  DB_NAME: 'citia',
  JWT_SECRET: SECRETO_FUERTE,
  FRONTEND_URL: 'https://app.citia.cl',
  MENSAJERIA_ADAPTADOR: 'resend',
  RESEND_API_KEY: 're_123',
  RESEND_WEBHOOK_SECRET: 'whsec_abc',
};

function erroresDe(crudo: Record<string, unknown>): readonly string[] {
  try {
    validarEntorno(crudo);
  } catch (e) {
    if (e instanceof EntornoInvalidoError) {
      return e.errores;
    }
    throw e;
  }
  throw new Error('se esperaba EntornoInvalidoError');
}

describe('validarEntorno', () => {
  describe('fuera de producción', () => {
    it('arranca solo con JWT_SECRET y aplica todos los defaults', () => {
      const e = validarEntorno({ JWT_SECRET: 'dev' });

      expect(e).toMatchObject({
        NODE_ENV: 'development',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_USER: 'postgres',
        DB_PASS: 'postgres',
        DB_NAME: 'citia_dev',
        JWT_EXPIRES_IN: '1d',
        FRONTEND_URL: 'http://localhost:5173',
        CORS_ORIGENES_EXTRA: [],
        APP_TZ: 'America/Santiago',
        SOLICITUD_VENTANA_HORAS: 72,
        LOG_NIVEL: 'info',
        LOG_FORMATO: 'pretty',
        PLANIFICADOR_ACTIVO: true,
        EVENTOS_SALIDA_INTERVALO_SEG: 5,
        EVENTOS_SALIDA_LOTE: 50,
        EVENTOS_SALIDA_MAX_INTENTOS: 10,
        EVENTOS_SALIDA_RETENCION_DIAS: 14,
        MENSAJERIA_ADAPTADOR: 'registro',
        CORREO_REMITENTE: 'Citia <onboarding@resend.dev>',
        RESEND_CUOTA_DIARIA: 100,
        RESEND_CUOTA_MENSUAL: 3000,
        CUOTA_UMBRAL_AVISO: 0.8,
        RECORDATORIO_ANTELACIONES_MIN: [1440, 120],
        RECORDATORIO_SILENCIO_DESDE: '21:00',
        RECORDATORIO_SILENCIO_HASTA: '08:00',
        RECORDATORIO_MARGEN_MINIMO_MIN: 30,
        RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN: 60,
        RECORDATORIO_MAX_INTENTOS: 5,
        RECORDATORIO_LOTE: 20,
        RECORDATORIO_INTERVALO_SEG: 60,
        RECORDATORIO_MAX_DIARIO_POR_TENANT: 40,
        RECORDATORIO_EXIGIR_CONSENTIMIENTO: false,
        RECORDATORIO_UMBRAL_TASA_FALLO: 0.05,
        RECORDATORIO_UMBRAL_MUESTRA_MIN: 20,
      });
      expect(e.BETTERSTACK_SOURCE_TOKEN).toBeUndefined();
      expect(e.BETTERSTACK_HEARTBEAT_SALIDA_URL).toBeUndefined();
      expect(e.RESEND_API_KEY).toBeUndefined();
    });

    it('en test: logs en silencio, JSON y planificador apagado', () => {
      const e = validarEntorno({ NODE_ENV: 'test', JWT_SECRET: 'dev' });
      expect(e.LOG_NIVEL).toBe('silent');
      expect(e.LOG_FORMATO).toBe('json');
      expect(e.PLANIFICADOR_ACTIVO).toBe(false);
    });

    it('convierte números, booleanos y listas', () => {
      const e = validarEntorno({
        JWT_SECRET: 'dev',
        PORT: '8080',
        DB_PORT: '15432',
        PLANIFICADOR_ACTIVO: 'FALSE',
        RECORDATORIO_EXIGIR_CONSENTIMIENTO: '1',
        CUOTA_UMBRAL_AVISO: '0.9',
        RECORDATORIO_ANTELACIONES_MIN: '2880, 60',
      });
      expect(e.PORT).toBe(8080);
      expect(e.DB_PORT).toBe(15432);
      expect(e.PLANIFICADOR_ACTIVO).toBe(false);
      expect(e.RECORDATORIO_EXIGIR_CONSENTIMIENTO).toBe(true);
      expect(e.CUOTA_UMBRAL_AVISO).toBe(0.9);
      expect(e.RECORDATORIO_ANTELACIONES_MIN).toEqual([2880, 60]);
    });

    it('trata un valor vacío como no definido', () => {
      const e = validarEntorno({
        JWT_SECRET: 'dev',
        PORT: '',
        BETTERSTACK_SOURCE_TOKEN: '   ',
      });
      expect(e.PORT).toBe(3000);
      expect(e.BETTERSTACK_SOURCE_TOKEN).toBeUndefined();
    });

    it('deja pasar las variables que no conoce', () => {
      const e = validarEntorno({
        JWT_SECRET: 'dev',
        TEST_DB_NAME: 'citia_test',
      });
      expect(e.TEST_DB_NAME).toBe('citia_test');
    });

    it('normaliza FRONTEND_URL y CORS_ORIGENES_EXTRA', () => {
      const e = validarEntorno({
        JWT_SECRET: 'dev',
        FRONTEND_URL: 'http://localhost:3002/',
        CORS_ORIGENES_EXTRA:
          'https://Citia.cl/, https://*.citia-frontend.pages.dev,,',
      });
      expect(e.FRONTEND_URL).toBe('http://localhost:3002');
      expect(e.CORS_ORIGENES_EXTRA).toEqual([
        'https://citia.cl',
        'https://*.citia-frontend.pages.dev',
      ]);
    });

    it('deriva el remitente de CORREO_DOMINIO si no se define (ADR-13 §13)', () => {
      const e = validarEntorno({
        JWT_SECRET: 'dev',
        CORREO_DOMINIO: 'notificaciones.citia.cl',
      });
      expect(e.CORREO_REMITENTE).toBe(
        'Citia <recordatorios@notificaciones.citia.cl>',
      );
    });
  });

  describe('errores', () => {
    it('JWT_SECRET es obligatoria siempre', () => {
      expect(erroresDe({})).toEqual(['JWT_SECRET: es obligatoria.']);
    });

    it('junta todos los errores en un solo mensaje', () => {
      let mensaje = '';
      try {
        validarEntorno({
          JWT_SECRET: 'dev',
          PORT: 'abc',
          DB_PORT: '70000',
          NODE_ENV: 'staging',
          PLANIFICADOR_ACTIVO: 'si',
          APP_TZ: 'Marte/Olympus',
          LOG_NIVEL: 'verbose',
        });
      } catch (e) {
        mensaje = (e as Error).message;
      }
      expect(mensaje).toContain('Variables de entorno inválidas (6)');
      expect(mensaje).toContain('PORT: debe ser un entero entre 1 y 65535');
      expect(mensaje).toContain('DB_PORT: debe ser un entero entre 1 y 65535');
      expect(mensaje).toContain('NODE_ENV: debe ser uno de');
      expect(mensaje).toContain('PLANIFICADOR_ACTIVO: debe ser true o false');
      expect(mensaje).toContain('APP_TZ: no es una zona horaria IANA válida');
      expect(mensaje).toContain('LOG_NIVEL: debe ser uno de');
    });

    it('rechaza un origen CORS inválido con un mensaje claro', () => {
      const errores = erroresDe({
        JWT_SECRET: 'dev',
        CORS_ORIGENES_EXTRA: 'https://ok.cl,https://*.pages.dev',
      });
      expect(errores).toHaveLength(1);
      expect(errores[0]).toMatch(
        /^CORS_ORIGENES_EXTRA: "https:\/\/\*\.pages\.dev"/,
      );
    });

    it('rechaza FRONTEND_URL con ruta o con comodín', () => {
      expect(
        erroresDe({ JWT_SECRET: 'dev', FRONTEND_URL: 'https://a.cl/app' })[0],
      ).toMatch(/^FRONTEND_URL:/);
      expect(
        erroresDe({
          JWT_SECRET: 'dev',
          FRONTEND_URL: 'https://*.citia-frontend.pages.dev',
        })[0],
      ).toBe('FRONTEND_URL: debe ser un origen exacto, sin comodín.');
    });

    it('valida las antelaciones como el dominio (1 a 3, distintas, 30..10080)', () => {
      for (const valor of ['', '1440,1440', '10', '1440,120,60,30', 'abc']) {
        if (valor === '') {
          continue; // vacío = default
        }
        expect(
          erroresDe({
            JWT_SECRET: 'dev',
            RECORDATORIO_ANTELACIONES_MIN: valor,
          })[0],
        ).toMatch(/^RECORDATORIO_ANTELACIONES_MIN:/);
      }
    });

    it('valida horas sin envío, cuotas y umbrales', () => {
      const errores = erroresDe({
        JWT_SECRET: 'dev',
        RECORDATORIO_SILENCIO_DESDE: '25:00',
        RESEND_CUOTA_DIARIA: '200',
        RESEND_CUOTA_MENSUAL: '100',
        CUOTA_UMBRAL_AVISO: '1.5',
        RECORDATORIO_UMBRAL_TASA_FALLO: '0',
      });
      expect(errores).toEqual([
        expect.stringMatching(/^RESEND_CUOTA_MENSUAL: no puede ser menor/),
        expect.stringMatching(/^CUOTA_UMBRAL_AVISO:/),
        expect.stringMatching(
          /^RECORDATORIO_SILENCIO_DESDE: debe tener formato HH:mm/,
        ),
        expect.stringMatching(/^RECORDATORIO_UMBRAL_TASA_FALLO:/),
      ]);
      expect(
        erroresDe({
          JWT_SECRET: 'dev',
          RECORDATORIO_SILENCIO_DESDE: '08:00',
          RECORDATORIO_SILENCIO_HASTA: '08:00',
        }),
      ).toEqual([
        'RECORDATORIO_SILENCIO_HASTA: no puede ser igual a RECORDATORIO_SILENCIO_DESDE.',
      ]);
    });

    it('no muestra el valor de las URLs de latido (llevan el token)', () => {
      const errores = erroresDe({
        JWT_SECRET: 'dev',
        BETTERSTACK_HEARTBEAT_SALIDA_URL:
          'http://uptime.betterstack.com/api/v1/heartbeat/SECRETO',
      });
      expect(errores).toEqual([
        'BETTERSTACK_HEARTBEAT_SALIDA_URL: debe ser una URL https completa (valor oculto).',
      ]);
      expect(errores.join()).not.toContain('SECRETO');
    });
  });

  describe('Resend', () => {
    it('con el adaptador registro no exige nada de Resend', () => {
      expect(() =>
        validarEntorno({ JWT_SECRET: 'dev', MENSAJERIA_ADAPTADOR: 'registro' }),
      ).not.toThrow();
    });

    it('con MENSAJERIA_ADAPTADOR=resend exige la clave y el secreto del webhook', () => {
      expect(
        erroresDe({ JWT_SECRET: 'dev', MENSAJERIA_ADAPTADOR: 'resend' }),
      ).toEqual([
        'RESEND_API_KEY: es obligatoria con MENSAJERIA_ADAPTADOR=resend.',
        'RESEND_WEBHOOK_SECRET: es obligatoria con MENSAJERIA_ADAPTADOR=resend.',
      ]);
    });

    it('exige que el secreto del webhook empiece con whsec_, sin mostrarlo', () => {
      const errores = erroresDe({
        JWT_SECRET: 'dev',
        MENSAJERIA_ADAPTADOR: 'resend',
        RESEND_API_KEY: 're_123',
        RESEND_WEBHOOK_SECRET: 'otro-secreto',
      });
      expect(errores).toHaveLength(1);
      expect(errores[0]).toMatch(/^RESEND_WEBHOOK_SECRET: .*whsec_/);
      expect(errores[0]).not.toContain('otro-secreto');
    });

    it('acepta una configuración de Resend completa', () => {
      const e = validarEntorno({
        JWT_SECRET: 'dev',
        MENSAJERIA_ADAPTADOR: 'resend',
        RESEND_API_KEY: 're_123',
        RESEND_WEBHOOK_SECRET: 'whsec_abc',
        CORREO_REMITENTE: 'Citia <recordatorios@notificaciones.citia.cl>',
      });
      expect(e.MENSAJERIA_ADAPTADOR).toBe('resend');
      expect(e.CORREO_REMITENTE).toBe(
        'Citia <recordatorios@notificaciones.citia.cl>',
      );
    });

    it('rechaza un remitente mal formado', () => {
      expect(
        erroresDe({
          JWT_SECRET: 'dev',
          CORREO_REMITENTE: 'Citia recordatorios',
        })[0],
      ).toMatch(/^CORREO_REMITENTE:/);
    });
  });

  describe('producción', () => {
    it('acepta la configuración mínima y usa JSON con nivel info', () => {
      const e = validarEntorno(PRODUCCION);
      expect(e.NODE_ENV).toBe('production');
      expect(e.LOG_FORMATO).toBe('json');
      expect(e.LOG_NIVEL).toBe('info');
      expect(e.PLANIFICADOR_ACTIVO).toBe(true);
    });

    it('sin defaults para la base de datos ni FRONTEND_URL', () => {
      expect(
        erroresDe({ NODE_ENV: 'production', JWT_SECRET: SECRETO_FUERTE }),
      ).toEqual([
        'DB_HOST: es obligatoria en producción.',
        'DB_PORT: es obligatoria en producción.',
        'DB_USER: es obligatoria en producción.',
        'DB_PASS: es obligatoria en producción.',
        'DB_NAME: es obligatoria en producción.',
        'FRONTEND_URL: es obligatoria en producción.',
        'MENSAJERIA_ADAPTADOR: es obligatoria en producción (registro o resend; registro no envía correos).',
      ]);
    });

    it('exige MENSAJERIA_ADAPTADOR explícito: nunca queda en registro por omisión', () => {
      // Arrange
      const sinAdaptador: Record<string, unknown> = { ...PRODUCCION };
      delete sinAdaptador.MENSAJERIA_ADAPTADOR;

      // Act & Assert
      expect(erroresDe(sinAdaptador)).toEqual([
        'MENSAJERIA_ADAPTADOR: es obligatoria en producción (registro o resend; registro no envía correos).',
      ]);
      expect(erroresDe({ ...PRODUCCION, MENSAJERIA_ADAPTADOR: '  ' })).toEqual([
        'MENSAJERIA_ADAPTADOR: es obligatoria en producción (registro o resend; registro no envía correos).',
      ]);
    });

    it('acepta registro en producción si se elige explícitamente', () => {
      const e = validarEntorno({
        ...PRODUCCION,
        MENSAJERIA_ADAPTADOR: 'registro',
        RESEND_API_KEY: undefined,
        RESEND_WEBHOOK_SECRET: undefined,
      });
      expect(e.MENSAJERIA_ADAPTADOR).toBe('registro');
    });

    it('fuera de producción sigue usando registro por defecto', () => {
      expect(
        validarEntorno({ NODE_ENV: 'test', JWT_SECRET: 'x' })
          .MENSAJERIA_ADAPTADOR,
      ).toBe('registro');
    });

    it.each([
      ['corto', 'corto'],
      ['el de ejemplo', 'dev-only-change-me-super-secret'],
    ])('rechaza un JWT_SECRET %s sin mostrarlo', (_caso, secreto) => {
      const errores = erroresDe({ ...PRODUCCION, JWT_SECRET: secreto });
      expect(errores).toHaveLength(1);
      expect(errores[0]).toMatch(
        /^JWT_SECRET: en producción debe tener al menos 32/,
      );
      expect(errores[0]).not.toContain(secreto);
    });
  });
});
