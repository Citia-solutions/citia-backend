import { Logger } from '@nestjs/common';

/**
 * Envuelve el trabajo de un job programado (ADR-12 §5):
 *
 *  - **Sin solapamiento dentro del proceso:** si el tick anterior no terminó,
 *    el siguiente se salta (bandera `enCurso`). Entre procesos, la exclusión
 *    la dan `FOR UPDATE SKIP LOCKED` y los candados consultivos.
 *  - **Apagado ordenado:** `detener()` impide nuevos ticks y espera al que
 *    está en curso.
 *
 * El trabajo debe manejar sus propios errores; si alguno escapa, se registra
 * aquí para que nunca quede una promesa rechazada sin atender.
 */
export class TrabajoSinSolapamiento {
  private readonly logger = new Logger(TrabajoSinSolapamiento.name);
  private enCurso: Promise<void> | null = null;
  private detenidoFlag = false;

  constructor(
    readonly nombre: string,
    private readonly trabajo: () => Promise<void>,
  ) {}

  get detenido(): boolean {
    return this.detenidoFlag;
  }

  get ocupado(): boolean {
    return this.enCurso !== null;
  }

  /**
   * Arranca el trabajo si no hay otro en curso ni se pidió detener. Devuelve
   * la promesa del trabajo, o `null` si este tick se saltó.
   */
  disparar(): Promise<void> | null {
    if (this.detenidoFlag || this.enCurso) {
      return null;
    }
    // El trabajo arranca en una microtarea, DESPUÉS de fijar `enCurso`: así
    // el `finally` nunca puede correr antes que la asignación (p. ej. si el
    // trabajo lanzara de forma síncrona) y dejar la bandera trabada.
    const ejecucion = Promise.resolve()
      .then(() => this.trabajo())
      .catch((error: unknown) => {
        this.logger.error({
          evento: 'planificador.error_no_controlado',
          trabajo: this.nombre,
          err: error,
        });
      })
      .finally(() => {
        this.enCurso = null;
      });
    this.enCurso = ejecucion;
    return ejecucion;
  }

  /** No acepta más ticks y espera a que termine el que está en curso. */
  async detener(): Promise<void> {
    this.detenidoFlag = true;
    await this.enCurso;
  }
}
