/**
 * Error de dominio: los cambios del perfil no cumplen sus reglas (US-10,
 * `normalizarCambiosPerfil`). Es la red de seguridad del DTO: nombre vacío
 * tras recortar o largos fuera de rango. `campo` dice cuál; el mensaje nunca
 * repite el valor recibido. El controller lo traduce a 400.
 */
export class PerfilInvalidoError extends Error {
  constructor(
    readonly campo: 'nombreCompleto' | 'especialidad',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'PerfilInvalidoError';
  }
}
