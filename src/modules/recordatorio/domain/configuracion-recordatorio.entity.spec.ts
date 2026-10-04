import {
  ANTELACIONES_PREDETERMINADAS_MIN,
  ConfiguracionRecordatorio,
  PropsConfiguracionRecordatorio,
} from './configuracion-recordatorio.entity';
import { ConfiguracionRecordatorioGuardada } from './configuracion-recordatorio.repository';
import { ConfiguracionRecordatorioInvalidaError } from './exceptions/configuracion-recordatorio-invalida.error';
import { CanalRecordatorio } from './recordatorio.entity';

const BASE: PropsConfiguracionRecordatorio = {
  tenantId: 'tenant-1',
  usuarioId: 'usuario-1',
  activo: true,
  antelacionesMin: [120, 1440],
};

function crear(
  cambios: Partial<PropsConfiguracionRecordatorio> = {},
): ConfiguracionRecordatorio {
  return ConfiguracionRecordatorio.crear({ ...BASE, ...cambios });
}

describe('ConfiguracionRecordatorio (ADR-13 §3)', () => {
  describe('predeterminada', () => {
    it('debería estar activa, a las 24 h y 2 h, sin contacto y sin fila', () => {
      // Act
      const c = ConfiguracionRecordatorio.predeterminada(
        'tenant-1',
        'usuario-1',
      );

      // Assert
      expect(c).toMatchObject({
        id: null,
        activo: true,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [1440, 120],
        telefonoContacto: null,
        correoRespuesta: null,
      });
      expect(c.esPredeterminada).toBe(true);
      expect(ANTELACIONES_PREDETERMINADAS_MIN).toEqual([1440, 120]);
    });

    it('debería usar las antelaciones del entorno cuando se le pasan', () => {
      // Act
      const c = ConfiguracionRecordatorio.predeterminada('t', 'u', [60, 2880]);

      // Assert
      expect(c.antelacionesMin).toEqual([2880, 60]);
    });

    it('debería rechazar antelaciones del entorno inválidas', () => {
      // Act & Assert
      expect(() =>
        ConfiguracionRecordatorio.predeterminada('t', 'u', [10]),
      ).toThrow(ConfiguracionRecordatorioInvalidaError);
    });
  });

  describe('crear: antelaciones', () => {
    it('debería ordenarlas de mayor a menor', () => {
      // Act & Assert
      expect(
        crear({ antelacionesMin: [30, 10_080, 600] }).antelacionesMin,
      ).toEqual([10_080, 600, 30]);
    });

    it.each([
      ['ninguna', []],
      ['más de 3', [60, 120, 180, 240]],
      ['menos de 30 min', [29]],
      ['más de 7 días', [10_081]],
      ['decimales', [90.5]],
      ['repetidas', [120, 120]],
      ['NaN', [Number.NaN]],
    ])('debería rechazar %s', (_caso, antelacionesMin) => {
      // Act
      let error: unknown;
      try {
        crear({ antelacionesMin });
      } catch (e) {
        error = e;
      }

      // Assert
      expect(error).toBeInstanceOf(ConfiguracionRecordatorioInvalidaError);
      expect((error as ConfiguracionRecordatorioInvalidaError).campo).toBe(
        'antelacionesMin',
      );
      expect((error as Error).name).toBe(
        'ConfiguracionRecordatorioInvalidaError',
      );
    });

    it.each([[[30]], [[10_080]], [[30, 60, 10_080]]])(
      'debería aceptar los extremos %p',
      (antelacionesMin) => {
        // Act & Assert
        expect(() => crear({ antelacionesMin })).not.toThrow();
      },
    );
  });

  describe('crear: canal y activo', () => {
    it('debería usar email por defecto y aceptar apagada', () => {
      // Act
      const c = crear({ activo: false });

      // Assert
      expect(c.canal).toBe(CanalRecordatorio.EMAIL);
      expect(c.activo).toBe(false);
    });

    it('debería rechazar otro canal', () => {
      // Act & Assert
      expect(() =>
        crear({ canal: 'whatsapp' as unknown as CanalRecordatorio }),
      ).toThrow(/canal/);
    });

    it('debería rechazar un activo que no es booleano', () => {
      // Act & Assert
      expect(() => crear({ activo: 'si' as unknown as boolean })).toThrow(
        ConfiguracionRecordatorioInvalidaError,
      );
    });
  });

  describe('crear: contacto', () => {
    it('debería normalizar el correo de respuesta y recortar el teléfono', () => {
      // Act
      const c = crear({
        telefonoContacto: '  +56 9 1234 5678 ',
        correoRespuesta: '  Consulta@Clinica.CL ',
      });

      // Assert
      expect(c.telefonoContacto).toBe('+56 9 1234 5678');
      expect(c.correoRespuesta).toBe('consulta@clinica.cl');
    });

    it.each(['', '   ', null, undefined])(
      'debería tratar %p como "sin contacto"',
      (vacio) => {
        // Act
        const c = crear({ telefonoContacto: vacio, correoRespuesta: vacio });

        // Assert
        expect(c.telefonoContacto).toBeNull();
        expect(c.correoRespuesta).toBeNull();
      },
    );

    it('debería rechazar un teléfono de más de 30 caracteres', () => {
      // Act & Assert
      expect(() => crear({ telefonoContacto: '1'.repeat(31) })).toThrow(
        /telefonoContacto/,
      );
      expect(() => crear({ telefonoContacto: '1'.repeat(30) })).not.toThrow();
    });

    it.each(['sin-arroba', 'a@b', 'dos @espacios.cl', 'Ana <ana@x.cl>'])(
      'debería rechazar el correo %p sin repetirlo en el mensaje',
      (correo) => {
        // Act
        let error: unknown;
        try {
          crear({ correoRespuesta: correo });
        } catch (e) {
          error = e;
        }

        // Assert
        expect((error as ConfiguracionRecordatorioInvalidaError).campo).toBe(
          'correoRespuesta',
        );
        expect((error as Error).message).not.toContain(correo.trim());
      },
    );
  });

  describe('reconstituir', () => {
    it('debería conservar la fila tal cual, sin validar', () => {
      // Arrange
      const guardada: ConfiguracionRecordatorioGuardada = {
        id: 'cfg-1',
        tenantId: 'tenant-1',
        usuarioId: 'usuario-1',
        activo: false,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [120, 1440],
        telefonoContacto: '+56 2 2222 2222',
        correoRespuesta: 'consulta@clinica.cl',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      };

      // Act
      const c = ConfiguracionRecordatorio.reconstituir(guardada);

      // Assert
      expect(c.esPredeterminada).toBe(false);
      expect(c.aDatos()).toEqual({
        tenantId: 'tenant-1',
        usuarioId: 'usuario-1',
        activo: false,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [120, 1440],
        telefonoContacto: '+56 2 2222 2222',
        correoRespuesta: 'consulta@clinica.cl',
      });
    });
  });
});
