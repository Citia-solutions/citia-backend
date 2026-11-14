import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CrearCitaDto } from '../../../cita/presentation/dto/crear-cita.dto';
import { CrearPacienteDto } from './crear-paciente.dto';
import { MENSAJE_VERSION_TERMINOS_NO_VIGENTE } from './version-terminos.decorator';

const valido = {
  rut: '12.345.678-5',
  nombre: 'Ana Soto',
  telefono: '+56 9 1111 1111',
  correo: 'ana@mail.com',
  consentimiento: true,
  terminosVersion: '1.0',
};

// Transforma y valida como el ValidationPipe global (whitelist + transform).
const transformar = (body: Record<string, unknown>): CrearPacienteDto =>
  plainToInstance(CrearPacienteDto, body);

const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const resultado = await validate(transformar(body), { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('CrearPacienteDto', () => {
  it('debería aceptar el cuerpo del contrato', async () => {
    expect(await errores(valido)).toEqual({});
  });

  describe('correo (obligatorio desde ADR-13 §14)', () => {
    it('debería rechazar el cuerpo sin correo', async () => {
      // Arrange
      const sinCorreo: Record<string, unknown> = { ...valido };
      delete sinCorreo.correo;

      // Act
      const result = await errores(sinCorreo);

      // Assert
      expect(result.correo).toEqual(
        expect.arrayContaining(['isEmail', 'isNotEmpty']),
      );
    });

    it.each([null, '', '   '])('debería rechazar correo %p', async (correo) => {
      expect((await errores({ ...valido, correo })).correo).toContain(
        'isEmail',
      );
    });

    it.each(['no-es-correo', 'ana@', '@mail.com', 'ana mail@mail.com', 42])(
      'debería rechazar el formato inválido %p',
      async (correo) => {
        expect((await errores({ ...valido, correo })).correo).toContain(
          'isEmail',
        );
      },
    );

    it('debería rechazar un correo de más de 254 caracteres', async () => {
      // Arrange — local de 64 (el máximo) y dominio largo, total 255
      const local = 'a'.repeat(64);
      const dominio = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(59)}.cl`;
      const correo = `${local}@${dominio}`;
      expect(correo).toHaveLength(255);

      // Act
      const result = await errores({ ...valido, correo });

      // Assert
      expect(result.correo).toEqual(expect.arrayContaining(['maxLength']));
    });

    it('debería normalizar el correo (trim + minúsculas) antes de validar', async () => {
      // Arrange
      const body = { ...valido, correo: '  Ana.Soto@Mail.CL  ' };

      // Act
      const dto = transformar(body);

      // Assert — pasa la validación y queda canónico
      expect(await errores(body)).toEqual({});
      expect(dto.correo).toBe('ana.soto@mail.cl');
    });

    it('debería dejar pasar sin tocar lo que no es texto (lo rechaza @IsEmail)', () => {
      expect(transformar({ ...valido, correo: 42 }).correo).toBe(42);
    });
  });

  describe('autorización y versión de los términos (US-11, D6)', () => {
    // Mensajes de `campo`, como los arma el ValidationPipe.
    const mensajes = async (
      body: Record<string, unknown>,
      campo: string,
    ): Promise<string[]> => {
      const resultado = await validate(transformar(body), { whitelist: true });
      return resultado
        .filter((e) => e.property === campo)
        .flatMap((e) => Object.values(e.constraints ?? {}));
    };

    it.each([false, 'true', 1, null])(
      'debería rechazar consentimiento %p',
      async (consentimiento) => {
        expect(
          await mensajes({ ...valido, consentimiento }, 'consentimiento'),
        ).toEqual(['Se necesita la autorización del paciente']);
      },
    );

    it('debería rechazar el cuerpo sin consentimiento', async () => {
      const sinConsentimiento: Record<string, unknown> = { ...valido };
      delete sinConsentimiento.consentimiento;
      expect(await mensajes(sinConsentimiento, 'consentimiento')).toHaveLength(
        1,
      );
    });

    it.each([undefined, null, '', '0.2', '9.9', 1, ' 1.0'])(
      'debería rechazar terminosVersion %p con el mensaje fijo',
      async (terminosVersion) => {
        const lista = await mensajes(
          { ...valido, terminosVersion },
          'terminosVersion',
        );
        expect(lista.length).toBeGreaterThan(0);
        expect(new Set(lista)).toEqual(
          new Set([MENSAJE_VERSION_TERMINOS_NO_VIGENTE]),
        );
      },
    );

    it('debería exigir la versión también en el paciente en línea de POST /citas', async () => {
      // Arrange
      const sinVersion: Record<string, unknown> = { ...valido };
      delete sinVersion.terminosVersion;
      const dto = plainToInstance(CrearCitaDto, {
        inicio: '2026-10-05T13:00:00Z',
        duracionMin: 30,
        tipoConsulta: 'Control',
        paciente: sinVersion,
      });

      // Act
      const [error] = await validate(dto, { whitelist: true });

      // Assert
      expect(error.property).toBe('paciente');
      expect(error.children?.map((c) => c.property)).toEqual([
        'terminosVersion',
      ]);
    });
  });

  it('debería seguir aceptando el alta sin RUT', async () => {
    // Arrange
    const sinRut: Record<string, unknown> = { ...valido };
    delete sinRut.rut;

    // Act & Assert
    expect(await errores(sinRut)).toEqual({});
  });
});

describe('CrearCitaDto.paciente (mismo DTO, segunda ruta)', () => {
  const cita = {
    inicio: '2026-10-05T13:00:00Z',
    duracionMin: 30,
    tipoConsulta: 'Control',
  };

  // Errores del paciente anidado: `children` del campo `paciente`.
  const erroresPaciente = async (
    paciente: Record<string, unknown>,
  ): Promise<Record<string, string[]>> => {
    const dto = plainToInstance(CrearCitaDto, { ...cita, paciente });
    const [error] = (await validate(dto, { whitelist: true })).filter(
      (e) => e.property === 'paciente',
    );
    return Object.fromEntries(
      (error?.children ?? []).map((e) => [
        e.property,
        Object.keys(e.constraints ?? {}),
      ]),
    );
  };

  it('debería rechazar el paciente en línea sin correo', async () => {
    // Arrange
    const sinCorreo: Record<string, unknown> = { ...valido };
    delete sinCorreo.correo;

    // Act
    const result = await erroresPaciente(sinCorreo);

    // Assert
    expect(result.correo).toContain('isEmail');
  });

  it('debería normalizar el correo del paciente en línea', async () => {
    // Arrange
    const dto = plainToInstance(CrearCitaDto, {
      ...cita,
      paciente: { ...valido, correo: ' ANA@mail.com ' },
    });

    // Act
    const resultado = await validate(dto, { whitelist: true });

    // Assert
    expect(resultado).toEqual([]);
    expect(dto.paciente?.correo).toBe('ana@mail.com');
  });

  it('NO debería exigir correo cuando la cita usa pacienteId', async () => {
    // Arrange
    const dto = plainToInstance(CrearCitaDto, {
      ...cita,
      pacienteId: '3f1c2b9e-8a4d-4c7e-9b21-5d6f7a8b9c0d',
    });

    // Act & Assert
    expect(await validate(dto, { whitelist: true })).toEqual([]);
  });
});
