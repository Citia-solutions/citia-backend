/**
 * Error de dominio: la versión de los términos no sirve para registrar una
 * aceptación por ese canal (US-11, ADR-16 §2). `formulario_publico` exige una
 * versión conocida del catálogo; `enlace_cita` y `profesional`, una que
 * reciba aceptaciones.
 *
 * Es una defensa: el DTO (`@VersionTerminosVigente()`) ya rechaza lo mismo
 * antes. Los controllers lo traducen a 400 con el mensaje fijo
 * `MENSAJE_VERSION_TERMINOS_NO_VIGENTE`, el mismo del DTO, que el frontend
 * reconoce por su texto.
 *
 * El mensaje NO repite la versión recibida: es un dato del cliente.
 */
export class VersionTerminosNoVigenteError extends Error {
  constructor() {
    super('La versión de los términos no está vigente para este canal');
    this.name = 'VersionTerminosNoVigenteError';
  }
}
