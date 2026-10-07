# Etapa 3 del producto — MVP

> **Etapa 3 del producto**, no una fase del roadmap. Las etapas (problema → validación → requisitos → MVP)
> explican cómo se llegó al alcance; el archivo conserva el nombre `fase-*` por historia. Las fases de
> construcción están en [`Fases/`](../Fases/README.md). **El MVP que define esta etapa son las fases 0, 1 y 2
> del roadmap**; la "Fase 3" del roadmap es la [respuesta del paciente](../Fases/fase-3-us04-respuesta-paciente.md), fuera del MVP.

**Objetivo:** decidir la **versión más pequeña** que entrega valor real y permite aprender.
**Estado:** ✅ alcance decidido (2026-09-30: Q1 → A) · la tercera pieza, **implementada en rama** (2026-10-04) y pendiente de merge y de los prerrequisitos operativos

---

## Preguntas clave

1. Si solo pudieran construir 3 cosas, ¿cuáles son?
2. ¿Qué queda explícitamente FUERA de la v1?
3. ¿El MVP entrega valor por sí solo, o depende de features futuras?

---

## 1. Las tres cosas

| # | Pieza | Requisito | Estado |
|---|-------|-----------|--------|
| 1 | **Dashboard de citas del día** — paciente, hora y fecha | RF-03 · US-06 | ✅ implementado |
| 2 | **Gestión de cita** — agendar, editar, reagendar, cancelar, agenda semanal, bandeja de solicitudes, aviso de solapamiento | US-02 | ✅ cerrada (`develop`, 2026-09-28) |
| 3 | **Recordatorios al paciente** por correo | RF-06 · US-03 | ✅ implementada en la rama `feature/fase2-recordatorios` (2026-10-04, [us03](../Features/us03-recordatorios.md)) · ⏳ pendiente de merge y de los prerrequisitos operativos |

> **Cambio de alcance (2026-09-30).** La tercera pieza era la **calificación de asistencia** (RF-08,
> "US-07"). El usuario respondió [Q1](../PREGUNTAS-ABIERTAS.md) con **A**: los recordatorios entran en
> el MVP y **la calificación pasa a la v2**, como segundo valor agregado del negocio. Siguen siendo
> tres piezas, no cuatro: una entra y otra sale.
>
> **No confundir con las subtareas de US-02** (2026-09-23): `US-02.07`, `US-02.08` y `US-02.09` son
> subtareas de la gestión de citas, no historias, y **no ocupan** los números US-07/08/09.

### Qué entra en la tercera pieza, y qué no

| Entra (Fase 2 del roadmap) | No entra |
|---|---|
| correo con fecha, hora, profesional y cómo contactar | WhatsApp y SMS (después, otro adaptador) |
| momentos configurables por profesional (predeterminado 24 h y 2 h antes) | tipo de consulta o cualquier dato de salud en el mensaje |
| reprogramar al reagendar, anular al cancelar | que el paciente **responda** desde el correo (Fase 3 del roadmap, US-04 / [ADR-10](../Decisions/ADR-10.md)) |
| registro de entrega y alertas si fallan (RNF-03, RNF-08) | revisar el consentimiento antes de enviar ([DT-16](../Deudas/DT-16.md), riesgo aceptado) |

### La calificación sale del MVP, pero su materia prima corre

La calificación se alimenta del historial de quién cumple y quién no. Al pasarla a la v2, el proceso
que marca `ghosting` las citas vencidas también se aplaza ([DT-11](../Deudas/DT-11.md)), y eso se puede
hacer sin pérdida: la regla depende de datos guardados y se aplica después, con una fecha de corte.

**Lo que sí se pierde** es la asistencia real: si el paciente llegó o no llegó a una cita solo lo sabe
el profesional ese día, y el voucher **no** tendrá los botones hasta la Fase 3 del roadmap, cuando el paciente
pueda confirmar desde el enlace (decisión del 2026-09-30, [DT-30](../Deudas/DT-30.md)).
**Traducción para la planificación: cada semana sin esos botones es una semana de historial que la v2
no podrá mostrar.** Es una pérdida aceptada, no un descuido.

---

## 2. Qué queda fuera de la v1

Heredado de la [etapa 0](fase-0-problema.md):

