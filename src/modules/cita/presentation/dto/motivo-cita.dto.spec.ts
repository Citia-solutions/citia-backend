import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PedidoPor } from '../../domain/cambio-cita.entity';
import { MotivoCitaDto } from './motivo-cita.dto';

const errores = async (
  body: Record<string, unknown>,
): Promise<Record<string, string[]>> => {
  const dto = plainToInstance(MotivoCitaDto, body);
  const resultado = await validate(dto, { whitelist: true });
  return Object.fromEntries(
    resultado.map((e) => [e.property, Object.values(e.constraints ?? {})]),
  );
};

describe('MotivoCitaDto — pedidoPor (US-07.01, H3)', () => {
  it.each<[string, Record<string, unknown>]>([
    ['paciente', { pedidoPor: 'paciente' }],
    ['profesional', { pedidoPor: 'profesional' }],
    ['ausente', {}],
    ['null', { pedidoPor: null }],
    ['con motivo', { motivo: 'Avisó por teléfono', pedidoPor: 'paciente' }],
  ])('acepta pedidoPor %s', async (_caso, body) => {
    expect(await errores(body)).toEqual({});
  });

  it.each<[string, unknown]>([
    ['sistema', 'sistema'],
    ['vacío', ''],
    ['en mayúsculas', 'PACIENTE'],
    ['un número', 1],
    ['un objeto', { valor: 'paciente' }],
  ])(
    'rechaza pedidoPor %s con el mensaje del contrato',
    async (_caso, valor) => {
      expect((await errores({ pedidoPor: valor })).pedidoPor).toEqual([
        'pedidoPor debe ser "paciente" o "profesional"',
      ]);
    },
  );

  it('los valores del enum son los del contrato', () => {
    expect(Object.values(PedidoPor)).toEqual(['paciente', 'profesional']);
  });
});
