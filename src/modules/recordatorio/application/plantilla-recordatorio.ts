// Plantilla del correo de recordatorio (ADR-13 §12). Pura: recibe SOLO lo que
// puede ir en el mensaje y devuelve asunto, HTML y texto plano.
//
// Privacidad por construcción: la entrada no tiene campos para el paciente
// (nombre, RUT, teléfono, correo), el tipo de consulta ni ids internos, así
// que no hay forma de que lleguen al cuerpo. Sin imágenes, pixeles ni enlaces
// de seguimiento.
//
// Se genera AL ENVIAR, no al programar: sale con el contacto y las reglas de
// zona vigentes. Determinista (sin "ahora" ni ids): un reintento con la misma
// `Idempotency-Key` manda el mismo contenido (ADR-13 §9.3).
import {
  formatearFechaLargaEnZona,
  formatearHoraEnZona,
} from '../../../shared/domain/timezone';

/**
 * Bloque de acción de la Fase 3 (ADR-10, US-04): el enlace por cita para
 * confirmar o pedir otra hora. En la Fase 2 va vacío y NO se dibuja.
 */
export interface AccionRecordatorio {
  texto: string;
  /** Solo `https://` (o `http://` en desarrollo); otra cosa no se dibuja. */
  url: string;
}

export interface DatosPlantillaRecordatorio {
  /** Inicio de la cita (instante). */
  inicio: Date;
  /** Zona de la clínica (`APP_TZ`). */
  tz: string;
  /** `Usuario.nombreCompleto` del profesional dueño de la cita. */
  profesional: string;
  /** `Tenant.nombre` (confirmado 2026-09-30: va en el cuerpo, nunca en el asunto). */
  organizacion: string;
  /** "Cómo contactar" de la configuración del profesional. */
  telefonoContacto: string | null;
  /** `Reply-To` (opción E2). `null` = sin `Reply-To` y el texto lo dice. */
  correoRespuesta: string | null;
  /** Fase 3. En la Fase 2, ausente. */
  accion?: AccionRecordatorio | null;
}

export interface ContenidoRecordatorio {
  asunto: string;
  html: string;
  texto: string;
}

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

const URL_ACCION = /^https?:\/\/[^\s<>"']+$/i;

function accionDibujable(
  accion: AccionRecordatorio | null | undefined,
): AccionRecordatorio | null {
  if (!accion) return null;
  const texto = enUnaLinea(accion.texto);
  const url = accion.url.trim();
  return texto !== '' && URL_ACCION.test(url) ? { texto, url } : null;
}

/**
 * Asunto, HTML y texto del recordatorio, en español de Chile.
 *
 * - **Asunto neutro** (ADR-13 §12): "Recordatorio de tu hora: martes 14 de
 *   octubre, 10:30". Sin profesional ni organización: el asunto se ve con la
 *   pantalla bloqueada y el nombre de una organización puede revelar la
 *   especialidad.
 * - **Cuerpo:** fecha y hora en la zona de la clínica, profesional,
 *   organización y cómo contactar (teléfono y/o "responde a este correo").
 *   Sin `Reply-To`, el texto dice que el correo no recibe respuestas.
 * - **Todo dato interpolado se escapa** en el HTML.
 */
export function generarPlantillaRecordatorio(
  datos: DatosPlantillaRecordatorio,
): ContenidoRecordatorio {
  const fechaConHora = formatearFechaLargaEnZona(datos.inicio, datos.tz);
  const fecha = formatearFechaLargaEnZona(datos.inicio, datos.tz, {
    conHora: false,
  });
  const hora = formatearHoraEnZona(datos.inicio, datos.tz);
  const profesional = enUnaLinea(datos.profesional);
  const organizacion = enUnaLinea(datos.organizacion);
  const telefono = datos.telefonoContacto
    ? enUnaLinea(datos.telefonoContacto)
    : null;
  const correo = datos.correoRespuesta
    ? enUnaLinea(datos.correoRespuesta)
    : null;
  const accion = accionDibujable(datos.accion);

  const asunto = `Recordatorio de tu hora: ${fechaConHora}`;

  // --- Texto plano ----------------------------------------------------------
  const lineasContacto: string[] = [];
  if (telefono) {
    lineasContacto.push(`- Llama o escribe al ${telefono}.`);
  }
  if (correo) {
    lineasContacto.push(
      `- Responde a este correo: tu respuesta le llega a ${profesional} (${correo}).`,
    );
  }

  const texto = [
    'Hola:',
    '',
    `Te recordamos tu hora del ${fecha} a las ${hora} con ${profesional}, en ${organizacion}.`,
    '',
    lineasContacto.length > 0
      ? 'Si no puedes asistir o necesitas cambiar la hora, avisa con anticipación:'
      : `Si no puedes asistir o necesitas cambiar la hora, comunícate con ${organizacion} por los medios habituales.`,
    ...lineasContacto,
    ...(correo
      ? []
      : ['', 'Este correo no recibe respuestas: por favor no lo respondas.']),
    ...(accion ? ['', `${accion.texto}: ${accion.url}`] : []),
    '',
    `Este es un aviso automático enviado por Citia en nombre de ${profesional}.`,
    '',
  ].join('\n');

  // --- HTML -----------------------------------------------------------------
  const h = {
    fecha: escaparHtml(fecha),
    hora: escaparHtml(hora),
    profesional: escaparHtml(profesional),
    organizacion: escaparHtml(organizacion),
    telefono: telefono ? escaparHtml(telefono) : null,
    correo: correo ? escaparHtml(correo) : null,
  };

  const contactoHtml: string[] = [];
  if (h.telefono) {
    contactoHtml.push(`<li>Llama o escribe al ${h.telefono}.</li>`);
  }
  if (h.correo) {
    contactoHtml.push(
      `<li>Responde a este correo: tu respuesta le llega a ${h.profesional} (${h.correo}).</li>`,
    );
  }

  const parrafo = (contenido: string): string =>
    `<p style="margin:0 0 16px 0;">${contenido}</p>`;

  const cuerpo = [
    parrafo('Hola:'),
    parrafo(
      `Te recordamos tu hora del <strong>${h.fecha} a las ${h.hora}</strong> con <strong>${h.profesional}</strong>, en ${h.organizacion}.`,
    ),
    contactoHtml.length > 0
      ? parrafo(
          'Si no puedes asistir o necesitas cambiar la hora, avisa con anticipación:',
        ) +
        `<ul style="margin:0 0 16px 0;padding-left:20px;">${contactoHtml.join('')}</ul>`
      : parrafo(
          `Si no puedes asistir o necesitas cambiar la hora, comunícate con ${h.organizacion} por los medios habituales.`,
        ),
    h.correo
      ? ''
      : parrafo('Este correo no recibe respuestas: por favor no lo respondas.'),
    accion
      ? parrafo(
          `<a href="${escaparHtml(accion.url)}" style="color:#1a56db;">${escaparHtml(accion.texto)}</a>`,
        )
      : '',
    `<p style="margin:24px 0 0 0;font-size:12px;color:#6b7280;">Este es un aviso automático enviado por Citia en nombre de ${h.profesional}.</p>`,
  ].join('');

  const html =
    '<!DOCTYPE html>' +
    '<html lang="es-CL"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escaparHtml(asunto)}</title></head>` +
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;">' +
    cuerpo +
    '</body></html>';

  return { asunto, html, texto };
}
