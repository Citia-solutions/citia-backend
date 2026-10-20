# Fase 5 — US-07: Calificación de asistencia (scoring, RF-08)

> **Fase del roadmap** (construcción). Índice: [Fases](README.md) · Estado y desglose de tareas en el
> [ROADMAP § Fase 5](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring).

| | |
|---|---|
| **Objetivo** | Que el profesional vea el historial de comportamiento de cada paciente: porcentaje de asistencia y clasificación "nuevo", "regular", "confiable" o "riesgo" ([ADR-14](../Decisions/ADR-14.md) agrega "regular" a las tres de RF-08). |
| **Entregable** | El profesional ve el historial de comportamiento de cada paciente (ROADMAP). |
| **Estado** | 🔶 **en construcción: US-07.01 (registro de hechos) desde el 2026-10-19; US-07.02 y US-07.03 siguen en la v2.** US-07.01 se adelanta a la [Fase 4](fase-4-us05-alertas.md), de la que no depende. *Antes (2026-09-30 → 2026-10-19): ⏸ fuera del MVP, pasa a la v2 (decisión del usuario); era la tercera pieza del MVP hasta el 2026-09-30.* |
| **Fechas** | salida del MVP: 2026-09-30 · diseño ([ADR-14](../Decisions/ADR-14.md)) y arranque de US-07.01: 2026-10-19. |
| **Historia** | US-07, en tres subtareas con la convención de US-02.07 / US-02.08: **US-07.01** · registro de hechos ([plan](../US/07.01-registro-hechos.md)) · **US-07.02** · calificación y riesgo (sin plan) · **US-07.03** · acciones (sin plan). La calibración es una tarea posterior, sin US propia. No confundir US-07.01 con la subtarea US-02.07. |
| **Commits** | ninguno propio todavía (US-07.01 se construye en la rama `feature/fase5-registro-hechos`). |

---

## Orden de lectura recomendado

1. **[ADR-14](../Decisions/ADR-14.md)** — **el diseño de esta fase** (2026-10-19; **aceptado en lo que toca a
   US-07.01**, el resto propuesto): calificación del paciente por puntos fijos sobre 12 meses, cuatro
   etiquetas, riesgo por cita, regla estricta de datos, dos transiciones nuevas desde `pendiente` y el
   **registro de hechos** de US-07.01, que va primero. Empieza aquí.
2. **[Plan US-07.01](../US/07.01-registro-hechos.md)** — el contrato de lo que se construye ahora: migraciones,
   guardas, DTO, hechos, primera apertura del portal, job G1 detrás de `CIERRE_GHOSTING_ACTIVO`, orden por
   agente, Definición de Terminado y riesgos.
