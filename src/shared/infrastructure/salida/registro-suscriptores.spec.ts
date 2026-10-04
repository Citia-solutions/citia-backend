import { SuscriptorEventos } from '../../application/suscriptor-eventos';
import { RegistroSuscriptores } from './registro-suscriptores';

class SuscriptorCitas extends SuscriptorEventos {
  readonly eventos = ['CitaCreada', 'CitaReagendada'];
  manejar(): Promise<void> {
    return Promise.resolve();
  }
}

class SuscriptorCancelaciones extends SuscriptorEventos {
  readonly eventos = ['CitaCancelada', 'CitaCreada'];
  manejar(): Promise<void> {
    return Promise.resolve();
  }
}

class SuscriptorSordo extends SuscriptorEventos {
  readonly eventos: string[] = [];
  manejar(): Promise<void> {
    return Promise.resolve();
  }
}

describe('RegistroSuscriptores', () => {
  it('sin suscriptores, nadie escucha nada', () => {
    const registro = new RegistroSuscriptores();
    expect(registro.suscriptoresDe('CitaCreada')).toEqual([]);
    expect(registro.todos()).toEqual([]);
  });

  it('devuelve los que escuchan cada hecho, en orden de registro', () => {
    const registro = new RegistroSuscriptores();
    const citas = new SuscriptorCitas();
    const cancelaciones = new SuscriptorCancelaciones();
    registro.registrar(citas);
    registro.registrar(cancelaciones);

    expect(registro.suscriptoresDe('CitaCreada')).toEqual([
      citas,
      cancelaciones,
    ]);
    expect(registro.suscriptoresDe('CitaReagendada')).toEqual([citas]);
    expect(registro.suscriptoresDe('CitaCancelada')).toEqual([cancelaciones]);
    expect(registro.suscriptoresDe('SolicitudCitaAceptada')).toEqual([]);
  });

  it('registrar dos veces la misma instancia no la duplica', () => {
    const registro = new RegistroSuscriptores();
    const citas = new SuscriptorCitas();
    registro.registrar(citas);
    registro.registrar(citas);

    expect(registro.suscriptoresDe('CitaCreada')).toHaveLength(1);
  });

  it('rechaza un suscriptor que no escucha ningún hecho', () => {
    expect(() =>
      new RegistroSuscriptores().registrar(new SuscriptorSordo()),
    ).toThrow(/SuscriptorSordo: un suscriptor debe escuchar al menos un hecho/);
  });
});
