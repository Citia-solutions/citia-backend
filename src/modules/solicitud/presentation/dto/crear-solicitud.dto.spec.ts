import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MENSAJE_VERSION_TERMINOS_NO_VIGENTE } from '../../../paciente/presentation/dto/version-terminos.decorator';
import { CrearSolicitudDto } from './crear-solicitud.dto';

/**
 * El formulario público (US-11, ADR-16 §5): `consentimiento` tiene que ser
 * `true` y `terminosVersion`, una versión del catálogo que recibe
 * aceptaciones. Los dos se rechazan con el 400 del `ValidationPipe`, antes de
 * buscar la organización (el 202 sigue uniforme).
 */
const valido = {
  rut: '11.111.111-1',
  nombrePaciente: 'Paciente Público',
  telefono: '+56 9 5555 5555',
  correo: 'publico@mail.com',
  motivo: 'Control',
  preferenciaHoraria: 'mañanas',
  consentimiento: true,
  terminosVersion: '1.0',
};

// Mensajes por campo, como los arma el ValidationPipe (whitelist + transform).
const mensajes = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const resultado = await validate(plainToInstance(CrearSolicitudDto, body), {
    whitelist: true,
  });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.values(e.constraints ?? {})]),
  );
};

describe('CrearSolicitudDto', () => {
  it('debería aceptar el cuerpo con consentimiento y la versión vigente', async () => {
    expect(await mensajes(valido)).toEqual({});
  });

  it.each([false, 'true', null, undefined])(
    'debería rechazar consentimiento %p',
    async (consentimiento) => {
      expect(
        (await mensajes({ ...valido, consentimiento })).consentimiento,
      ).toEqual(['Debes aceptar los términos de uso y el aviso de privacidad']);
    },
  );

  it.each([undefined, null, '', '0.2', '9.9', 1])(
    'debería rechazar terminosVersion %p con el mensaje fijo',
    async (terminosVersion) => {
      const lista = (await mensajes({ ...valido, terminosVersion }))
        .terminosVersion;
      expect(lista.length).toBeGreaterThan(0);
      expect(new Set(lista)).toEqual(
        new Set([MENSAJE_VERSION_TERMINOS_NO_VIGENTE]),
      );
    },
  );
});
