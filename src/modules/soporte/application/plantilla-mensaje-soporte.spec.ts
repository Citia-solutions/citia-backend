import {
  CategoriaSoporte,
  DatosMensajeSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../domain/mensaje-soporte.entity';
import {
  DatosCorreoSoporte,
  armarCorreoSoporte,
  escaparHtml,
} from './plantilla-mensaje-soporte';

const TZ = 'America/Santiago';
const ID = '5e000000-0000-4000-8000-000000000001';
const TENANT = '7e000000-0000-4000-8000-000000000001';
const USUARIO = '0a5e0000-0000-4000-8000-000000000001';
// 2026-10-31 14:05 en Santiago (UTC-3 en horario de verano).
const CREADO = new Date('2026-10-31T17:05:00.000Z');

const mensaje = (extra: Partial<DatosMensajeSoporte> = {}): MensajeSoporte =>
  MensajeSoporte.reconstituir({
    id: ID,
    tenantId: TENANT,
    usuarioId: USUARIO,
    categoria: CategoriaSoporte.PROBLEMA,
    mensaje: 'No carga la agenda.\nProbé en dos navegadores.',
    estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
    intentos: 0,
    proximoIntentoEn: CREADO,
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    creadoEn: CREADO,
    ...extra,
  });

const datos = (
  extra: Partial<DatosCorreoSoporte> = {},
): DatosCorreoSoporte => ({
  mensaje: mensaje(),
  usuario: {
    nombreCompleto: 'Dra. Ana Soto',
    email: 'dra.soto@clinica.cl',
    rol: 'ADMINISTRADOR',
  },
  organizacion: { nombre: 'Clínica Sur', slug: 'clinica-sur' },
  ...extra,
});

describe('armarCorreoSoporte', () => {
  describe('asunto', () => {
    it('Soporte · <Categoría legible> · <organización>', () => {
      expect(armarCorreoSoporte(datos(), TZ).asunto).toBe(
        'Soporte · Problema · Clínica Sur',
      );
    });

    it.each([
      [CategoriaSoporte.CONSULTA, 'Consulta'],
      [CategoriaSoporte.SUGERENCIA, 'Sugerencia'],
      [CategoriaSoporte.OTRO, 'Otro'],
    ])('categoría %s → %s', (categoria, legible) => {
      expect(
        armarCorreoSoporte(datos({ mensaje: mensaje({ categoria }) }), TZ)
          .asunto,
      ).toBe(`Soporte · ${legible} · Clínica Sur`);
    });

    it('sin saltos de línea ni caracteres de control, aunque la organización los traiga', () => {
      // Act
      const { asunto } = armarCorreoSoporte(
        datos({
          organizacion: { nombre: 'Clínica\r\nBcc: x@y.cl\tSur', slug: 'c' },
        }),
        TZ,
      );

      // Assert
      expect(asunto).not.toMatch(/[\r\n\t]/);
      expect(asunto).toBe('Soporte · Problema · Clínica Bcc: x@y.cl Sur');
    });

    it('recorta la organización a 60 caracteres (sin partir un emoji)', () => {
      // Arrange
      const larga = `${'😀'.repeat(30)}${'a'.repeat(40)}`;

      // Act
      const { asunto } = armarCorreoSoporte(
        datos({ organizacion: { nombre: larga, slug: 'larga' } }),
        TZ,
      );

      // Assert
      const organizacion = asunto.replace('Soporte · Problema · ', '');
      expect(Array.from(organizacion)).toHaveLength(60);
      expect(organizacion.startsWith('😀'.repeat(30))).toBe(true);
      expect(organizacion.endsWith('…')).toBe(true);
    });
  });

  describe('cuerpo', () => {
    it('lleva quién escribe, la organización, la fecha en APP_TZ, la categoría, los ids y el texto', () => {
      // Act
      const { texto, html } = armarCorreoSoporte(datos(), TZ);

      // Assert
      for (const parte of [
        'De: Dra. Ana Soto <dra.soto@clinica.cl> · Administrador',
        'Organización: Clínica Sur (clinica-sur)',
        'Recibido: 2026-10-31 14:05 (America/Santiago)',
        'Categoría: Problema',
        `Ids: mensaje ${ID} · usuario ${USUARIO} · organización ${TENANT}`,
        'No carga la agenda.\nProbé en dos navegadores.',
        'Responde a este correo para contestarle a Dra. Ana Soto (dra.soto@clinica.cl).',
      ]) {
        expect(texto).toContain(parte);
      }
      expect(html).toContain('2026-10-31 14:05 (America/Santiago)');
      expect(html).toContain('Dra. Ana Soto &lt;dra.soto@clinica.cl&gt;');
      expect(html).toContain(ID);
    });

    it('la fecha usa la zona dada (no la del servidor)', () => {
      expect(armarCorreoSoporte(datos(), 'UTC').texto).toContain(
        'Recibido: 2026-10-31 17:05 (UTC)',
      );
    });

    it('conserva los saltos de línea del texto (texto plano y HTML con pre-wrap)', () => {
      // Arrange
      const texto = 'Línea 1\r\n\r\nLínea 3\nLínea 4';

      // Act
      const correo = armarCorreoSoporte(
        datos({ mensaje: mensaje({ mensaje: texto }) }),
        TZ,
      );

      // Assert
      expect(correo.texto).toContain('Línea 1\n\nLínea 3\nLínea 4');
      expect(correo.html).toContain('white-space:pre-wrap');
      expect(correo.html).toContain('Línea 1\n\nLínea 3\nLínea 4');
    });

    it('usuario inexistente: lo dice y no ofrece responder', () => {
      // Act
      const { texto } = armarCorreoSoporte(datos({ usuario: null }), TZ);

      // Assert
      expect(texto).toContain('De: (el usuario ya no existe)');
      expect(texto).toContain(`usuario ${USUARIO}`);
      expect(texto).toContain('no tiene a quién responder');
    });

    it('organización inexistente: no falla', () => {
      // Act
      const correo = armarCorreoSoporte(datos({ organizacion: null }), TZ);

      // Assert
      expect(correo.asunto).toBe(
        'Soporte · Problema · (organización no encontrada)',
      );
      expect(correo.texto).toContain(`organización ${TENANT}`);
    });

    it('un rol desconocido se muestra tal cual', () => {
      expect(
        armarCorreoSoporte(
          datos({
            usuario: {
              nombreCompleto: 'X',
              email: 'x@y.cl',
              rol: 'RECEPCION',
            },
          }),
          TZ,
        ).texto,
      ).toContain('· RECEPCION');
    });
  });

  describe('escapado (HTML)', () => {
    it('escapa TODO dato: <script> en el texto, en la organización y en el nombre', () => {
      // Arrange
      const peligroso = '<script>alert("x")</script>';

      // Act
      const { html } = armarCorreoSoporte(
        datos({
          mensaje: mensaje({ mensaje: `Hola ${peligroso} & 'adiós'` }),
          organizacion: { nombre: `Clínica ${peligroso}`, slug: '<b>slug' },
          usuario: {
            nombreCompleto: `Dra. ${peligroso}`,
            email: 'a"b@c.cl',
            rol: 'ADMINISTRADOR',
          },
        }),
        TZ,
      );

      // Assert
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>slug');
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
      );
      expect(html).toContain('&amp; &#39;adiós&#39;');
      expect(html).toContain('a&quot;b@c.cl');
    });

    it('el asunto también va escapado en el <title>', () => {
      // Act
      const { html } = armarCorreoSoporte(
        datos({ organizacion: { nombre: '<i>Clínica</i>', slug: 's' } }),
        TZ,
      );

      // Assert
      expect(html).toContain(
        '<title>Soporte · Problema · &lt;i&gt;Clínica&lt;/i&gt;</title>',
      );
    });

    it('escaparHtml cubre los cinco caracteres', () => {
      expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    });
  });

  it('es determinista: dos llamadas (p. ej. un reintento) dan el mismo correo', () => {
    // Act
    const primero = armarCorreoSoporte(datos(), TZ);
    const segundo = armarCorreoSoporte(datos(), TZ);

    // Assert
    expect(segundo).toEqual(primero);
  });
});
