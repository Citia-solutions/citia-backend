/**
 * Cabecera con la que el portal del paciente envía el token de su enlace
 * (contrato de la Fase 3, S3): el token viaja en el fragmento de la URL de la
 * página (`/cita#<token>`) y la página lo manda a la API en esta cabecera,
 * nunca en la URL de la API.
 *
 * En minúsculas, como la expone Node en `req.headers`; `@Headers()` de Nest y
 * CORS no distinguen mayúsculas.
 *
 * La usan: el controller del portal (para leerla), CORS (la permite), los
 * logs (la redactan) y el límite de tasa por enlace (la usa como clave,
 * hasheada).
 */
export const CABECERA_ENLACE_CITA = 'x-enlace-cita';