- ❌ Todo lo relativo a **dinero** (cobros, prepagos, retenciones, facturación)
- ❌ **Inventarios**

Y por no estar entre las tres piezas, quedan fuera también:

- RF-01 monitoreo · RF-02 calendarios externos · RF-04 perfil y suscripción
- RF-05 alertas al profesional
- **RF-07 respuesta del paciente** (confirmar, cancelar o pedir reagendar desde el recordatorio)
- **RF-08 calificación de asistencia** → **v2** (2026-09-30)
- Recordatorios por **WhatsApp o SMS** (2026-09-30)

---

## 3. ¿El MVP entrega valor por sí solo?

**Respondida el 2026-09-30 con la salida A** (meter los recordatorios en el MVP).

Los criterios de éxito de la [etapa 0](fase-0-problema.md) son:

1. el usuario deja de mandar mensajes por WhatsApp;
2. se desliga de presionar al paciente;
3. tiene dónde monitorear el estado de sus consultas.

Con el alcance anterior el MVP cumplía el 3 y ninguno de los otros dos: **ninguna pieza le hablaba al
paciente**. Con los recordatorios:

| Criterio | Con el MVP actual |
|---|---|
| 1. Deja de mandar WhatsApps | **En parte.** Deja de mandar el "te recuerdo tu hora de mañana": lo manda Citia. Pero la **respuesta** del paciente (voy, no voy, cámbiame la hora) sigue llegando por teléfono o por correo al profesional hasta la Fase 3 del roadmap. |
| 2. Se desliga de presionar al paciente | **En parte.** El recordatorio sale solo y a tiempo; lo que no existe todavía es el registro de quién cumple (calificación, v2). |
| 3. Monitorea el estado de sus consultas | **Sí**, y además ve si cada recordatorio salió, llegó o falló. |

**Lo que se promete al primer cliente, dicho con honestidad:** *"tus pacientes reciben un recordatorio
automático por correo antes de cada hora, y tú ves si les llegó"*. **No** se promete todavía que el
paciente confirme o cancele con un clic, ni el historial de comportamiento.

### Restricción del modo prueba

El piloto arranca con planes gratis ([stack-tecnologico.md](../stack-tecnologico.md#modo-prueba)). El
límite que manda es el del proveedor de correo: **100 correos al día**, que con dos recordatorios por
cita son **unas 50 citas al día entre todos los profesionales** (~9 profesionales con 5–6 citas
diarias). Pasar a pago cuesta US$20 al mes y se decide cuando el aviso del 80 % empiece a saltar.

---

## Estado real del MVP hoy

```
Pieza 1 · Dashboard              ██████████ implementado
Pieza 2 · Gestión de cita        ██████████ cerrada (bandeja, agenda y solapamiento incluidos)
Pieza 3 · Recordatorios          ████████░░ construida en rama · falta merge, verificar el subdominio y operar
```

*(Actualizado el 2026-10-04. Antes: la pieza 2 estaba "a falta de la bandeja", que se cerró el
2026-09-28, y la pieza 3 era la calificación, bloqueada por el proceso de cierre; el 2026-09-30 la pieza 3
pasó a ser los recordatorios, con el diseño cerrado.)*

**El camino más corto al MVP completo:**

1. ~~Comprar el dominio~~ (✅ `citiahealth.cl`, delegado a Cloudflare) y **verificar el subdominio de
   envío en Resend** — es lo único con plazos fuera del control del equipo (DNS).
2. ~~Outbox de los hechos ([ADR-12](../Decisions/ADR-12.md))~~ ✅ construido en rama.
3. ~~Recordatorios ([ADR-13](../Decisions/ADR-13.md)) y observabilidad mínima~~ ✅ construidos en rama;
   falta crear la cuenta de Better Stack.
4. ~~Frontend: correo obligatorio, configuración y estado de los recordatorios~~ ✅ en rama; falta
   publicarlo y probarlo contra el backend real.
5. **Mergear y salir a producción** con el
   [checklist de la Fase 2](../Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción).
6. Revisar el consentimiento antes del 2026-12-01 (Ley 21.719, [DT-16](../Deudas/DT-16.md)).

---

**Anterior:** [Etapa 2 — Requisitos](fase-2-requisitos.md) · **Índice:** [README](README.md)
