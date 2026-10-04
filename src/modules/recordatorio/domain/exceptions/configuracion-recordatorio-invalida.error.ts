/**
 * Error de dominio: la configuración de recordatorios de un profesional no
 * cumple sus reglas (ADR-13 §3). `campo` dice cuál; el mensaje nunca repite
 * el correo ni el teléfono recibidos. La ruta de configuración (paso 12) lo
 * traduce a 400.
 */
export class ConfiguracionRecordatorioInvalidaError extends Error {
  constructor(
    readonly campo:
      | 'antelacionesMin'
      | 'canal'
      | 'activo'
      | 'telefonoContacto'
      | 'correoRespuesta',
    mensaje: string,
  ) {
    super(`Configuración de recordatorios inválida (${campo}): ${mensaje}`);
    this.name = 'ConfiguracionRecordatorioInvalidaError';
  }
}
