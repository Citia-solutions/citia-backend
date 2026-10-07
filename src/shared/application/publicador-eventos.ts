import { TransactionContext } from './transaction-runner';

/**
 * Publicacion de hechos de dominio (ADR-09 §7, ADR-12 §2).
 *
 * Los casos de uso publican lo que paso ("esta cita se movio"); los
 * suscriptores (recordatorios RF-06, alertas RF-05) se enchufan sin volver a
 * operar los casos de uso.
 *
 * El hecho se escribe en la MISMA transaccion que el cambio que lo origina
 * (outbox `eventos_salida`, ADR-12 §1): o se confirman los dos o ninguno. Asi
 * no hay hechos fantasma (publicado y revertido) ni hechos perdidos
 * (confirmado y no publicado). Por eso `tx` es OBLIGATORIO: publicar fuera de
 * una transaccion es un error de compilacion, no una revision de codigo. Quien
 * no tenga transaccion la abre con `TransactionRunner.run` (ADR-06) y publica
 * DENTRO del callback, con el `tx` que este recibe.
 *
 * La entrega a los suscriptores ocurre despues del commit, con reintentos
 * (ADR-12 §3): al menos una vez y sin orden garantizado.
 *
 * Mismo patron de puerto opaco que TransactionRunner (ADR-06): `application`
 * no sabe si por debajo hay una tabla, una cola o un log.
 */
export interface EventoDominio {
  // Nombre en pasado: describe algo que YA ocurrio, no una orden.
  nombre: string;
  ocurridoEn: Date;
  tenantId: string;
  // Solo ids y datos no sensibles: sin RUT, nombre ni contacto (ADR-09 §3
  // regla 5). Se guarda tal cual en `eventos_salida.payload`.
  payload: Record<string, unknown>;
}

export abstract class PublicadorEventos {
  abstract publicar(
    evento: EventoDominio,
    tx: TransactionContext,
  ): Promise<void>;
}
