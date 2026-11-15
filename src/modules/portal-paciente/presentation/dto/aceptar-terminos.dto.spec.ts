import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MENSAJE_VERSION_TERMINOS_NO_VIGENTE } from '../../../paciente/presentation/dto/version-terminos.decorator';
import { AceptarTerminosDto } from './aceptar-terminos.dto';

/**
 * Cuerpo de `POST /publico/cita/aceptar-terminos` (US-11, ADR-16 §8), como lo
 * valida el `ValidationPipe` global (`transform` + `whitelist`): una versión
 * del catálogo que recibe aceptaciones; si no, el 400 con el mensaje FIJO que
 * busca el frontend para pedir recargar. El pipe corre antes de mirar el
 * token: el 400 no revela nada del enlace.
 */
describe('AceptarTerminosDto', () => {
  const validar = async (
    cuerpo: unknown,
  ): Promise<{ dto: AceptarTerminosDto; mensajes: string[] }> => {
    const dto = plainToInstance(AceptarTerminosDto, cuerpo);
    const errores = await validate(dto, { whitelist: true });
    return {
      dto,
      mensajes: errores.flatMap((e) => Object.values(e.constraints ?? {})),
    };
  };

  it('debería aceptar la versión vigente', async () => {
    // Act
    const { dto, mensajes } = await validar({ terminosVersion: '1.0' });

    // Assert
    expect(mensajes).toEqual([]);
    expect(dto).toEqual({ terminosVersion: '1.0' });
  });

  it.each<[string, Record<string, unknown>]>([
    ['ausente', {}],
    ['null', { terminosVersion: null }],
    ['vacía', { terminosVersion: '' }],
    ['desconocida', { terminosVersion: '9.9' }],
    ['del borrador (nunca publicada)', { terminosVersion: '0.2' }],
    ['con espacios (no se recorta)', { terminosVersion: ' 1.0 ' }],
    ['numérica', { terminosVersion: 1 }],
    ['en una lista', { terminosVersion: ['1.0'] }],
  ])(
    'debería rechazar la versión %s con el mensaje fijo y nada más',
    async (_caso, cuerpo) => {
      // Act
      const { mensajes } = await validar(cuerpo);

      // Assert — solo el mensaje fijo (aunque fallen las dos reglas)
      expect(mensajes.length).toBeGreaterThan(0);
      expect(new Set(mensajes)).toEqual(
        new Set([MENSAJE_VERSION_TERMINOS_NO_VIGENTE]),
      );
    },
  );

  it('el mensaje fijo no repite la versión recibida', async () => {
    // Act
    const { mensajes } = await validar({ terminosVersion: '7.7' });

    // Assert
    expect(mensajes.join(' ')).not.toContain('7.7');
  });

  it('debería quitar cualquier otro campo (whitelist): el cliente no elige paciente, enlace ni canal', async () => {
    // Act
    const { dto, mensajes } = await validar({
      terminosVersion: '1.0',
      pacienteId: 'a0000000-0000-4000-8000-000000000001',
      enlaceId: 'e1000000-0000-4000-8000-000000000001',
      canal: 'profesional',
    });

    // Assert
    expect(mensajes).toEqual([]);
    expect(dto).toEqual({ terminosVersion: '1.0' });
  });
});
