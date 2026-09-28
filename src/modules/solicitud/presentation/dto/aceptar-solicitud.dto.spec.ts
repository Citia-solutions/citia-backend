import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AceptarSolicitudDto } from './aceptar-solicitud.dto';

const valido = {
  inicio: '2026-09-18T10:00:00-03:00',
  duracionMin: 50,
  tipoConsulta: 'Dolor de muela desde el lunes',
};

// Valida como el ValidationPipe global y devuelve los constraints por campo.
const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const dto = plainToInstance(AceptarSolicitudDto, body);
  const resultado = await validate(dto, { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('AceptarSolicitudDto', () => {
  it('debería aceptar el cuerpo del contrato', async () => {
    expect(await errores(valido)).toEqual({});
  });

  describe('inicio (@IsInstanteConZona)', () => {
    it.each([
      '2026-09-18T13:00:00Z',
      '2026-09-18T13:00:00.000Z',
      '2026-09-18T10:00:00-03:00',
      '2026-09-18T10:00:00+05:30',
      '2026-09-18T10:00-03:00',
    ])('debería aceptar "%s" (zona explícita)', async (inicio) => {
      expect(await errores({ ...valido, inicio })).toEqual({});
    });

    it.each(['2026-09-18T10:00:00', '2026-09-18T10:00', '2026-09-18'])(
      'debería rechazar "%s" por no traer zona',
      async (inicio) => {
        // Act
        const result = await errores({ ...valido, inicio });

        // Assert
        expect(result.inicio).toContain('matches');
      },
    );

    it('debería explicar en el mensaje que falta la zona horaria', async () => {
      // Arrange
      const dto = plainToInstance(AceptarSolicitudDto, {
        ...valido,
        inicio: '2026-09-18T10:00:00',
      });

      // Act
      const [error] = await validate(dto);

      // Assert
      expect(error.property).toBe('inicio');
      expect(error.constraints?.matches).toMatch(
        /^inicio debe incluir la zona horaria explícita \(Z o ±HH:MM\)/,
      );
    });

    it.each(['mañana Z', '2026-13-18T10:00:00Z', ''])(
      'debería rechazar "%s" por no ser ISO 8601',
      async (inicio) => {
        // Act
        const result = await errores({ ...valido, inicio });

        // Assert
        expect(result.inicio).toContain('isIso8601');
      },
    );

    it('debería rechazar cuando falta inicio', async () => {
      // Arrange
      const sinInicio: Record<string, unknown> = { ...valido };
      delete sinInicio.inicio;

      // Act & Assert
      expect((await errores(sinInicio)).inicio).toBeDefined();
    });
  });

  describe('duracionMin', () => {
    it('debería aceptar el máximo de 1440 minutos', async () => {
      expect(await errores({ ...valido, duracionMin: 1440 })).toEqual({});
    });

    it('debería rechazar 1441 minutos (@Max)', async () => {
      expect(
        (await errores({ ...valido, duracionMin: 1441 })).duracionMin,
      ).toEqual(['max']);
    });

    it.each([
      [0, 'isPositive'],
      [-5, 'isPositive'],
      [12.5, 'isInt'],
      ['50', 'isInt'],
    ])('debería rechazar %p (%s)', async (duracionMin, constraint) => {
      expect((await errores({ ...valido, duracionMin })).duracionMin).toContain(
        constraint,
      );
    });
  });

  describe('tipoConsulta', () => {
    it.each([
      ['', 'isNotEmpty'],
      [42, 'isString'],
      [undefined, 'isNotEmpty'],
    ])('debería rechazar %p (%s)', async (tipoConsulta, constraint) => {
      expect(
        (await errores({ ...valido, tipoConsulta })).tipoConsulta,
      ).toContain(constraint);
    });
  });
});
