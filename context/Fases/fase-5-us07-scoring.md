# Fase 5 — US-07: Calificación de asistencia (scoring, RF-08)

> **Fase del roadmap** (construcción). Índice: [Fases](README.md) · Estado y desglose de tareas en el
> [ROADMAP § Fase 5](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring).

| | |
|---|---|
| **Objetivo** | Que el profesional vea el historial de comportamiento de cada paciente: porcentaje de asistencia y clasificación "nuevo", "confiable" o "riesgo". |
| **Entregable** | El profesional ve el historial de comportamiento de cada paciente (ROADMAP). |
| **Estado** | ⏸ **fuera del MVP, pasa a la v2** (decisión del usuario, 2026-09-30). Era la tercera pieza del MVP hasta ese día. |
| **Fechas** | salida del MVP: 2026-09-30. |
| **Historia** | US-07 — sin plan. No confundir con la subtarea US-02.07. |
| **Commits** | ninguno propio. |

---

## Orden de lectura recomendado

1. **[Descripcion/fase-3-mvp.md](../Descripcion/fase-3-mvp.md#la-calificación-sale-del-mvp-pero-su-materia-prima-corre)**
   — por qué sale del MVP y qué se pierde mientras tanto.
2. **[DT-30](../Deudas/DT-30.md)** — **lo más importante de esta fase hoy**: la asistencia real no se
   registra y no se puede reconstruir. Esta fase arrancará sin ese historial.
3. **[DT-11](../Deudas/DT-11.md)** — el `ghosting` sí se reconstruye, con una fecha de corte.
4. **[ADR-04](../Decisions/ADR-04.md)** §2 y §4 — `ghosting` ≠ `no_asistio` y el estado materializado.
5. **[ADR-12 §8](../Decisions/ADR-12.md)** — el proceso de cierre aplazado con el mecanismo listo y la
   tabla de preguntas de Q6.
6. **[ADR-10 §5](../Decisions/ADR-10.md)** — la regla que el job de cierre debe respetar: una petición
   de reagendamiento sin atender no es `ghosting`.

---

## Qué necesita esta fase y dónde está

| Insumo | Estado | Dónde |
|---|---|---|
| Estados `ghosting` / `no_asistio` / `asistio` | ✅ modelados | ADR-04 §2 (Fase 0) |
| Historial de reagendamientos | ✅ bitácora `cambios_cita` | ADR-09 §6 · DT-22 cerrada (Fase 1) |
| Job de cierre (`ghosting`) | mecanismo decidido, job aplazado | ADR-12 §8 · DT-11 |
| Asistencia real | **no se registra** hasta la Fase 3 | DT-30 |
| Confirmación del paciente | llega con la Fase 3 | ADR-10 · [Fase 3](fase-3-us04-respuesta-paciente.md) |

---

## Decisiones

| ADR | Qué aporta a esta fase | Estado |
|---|---|---|
| [ADR-04](../Decisions/ADR-04.md) | grafo de estados y materialización | Aceptado · §4 reemplazado por ADR-12 |
| [ADR-12](../Decisions/ADR-12.md) §8 | mecanismo del job de cierre | Aceptado · el job, aplazado |
| [ADR-10](../Decisions/ADR-10.md) §5 | petición sin atender ≠ `ghosting` | Propuesto |

---

## Features, planes y commits

Ninguno.

---

## Deudas

| Deuda | Relación |
|---|---|
| [DT-30](../Deudas/DT-30.md) | sin asistencia registrada no hay qué calificar; adelantar el scoring obliga a elegir A o B |
| [DT-11](../Deudas/DT-11.md) | se cierra al retomar RF-08 (preguntas 1 y 2 de Q6, fecha de corte) |
| [DT-13](../Deudas/DT-13.md) | con el proceso de cierre, una cita creada en el pasado fabricaría un incumplimiento falso |
| [DT-23](../Deudas/DT-23.md) | un tercero podría ensuciar la reputación de una persona real |
| [DT-29](../Deudas/DT-29.md) | los estados `recuperada` / `riesgo_alto` del diseño del dashboard dependen de RF-08 |

---

## Preguntas abiertas relacionadas

- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) —
  preguntas 1 (¿cuándo vence una cita?) y 2 (¿qué pasa con las `confirmada` sin cerrar?), abiertas.
- [H3](../PREGUNTAS-ABIERTAS.md#h3--modelo-de-amenazas-de-la-vía-pública-antes-de-construirla) —
  pregunta 2: suplantación y reputación.

---

## Contraparte en el frontend

Ninguna todavía.

---

## Depende de / desbloquea

- **Depende de:** [Fase 1](fase-1-us02-gestion-citas.md), [Fase 3](fase-3-us04-respuesta-paciente.md),
  el proceso de cierre (ADR-12) y la asistencia registrada (DT-30).
- **Desbloquea:** la [Fase 6](fases-6-7-us09-sin-diseno.md#fase-6--us-08-monitoreo-y-seguimiento-del-paciente)
  (el ROADMAP la hace depender de US-07).
