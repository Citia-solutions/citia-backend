/**
 * Respuesta ÚNICA de la ruta pública (ADR-09 §8 regla 6).
 *
 * Se devuelve exactamente esto en todos los casos: exista o no la
 * organización, y haya o no una solicitud abierta con ese RUT.
 *
 * No es cortesía: si la respuesta variara, cualquiera podría sondear qué
 * organizaciones existen y —más grave— qué RUT es paciente de qué profesional
 * de la salud. Por eso no lleva id ni ningún dato derivado del servidor.
 */
export class SolicitudRecibidaDto {
  readonly mensaje =
    'Recibimos tu solicitud. El profesional te contactará para confirmar la hora.';
}
