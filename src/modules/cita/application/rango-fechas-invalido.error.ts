/**
 * El rango de `GET /citas?desde&hasta` no es aceptable: `hasta` anterior a
 * `desde`, o más días de los permitidos. El controller lo traduce a 400.
 */
export class RangoFechasInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RangoFechasInvalidoError';
  }
}