3. **[Descripcion/fase-3-mvp.md](../Descripcion/fase-3-mvp.md#la-calificación-sale-del-mvp-pero-su-materia-prima-corre)**
   — por qué sale del MVP y qué se pierde mientras tanto.
4. **[DT-30](../Deudas/DT-30.md)** — la asistencia real solo existe si alguien la marca ese día. Mitigada el
   2026-10-05: el voucher la registra desde esa fecha; lo anterior se perdió. Una cita `pendiente` todavía no
   se puede marcar: lo resuelve US-07.01 (ADR-14 §9, aceptada).
5. **[DT-11](../Deudas/DT-11.md)** — el `ghosting` sí se reconstruye, con una fecha de corte. Desde el
   2026-10-14 tiene su **regla G1** escrita, con el corte del **2026-10-17 a las 03:22 UTC**. El job se construye
   en US-07.01.
6. **[ADR-04](../Decisions/ADR-04.md)** §2 y §4 — `ghosting` ≠ `no_asistio` y el estado materializado (con la
   nota del 2026-10-19: las transiciones desde `pendiente`, aceptadas).
7. **[ADR-12 §8](../Decisions/ADR-12.md)** — el proceso de cierre aplazado con el mecanismo listo y la
   tabla de preguntas de Q6.
8. **[ADR-10 §5](../Decisions/ADR-10.md)** — la regla que el job de cierre debe respetar: una petición
   de reagendamiento sin atender no es `ghosting`. *(2026-10-14: ADR-10 aceptado; la regla es la
   condición 3 de G1.)*

---

## Qué necesita esta fase y dónde está

| Insumo | Estado | Dónde |
|---|---|---|
| Estados `ghosting` / `no_asistio` / `asistio` | ✅ modelados | ADR-04 §2 (Fase 0) |
| Historial de reagendamientos | ✅ bitácora `cambios_cita` | ADR-09 §6 · DT-22 cerrada (Fase 1) |
| Job de cierre (`ghosting`) | mecanismo decidido; **se construye en US-07.01**, detrás de `CIERRE_GHOSTING_ACTIVO` (apagado por defecto) · *(antes: job aplazado)* | ADR-12 §8 · DT-11 · [plan § Job G1](../US/07.01-registro-hechos.md#job-g1) |
| Asistencia real | ✅ se registra desde el 2026-10-05 (Confirmar, Asistió y No asistió en el voucher; DT-30 mitigada); lo anterior no se recupera. Hoy solo desde `confirmada`; **US-07.01 la permite también desde `pendiente`** y exige que haya llegado la hora ([ADR-14 §9](../Decisions/ADR-14.md#9-cambio-en-la-máquina-de-estados-extiende-adr-04), aceptada) · *(antes: "no se registra hasta la Fase 3")* | DT-30 (mitigada) · ADR-14 §9 |
| Quién pidió cada cancelación o reagendamiento | ⬜ **US-07.01** (`cambios_cita.pedido_por`) | ADR-14 §10.c |
| Origen de la cita | ⬜ **US-07.01** (`citas.origen`: `manual` \| `solicitud_publica`, con relleno) | ADR-14 §10.b |
| Si el paciente abrió su enlace | ⬜ **US-07.01** (`enlaces_cita.primera_apertura_en`) | ADR-14 §10.a |
| Confirmación del paciente | ✅ en producción desde el 2026-10-17 (Fase 3); pesa igual que la del profesional (G2), el peso se decide aquí | ADR-10 · [Fase 3](fase-3-us04-respuesta-paciente.md) |
| Regla del `ghosting` | ✅ escrita (G1, 2026-10-14); corte = **2026-10-17, 03:22 UTC** (despliegue de la Fase 3) | [DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14) |
| Revisión legal | ⬜ pendiente; **bloquea US-07.02 y US-07.03**, no US-07.01 | [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) |

---

## Decisiones

| ADR | Qué aporta a esta fase | Estado |
|---|---|---|
| [ADR-14](../Decisions/ADR-14.md) | **el diseño de la fase**: calificación del paciente (puntos fijos, 12 meses, cuatro etiquetas), riesgo por cita, acciones permitidas, regla estricta de datos, transiciones desde `pendiente`, registro de hechos de US-07.01 y contexto legal a validar | **Aceptado en lo que toca a US-07.01 (2026-10-19)** · US-07.02 y US-07.03 propuestas · abierto: revisión legal, calibración, peso de `nuevo` |
| [ADR-04](../Decisions/ADR-04.md) | grafo de estados y materialización | Aceptado · §4 reemplazado por ADR-12 · §2 extendido por ADR-14 con dos transiciones desde `pendiente` y la guarda de la hora (aceptadas el 2026-10-19) |
| [ADR-12](../Decisions/ADR-12.md) §8 | mecanismo del job de cierre | Aceptado · el job se construye en US-07.01 |
| [ADR-10](../Decisions/ADR-10.md) §5 | petición sin atender ≠ `ghosting`; regla G1 completa | ✅ Aceptado (2026-10-14) |

---

## Features, planes y commits

| Tipo | Documento | Estado |
|---|---|---|
| Plan | [US-07.01 · registro de hechos](../US/07.01-registro-hechos.md) | 🔶 en construcción (2026-10-19) |
| Plan | US-07.02 · calificación y riesgo | sin plan; después de la revisión legal |
| Plan | US-07.03 · acciones | sin plan |
| Feature | — | se crea al cerrar US-07.01 |
| Commits | — | ninguno todavía |

---

## Deudas

| Deuda | Relación |
|---|---|
| [DT-11](../Deudas/DT-11.md) | **la implementa US-07.01**: el job G1 con su regla y el corte del 2026-10-17. Se cierra cuando el job quede **prendido en production** (`CIERRE_GHOSTING_ACTIVO=true`). *(Antes: "se cierra al retomar RF-08 y decidir la pregunta 2 de Q6".)* |
| [DT-30](../Deudas/DT-30.md) | sin asistencia registrada no hay qué calificar. US-07.01 cierra la brecha de las citas `pendiente` (ADR-14 §9 es la salida B que DT-30 dejaba para un ADR propio) y lleva al dominio el bloqueo por hora |
| [DT-13](../Deudas/DT-13.md) | una cita creada en el pasado fabricaría un incumplimiento falso: G1 la deja fuera (nunca recibe recordatorio) y la calificación no la cuenta; la validación al crear sigue abierta |
| [DT-40](../Deudas/DT-40.md) | con `MENSAJERIA_ADAPTADOR=registro` un recordatorio queda `enviado` sin salir: el job G1 de US-07.01 no lo toma como vía real |
| [DT-44](../Deudas/DT-44.md) | una petición de otra hora rechazada en silencio no protege del `ghosting` (G1 solo excluye las `recibida`); el peso lo decide US-07.02 (ADR-14 §8) |
| [DT-23](../Deudas/DT-23.md) | un tercero podría ensuciar la reputación de una persona real |
| [DT-29](../Deudas/DT-29.md) | los estados `recuperada` / `riesgo_alto` del diseño del dashboard dependen de RF-08 |

---

## Preguntas abiertas relacionadas

- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) —
  pregunta 1 (¿cuándo vence una cita?) respondida por la regla G1 el 2026-10-14
  ([DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14)); pregunta 2 (¿qué pasa con las `confirmada`
  sin cerrar?), **abierta**: el job G1 no las toca.
- [Q16](../PREGUNTAS-ABIERTAS.md#q16--modelo-de-amenazas-de-la-vía-pública) —
  pregunta 2: suplantación y reputación.
- Las del [plan US-07.01](../US/07.01-registro-hechos.md#preguntas-abiertas) (ninguna bloquea): confirmar una
  `pendiente` que ya empezó, la corrección de un cierre equivocado, la precisión de la condición 2 de G1 y el
  valor inválido del interruptor.
- Las de [ADR-14](../Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar) para US-07.02: el peso
  de `nuevo` en el riesgo y llevar la acción directo al profesional cuando el recordatorio no se pudo entregar.

---

## Contraparte en el frontend

**US-07.01** (`citia-frontend`, en paralelo al backend, mismo contrato): en el voucher, *Asistió* y *No asistió*
también sobre citas `pendiente` cuya hora ya llegó, guiados por `accionesPermitidas`; *"¿Quién lo pidió?"*
(*Paciente* / *Decisión mía*), obligatoria, al cancelar y al reagendar; el filtro *"Sin respuesta"* en la agenda.
Detalle en el [plan § Frontend](../US/07.01-registro-hechos.md#frontend-citia-frontend-en-vue).

---

## Depende de / desbloquea

- **Depende de:** [Fase 1](fase-1-us02-gestion-citas.md), [Fase 3](fase-3-us04-respuesta-paciente.md),
  el proceso de cierre (ADR-12) y la asistencia registrada (DT-30). **US-07.01 no depende de la
  [Fase 4](fase-4-us05-alertas.md)** y por eso se construye antes. US-07.02 y US-07.03 dependen además de la
  revisión legal.
- **Desbloquea:** la [Fase 6](fases-6-7-us09-sin-diseno.md#fase-6--us-08-monitoreo-y-seguimiento-del-paciente)
  (el ROADMAP la hace depender de US-07).
