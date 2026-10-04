import { CambioContactoVacioError } from './exceptions/cambio-contacto-vacio.error';
import { CorreoPacienteRequeridoError } from './exceptions/correo-paciente-requerido.error';
import { CrearPacienteProps, Paciente } from './paciente.entity';

describe('Paciente', () => {
  const props: CrearPacienteProps = {
    rut: '123456785',
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
    tenantId: 'tenant-1',
  };

  describe('crear (ADR-13 §14)', () => {
    it('debería crear un paciente nuevo sin id (lo asigna la persistencia)', () => {
      // Act
      const paciente = Paciente.crear(props);

      // Assert
      expect(paciente).toBeInstanceOf(Paciente);
      expect(paciente.id).toBeUndefined();
      expect(paciente).toMatchObject({
        rut: '123456785',
        nombre: 'Ana Soto',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
    });

    it('debería guardar el correo normalizado (sin espacios, en minúsculas)', () => {
      // Act
      const paciente = Paciente.crear({
        ...props,
        correo: '  Ana.Soto@Mail.CL ',
      });

      // Assert
      expect(paciente.correo).toBe('ana.soto@mail.cl');
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['vacío', ''],
      ['en blanco', '   '],
    ])(
      'debería rechazar un correo %s con CorreoPacienteRequeridoError',
      (_caso, correo) => {
        // Act & Assert
        expect(() => Paciente.crear({ ...props, correo })).toThrow(
          CorreoPacienteRequeridoError,
        );
      },
    );

    it('debería admitir un paciente sin RUT (alta manual)', () => {
      // Act
      const paciente = Paciente.crear({ ...props, rut: null });

      // Assert
      expect(paciente.rut).toBeNull();
    });
  });

  describe('reconstituir', () => {
    it('debería aceptar correo NULL (filas anteriores a la Fase 2, opción F4)', () => {
      // Act
      const paciente = Paciente.reconstituir({
        id: 'p1',
        rut: null,
        nombre: 'Ficha vieja',
        telefono: '+56 9 0000 0000',
        correo: null,
        consentimiento: false,
        tenantId: 'tenant-1',
      });

      // Assert
      expect(paciente).toBeInstanceOf(Paciente);
      expect(paciente.id).toBe('p1');
      expect(paciente.correo).toBeNull();
    });

    it('NO debería normalizar lo que viene de la base', () => {
      // Act
      const paciente = Paciente.reconstituir({
        id: 'p1',
        rut: null,
        nombre: 'Ficha vieja',
        telefono: '+56 9 0000 0000',
        correo: 'Ana@Mail.com',
        consentimiento: false,
        tenantId: 'tenant-1',
      });

      // Assert — se devuelve tal cual está guardado
      expect(paciente.correo).toBe('Ana@Mail.com');
    });
  });

  describe('tieneCorreo', () => {
    it.each([
      [null, false],
      [undefined, false],
      ['', false],
      ['   ', false],
      ['ana@mail.com', true],
    ])('con correo %p debería ser %p', (correo, esperado) => {
      expect(Paciente.tieneCorreo({ correo })).toBe(esperado);
    });
  });

  describe('correoParaCompletar (vinculación por RUT)', () => {
    it.each([null, undefined, '', '  '])(
      'debería devolver el correo entrante normalizado cuando el guardado es %p',
      (guardado) => {
        expect(
          Paciente.correoParaCompletar({ correo: guardado }, ' Ana@Mail.com '),
        ).toBe('ana@mail.com');
      },
    );

    it('debería devolver null cuando ya tiene un correo distinto (nunca se reemplaza)', () => {
      expect(
        Paciente.correoParaCompletar(
          { correo: 'otro@mail.com' },
          'ana@mail.com',
        ),
      ).toBeNull();
    });

    it('debería devolver null cuando ya tiene el mismo correo', () => {
      expect(
        Paciente.correoParaCompletar(
          { correo: 'ana@mail.com' },
          'ana@mail.com',
        ),
      ).toBeNull();
    });

    it.each([null, undefined, '', '   '])(
      'debería devolver null cuando el entrante es %p (nada con qué completar)',
      (entrante) => {
        expect(
          Paciente.correoParaCompletar({ correo: null }, entrante),
        ).toBeNull();
      },
    );
  });

  describe('prepararCambioContacto (PATCH)', () => {
    it('debería devolver solo los campos presentes', () => {
      expect(Paciente.prepararCambioContacto({ telefono: '+56 9 2' })).toEqual({
        telefono: '+56 9 2',
      });
    });

    it('debería normalizar el correo', () => {
      expect(
        Paciente.prepararCambioContacto({
          telefono: '+56 9 2',
          correo: ' NUEVO@mail.com ',
        }),
      ).toEqual({ telefono: '+56 9 2', correo: 'nuevo@mail.com' });
    });

    it('debería rechazar un cambio sin campos con CambioContactoVacioError', () => {
      expect(() => Paciente.prepararCambioContacto({})).toThrow(
        CambioContactoVacioError,
      );
    });

    it('debería rechazar un correo en blanco: se puede cambiar, no borrar', () => {
      expect(() => Paciente.prepararCambioContacto({ correo: '  ' })).toThrow(
        CorreoPacienteRequeridoError,
      );
    });
  });
});
