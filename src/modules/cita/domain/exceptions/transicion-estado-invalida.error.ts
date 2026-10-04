import { EstadoCita } from '../cita.entity';

// Error de dominio: se intentó una transición de estado no permitida por el
// grafo cerrado de estados de una cita (ej. confirmar una cita cancelada).
export class TransicionEstadoInvalidaError extends Error {
  constructor(desde: EstadoCita, evento: string) {
    super(
      `Transición de estado inválida: no se puede aplicar "${evento}" desde el estado "${desde}"`,
    );
    this.name = 'TransicionEstadoInvalidaError';
  }
}
