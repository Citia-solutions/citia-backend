import {
  DatosPlantillaRecordatorio,
  escaparHtml,
  generarPlantillaRecordatorio,
} from './plantilla-recordatorio';

// Martes 14 de octubre de 2026, 10:30 en Santiago (UTC−3).
const INICIO = new Date('2026-10-14T13:30:00Z');

const BASE: DatosPlantillaRecordatorio = {
  inicio: INICIO,
  tz: 'America/Santiago',
  profesional: 'Dra. Ana Pérez',
  organizacion: 'Centro Norte',
  telefonoContacto: null,
  correoRespuesta: null,
};

describe('generarPlantillaRecordatorio (ADR-13 §12)', () => {
  describe('asunto', () => {
    it('es neutro: solo la fecha y la hora, en la zona de la clínica', () => {
      // Act
      const { asunto } = generarPlantillaRecordatorio(BASE);

      // Assert
      expect(asunto).toBe(
        'Recordatorio de tu hora: miércoles 14 de octubre, 10:30',
      );
    });

    it('no nombra al profesional ni a la organización (pantalla bloqueada)', () => {
      // Act
      const { asunto } = generarPlantillaRecordatorio({
        ...BASE,
        organizacion: 'Clínica Psiquiátrica Sur',
      });

      // Assert
      expect(asunto).not.toContain('Ana');
      expect(asunto).not.toContain('Psiquiátrica');
    });
  });

  describe('cuerpo', () => {
    it('lleva fecha, hora, profesional y organización en HTML y texto', () => {
      // Act
      const { html, texto } = generarPlantillaRecordatorio(BASE);

      // Assert
      for (const contenido of [html, texto]) {
        expect(contenido).toContain('miércoles 14 de octubre');
        expect(contenido).toContain('10:30');
        expect(contenido).toContain('Dra. Ana Pérez');
        expect(contenido).toContain('Centro Norte');
        expect(contenido).toContain('aviso automático enviado por Citia');
      }
    });

    it('sin Reply-To: dice que el correo no recibe respuestas', () => {
      // Act
      const { html, texto } = generarPlantillaRecordatorio(BASE);

      // Assert
      expect(texto).toContain('Este correo no recibe respuestas');
      expect(html).toContain('Este correo no recibe respuestas');
      expect(texto).not.toContain('Responde a este correo');
    });

    it('con Reply-To: invita a responder y muestra el correo de contacto', () => {
      // Act
      const { html, texto } = generarPlantillaRecordatorio({
        ...BASE,
        correoRespuesta: 'consulta@ana.cl',
      });

      // Assert
      expect(texto).toContain('Responde a este correo');
      expect(texto).toContain('consulta@ana.cl');
      expect(html).toContain('consulta@ana.cl');
      expect(texto).not.toContain('no recibe respuestas');
    });

    it('con teléfono de contacto lo incluye', () => {
      // Act
      const { html, texto } = generarPlantillaRecordatorio({
        ...BASE,
        telefonoContacto: '+56 9 1234 5678',
      });

      // Assert
      expect(texto).toContain('+56 9 1234 5678');
      expect(html).toContain('+56 9 1234 5678');
    });

    it('sin ningún contacto remite a la organización', () => {
      // Act
      const { texto } = generarPlantillaRecordatorio(BASE);

      // Assert
      expect(texto).toContain(
        'comunícate con Centro Norte por los medios habituales',
      );
    });

    it('sin enlaces ni imágenes (ni seguimiento) en la Fase 2', () => {
      // Act
      const { html } = generarPlantillaRecordatorio(BASE);

      // Assert
      expect(html).not.toMatch(/<a\s/i);
      expect(html).not.toMatch(/<img\s/i);
      expect(html).not.toContain('http');
    });

    it('es determinista: mismo contenido para los mismos datos (Idempotency-Key)', () => {
      expect(generarPlantillaRecordatorio(BASE)).toEqual(
        generarPlantillaRecordatorio(BASE),
      );
    });
  });

  describe('escape de HTML', () => {
    it('escapa todo dato interpolado en el HTML', () => {
      // Arrange
      const malicioso = '<script>alert("x")</script> & \'co\'';

      // Act
      const { html } = generarPlantillaRecordatorio({
        ...BASE,
        profesional: malicioso,
        organizacion: `<img src=x onerror=alert(1)>`,
        telefonoContacto: '<b>123</b>',
        correoRespuesta: 'a"b@c.cl',
      });

      // Assert
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<b>123</b>');
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
      );
      expect(html).toContain('&amp; &#39;co&#39;');
      expect(html).toContain('a&quot;b@c.cl');
    });

    it('lleva cada dato a una línea (sin saltos inyectados en el texto)', () => {
      // Act
      const { texto } = generarPlantillaRecordatorio({
        ...BASE,
        organizacion: 'Centro\nNorte\r\nX',
      });

      // Assert
      expect(texto).toContain('en Centro Norte X.');
    });

    it('escaparHtml cubre los cinco caracteres', () => {
      expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    });
  });

  describe('bloque accion (Fase 3, ADR-10)', () => {
    it('vacío o ausente no se dibuja', () => {
      // Act
      const sin = generarPlantillaRecordatorio(BASE);
      const nulo = generarPlantillaRecordatorio({ ...BASE, accion: null });

      // Assert
      expect(nulo).toEqual(sin);
    });

    it('con un enlace https se dibuja, escapado', () => {
      // Act
      const { html, texto } = generarPlantillaRecordatorio({
        ...BASE,
        accion: {
          texto: 'Confirmar o cambiar mi hora',
          url: 'https://app.citia.cl/cita#tok&en',
        },
      });

      // Assert
      expect(html).toContain('href="https://app.citia.cl/cita#tok&amp;en"');
      expect(texto).toContain(
        'Confirmar o cambiar mi hora: https://app.citia.cl/cita#tok&en',
      );
    });

    it('con una URL que no es http(s) no se dibuja', () => {
      // Act
      const { html } = generarPlantillaRecordatorio({
        ...BASE,
        accion: { texto: 'x', url: 'javascript:alert(1)' },
      });

      // Assert
      expect(html).not.toContain('javascript:');
    });
  });
});
