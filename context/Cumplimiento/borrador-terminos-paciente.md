# Borrador: términos de uso y aviso de privacidad para pacientes

> **Fase:** — (transversal: [Cumplimiento](README.md)) · **Feature:** — · **Plan:** — · **Relacionado:**
> [DT-16](../Deudas/DT-16.md) (el consentimiento), [DT-53](../Deudas/DT-53.md) (política de privacidad y derechos),
> [DT-52](../Deudas/DT-52.md) (proveedores), [DT-26](../Deudas/DT-26.md) (conservación), [DT-54](../Deudas/DT-54.md)
> (menores)

**Estado:** ✏️ borrador v0.1 del 2026-11-14. El usuario decidió abordar el cumplimiento sin abogado por ahora,
empezando por **los términos que autoriza el paciente**. Este texto es del proyecto: nadie con formación legal lo ha
revisado. Los ❓ marcan datos que hay que confirmar antes de publicarlo.

**Dónde se usaría:**

1. **El formulario público para pedir hora.** Ya tiene una casilla `consentimiento` que marca el **propio paciente**
   (`crear-solicitud.dto.ts`); hoy no enlaza a ningún texto.
2. **La página del enlace de la cita** (`/cita`), para que acepte el paciente que agendó el profesional.
3. **El alta manual de un paciente por el profesional.** Ahí el profesional marca la casilla en nombre del paciente
   (DT-16). Este texto le da algo concreto que leerle o enviarle.

---

## Decisiones por confirmar (del usuario)

| # | Decisión | Lo que asume este borrador |
|---|---|---|
| 1 | Quién figura como responsable de los datos | **El profesional o la clínica**; Citia, como su proveedor (encargado). Es lo que dice el pre-análisis, sin confirmar |
| 2 | Un documento o dos | **Uno** (términos y privacidad juntos), con un texto corto para la casilla |
| 3 | A quién escribe el paciente para ejercer sus derechos | **Al profesional, o a `soporte@citiahealth.cl`** |
| 4 | Cuánto tiempo se guardan los datos | ❓ sin plazo definido hoy ([DT-26](../Deudas/DT-26.md)) |
| 5 | Desde qué edad acepta el propio paciente | **16 años** ❓ (lectura del pre-análisis sobre el art. 16 quáter: hasta los 15, para datos de salud, acepta la madre, el padre o quien lo represente) |
| 6 | Proveedores y países | Railway, Resend y Netlify, con datos en EE. UU. ❓ (la región de Resend está sin verificar, [DT-52](../Deudas/DT-52.md)) |
| 7 | Plazo para responder una solicitud de derechos | **30 días** ❓ (sin verificar en la Ley 21.719) |

---

## El texto para el paciente

> Lo que va entre corchetes se llena con los datos de cada profesional u organización (en Citia, el nombre del
> tenant y su contacto).

### Términos de uso y aviso de privacidad de Citia para pacientes

*Versión 0.1 · [fecha de publicación]*

**1. Quién es quién**

- **[Nombre del profesional o de la clínica]** («tu profesional») agenda tus horas y decide para qué se usan tus
  datos.
- **Citia** es el sistema de agenda que usa tu profesional. Trata tus datos **por encargo de tu profesional** y solo
  para lo que se describe aquí. Citia no usa tus datos para fines propios, no los vende y no los comparte con otros
  profesionales o clínicas que usen Citia.

**2. Qué datos se usan**

- **Para identificarte y contactarte:** tu nombre, tu RUT, tu teléfono y tu correo.
- **De tus horas:** la fecha y la duración, el tipo o motivo de la consulta, su estado (pendiente, confirmada,
  cancelada, si asististe o no) y los cambios que tuvo, incluido quién pidió reagendar o cancelar.
- **Si pides hora por el enlace público:** además, tu preferencia de horario y el motivo que escribas.
- **Del enlace de tu hora:** cuándo lo abriste por primera vez y lo que hiciste ahí (confirmar, cancelar o pedir otra
  hora).
- **De los correos:** si los recordatorios se entregaron o rebotaron.

**El motivo de la consulta y tu asistencia pueden revelar información sobre tu salud.** Se usan solo para gestionar
tus horas.

**3. Para qué se usan**

