# Términos del paciente, versión 1.0 (copia congelada)

> **Fase:** — (transversal: [Cumplimiento](README.md)) · **Feature:** [us11-terminos-paciente](../Features/us11-terminos-paciente.md)
> · **Plan:** [US-11](../US/11-terminos-paciente.md#el-texto-que-se-publica) · **Decisión:**
> [ADR-16 §1](../Decisions/ADR-16.md#1-el-texto-terminos-versión-10-genérico-d2-d8-d9) · **Relacionado:**
> [borrador v0.2](borrador-terminos-paciente.md) (el antecedente), [DT-16](../Deudas/DT-16.md), [DT-53](../Deudas/DT-53.md)

**Copia congelada. No se edita.** Es la prueba de qué decía la versión **1.0** que aceptaron los pacientes: la fila de
`aceptaciones_terminos` guarda la versión (`'1.0'`) y este archivo guarda el texto. Si el texto cambia, aunque sea
una palabra, es una versión nueva con su propia copia (`terminos-paciente-v1.1.md`), con el orden de despliegue de
[ADR-16 §2](../Decisions/ADR-16.md#2-catálogo-de-versiones-d3).

| Dato | Valor |
|---|---|
| Versión | **1.0** (`CATALOGO_TERMINOS_PACIENTE` del backend y `VERSION_TERMINOS_PACIENTE` del frontend) |
| Publicada el | **2026-11-15**, el día del release del frontend a production (`FECHA_TERMINOS_PACIENTE`) |
| Dónde se publica | `https://app.citiahealth.cl/terminos` (`citia-frontend`, `src/pages/terminos/ui/TerminosPage.vue`) |
| Comprobación | El 2026-11-15, el texto de `TerminosPage.vue` (`citia-frontend` `develop`, `b6f5d5f`) y el del [plan](../US/11-terminos-paciente.md#el-texto-que-se-publica) dieron **idénticos** palabra por palabra (694 palabras, sin el formato). Como el frontend no tiene una comparación automática ([DTF-09 del frontend](../../../citia-frontend/context/Deudas/DTF-09.md)), esta copia se hizo desde ese texto comprobado |
| Quién lo redactó | El proyecto, sin revisión de alguien con formación legal (decisión del usuario del 2026-11-14) |

Los textos cortos de abajo (casilla, tarjeta de `/cita` y alta manual) son parte de lo que se muestra al aceptar, así
que también quedan congelados con esta versión.

---

## Términos de uso y aviso de privacidad de Citia para pacientes

*Versión 1.0 · publicada el 15 de noviembre de 2026*

**1. Quién es quién**

- **Tu profesional** es la persona o la clínica que agenda tus horas con Citia: la que te compartió el enlace para
  pedir hora o la que te envía los recordatorios. Su nombre aparece en la página de tu hora y en los recordatorios. Tu
  profesional decide para qué se usan tus datos.
- **Citia** es el sistema de agenda que usa tu profesional. Trata tus datos **por encargo de tu profesional** y solo
  para lo que se describe aquí. Citia no usa tus datos para fines propios, no los vende y no los comparte con otros
  profesionales o clínicas que usen Citia.

**2. Qué datos se usan**

- **Para identificarte y contactarte:** tu nombre, tu RUT, tu teléfono y tu correo.
- **De tus horas:** la fecha y la duración, el tipo o motivo de la consulta, su estado (pendiente, confirmada,
  cancelada, si asististe o no) y los cambios que tuvo, incluido quién pidió reagendar o cancelar. Si no confirmas una
  hora y no se registra tu asistencia, al terminar el día el sistema la marca sola como inasistencia.
- **Si pides hora por el enlace público:** además, tu preferencia de horario y el motivo que escribas.
- **Del enlace de tu hora:** cuándo lo abriste por primera vez y lo que hiciste ahí (confirmar, cancelar o pedir otra
  hora).
- **De los correos:** si los recordatorios se entregaron o rebotaron.
- **De tu autorización:** qué versión de estos términos aceptaste, cuándo y por dónde (el formulario para pedir hora,
  el enlace de tu hora o tu profesional).

**El motivo de la consulta y tu asistencia pueden revelar información sobre tu salud.** Se usan solo para gestionar
tus horas.

**3. Para qué se usan**

- Agendar, reagendar y cancelar tus horas.
- Enviarte recordatorios por correo, con un enlace para confirmar, cancelar o pedir otra hora.
- Que tu profesional lleve el registro de asistencia de su agenda.

**No se usan** para publicidad, ni para calificarte o hacer un perfil tuyo. Si algún día tu historial de asistencia
se quisiera usar para otra cosa, se te pedirá una autorización nueva.

**4. Tu autorización**

Al marcar la casilla o presionar «Acepto» autorizas a tu profesional, y a Citia como su proveedor, a usar tus datos
(incluido el motivo de tu consulta) para lo que dice el punto 3. Puedes retirar tu autorización cuando quieras
escribiéndole a tu profesional. Retirarla no deshace lo anterior, y sin tus datos de contacto no se te pueden enviar
recordatorios.

**5. Con quién se comparten**

- Con tu profesional.
- Con los proveedores que Citia necesita para funcionar: alojamiento del sistema y de la base de datos (Railway), envío
  de correos (Resend) y publicación del sitio web (Netlify). Algunos procesan datos **fuera de Chile**, principalmente
  en Estados Unidos. Son proveedores: no usan tus datos para sí mismos.
- **No** se comparten con otros profesionales o clínicas que usen Citia.

**6. Cuánto tiempo se guardan**

Mientras tu profesional use Citia y los necesite para atenderte. Si tu profesional deja de usar Citia, tus datos se le
devuelven o se eliminan.

**7. Tus derechos**

Puedes pedir:

- saber qué datos tuyos hay;
- corregirlos;
- que se eliminen;
- oponerte a un uso;
- una copia para llevarlos a otro lugar.

Escríbele a tu profesional, por el medio que usas para comunicarte con él o ella, o a soporte@citiahealth.cl, indicando
tu nombre y RUT. Te responderemos dentro de 30 días.

**8. Si el paciente es menor de edad**

Si tienes menos de 16 años, la autorización la da tu madre, tu padre o quien te represente legalmente.

**9. Seguridad**

Las conexiones van cifradas. Solo tu profesional accede a tus datos, con su cuenta, y cada consulta que usa Citia
tiene sus datos separados de las demás. El enlace de tu hora es personal: no lo compartas.

**10. Cambios a estos términos**

Si cambian, publicaremos la nueva versión con su fecha en esta página. Si el cambio es para un uso nuevo de tus datos,
te pediremos una autorización nueva.

**11. Contacto**

Tu profesional, por el medio que usas para comunicarte con él o ella · Citia: soporte@citiahealth.cl

---

## Casilla del formulario público para pedir hora

> ☐ He leído los [Términos de uso y el aviso de privacidad] y autorizo a mi profesional, y a Citia como su proveedor, a
> usar mis datos, incluido el motivo de mi consulta, para gestionar mis horas y enviarme recordatorios por correo.

El enlace abre `/terminos` en otra pestaña. Si no se marca: *«Para enviar la solicitud tienes que aceptar los
términos.»*

## Tarjeta de la página del enlace de la cita (`/cita`)

> **Tus datos y Citia**
>
> {profesional}, de {organizacion}, usa Citia para agendar tus horas y enviarte recordatorios por correo. Lee los
> [Términos de uso y el aviso de privacidad]. Al presionar «Acepto» autorizas a {profesional}, y a Citia como su
> proveedor, a usar tus datos, incluido el motivo de tu consulta, para gestionar tus horas y enviarte recordatorios por
> correo.
>
> Puedes confirmar, cancelar o pedir otra hora aunque no aceptes ahora. Si no estás de acuerdo, escríbele a tu
> profesional.
>
> [ Acepto ]

`{profesional}` y `{organizacion}` son los de la cita. Si son iguales, se muestra uno solo: *«{profesional} usa
Citia…»*. Al aceptar: *«Gracias. Quedó registrada tu autorización.»*

## Texto del alta manual (modal *Nueva cita* del profesional)

> Antes de marcar la casilla, léele o envíale esto al paciente:
>
> «Para agendar tus horas y enviarte recordatorios por correo uso Citia, un sistema de agenda. Ahí quedan tu nombre,
> RUT, teléfono, correo y los datos de tus horas, incluido el motivo de la consulta. No se usan para otra cosa ni se
> comparten con otras clínicas. Los términos completos están en https://app.citiahealth.cl/terminos. ¿Me
> autorizas?»
>
> ☐ El paciente me autorizó después de leerle o enviarle este texto.
>
> *Si no te autoriza, no lo registres en Citia. El paciente también podrá aceptar los términos él mismo desde el
> enlace de su recordatorio.*

Si no se marca: *«Marca la casilla cuando el paciente te haya autorizado.»*
