/**
 * La cita no existe, o pertenece a otra organizacion. No se distinguen los dos
 * casos: revelar "existe pero no es tuya" filtraria informacion de otro tenant.
 */
export class CitaNoEncontradaError extends Error {
  constructor(id: string) {
    super(`Cita "${id}" no encontrada`);
    this.name = 'CitaNoEncontradaError';
  }
}
