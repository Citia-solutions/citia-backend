import {
  ACTOR_SISTEMA,
  Actor,
  actorCambioDe,
  actorDelHecho,
  actorPaciente,
  actorProfesional,
  idDelActor,
} from './actor';
import { ActorCambio } from './cambio-cita.entity';

describe('Actor (ADR-10 §3)', () => {
  it.each<[string, Actor, ActorCambio, string | null]>([
    [
      'profesional → usuario',
      actorProfesional('usuario-1'),
      ActorCambio.PROFESIONAL,
      'usuario-1',
    ],
    [
      'paciente → enlace',
      actorPaciente('enlace-1'),
      ActorCambio.PACIENTE,
      'enlace-1',
    ],
    ['sistema → nulo', ACTOR_SISTEMA, ActorCambio.SISTEMA, null],
  ])('%s: actor_tipo e id de la bitácora', (_caso, actor, actorTipo, id) => {
    expect(actorCambioDe(actor)).toBe(actorTipo);
    expect(idDelActor(actor)).toBe(id);
  });

  it('en el hecho viaja como { tipo, id } con el mismo vocabulario que la bitácora', () => {
    expect(actorDelHecho(actorProfesional('u'))).toEqual({
      tipo: 'profesional',
      id: 'u',
    });
    expect(actorDelHecho(actorPaciente('e'))).toEqual({
      tipo: 'paciente',
      id: 'e',
    });
    expect(actorDelHecho(ACTOR_SISTEMA)).toEqual({ tipo: 'sistema', id: null });
    // `tipo` coincide con el valor del enum de `cambios_cita.actor_tipo`.
    for (const actor of [
      actorProfesional('u'),
      actorPaciente('e'),
      ACTOR_SISTEMA,
    ]) {
      expect(actorDelHecho(actor).tipo).toBe(actorCambioDe(actor));
    }
  });
});
