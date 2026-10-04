import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { EditarCitaDto } from './editar-cita.dto';

const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const dto = plainToInstance(EditarCitaDto, body);
  const resultado = await validate(dto, { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('EditarCitaDto — duracionMin (ADR-11 §2)', () => {
  it('debería aceptar un cuerpo sin duracionMin (es opcional)', async () => {
    expect(await errores({ tipoConsulta: 'Control' })).toEqual({});
  });

  it('debería aceptar exactamente 1440 minutos', async () => {
    expect(await errores({ duracionMin: 1440 })).toEqual({});
  });

  it('debería rechazar 1441 minutos con @Max', async () => {
    expect((await errores({ duracionMin: 1441 })).duracionMin).toEqual(['max']);
  });
});
