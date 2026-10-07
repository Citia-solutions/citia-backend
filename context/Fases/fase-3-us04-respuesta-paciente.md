# Fase 3 — US-04: Respuesta del paciente (RF-07, + US-02.07)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 3 del producto](../Descripcion/fase-3-mvp.md) (el MVP, que termina en la Fase 2). Índice:
> [Fases](README.md) · Estado en el [ROADMAP § Fase 3](../ROADMAP.md#fase-3--us-04-respuesta-del-paciente).

| | |
|---|---|
| **Objetivo** | Que el paciente confirme o cancele —y pida otra hora (US-02.07)— desde el enlace que le llega en el recordatorio, sin cuenta; y que la agenda y las alertas se actualicen. |
| **Entregable** | El paciente confirma o cancela desde el correo; agenda y alertas se actualizan (ROADMAP). |
| **Estado** | ⬜ nada construido · **fuera del MVP** (2026-09-30) · **siguiente fase** (2026-10-07: el MVP ya está en producción y el canal existe). Hay diseño parcial: ADR-10 (propuesto) y FD-06 (propuesta); para empezar hay que aceptar ADR-10. |
| **Fechas** | FD-06 2026-09-10 · ADR-10 propuesto 2026-09-23 y aplazado 2026-09-25 (Q11 → C) · reabrible desde el 2026-09-30 (el canal existirá con la Fase 2). |
| **Historias** | US-04 (sin plan propio) + la subtarea US-02.07, cuyo plan es [US/02.07-paciente-reagenda-cancela.md](../US/02.07-paciente-reagenda-cancela.md). |
| **Commits** | ninguno propio. ADR-10 y US-02.07 entraron con `2877b13` (fila 41, Fase 1); FD-06 con `16b50e1` (fila 38). |

---

## Orden de lectura recomendado

1. **[ROADMAP § Fase 3](../ROADMAP.md#fase-3--us-04-respuesta-del-paciente)** — la relación con
   US-02.07: US-04 se construye **sobre** el enlace por cita de ADR-10 (mismo token, misma página).
2. **[US-02.07](../US/02.07-paciente-reagenda-cancela.md)** — el análisis completo (§1–§9) del que sale
   ADR-10.
3. **[ADR-10](../Decisions/ADR-10.md)** — la decisión propuesta. Mira §5 (nada después de `inicio`), §6
   (canal: A, B o C, y cuándo DT-16 se vuelve bloqueante), *Decisiones que deja abiertas* y
   [Pendiente para aceptar](../Decisions/ADR-10.md#pendiente-para-aceptar).
4. **[ADR-13 §12](../Decisions/ADR-13.md)** — el bloque `accion` de la plantilla, preparado para este
   enlace, y por qué se desactiva el seguimiento de clics.
5. **[FD-06](../Frontend-Decisions/FD-06.md)** — lo que el front propuso: confirmar, cancelar y cambiar
   la hora desde una sola página. Ojo con el choque señalado abajo.
6. **Deudas que se reabren o pesan aquí:** [DT-30](../Deudas/DT-30.md), [DT-16](../Deudas/DT-16.md),
   [DT-18](../Deudas/DT-18.md), [DT-23](../Deudas/DT-23.md).

---

## Qué hay diseñado (y qué no)

**Diseñado (propuesto, sin aceptar):** el enlace por cita de ADR-10 —token opaco que sirve para una
cita, guardado hasheado, que viaja en el fragmento `#` y en la cabecera `X-Enlace-Cita`, caduca en
`inicio` y se revoca al cerrar la cita—; cancelar con la transición existente; pedir reagendar como
una **petición** que no mueve la cita.

**Por decidir al retomar la fase:**

- aceptar ADR-10: revisión del hacker ([H7](../PREGUNTAS-ABIERTAS.md#h7--modelo-de-amenazas-del-enlace-por-cita-antes-de-construirlo--la-otra-mitad-de-q11))
  y reabrir [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) con la
  salida **B** (el enlace viaja en el recordatorio);
- **confirmar desde el enlace**, que ADR-10 dejó fuera porque cambia la semántica de `ghosting`;
- los botones de asistencia del voucher ([DT-30](../Deudas/DT-30.md)), que entran en el mismo release.

> **Choque a resolver: FD-06 frente a ADR-10.** FD-06 dice que reagendar "siempre necesita una página,
> porque hay que mostrarle horarios disponibles para elegir". ADR-10 §4 lo diseña como una **petición**
> sin mover la cita, y el sistema no tiene modelo de disponibilidad (ADR-09 §2). Es la misma tensión
> que resolvió FD-01 a favor de ADR-09; aquí sigue abierta (ROADMAP, *Decisiones previas* 5).

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documento |
|---|---|---|---|---|
| 38 | `16b50e1` | 2026-09-10 | FD-06 propuesta | [FD-06](../Frontend-Decisions/FD-06.md) |
| 41 | `2877b13` | 2026-09-25 | ADR-10 propuesto y plan de US-02.07 | [ADR-10](../Decisions/ADR-10.md) · [US-02.07](../US/02.07-paciente-reagenda-cancela.md) |
| 54 | `4c543a5` | 2026-09-28 | US-02.07 aplazada fuera de la v1 (Q11 → C) | ADR-10 · US-02.07 · PREGUNTAS |
| 59 | `ab30bb7` | 2026-09-30 | ADR-13 prepara el bloque `accion`; DT-30 espera a esta fase | [ADR-13](../Decisions/ADR-13.md) · [DT-30](../Deudas/DT-30.md) |

---

## Decisiones

| Documento | En una línea | Estado |
|---|---|---|
| [ADR-10](../Decisions/ADR-10.md) | Enlace por cita: cancela con la transición existente, pide reagendar sin mover la cita | **Propuesto** · aplazado fuera de la v1 (Q11 → C) |
| [ADR-13](../Decisions/ADR-13.md) §12 | La plantilla del recordatorio trae un bloque `accion?` vacío para este enlace | Aceptado (Fase 2) |
| [FD-06](../Frontend-Decisions/FD-06.md) | Confirmar, cancelar o cambiar la hora desde el correo, en una sola página | Propuesta |

**No depende de ADR-08:** el enlace no lleva `tenantSlug` (ADR-10, *Relación*).

---

## Features

Ninguna.

---

## Deudas

| Deuda | Por qué pesa en esta fase |
|---|---|
| [DT-30](../Deudas/DT-30.md) | ~~**se reabre al empezar la fase**: la confirmación del paciente lleva las citas a `confirmada` y recién ahí funcionan los botones de asistencia~~ **mitigada el 2026-10-05**: el voucher ya tiene Confirmar, Asistió y No asistió; la confirmación del paciente desde el enlace se suma y reduce las citas que llegan `pendiente` a su hora |
| [DT-11](../Deudas/DT-11.md) | la fecha de corte del `ghosting` retroactivo será el despliegue de esta fase |
| [DT-16](../Deudas/DT-16.md) | con la salida B escribe Citia; ADR-10 §6 la daba por bloqueante y el usuario aceptó el riesgo (2026-09-30) |
| [DT-18](../Deudas/DT-18.md) | ADR-10 exige límite de tasa antes del primer enlace real |
| [DT-23](../Deudas/DT-23.md) | el enlace, como el RUT, no verifica identidad |
| [DT-26](../Deudas/DT-26.md) | la retención se amplía a enlaces y peticiones cerradas |
| previstas de ADR-10 | cuatro, sin número ([ADR-10 § Deudas](../Decisions/ADR-10.md#deudas-técnicas-asociadas)) |

---

## Preguntas abiertas relacionadas

- [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) — respondida C;
  se reabre con B.
- [H7](../PREGUNTAS-ABIERTAS.md#h7--modelo-de-amenazas-del-enlace-por-cita-antes-de-construirlo--la-otra-mitad-de-q11)
  — modelo de amenazas del enlace. **ADR-10 no se acepta sin ella.**
- [ADR-10 § Decisiones que deja abiertas](../Decisions/ADR-10.md#decisiones-que-este-adr-deja-abiertas)
  — tope de validez, reemisión, `tipoConsulta`, confirmar desde el enlace.

---

## Planes de US

- [US-02.07](../US/02.07-paciente-reagenda-cancela.md) — ⏸ aplazada; el análisis se conserva.
- US-04 — sin plan todavía.

---

## Contraparte en el frontend

- [us/02.07-paciente-reagenda-cancela.md](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md)
  — la vista del paciente (`/cita#<token>`), planificada y bloqueada por ADR-10.

---

## Depende de / desbloquea

- **Depende de:** la [Fase 2](fase-2-us03-recordatorios.md) (el recordatorio es lo que lleva el enlace)
  y de que se acepte ADR-10 (H7 y Q11).
- **Desbloquea:** la [Fase 4](fase-4-us05-alertas.md) (confirmar y cancelar disparan alertas) y la
  [Fase 5](fase-5-us07-scoring.md) (la respuesta registrada y la asistencia marcable alimentan el
  scoring).
