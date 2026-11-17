import {
  AceptacionTerminos,
  CanalAceptacion,
  RegistrarAceptacionProps,
} from './aceptacion-terminos.entity';
import { VersionTerminosNoVigenteError } from './exceptions/version-terminos-no-vigente.error';
import { VersionTerminosPaciente } from './terminos-paciente';

describe('AceptacionTerminos.registrar (US-11, ADR-16 §3)', () => {
  const ACEPTADA_EN = new Date('2026-11-14T15:00:00.000Z');
  const base = {
    tenantId: 'tenant-1',
    pacienteId: 'paciente-1',
    version: '1.0',
    aceptadaEn: ACEPTADA_EN,
  };

  const formulario: RegistrarAceptacionProps = {
    ...base,
    canal: CanalAceptacion.FORMULARIO_PUBLICO,
    solicitudId: 'solicitud-1',
  };
  const enlace: RegistrarAceptacionProps = {
    ...base,
    canal: CanalAceptacion.ENLACE_CITA,
    enlaceId: 'enlace-1',
  };
  const profesional: RegistrarAceptacionProps = {
    ...base,
    canal: CanalAceptacion.PROFESIONAL,
    usuarioId: 'usuario-1',
  };

  it.each<[string, RegistrarAceptacionProps, object]>([
    [
      'formulario_publico',
      formulario,
      { solicitudId: 'solicitud-1', enlaceId: null, usuarioId: null },
    ],
    [
      'enlace_cita',
      enlace,
      { solicitudId: null, enlaceId: 'enlace-1', usuarioId: null },
    ],
    [
      'profesional',
      profesional,
      { solicitudId: null, enlaceId: null, usuarioId: 'usuario-1' },
    ],
  ])(
    '%s: su referencia y las otras en null (no undefined)',
    (_n, props, referencias) => {
      // Act
      const aceptacion = AceptacionTerminos.registrar(props);

      // Assert
      expect(aceptacion).toBeInstanceOf(AceptacionTerminos);
      expect(aceptacion).toMatchObject({
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        version: '1.0',
        canal: props.canal,
        aceptadaEn: ACEPTADA_EN,
        ...referencias,
      });
      // Sin id ni registradaEn: los pone la base.
      expect(aceptacion.id).toBeUndefined();
      expect(aceptacion.registradaEn).toBeUndefined();
    },
  );

  describe('la versión según el canal', () => {
    // La 1.0 ya no recibe aceptaciones (paso 3 de un cambio de versión).
    const conRetirada: VersionTerminosPaciente[] = [
      { version: '1.0', recibeAceptaciones: false, sigueCubriendo: true },
      { version: '1.1', recibeAceptaciones: true, sigueCubriendo: true },
    ];

    it.each([enlace, profesional])(
      '$canal con una versión que ya no recibe → VersionTerminosNoVigenteError',
      (props) => {
        expect(() => AceptacionTerminos.registrar(props, conRetirada)).toThrow(
          VersionTerminosNoVigenteError,
        );
      },
    );

    it('formulario_publico con una versión conocida que ya no recibe → se registra', () => {
      expect(
        AceptacionTerminos.registrar(formulario, conRetirada).version,
      ).toBe('1.0');
    });

    it.each([formulario, enlace, profesional])(
      '$canal con una versión desconocida → VersionTerminosNoVigenteError',
      (props) => {
        expect(() =>
          AceptacionTerminos.registrar({ ...props, version: '9.9' }),
        ).toThrow(VersionTerminosNoVigenteError);
      },
    );

    it.each(['', undefined, null])(
      'versión %p → VersionTerminosNoVigenteError',
      (version) => {
        expect(() =>
          AceptacionTerminos.registrar({
            ...profesional,
            version: version as unknown as string,
          }),
        ).toThrow(VersionTerminosNoVigenteError);
      },
    );

    it('el mensaje no repite la versión recibida', () => {
      // Act
      let mensaje = '';
      try {
        AceptacionTerminos.registrar({ ...enlace, version: '7.3' });
      } catch (error) {
        mensaje = (error as Error).message;
      }

      // Assert
      expect(mensaje).not.toBe('');
      expect(mensaje).not.toContain('7.3');
    });
  });

  describe('invariantes de quien llama (RangeError)', () => {
    it.each<[string, RegistrarAceptacionProps]>([
      ['solicitudId vacía', { ...formulario, solicitudId: '  ' }],
      [
        'enlaceId ausente',
        { ...enlace, enlaceId: undefined as unknown as string },
      ],
      ['usuarioId vacío', { ...profesional, usuarioId: '' }],
    ])('%s', (_n, props) => {
      expect(() => AceptacionTerminos.registrar(props)).toThrow(RangeError);
    });

    it('canal desconocido', () => {
      expect(() =>
        AceptacionTerminos.registrar({
          ...profesional,
          canal: 'correo' as CanalAceptacion.PROFESIONAL,
        }),
      ).toThrow(RangeError);
    });

    it('aceptadaEn inválida', () => {
      expect(() =>
        AceptacionTerminos.registrar({
          ...profesional,
          aceptadaEn: new Date('no es una fecha'),
        }),
      ).toThrow(RangeError);
    });
  });
});
