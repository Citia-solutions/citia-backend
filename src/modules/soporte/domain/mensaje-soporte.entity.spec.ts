import { MensajeSoporteInvalidoError } from './exceptions/mensaje-soporte-invalido.error';
import { TransicionEnvioSoporteInvalidaError } from './exceptions/transicion-envio-soporte-invalida.error';
import {
  LARGO_MAXIMO_MENSAJE_SOPORTE,
  POLITICA_REINTENTO_SOPORTE,
} from './limites-soporte';
import {
  CategoriaSoporte,
  DatosMensajeSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from './mensaje-soporte.entity';

/**
 * Creación, reconstitución y transiciones del envío del mensaje a soporte
 * (US-10, P7; ADR-15 §7).
 */
describe('MensajeSoporte', () => {
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const USUARIO = '0a5e0000-0000-4000-8000-000000000001';

  const crear = (
    extra: Partial<Parameters<typeof MensajeSoporte.crear>[0]> = {},
  ): MensajeSoporte =>
    MensajeSoporte.crear({
      tenantId: TENANT,
      usuarioId: USUARIO,
      categoria: CategoriaSoporte.PROBLEMA,
      mensaje: 'No puedo ver mis citas de mañana',
      ...extra,
    });

  /** Error lanzado por `fn`; falla si no lanzó. */
  const errorDe = (fn: () => unknown): MensajeSoporteInvalidoError => {
    try {
      fn();
    } catch (error: unknown) {
      return error as MensajeSoporteInvalidoError;
    }
    throw new Error('se esperaba un MensajeSoporteInvalidoError');
  };

  describe('crear', () => {
    it('debería nacer pendiente, sin intentos ni datos de envío', () => {
      // Act
      const mensaje = crear();

      // Assert
      expect(mensaje.tenantId).toBe(TENANT);
      expect(mensaje.usuarioId).toBe(USUARIO);
      expect(mensaje.categoria).toBe(CategoriaSoporte.PROBLEMA);
      expect(mensaje.estadoEnvio).toBe(EstadoEnvioSoporte.PENDIENTE);
      expect(mensaje.estaPendiente()).toBe(true);
      expect(mensaje.intentos).toBe(0);
      expect(mensaje.ultimoError).toBeNull();
      expect(mensaje.proveedor).toBeNull();
      expect(mensaje.proveedorMensajeId).toBeNull();
      expect(mensaje.enviadoEn).toBeNull();
    });

    it('id, creadoEn y proximoIntentoEn los pone la base: todavía no existen', () => {
      // Act
      const mensaje = crear();

      // Assert
      expect(mensaje.estaGuardado()).toBe(false);
      expect(mensaje.id).toBeUndefined();
      expect(mensaje.creadoEn).toBeUndefined();
      expect(mensaje.proximoIntentoEn).toBeUndefined();
    });

    it('debería recortar solo los extremos del texto (conserva los saltos de línea internos)', () => {
      // Act
      const mensaje = crear({
        mensaje: '  \n Hola,\n\nno carga la agenda.  \t',
      });

      // Assert
      expect(mensaje.mensaje).toBe('Hola,\n\nno carga la agenda.');
    });

    it.each([undefined, null])(
      'con categoría %s debería quedar en otro (T12)',
      (categoria) => {
        expect(crear({ categoria }).categoria).toBe(CategoriaSoporte.OTRO);
      },
    );

    it.each(Object.values(CategoriaSoporte))(
      'debería aceptar la categoría %s',
      (categoria) => {
        expect(crear({ categoria }).categoria).toBe(categoria);
      },
    );

    it('debería rechazar una categoría fuera de las cuatro', () => {
      // Act
      const error = errorDe(() =>
        crear({ categoria: 'urgente' as CategoriaSoporte }),
      );

      // Assert
      expect(error).toBeInstanceOf(MensajeSoporteInvalidoError);
      expect(error.campo).toBe('categoria');
    });

    it.each(['', '   ', '\n\t  \n'])(
      'debería rechazar un texto en blanco (%j)',
      (texto) => {
        const error = errorDe(() => crear({ mensaje: texto }));
        expect(error).toBeInstanceOf(MensajeSoporteInvalidoError);
        expect(error.campo).toBe('mensaje');
      },
    );

    it('debería aceptar 1 y 2000 caracteres', () => {
      expect(crear({ mensaje: 'x' }).mensaje).toBe('x');
      expect(
        crear({ mensaje: 'a'.repeat(LARGO_MAXIMO_MENSAJE_SOPORTE) }).mensaje,
      ).toHaveLength(2000);
    });

    it('debería medir el largo DESPUÉS de recortar', () => {
      // Arrange — 2000 caracteres útiles rodeados de espacios
      const texto = `   ${'a'.repeat(2000)}   `;

      // Act + Assert
      expect(crear({ mensaje: texto }).mensaje).toHaveLength(2000);
    });

    it('debería rechazar 2001 caracteres', () => {
      const error = errorDe(() => crear({ mensaje: 'a'.repeat(2001) }));
      expect(error).toBeInstanceOf(MensajeSoporteInvalidoError);
      expect(error.campo).toBe('mensaje');
    });

    it('cuenta unidades UTF-16, como el DTO: 1000 emojis (2000 unidades) pasan y 1001 no', () => {
      // `char_length` del CHECK cuenta 1000: lo que pasa aquí pasa la base.
      expect(() => crear({ mensaje: '😀'.repeat(1000) })).not.toThrow();
      expect(errorDe(() => crear({ mensaje: '😀'.repeat(1001) })).campo).toBe(
        'mensaje',
      );
    });

    it('el error NUNCA repite el texto recibido', () => {
      // Arrange — un texto con datos que no deben terminar en un log
      const texto = `Paciente Juan Pérez RUT 12.345.678-5 ${'x'.repeat(2000)}`;

      // Act
      const error = errorDe(() => crear({ mensaje: texto }));

      // Assert
      expect(error.message).not.toContain('Juan');
      expect(error.message).not.toContain('12.345.678-5');
    });

    it('debería rechazar un texto que no es string (llegó sin tipo)', () => {
      const error = errorDe(() => crear({ mensaje: 42 as unknown as string }));
      expect(error.campo).toBe('mensaje');
    });
  });

  describe('reconstituir', () => {
    const datos: DatosMensajeSoporte = {
      id: '5e000000-0000-4000-8000-000000000001',
      tenantId: TENANT,
      usuarioId: USUARIO,
      categoria: CategoriaSoporte.CONSULTA,
      mensaje: '  texto tal cual  ',
      estadoEnvio: EstadoEnvioSoporte.ENVIADO,
      intentos: 2,
      proximoIntentoEn: new Date('2026-10-31T12:00:00.000Z'),
      ultimoError: 'resend_500',
      proveedor: 'resend',
      proveedorMensajeId: 'msg_1',
      enviadoEn: new Date('2026-10-31T12:01:00.000Z'),
      creadoEn: new Date('2026-10-31T11:59:00.000Z'),
    };

    it('debería devolver la fila tal cual, sin validar ni recortar', () => {
      // Act
      const mensaje = MensajeSoporte.reconstituir(datos);

      // Assert
      expect({
        id: mensaje.id,
        tenantId: mensaje.tenantId,
        usuarioId: mensaje.usuarioId,
        categoria: mensaje.categoria,
        mensaje: mensaje.mensaje,
        estadoEnvio: mensaje.estadoEnvio,
        intentos: mensaje.intentos,
        proximoIntentoEn: mensaje.proximoIntentoEn,
        ultimoError: mensaje.ultimoError,
        proveedor: mensaje.proveedor,
        proveedorMensajeId: mensaje.proveedorMensajeId,
        enviadoEn: mensaje.enviadoEn,
        creadoEn: mensaje.creadoEn,
      }).toEqual(datos);
      expect(mensaje.estaGuardado()).toBe(true);
      expect(mensaje.estaPendiente()).toBe(false);
    });

    it('no debería compartir el objeto recibido', () => {
      // Arrange
      const copia = { ...datos };
      const mensaje = MensajeSoporte.reconstituir(copia);

      // Act
      copia.estadoEnvio = EstadoEnvioSoporte.FALLIDO;

      // Assert
      expect(mensaje.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
    });
  });

  // ---------------------------------------------------------------------------
  describe('transiciones del envío', () => {
    const MIN = 60_000;
    const AHORA = new Date('2026-10-31T15:00:00.000Z');
    const CREADO = new Date('2026-10-31T14:59:00.000Z');
    /** Sin variación: la espera es la nominal de la política. */
    const SIN_AZAR = (): number => 0;

    /** Un mensaje guardado y pendiente, como lo devuelve el reclamo. */
    const pendiente = (
      extra: Partial<DatosMensajeSoporte> = {},
    ): MensajeSoporte =>
      MensajeSoporte.reconstituir({
        id: '5e000000-0000-4000-8000-000000000009',
        tenantId: TENANT,
        usuarioId: USUARIO,
        categoria: CategoriaSoporte.PROBLEMA,
        mensaje: 'No carga la agenda',
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

    describe('marcarEnviado', () => {
      it('aceptado: enviado con enviadoEn, proveedor e id; suma el intento', () => {
        // Arrange
        const mensaje = pendiente({ intentos: 2, ultimoError: 'rate_limit' });

        // Act
        mensaje.marcarEnviado('resend', 'msg_123', AHORA);

        // Assert
        expect(mensaje.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
        expect(mensaje.estaPendiente()).toBe(false);
        expect(mensaje.enviadoEn).toEqual(AHORA);
        expect(mensaje.proveedor).toBe('resend');
        expect(mensaje.proveedorMensajeId).toBe('msg_123');
        expect(mensaje.intentos).toBe(3);
        // El último fallo queda como historial
        expect(mensaje.ultimoError).toBe('rate_limit');
      });

      it('posible duplicado: enviado sin id del proveedor', () => {
        // Arrange
        const mensaje = pendiente();

        // Act
        mensaje.marcarEnviado('resend', null, AHORA);

        // Assert
        expect(mensaje.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
        expect(mensaje.enviadoEn).toEqual(AHORA);
        expect(mensaje.proveedorMensajeId).toBeNull();
      });

      it('no comparte la fecha recibida', () => {
        // Arrange
        const mensaje = pendiente();
        const ahora = new Date(AHORA.getTime());

        // Act
        mensaje.marcarEnviado('registro', 'reg_1', ahora);
        ahora.setTime(0);

        // Assert
        expect(mensaje.enviadoEn).toEqual(AHORA);
      });
    });

    describe('registrarFallo', () => {
      it('suma intentos con la espera de la política (1, 2, 4, 8, 16, 32, 60 min) y pasa a fallido al OCTAVO', () => {
        // Arrange
        const mensaje = pendiente();
        const esperasMin: number[] = [];

        // Act — siete fallos que se reintentan…
        for (let i = 1; i <= 7; i++) {
          mensaje.registrarFallo(
            'application_error',
            AHORA,
            POLITICA_REINTENTO_SOPORTE,
            SIN_AZAR,
          );
          expect(mensaje.estaPendiente()).toBe(true);
          expect(mensaje.intentos).toBe(i);
          esperasMin.push(
            (mensaje.proximoIntentoEn.getTime() - AHORA.getTime()) / MIN,
          );
        }
        const proximoAntes = mensaje.proximoIntentoEn;

        // …y el octavo lo da por perdido
        mensaje.registrarFallo(
          'application_error',
          AHORA,
          POLITICA_REINTENTO_SOPORTE,
          SIN_AZAR,
        );

        // Assert
        expect(esperasMin).toEqual([1, 2, 4, 8, 16, 32, 60]);
        expect(mensaje.estadoEnvio).toBe(EstadoEnvioSoporte.FALLIDO);
        expect(mensaje.intentos).toBe(8);
        expect(mensaje.ultimoError).toBe('application_error');
        expect(mensaje.proximoIntentoEn).toEqual(proximoAntes);
        expect(mensaje.enviadoEn).toBeNull();
      });

      it('la variación solo acorta la espera', () => {
        // Arrange
        const mensaje = pendiente();

        // Act — azar 0,5 con variación 0,2 → 90 % de la nominal (1 min)
        mensaje.registrarFallo(
          'timeout',
          AHORA,
          POLITICA_REINTENTO_SOPORTE,
          () => 0.5,
        );

        // Assert
        expect(mensaje.proximoIntentoEn.getTime() - AHORA.getTime()).toBe(
          54_000,
        );
      });

      it('un código vacío queda como "desconocido"', () => {
        // Arrange
        const mensaje = pendiente();

        // Act
        mensaje.registrarFallo(
          '  ',
          AHORA,
          POLITICA_REINTENTO_SOPORTE,
          SIN_AZAR,
        );

        // Assert
        expect(mensaje.ultimoError).toBe('desconocido');
      });

      it('rechaza una política inválida sin tocar el mensaje', () => {
        // Arrange
        const mensaje = pendiente();

        // Act + Assert
        expect(() =>
          mensaje.registrarFallo(
            'x',
            AHORA,
            { ...POLITICA_REINTENTO_SOPORTE, maxIntentos: Number.NaN },
            SIN_AZAR,
          ),
        ).toThrow(/Política de reintento inválida/);
        expect(mensaje.intentos).toBe(0);
        expect(mensaje.ultimoError).toBeNull();
      });
    });

    describe('posponer', () => {
      it('mueve el próximo intento SIN sumar intento ni cambiar el estado', () => {
        // Arrange
        const mensaje = pendiente({ intentos: 3 });
        const hasta = new Date(AHORA.getTime() + 60 * MIN);

        // Act
        mensaje.posponer(hasta);

        // Assert
        expect(mensaje.proximoIntentoEn).toEqual(hasta);
        expect(mensaje.intentos).toBe(3);
        expect(mensaje.estaPendiente()).toBe(true);
        expect(mensaje.ultimoError).toBeNull();
      });
    });

    describe('marcarFallido', () => {
      it('fallido sin reintento, con el código; suma el intento', () => {
        // Arrange
        const mensaje = pendiente({ intentos: 1 });

        // Act
        mensaje.marcarFallido('validation_error:to');

        // Assert
        expect(mensaje.estadoEnvio).toBe(EstadoEnvioSoporte.FALLIDO);
        expect(mensaje.ultimoError).toBe('validation_error:to');
        expect(mensaje.intentos).toBe(2);
        expect(mensaje.enviadoEn).toBeNull();
      });
    });

    describe('nada sale de enviado ni de fallido', () => {
      const transiciones: [string, (m: MensajeSoporte) => void][] = [
        ['marcarEnviado', (m) => m.marcarEnviado('resend', 'msg_9', AHORA)],
        [
          'registrarFallo',
          (m) =>
            m.registrarFallo('x', AHORA, POLITICA_REINTENTO_SOPORTE, SIN_AZAR),
        ],
        ['posponer', (m) => m.posponer(AHORA)],
        ['marcarFallido', (m) => m.marcarFallido('x')],
      ];
      const finales: [EstadoEnvioSoporte, Partial<DatosMensajeSoporte>][] = [
        [
          EstadoEnvioSoporte.ENVIADO,
          {
            estadoEnvio: EstadoEnvioSoporte.ENVIADO,
            enviadoEn: CREADO,
            proveedor: 'resend',
            proveedorMensajeId: 'msg_1',
            intentos: 1,
          },
        ],
        [
          EstadoEnvioSoporte.FALLIDO,
          {
            estadoEnvio: EstadoEnvioSoporte.FALLIDO,
            ultimoError: 'resend_422',
            intentos: 1,
          },
        ],
      ];

      for (const [estado, datosFinal] of finales) {
        it.each(transiciones)(
          `${estado}: %s lanza y no cambia nada`,
          (_nombre, aplicar) => {
            // Arrange
            const mensaje = pendiente(datosFinal);
            const antes = {
              estadoEnvio: mensaje.estadoEnvio,
              intentos: mensaje.intentos,
              proximoIntentoEn: mensaje.proximoIntentoEn,
              ultimoError: mensaje.ultimoError,
              enviadoEn: mensaje.enviadoEn,
            };

            // Act + Assert
            expect(() => aplicar(mensaje)).toThrow(
              TransicionEnvioSoporteInvalidaError,
            );
            expect({
              estadoEnvio: mensaje.estadoEnvio,
              intentos: mensaje.intentos,
              proximoIntentoEn: mensaje.proximoIntentoEn,
              ultimoError: mensaje.ultimoError,
              enviadoEn: mensaje.enviadoEn,
            }).toEqual(antes);
          },
        );
      }
    });

    it.each([
      [
        'marcarEnviado',
        (m: MensajeSoporte, f: Date) => m.marcarEnviado('r', null, f),
      ],
      [
        'registrarFallo',
        (m: MensajeSoporte, f: Date) =>
          m.registrarFallo('x', f, POLITICA_REINTENTO_SOPORTE, SIN_AZAR),
      ],
      ['posponer', (m: MensajeSoporte, f: Date) => m.posponer(f)],
    ])('%s rechaza una fecha inválida sin tocar el mensaje', (_n, aplicar) => {
      // Arrange
      const mensaje = pendiente();

      // Act + Assert
      expect(() => aplicar(mensaje, new Date(Number.NaN))).toThrow(RangeError);
      expect(mensaje.estaPendiente()).toBe(true);
      expect(mensaje.intentos).toBe(0);
      expect(mensaje.proximoIntentoEn).toEqual(CREADO);
    });
  });
});
