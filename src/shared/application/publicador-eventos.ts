/**
 * Publicacion de hechos de dominio (ADR-09 §7).
 *
 * Los casos de uso publican lo que paso ("esta cita se movio") aunque todavia
 * no exista ningun suscriptor. Asi las alertas (RF-05) y los recordatorios
 * (RF-06) se enchufan despues SIN volver a operar los casos de uso.
 *
 * Mismo patron de puerto opaco que TransactionRunner (ADR-06): `application`
 * no sabe si por debajo hay memoria, una cola o un log.
 */
export interface EventoDominio {
  // Nombre en pasado: describe algo que YA ocurrio, no una orden.
  nombre: string;
  ocurridoEn: Date;
  tenantId: string;
  payload: Record<string, unknown>;
}

export abstract class PublicadorEventos {
  abstract publicar(evento: EventoDominio): Promise<void>;
}
