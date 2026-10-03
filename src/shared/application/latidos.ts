/**
 * Latidos (heartbeats) de los trabajos programados (ADR-12 §5, ADR-13 §16).
 *
 * Al terminar un tick sin errores, el job avisa a un monitor externo (Better
 * Stack). Si el aviso deja de llegar —el contenedor se durmió, el job se
 * colgó— el monitor alerta sin que nadie tenga que mirar los logs.
 *
 * Contrato:
 *  - **Nunca lanza.** Un fallo del monitor (red, tiempo agotado, 5xx) no puede
 *    romper el job: se registra y se sigue.
 *  - **Sin URL configurada no hace nada** (desarrollo y tests).
 *  - Tiene tiempo límite: se puede esperar con `await` sin riesgo.
 *  - Envía como mucho uno por minuto por job, aunque el job corra más seguido
 *    (el despachador de salida corre cada 5 s).
 *
 * Puerto sin Nest ni red: los jobs y los casos de uso lo reciben inyectado.
 */
export type NombreLatido = 'salida' | 'recordatorios';

export abstract class Latidos {
  /** El job `nombre` terminó un tick sin errores. */
  abstract latir(nombre: NombreLatido): Promise<void>;

  /**
   * El job `nombre` falló. El monitor alerta de inmediato, sin esperar a que
   * venza el plazo del latido (ADR-13 §16, último punto).
   */
  abstract informarFallo(nombre: NombreLatido): Promise<void>;
}
