import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { EstadoSolicitud } from '../../domain/solicitud-cita.entity';
import { ListarSolicitudesQueryDto } from './listar-solicitudes-query.dto';

const errores = async (query: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(ListarSolicitudesQueryDto, query);
  const resultado = await validate(dto, { whitelist: true });
  return resultado.flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe('ListarSolicitudesQueryDto', () => {
  it('debería aceptar la query sin estado (el controller aplica "recibida")', async () => {
    expect(await errores({})).toEqual([]);
  });

  it.each(Object.values(EstadoSolicitud))(
    'debería aceptar el estado "%s"',
    async (estado) => {
      expect(await errores({ estado })).toEqual([]);
    },
  );

  it.each(['pendiente', 'RECIBIDA', 'todas'])(
    'debería rechazar el estado "%s"',
    async (estado) => {
      expect(await errores({ estado })).toEqual(['isEnum']);
    },
  );
});
