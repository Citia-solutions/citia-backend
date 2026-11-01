/**
 * Respuesta 200 de `PUT /api/usuarios/me/contrasena` (US-10, ADR-15 §4 y §5).
 *
 * `accessToken` es el token NUEVO de la sesión actual, firmado con `iat` = el
 * corte: el frontend reemplaza el guardado. Los anteriores (de esta y de las
 * demás sesiones) dejan de valer.
 */
export class ContrasenaCambiadaDto {
  accessToken: string;

  constructor(datos: ContrasenaCambiadaDto) {
    Object.assign(this, datos);
  }
}
