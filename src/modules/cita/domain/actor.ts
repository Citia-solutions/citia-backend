import { ActorCambio } from './cambio-cita.entity';

/**
 * Quién provoca un cambio en una cita (ADR-10 §3, refactor del esqueleto de
 * mutación).
 *
 *  - `profesional`: una ruta autenticada; `usuarioId` es el usuario del token
 *    (puede ser un colega del tenant, no necesariamente el dueño de la cita).
 *  - `paciente`: el portal del paciente; `enlaceId` es el `EnlaceCita` usado.
 *  - `sistema`: un proceso sin persona detrás (el futuro job de cierre, DT-11).
 *
 * En la bitácora (`cambios_cita`) se guarda como `actor_tipo` + `actor_id`
 * (referencia polimórfica: usuario, enlace o nulo). En los hechos del outbox
 * viaja como `actor: { tipo, id }`.
 */
export type Actor =
  | { tipo: 'profesional'; usuarioId: string }
  | { tipo: 'paciente'; enlaceId: string }
  | { tipo: 'sistema' };

/** Forma del actor en el payload de los hechos de la cita (`id` nulo para `sistema`). */
export interface ActorHecho {
  tipo: Actor['tipo'];
  id: string | null;
}

export const actorProfesional = (usuarioId: string): Actor => ({
  tipo: 'profesional',
  usuarioId,
});

export const actorPaciente = (enlaceId: string): Actor => ({
  tipo: 'paciente',
  enlaceId,
});

export const ACTOR_SISTEMA: Actor = Object.freeze({ tipo: 'sistema' });

/** Id que acompaña al actor: usuario, enlace o `null` para el sistema. */
export function idDelActor(actor: Actor): string | null {
  switch (actor.tipo) {
    case 'profesional':
      return actor.usuarioId;
    case 'paciente':
      return actor.enlaceId;
    case 'sistema':
      return null;
  }
}

/** `actor_tipo` de la bitácora para este actor. */
export function actorCambioDe(actor: Actor): ActorCambio {
  switch (actor.tipo) {
    case 'profesional':
      return ActorCambio.PROFESIONAL;
    case 'paciente':
      return ActorCambio.PACIENTE;
    case 'sistema':
      return ActorCambio.SISTEMA;
  }
}

/** El actor tal como viaja en el payload de un hecho. */
export function actorDelHecho(actor: Actor): ActorHecho {
  return { tipo: actor.tipo, id: idDelActor(actor) };
}