- Agendar, reagendar y cancelar tus horas.
- Enviarte recordatorios por correo, con un enlace para confirmar, cancelar o pedir otra hora.
- Que tu profesional lleve el registro de asistencia de su agenda.

**No se usan** para publicidad, ni para calificarte o hacer un perfil tuyo. Si algún día tu historial de asistencia
se quisiera usar para otra cosa, se te pedirá una autorización nueva.

**4. Tu autorización**

Al marcar la casilla autorizas a tu profesional, y a Citia como su proveedor, a usar tus datos (incluido el motivo de
tu consulta) para lo que dice el punto 3. Puedes retirar tu autorización cuando quieras escribiéndole a tu
profesional. Retirarla no deshace lo anterior, y sin tus datos de contacto no se te pueden enviar recordatorios.

**5. Con quién se comparten**

- Con tu profesional.
- Con los proveedores que Citia necesita para funcionar: alojamiento del sistema y de la base de datos (Railway), envío
  de correos (Resend) y publicación del sitio web (Netlify). Algunos procesan datos **fuera de Chile**, principalmente
  en Estados Unidos. Son proveedores: no usan tus datos para sí mismos.
- **No** se comparten con otros profesionales o clínicas que usen Citia.

**6. Cuánto tiempo se guardan**

Mientras tu profesional use Citia y los necesite para atenderte, con un máximo de [plazo]. Si tu profesional deja de
usar Citia, sus datos se le devuelven o se eliminan.

**7. Tus derechos**

Puedes pedir:

- saber qué datos tuyos hay;
- corregirlos;
- que se eliminen;
- oponerte a un uso;
- una copia para llevarlos a otro lugar.

Escríbele a tu profesional ([contacto]) o a soporte@citiahealth.cl, indicando tu nombre y RUT. Te responderemos dentro
de [30] días.

**8. Si el paciente es menor de edad**

Si tienes menos de [16] años, la autorización la da tu madre, tu padre o quien te represente legalmente.

**9. Seguridad**

Las conexiones van cifradas. Solo tu profesional accede a tus datos, con su cuenta, y cada consulta que usa Citia
tiene sus datos separados de las demás. El enlace de tu hora es personal: no lo compartas.

**10. Cambios a estos términos**

Si cambian, publicaremos la nueva versión con su fecha. Si el cambio es para un uso nuevo de tus datos, te pediremos
una autorización nueva.

**11. Contacto**

[Nombre del profesional o de la clínica] · [contacto] · soporte@citiahealth.cl

---

## El texto corto de la casilla

> ☐ He leído los [Términos de uso y el aviso de privacidad] y autorizo a [nombre del profesional o de la clínica], y
> a Citia como su proveedor, a usar mis datos, incluido el motivo de mi consulta, para gestionar mis horas y enviarme
> recordatorios por correo.

## El texto para el alta manual

Cuando el profesional agenda al paciente sin que este use el formulario, le lee o le envía esto **antes de marcar la
casilla**:

> Para agendar tus horas y enviarte recordatorios por correo uso Citia, un sistema de agenda. Ahí quedan tu nombre,
> RUT, teléfono, correo y los datos de tus horas, incluido el motivo de la consulta. No se usan para otra cosa ni se
> comparten con otras clínicas. Los términos completos están en [enlace]. ¿Me autorizas?

---

## Lo que falta para usarlo (no es parte de este borrador)

- **Publicarlo** en una página del frontend (por ejemplo, `/terminos`), con número de versión.
- **Guardar la prueba de la aceptación:** qué versión aceptó el paciente, cuándo y por qué canal (formulario, enlace o
  profesional). Hoy solo se guarda un `true` o `false` ([DT-16](../Deudas/DT-16.md)).
- **Que acepte el paciente agendado a mano:** pedirle la aceptación en la página del enlace la primera vez que la abra.
- **Atender los derechos:** hoy no hay forma de entregarle sus datos a un paciente ni de borrarlo; solo se corrigen el
  teléfono y el correo ([DT-53](../Deudas/DT-53.md)). Mientras tanto, se atienden a mano.
- **Lo que este texto no cubre:** el contrato entre la clínica y Citia ([DT-51](../Deudas/DT-51.md)), las cuentas de
  los profesionales (donde Citia sería responsable) y la calificación de asistencia, que sigue 🚧 bloqueada.
