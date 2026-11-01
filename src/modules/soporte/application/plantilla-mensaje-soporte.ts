// Plantilla del correo de un mensaje a soporte (US-10, ADR-15 §7). Pura:
// recibe el mensaje, quién lo escribió y su organización, y devuelve asunto,
// HTML y texto plano.
//
// - Determinista para un mismo mensaje: usa `creadoEn` (no la hora del
//   envío) y nada aleatorio, así un reintento con la misma `Idempotency-Key`
//   (`soporte/<id>`) manda exactamente el mismo correo.
// - En el HTML TODO dato se escapa; el texto conserva sus saltos de línea
//   (`white-space: pre-wrap`).
// - El asunto va en una sola línea (sin saltos ni caracteres de control).
// - Este correo va a la casilla de soporte, no a un paciente: sí lleva el
//   nombre de la organización (en el asunto, para ordenar la casilla), los
//   datos del profesional y los ids. El texto puede traer datos de pacientes
//   aunque el formulario lo desaconseje (ADR-15 §7, DT-52): nunca va a un log.
import {
  formatearFechaEnZona,
  formatearHoraEnZona,
} from '../../../shared/domain/timezone';
import {
  CategoriaSoporte,
  MensajeSoporte,
} from '../domain/mensaje-soporte.entity';

/** Quién escribió, leído AL ENVIAR (`null` si el usuario ya no existe). */
export interface AutorCorreoSoporte {
  nombreCompleto: string;
  email: string;
  rol: string;
}

/** La organización, leída al enviar (`null` si ya no existe). */
export interface OrganizacionCorreoSoporte {
  nombre: string;
  slug: string;
}

export interface DatosCorreoSoporte {
  mensaje: MensajeSoporte;
  usuario: AutorCorreoSoporte | null;
  organizacion: OrganizacionCorreoSoporte | null;
}

export interface CorreoSoporte {
  asunto: string;
  html: string;
  texto: string;
}

/** Largo máximo del nombre de la organización en el asunto. */
export const LARGO_MAXIMO_ORGANIZACION_ASUNTO = 60;

// `Partial` por si una fila trae un valor que el enum no conoce (el CHECK lo
// impide, pero `reconstituir` no valida): se muestra tal cual.
const CATEGORIAS_LEGIBLES: Readonly<Partial<Record<string, string>>> = {
  [CategoriaSoporte.PROBLEMA]: 'Problema',
  [CategoriaSoporte.CONSULTA]: 'Consulta',
  [CategoriaSoporte.SUGERENCIA]: 'Sugerencia',
  [CategoriaSoporte.OTRO]: 'Otro',
};

// Por texto y no con `RolUsuario`: la plantilla no depende del módulo
// `usuario`. Un rol desconocido se muestra tal cual.
const ROLES_LEGIBLES: Readonly<Partial<Record<string, string>>> = {
  ADMINISTRADOR: 'Administrador',
  PROFESIONAL: 'Profesional',
};

