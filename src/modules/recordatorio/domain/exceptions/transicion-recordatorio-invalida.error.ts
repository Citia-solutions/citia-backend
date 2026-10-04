import type { EstadoRecordatorio } from '../recordatorio.entity';

/**
 * Error de dominio: se intentó una transición que la máquina de estados del
 * recordatorio no permite (ADR-13 §4), p. ej. anular uno ya enviado o fallar
 * uno cancelado. Misma disciplina que `TransicionEstadoInvalidaError` de cita.
 */
export class TransicionRecordatorioInvalidaError extends Error {
  constructor(
    readonly desde: EstadoRecordatorio,
    readonly evento: string,
  ) {
    super(
      `Transición de recordatorio inválida: no se puede aplicar "${evento}" desde el estado "${desde}"`,
    );
    this.name = 'TransicionRecordatorioInvalidaError';
  }
}
