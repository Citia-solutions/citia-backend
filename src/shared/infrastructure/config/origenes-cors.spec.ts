import {
  crearOpcionesCors,
  crearPoliticaCors,
  esOrigenPermitido,
  normalizarOrigen,
  OrigenCorsInvalidoError,
  parsearListaOrigenes,
} from './origenes-cors';

describe('origenes-cors', () => {
  const FRONTEND = 'https://app.citia.cl';
  const politica = crearPoliticaCors(FRONTEND, [
    'http://localhost:3002',
    'https://*.citia-frontend.pages.dev',
  ]);

  describe('esOrigenPermitido', () => {
    it('acepta FRONTEND_URL (origen canónico)', () => {
      expect(esOrigenPermitido('https://app.citia.cl', politica)).toBe(true);
    });

    it('acepta un origen exacto de CORS_ORIGENES_EXTRA', () => {
      expect(esOrigenPermitido('http://localhost:3002', politica)).toBe(true);
    });

    it('acepta una vista previa de un solo nivel bajo el comodín', () => {
      expect(
        esOrigenPermitido(
          'https://a1b2c3d4.citia-frontend.pages.dev',
          politica,
        ),
      ).toBe(true);
      expect(
        esOrigenPermitido(
          'https://feature-login.citia-frontend.pages.dev',
          politica,
        ),
      ).toBe(true);
    });

    it('rechaza un origen ajeno (evil.com)', () => {
      expect(esOrigenPermitido('https://evil.com', politica)).toBe(false);
    });

    it('rechaza dos niveles de subdominio (x.y.<proyecto>.pages.dev)', () => {
      expect(
        esOrigenPermitido('https://x.y.citia-frontend.pages.dev', politica),
      ).toBe(false);
    });

    it('rechaza el sufijo arbitrario (<proyecto>.pages.dev.evil.com)', () => {
      expect(
        esOrigenPermitido(
          'https://citia-frontend.pages.dev.evil.com',
          politica,
        ),
      ).toBe(false);
      expect(
        esOrigenPermitido(
          'https://abc.citia-frontend.pages.dev.evil.com',
          politica,
        ),
      ).toBe(false);
    });

    it('rechaza el comodín por http en vez de https', () => {
      expect(
        esOrigenPermitido('http://abc.citia-frontend.pages.dev', politica),
      ).toBe(false);
    });

    it('rechaza el proyecto sin subdominio y otros proyectos de Pages', () => {
      expect(
        esOrigenPermitido('https://citia-frontend.pages.dev', politica),
      ).toBe(false);
      expect(
        esOrigenPermitido('https://abc.otro-proyecto.pages.dev', politica),
      ).toBe(false);
      expect(
        esOrigenPermitido('https://abc.evilcitia-frontend.pages.dev', politica),
      ).toBe(false);
    });

    it('rechaza una vista previa con puerto', () => {
      expect(
        esOrigenPermitido(
          'https://abc.citia-frontend.pages.dev:8443',
          politica,
        ),
      ).toBe(false);
    });

    it('rechaza el origen exacto con otro esquema o puerto', () => {
      expect(esOrigenPermitido('http://app.citia.cl', politica)).toBe(false);
      expect(esOrigenPermitido('https://app.citia.cl:8443', politica)).toBe(
        false,
      );
    });

    it('rechaza la petición sin cabecera Origin, con Origin vacío o "null"', () => {
      expect(esOrigenPermitido(undefined, politica)).toBe(false);
      expect(esOrigenPermitido('', politica)).toBe(false);
      expect(esOrigenPermitido('null', politica)).toBe(false);
    });
  });

  describe('normalizarOrigen', () => {
    it('quita la barra final y pasa el host a minúsculas', () => {
      expect(normalizarOrigen(' https://App.Citia.CL/ ')).toBe(
        'https://app.citia.cl',
      );
    });

    it('quita el puerto por defecto y conserva uno explícito', () => {
      expect(normalizarOrigen('https://app.citia.cl:443')).toBe(
        'https://app.citia.cl',
      );
      expect(normalizarOrigen('http://localhost:3002')).toBe(
        'http://localhost:3002',
      );
    });

    it('acepta el comodín de vistas previas y lo deja en minúsculas', () => {
      expect(normalizarOrigen('https://*.Citia-Frontend.pages.dev')).toBe(
        'https://*.citia-frontend.pages.dev',
      );
    });

    it.each([
      ['https://*.pages.dev', 'cualquier proyecto de Pages'],
      ['http://*.citia-frontend.pages.dev', 'comodín por http'],
      ['https://*.*.citia-frontend.pages.dev', 'dos comodines'],
      ['https://*.citia.cl', 'comodín fuera de pages.dev'],
      ['https://*', 'comodín total'],
      ['*', 'asterisco solo'],
      ['https://a*.citia-frontend.pages.dev', 'comodín dentro de una etiqueta'],
      ['https://*.citia-frontend.pages.dev:8443', 'comodín con puerto'],
    ])('rechaza el comodín %s (%s)', (valor) => {
      expect(() => normalizarOrigen(valor)).toThrow(OrigenCorsInvalidoError);
    });

    it.each([
      ['app.citia.cl', 'sin esquema'],
      ['ftp://app.citia.cl', 'esquema no http'],
      ['https://app.citia.cl/agenda', 'con ruta'],
      ['https://app.citia.cl?x=1', 'con query'],
      ['https://usuario:clave@app.citia.cl', 'con credenciales'],
      ['   ', 'vacío'],
    ])('rechaza %s (%s)', (valor) => {
      expect(() => normalizarOrigen(valor)).toThrow(OrigenCorsInvalidoError);
    });
  });

  describe('parsearListaOrigenes', () => {
    it('separa por comas, ignora vacíos y normaliza', () => {
      expect(
        parsearListaOrigenes(
          ' https://a.cl/ ,, https://*.citia-frontend.pages.dev ,',
        ),
      ).toEqual(['https://a.cl', 'https://*.citia-frontend.pages.dev']);
    });

    it('sin valor devuelve una lista vacía', () => {
      expect(parsearListaOrigenes(undefined)).toEqual([]);
      expect(parsearListaOrigenes('')).toEqual([]);
    });

    it('lanza si alguna entrada es inválida', () => {
      expect(() =>
        parsearListaOrigenes('https://a.cl,https://*.pages.dev'),
      ).toThrow(OrigenCorsInvalidoError);
    });
  });

  describe('crearPoliticaCors', () => {
    it('sin extras solo acepta FRONTEND_URL', () => {
      const soloFrontend = crearPoliticaCors('https://app.citia.cl/');
      expect(esOrigenPermitido('https://app.citia.cl', soloFrontend)).toBe(
        true,
      );
      expect(esOrigenPermitido('http://localhost:3002', soloFrontend)).toBe(
        false,
      );
    });

    it('lanza si FRONTEND_URL no es un origen válido', () => {
      expect(() => crearPoliticaCors('https://app.citia.cl/agenda')).toThrow(
        OrigenCorsInvalidoError,
      );
    });
  });

  describe('crearOpcionesCors', () => {
    const opciones = crearOpcionesCors(politica);

    const resolver = (origen: string | undefined): unknown => {
      let resultado: unknown;
      if (typeof opciones.origin !== 'function') {
        throw new Error('origin debería ser una función');
      }
      opciones.origin(origen, (err, permitido) => {
        expect(err).toBeNull();
        resultado = permitido;
      });
      return resultado;
    };

    it('mantiene credentials: true y expone X-Request-Id', () => {
      expect(opciones.credentials).toBe(true);
      expect(opciones.exposedHeaders).toEqual(['X-Request-Id']);
    });

    it('responde true para un origen permitido y false para uno ajeno', () => {
      expect(resolver('https://app.citia.cl')).toBe(true);
      expect(resolver('https://evil.com')).toBe(false);
      expect(resolver(undefined)).toBe(false);
    });
  });
});
