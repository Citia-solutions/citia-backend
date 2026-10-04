# Fase 4 — US-05: Alertas al profesional (RF-05)

> **Fase del roadmap** (construcción). Índice: [Fases](README.md) · Estado y desglose de tareas en el
> [ROADMAP § Fase 4](../ROADMAP.md#fase-4--us-05-alertas-al-profesional).

| | |
|---|---|
| **Objetivo** | Que el profesional reciba en menos de 3 s una alerta cuando se reagenda, se cancela o llega una solicitud, y que pueda gestionarlas (leídas / no leídas, aviso por correo). |
| **Entregable** | El profesional recibe alertas en < 3 s y las gestiona (ROADMAP). |
| **Estado** | ⬜ nada propio. Fuera del MVP. *(2026-10-04: la Fase 2, en rama, ya trae el outbox con despachador y un primer suscriptor, los recordatorios; ver [DT-32](../Deudas/DT-32.md) y [DT-33](../Deudas/DT-33.md).)* |
| **Fechas** | — |
| **Historia** | US-05 — sin plan. |
| **Commits** | ninguno propio. |

---

## Orden de lectura recomendado

1. **[ROADMAP § Fase 4](../ROADMAP.md#fase-4--us-05-alertas-al-profesional)** — las tareas de backend,
   frontend e integración.
2. **[ADR-09 §7](../Decisions/ADR-09.md)** — por qué los hechos se publican "aunque nadie escuche": es el
   enchufe de RF-05.
3. **[ADR-12](../Decisions/ADR-12.md)** — §4 (reglas de los suscriptores: las alertas serán uno más) y
   *Consecuencias*: la latencia de segundos del despachador **no** alcanza para los 3 s; la evolución
   anotada es `LISTEN/NOTIFY`.
4. **[DT-28](../Deudas/DT-28.md)** — *Lo que queda*: avisar al profesional de solicitudes sin atender.

---

## Lo que ya hay

- Los casos de uso de cita y bandeja publican `CitaCreada`, `CitaReagendada`, `CitaCancelada`,
  `SolicitudCitaAceptada`, … ([ADR-12, *Lo que hay hoy*](../Decisions/ADR-12.md)).
- Con la [Fase 2](fase-2-us03-recordatorios.md), esos hechos pasan por el outbox; las alertas se
  enchufan como otro suscriptor.

## Lo que falta decidir

- **Tiempo real: WebSockets o SSE** — *Decisiones previas* 3 del ROADMAP, abierta.
- Cómo bajar la latencia a < 3 s (RNF-01): `LISTEN/NOTIFY` según ADR-12.

---

## Decisiones

| ADR | Qué aporta a esta fase | Estado |
|---|---|---|
| [ADR-09](../Decisions/ADR-09.md) §7 | los hechos ya se publican | Aceptado · implementado |
| [ADR-12](../Decisions/ADR-12.md) §4 | reglas de suscriptores; latencia y `LISTEN/NOTIFY` | Aceptado · implementado en la rama de la Fase 2 (sin `LISTEN/NOTIFY`) |
| [ADR-10](../Decisions/ADR-10.md) | prevé la deuda "sin aviso en tiempo real al profesional" mientras RF-05 esté fuera | Propuesto |

**Decisiones del frontend:** ninguna.

---

## Features, planes y commits

Ninguno.

---

## Deudas

- [DT-28](../Deudas/DT-28.md) — el aviso al profesional de solicitudes sin atender es la pieza 1 de lo
  que queda.
- Prevista de ADR-12 sin número: *latencia de segundos incompatible con RF-05 sin `LISTEN/NOTIFY`*.

---

## Preguntas abiertas relacionadas

Ninguna fichada en [PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md). La elección WebSockets / SSE vive
solo en el [ROADMAP](../ROADMAP.md#decisiones-previas).

---

## Contraparte en el frontend

Ninguna todavía.

---

## Depende de / desbloquea

- **Depende de:** [Fase 1](fase-1-us02-gestion-citas.md) (disparadores de reagendar y cancelar),
  [Fase 2](fase-2-us03-recordatorios.md) (outbox) y [Fase 3](fase-3-us04-respuesta-paciente.md)
  (confirmar y cancelar del paciente).
- **Desbloquea:** nada declarado en el ROADMAP.
