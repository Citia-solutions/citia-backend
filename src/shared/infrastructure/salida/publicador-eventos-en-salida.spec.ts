import { EventosSalidaRepository } from '../../application/eventos-salida.repository';
import { EventoDominio } from '../../application/publicador-eventos';
import { PublicadorEventosEnSalida } from './publicador-eventos-en-salida';

describe('PublicadorEventosEnSalida', () => {
  const evento: EventoDominio = {
    nombre: 'CitaCreada',
    ocurridoEn: new Date('2026-10-01T12:00:00Z'),
    tenantId: 'tenant-1',
    payload: { citaId: 'cita-1', usuarioId: 'usuario-1' },
  };

  function crear(): {
    publicador: PublicadorEventosEnSalida;
    insertar: jest.Mock;
  } {
    const insertar = jest.fn().mockResolvedValue('evento-1');
    const salida = { insertar } as unknown as EventosSalidaRepository;
    return { publicador: new PublicadorEventosEnSalida(salida), insertar };
  }

  it('escribe el hecho en el outbox con la transacción del caso de uso', async () => {
    const { publicador, insertar } = crear();
    const tx = { manager: 'del caso de uso' };

    await publicador.publicar(evento, tx);

    expect(insertar).toHaveBeenCalledTimes(1);
    expect(insertar).toHaveBeenCalledWith(evento, tx);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('rechaza un tx %s sin escribir nada', async (_caso, tx) => {
    const { publicador, insertar } = crear();

    await expect(publicador.publicar(evento, tx)).rejects.toThrow(
      /requiere la transacción del caso de uso/,
    );
    expect(insertar).not.toHaveBeenCalled();
  });

  it('propaga el error del repositorio (la transacción del caso de uso se revierte)', async () => {
    const { publicador, insertar } = crear();
    insertar.mockRejectedValueOnce(new Error('fallo de base'));

    await expect(publicador.publicar(evento, {})).rejects.toThrow(
      'fallo de base',
    );
  });
});