/** Reemplaza los cinco caracteres con significado en HTML (texto y atributos). */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Una línea: sin saltos ni caracteres de control, espacios colapsados. */
function enUnaLinea(valor: string): string {
  return (
    valor
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * El texto del mensaje con sus saltos de línea normalizados a `\n` y sin
 * otros caracteres de control (salvo el tabulador).
 */
function textoConSaltos(valor: string): string {
  return (
    valor
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  );
}

/** Recorta a `largo` caracteres (sin partir un emoji) con `…` al final. */
function recortar(valor: string, largo: number): string {
  const caracteres = Array.from(valor);
  return caracteres.length <= largo
    ? valor
    : `${caracteres.slice(0, largo - 1).join('')}…`;
}

/** `2026-10-31 14:05 (America/Santiago)`: fecha y hora de la clínica. */
function fechaRecibido(instante: Date, tz: string): string {
  return `${formatearFechaEnZona(instante, tz)} ${formatearHoraEnZona(instante, tz)} (${tz})`;
}

/**
 * Asunto, HTML y texto del correo a la casilla de soporte.
 *
 * - **Asunto:** `Soporte · <Categoría> · <organización>` (organización en una
 *   línea y recortada a 60 caracteres).
 * - **Cuerpo:** De (nombre, correo y rol) · Organización (nombre y slug) ·
 *   Recibido (fecha y hora de `creadoEn` en `tz`) · Categoría · Ids (mensaje,
 *   usuario y organización) · el texto.
 */
export function armarCorreoSoporte(
  datos: DatosCorreoSoporte,
  tz: string,
): CorreoSoporte {
  const { mensaje, usuario, organizacion } = datos;
  const categoria =
    CATEGORIAS_LEGIBLES[mensaje.categoria] ?? enUnaLinea(mensaje.categoria);
  const nombreOrganizacion = organizacion
    ? enUnaLinea(organizacion.nombre) || '(sin nombre)'
    : '(organización no encontrada)';
  const slug = organizacion ? enUnaLinea(organizacion.slug) : null;
  const autor = usuario
    ? {
        nombre: enUnaLinea(usuario.nombreCompleto) || '(sin nombre)',
        correo: enUnaLinea(usuario.email),
        rol: ROLES_LEGIBLES[usuario.rol] ?? enUnaLinea(usuario.rol),
      }
    : null;
  const recibido = fechaRecibido(mensaje.creadoEn, tz);
  const texto = textoConSaltos(mensaje.mensaje);

  const asunto = enUnaLinea(
    `Soporte · ${categoria} · ${recortar(
      nombreOrganizacion,
      LARGO_MAXIMO_ORGANIZACION_ASUNTO,
    )}`,
  );

  const de = autor
    ? `${autor.nombre} <${autor.correo}> · ${autor.rol}`
    : '(el usuario ya no existe)';
  const deOrganizacion = slug
    ? `${nombreOrganizacion} (${slug})`
    : nombreOrganizacion;
  const ids = `mensaje ${mensaje.id} · usuario ${mensaje.usuarioId} · organización ${mensaje.tenantId}`;
  const respuesta = autor
    ? `Responde a este correo para contestarle a ${autor.nombre} (${autor.correo}).`
    : 'Este mensaje no tiene a quién responder: el usuario ya no existe.';

  // --- Texto plano ----------------------------------------------------------
  const textoPlano = [
    'Mensaje a soporte desde Citia',
    '',
    `De: ${de}`,
    `Organización: ${deOrganizacion}`,
    `Recibido: ${recibido}`,
    `Categoría: ${categoria}`,
    `Ids: ${ids}`,
    '',
    '--- Mensaje ---',
    texto,
    '--- Fin del mensaje ---',
    '',
    respuesta,
    '',
  ].join('\n');

  // --- HTML -----------------------------------------------------------------
  const fila = (etiqueta: string, valor: string): string =>
    '<tr>' +
    `<td style="padding:2px 12px 2px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${escaparHtml(etiqueta)}</td>` +
    `<td style="padding:2px 0;">${escaparHtml(valor)}</td>` +
    '</tr>';

  const cuerpo = [
    '<p style="margin:0 0 16px 0;font-size:17px;"><strong>Mensaje a soporte desde Citia</strong></p>',
    '<table style="border-collapse:collapse;margin:0 0 16px 0;">',
    fila('De', de),
    fila('Organización', deOrganizacion),
    fila('Recibido', recibido),
    fila('Categoría', categoria),
    fila('Ids', ids),
    '</table>',
    `<div style="white-space:pre-wrap;word-break:break-word;border-left:3px solid #d1d5db;padding:8px 12px;margin:0 0 16px 0;">${escaparHtml(texto)}</div>`,
    `<p style="margin:0;font-size:12px;color:#6b7280;">${escaparHtml(respuesta)}</p>`,
  ].join('');

  const html =
    '<!DOCTYPE html>' +
    '<html lang="es-CL"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escaparHtml(asunto)}</title></head>` +
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;">' +
    cuerpo +
    '</body></html>';

  return { asunto, html, texto: textoPlano };
}
