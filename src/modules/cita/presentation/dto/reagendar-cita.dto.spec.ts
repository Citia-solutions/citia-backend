import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReagendarCitaDto } from './reagendar-cita.dto';

const INICIO = '2026-10-22T15:00:00-03:00';

const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const dto = plainToInstance(ReagendarCitaDto, body);
  const resultado = await validate(dto, { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.values(e.constraints ?? {})]),
  );
};

describe('ReagendarCitaDto — pedidoPor (US-07.01, H3)', () => {
  it.each<[string, Record<string, unknown>]>([
    ['paciente', { pedidoPor: 'paciente' }],
    ['profesional', { pedidoPor: 'profesional' }],
    ['ausente', {}],
    ['null', { pedidoPor: null }],
  ])('acepta pedidoPor %s', async (_caso, extra) => {
    expect(await errores({ inicio: INICIO, ...extra })).toEqual({});
  });

  it.each<[string, unknown]>([
    ['sistema', 'sistema'],
    ['vacío', ''],
    ['en mayúsculas', 'PACIENTE'],
    ['un número', 1],
    ['un objeto', { valor: 'paciente' }],
  ])('rechaza pedidoPor %s', async (_caso, valor) => {
    expect(
      (await errores({ inicio: INICIO, pedidoPor: valor })).pedidoPor,
    ).toEqual(['pedidoPor debe ser "paciente" o "profesional"']);
  });

  it('inicio sigue siendo obligatorio', async () => {
    expect(await errores({ pedidoPor: 'paciente' })).toHaveProperty('inicio');
  });
});
