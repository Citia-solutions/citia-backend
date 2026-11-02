# Fase 5 — US-07: Calificación de asistencia (scoring, RF-08)

> **Fase del roadmap** (construcción). Índice: [Fases](README.md) · Estado y desglose de tareas en el
> [ROADMAP § Fase 5](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring).

| | |
|---|---|
| **Objetivo** | Que el profesional vea el historial de comportamiento de cada paciente: porcentaje de asistencia y clasificación "nuevo", "regular", "confiable" o "riesgo" ([ADR-14](../Decisions/ADR-14.md) agrega "regular" a las tres de RF-08). |
| **Entregable** | El profesional ve el historial de comportamiento de cada paciente (ROADMAP). |
| **Estado** | 🔶 **US-07.01 (registro de hechos) en producción desde el 2026-10-20, con el job G1 prendido desde el 2026-10-27 ([DT-11](../Deudas/DT-11.md) cerrada) y sus pruebas manuales en curso. US-07.02 y US-07.03 quedan 🚧 bloqueadas desde el 2026-10-30, plan incluido** ([abajo](#bloqueo-de-us-0702-y-us-0703-2026-10-30)): el usuario no tiene abogado, y un pre-análisis legal hecho con una IA (no es una opinión legal) recomienda no habilitar el perfilamiento mientras no haya fundamento jurídico. Se desbloquean cuando un abogado revise el contexto legal de ADR-14 (o el usuario decida otra cosa); siguen además fuera del MVP, en la v2. Sus **decisiones de producto, aprobadas el 2026-10-30**, siguen vigentes ([abajo](#decisiones-de-producto-de-us-0702-2026-10-30)). **El siguiente paso de la fase es cerrar US-07.01**, con sus pruebas manuales, su feature y la TRAZABILIDAD ([abajo](#release-a-producción-2026-10-20)). Se adelantó a la [Fase 4](fase-4-us05-alertas.md), de la que no depende. *Antes (2026-10-30, hasta el bloqueo): "US-07.02 y US-07.03 siguen en la v2"; "el siguiente paso es el plan de US-07.02, que ya no bloquean las preguntas de producto. La revisión legal (sin abogado al 2026-10-30) sigue bloqueando la implementación de US-07.02 y US-07.03, no su plan". Antes (2026-10-20 → 2026-10-27): en producción con el job G1 apagado. Antes (2026-10-19 → 2026-10-20): 🔶 en construcción. Antes (2026-09-30 → 2026-10-19): ⏸ fuera del MVP, pasa a la v2 (decisión del usuario); era la tercera pieza del MVP hasta el 2026-09-30.* |
| **Fechas** | salida del MVP: 2026-09-30 · diseño ([ADR-14](../Decisions/ADR-14.md)) y arranque de US-07.01: 2026-10-19 · merge a `develop` y **release a producción de US-07.01: 2026-10-20** (04:43 UTC) · **job G1 prendido: 2026-10-27** (18:39 UTC) · **decisiones de producto de US-07.02 y bloqueo de US-07.02 y US-07.03: 2026-10-30**. |
| **Historia** | US-07, en tres subtareas con la convención de US-02.07 / US-02.08: **US-07.01** · registro de hechos ([plan](../US/07.01-registro-hechos.md)) · **US-07.02** · calificación y riesgo (sin plan; 🚧 bloqueada desde el 2026-10-30, plan incluido · *antes: "es el siguiente paso"*) · **US-07.03** · acciones (sin plan; 🚧 bloqueada desde el 2026-10-30). La calibración es una tarea posterior, sin US propia. No confundir US-07.01 con la subtarea US-02.07. |
| **Commits** | US-07.01, en la rama `feature/fase5-registro-hechos`: `3e64472` (ADR-14 y plan), `1545ad7` (esquema), `f123617` (dominio, API y job G1), `8a7953b` y `d4aa920` (tests), `bb90815` (DT-47); el merge `715c3f3` (PR #12) a `develop` y el release `313a506` (PR #13) a `main`. En el frontend, `9e3be69` y `af10f5e`, el merge `ef61077` (PR #13) y el release `69668ec` (PR #14). Filas 105–112 de la [TRAZABILIDAD](../TRAZABILIDAD.md); las decisiones y el bloqueo del 2026-10-30 (`c3e7b42`, `8c74f70`, `f6d0aa4`), filas 113–115, y su PR de docs directo a `main` (`33fc74c`), fila 117 *(registradas el 2026-11-01; antes: sin filas)*. |

---

## Release a producción (2026-10-20)

**US-07.01 está en producción**, en los dos repos, desde el 2026-10-20 a las 04:43 UTC:

| | Backend | Frontend |
|---|---|---|
| A `develop` (staging) | [PR #12](https://github.com/Citia-solutions/citia-backend/pull/12), `715c3f3` | [PR #13](https://github.com/Citia-solutions/citia-frontend/pull/13), `ef61077` |
| A `main` (production) | [PR #13](https://github.com/Citia-solutions/citia-backend/pull/13), `313a506` | [PR #14](https://github.com/Citia-solutions/citia-frontend/pull/14), `69668ec` |

- **Antes del release:** 1987 unitarios, 212 de integración y 326 e2e en verde.
- **Del 2026-10-20 al 2026-10-27, el job G1 estuvo apagado** (`CIERRE_GHOSTING_ACTIVO=false`, el valor por
  defecto): no escribía nada y al minuto 40 de cada hora dejaba en el log `citas.cierre_ghosting.simulado` con
  cuántas citas cerraría y la más antigua.
- **Revisión de solo lectura en production (2026-10-23):** las migraciones 15000–18000 están aplicadas, la primera
  apertura del enlace quedó registrada en una cita de prueba y el job G1 cerraría **1 cita** (esa misma, que se
  dejó sin responder a propósito). Todavía no había ningún `ghosting` en la base.
- **Job G1 prendido el 2026-10-27:** `CIERRE_GHOSTING_ACTIVO=true` en production, despliegue de las 18:39 UTC, log
  `planificador.activo` con `modo: 'activo'`. Primer tick a las 18:40 UTC: `citas.cierre_ghosting` con
  `cerradas: 1, fallidas: 0, interrumpido: false` (la cita de prueba del 2026-10-20). El 2026-10-28 a las 00:40 de
  Chile cerró otra cita de prueba. **[DT-11](../Deudas/DT-11.md) queda cerrada.**
- **Revisión de solo lectura en production (2026-10-28, la corrió el usuario):** hay **3 `ghosting` con actor
  `sistema`** y **0 candidatas** pendientes; G1 respetó su condición 2 (una cita pasada sin recordatorio siguió
  `pendiente`). Se comprobó además: el portal (la cancelación del paciente queda con actor `paciente` y
  `pedido_por paciente`; la primera apertura se registra y no cambia al reabrir), reagendar con
  `pedido_por profesional`, el `origen` correcto, el voucher marcando `pendiente → asistio` y el webhook nuevo de
  Resend tras la rotación de credenciales del 2026-10-24.

**Qué falta para cerrar US-07.01** (al 2026-10-30: en producción con G1 prendido, **pruebas manuales en curso**,
todavía no cerrada). Desde el bloqueo de US-07.02 y US-07.03 (2026-10-30), **cerrarla es el siguiente paso de la
fase**:

1. 🔶 Las pruebas manuales de la
   [verificación mínima](../US/07.01-registro-hechos.md#verificación-manual-mínima): **en curso**. La revisión del
   2026-10-28 comprobó lo de arriba; **faltan** *No asistió* marcado por el profesional sobre una `pendiente`
   (`ghosting` con actor `profesional`) y *"¿Quién lo pidió?" = El paciente* elegido desde la app.
2. ✅ **Prender el job G1** en production (2026-10-27). Con eso se cerró [DT-11](../Deudas/DT-11.md).
3. ⬜ La feature de US-07.01. *(Sus filas en la [TRAZABILIDAD](../TRAZABILIDAD.md), 105–115, se registraron el
   2026-11-01, en la pasada de docs de la Fase 7. Antes: "y sus filas en la TRAZABILIDAD (atrasada desde la fila 96; se
   rellena en el PR de cierre)".)*

**Pendiente menor de código** (no es deuda): la línea `citas.cierre_ghosting` del modo activo no lleva `msg` y en
Railway se ve sin mensaje (`src/modules/cita/infrastructure/planificacion/planificador-cierre-citas.ts`, el
`logger.log` del resumen del tick). Las demás líneas del job sí lo llevan.

---

## Decisiones de producto de US-07.02 (2026-10-30)

El usuario respondió las preguntas abiertas de [ADR-14](../Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar).
Quedan registradas allí como **aprobadas el 2026-10-30**, con su "antes". El bloqueo de US-07.02 y US-07.03 del
mismo día ([abajo](#bloqueo-de-us-0702-y-us-0703-2026-10-30)) **no las revierte**: siguen vigentes y quedan listas
para cuando se desbloqueen.

| # | Decisión | Dónde |
|---|---|---|
| 1 | **`nuevo` suma 0** en el riesgo de la cita (antes +1); las situaciones típicas se recalcularon | ADR-14 §5.b y §5.d |
| 2 | **Recordatorio no entregado → la acción va al profesional**; no se insiste por el mismo canal | ADR-14 §5.a y §5.b |
| 3 | **El +3 suma las fallas del contacto del paciente y las del sistema** (cuota de Resend, fusible del tenant); no los recordatorios apagados ni `creada_tarde`. Cambia la inclinación anterior ("solo lo del paciente") | ADR-14 §5.b |
| 4 | **"Se reagendó 2 o más veces" cuenta solo lo que pidió el paciente** (vacío = profesional) | ADR-14 §5.b |
| 5 | **Un solo hecho por hora comprometida, el peor**; mientras el rechazo no se avise ([DT-44](../Deudas/DT-44.md)), la petición rechazada no cuenta como falta (−10, no −35) | ADR-14 §3 y §8 |
| 6 | **Un cierre equivocado se corrige dentro de 7 días** (Asistió ↔ No asistió, también los de G1; las canceladas no). Excepción a "de un terminal no se sale" | ADR-14 §9 · nota en [ADR-04](../Decisions/ADR-04.md) · [DT-48](../Deudas/DT-48.md) |
| 7 | **Las `confirmada` sin cerrar siguen neutras** y van a una **lista de citas pasadas sin cerrar**; candidata a adelantarse (no depende de la revisión legal), sin US ni número | [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) · [DT-30](../Deudas/DT-30.md) |
| 8 | **Nada compartido entre clínicas**: confirmado | ADR-14 §11 |
| 9 | **Revisión legal: sin abogado al 2026-10-30.** Sigue pendiente y, desde el bloqueo de ese día, **US-07.02 y US-07.03 esperan esa revisión enteras, plan incluido** ([abajo](#bloqueo-de-us-0702-y-us-0703-2026-10-30)) · *antes (hasta el bloqueo): "bloquea la implementación de US-07.02 y US-07.03, no su plan"* | ADR-14 § Contexto legal |

**Siguiente paso (desde el bloqueo del 2026-10-30):** **cerrar US-07.01** —las pruebas manuales que faltan, su
feature y la TRAZABILIDAD ([arriba](#release-a-producción-2026-10-20))—. El plan de US-07.02 queda 🚧 bloqueado;
cuando se desbloquee, debe precisar lo que ADR-14 dejó "a precisar en el plan" (el plazo, el tipo y el hecho de
la corrección; los motivos de recordatorio no nombrados; qué es una "hora comprometida"), y **antes de
implementar US-07.02 hay que corregir [DT-47](../Deudas/DT-47.md)**: la calificación lee el orden de la bitácora.
*Antes (2026-10-30, hasta el bloqueo): "Siguiente paso: el plan de US-07.02 (paso 4 del Plan de ejecución), que
todavía no existe".*

---

## Bloqueo de US-07.02 y US-07.03 (2026-10-30)

El 2026-10-30 el usuario decidió: *"vamos a bloquear esta fase del scoring"*. Queda así:

- **Qué se bloquea:** US-07.02 (calificación y riesgo) y US-07.03 (acciones), 🚧, **plan incluido**: ya no se
  escribe el plan de US-07.02 como siguiente paso.
- **Por qué:** el usuario no tiene abogado al 2026-10-30, y un **pre-análisis legal hecho con una IA** ese mismo
  día (**no es un abogado ni una opinión legal**) recomienda no habilitar el perfilamiento mientras no haya
  fundamento jurídico: el art. 16 bis, inciso 1, de la Ley 21.719 limita los datos de salud a los fines de las
  leyes sanitarias, y el art. 8 bis exige que la intervención humana sea real. El resumen, con los hechos
  verificados ese día (la postergación aprobada por el Senado y el Decreto 662), está en el
  [Contexto legal de ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado).
- **Cuándo se desbloquea:** cuando un abogado revise el *Contexto legal* de ADR-14, o si el usuario decide otra
  cosa. Sin fecha.
- **Qué sigue vigente:** las [decisiones de producto](#decisiones-de-producto-de-us-0702-2026-10-30) del
  2026-10-30, listas para cuando se desbloquee. Los detalles "a precisar en el plan de US-07.02" quedan igual, en
  espera.
- **Qué no cambia:** US-07.01 sigue en producción con el job G1 prendido, y sus pruebas manuales y su
  documentación de cierre siguen pendientes.
- **Deudas:** [DT-47](../Deudas/DT-47.md) sigue abierta y se corrige antes de implementar US-07.02, cuando se
  desbloquee; deja de ser un paso inmediato. [DT-48](../Deudas/DT-48.md) sigue abierta, con su salida decidida
  sin cambios.
- **Observación, sin decidir:** la corrección de un cierre dentro de 7 días (DT-48) y la lista de citas pasadas
  sin cerrar (pregunta 2 de Q6) no perfilan al paciente: **podrían separarse de US-07.02** si el usuario lo quiere.
  La lista ya figura como candidata.

---

## Orden de lectura recomendado

1. **[ADR-14](../Decisions/ADR-14.md)** — **el diseño de esta fase** (2026-10-19; **aceptado en lo que toca a
   US-07.01**, el resto propuesto, con sus **decisiones de producto aprobadas el 2026-10-30** y 🚧 bloqueado ese
   mismo día, plan incluido): calificación del
   paciente por puntos fijos sobre 12 meses, cuatro etiquetas, riesgo por cita, regla estricta de datos, dos
   transiciones nuevas desde `pendiente`, la corrección de un cierre dentro de 7 días y el **registro de hechos**
   de US-07.01, que va primero. Empieza aquí.
2. **[Plan US-07.01](../US/07.01-registro-hechos.md)** — el contrato de lo que se construyó (en producción desde
   el 2026-10-20): migraciones,
   guardas, DTO, hechos, primera apertura del portal, job G1 detrás de `CIERRE_GHOSTING_ACTIVO`, orden por
   agente, Definición de Terminado y riesgos.
3. **[Descripcion/fase-3-mvp.md](../Descripcion/fase-3-mvp.md#la-calificación-sale-del-mvp-pero-su-materia-prima-corre)**
   — por qué sale del MVP y qué se pierde mientras tanto.
4. **[DT-30](../Deudas/DT-30.md)** — la asistencia real solo existe si alguien la marca ese día. Mitigada el
   2026-10-05: el voucher la registra desde esa fecha; lo anterior se perdió. Desde el 2026-10-20 también se
   marca sobre una cita `pendiente` (US-07.01, ADR-14 §9).
5. **[DT-11](../Deudas/DT-11.md)** — el `ghosting` sí se reconstruye, con una fecha de corte. Desde el
   2026-10-14 tiene su **regla G1** escrita, con el corte del **2026-10-17 a las 03:22 UTC**. El job está en
   producción desde el 2026-10-20 y **prendido desde el 2026-10-27**: la deuda está **cerrada**.
6. **[ADR-04](../Decisions/ADR-04.md)** §2 y §4 — `ghosting` ≠ `no_asistio` y el estado materializado (con la
   nota del 2026-10-19: las transiciones desde `pendiente`, aceptadas; y la del 2026-10-30: la corrección de un
   cierre, única excepción a "de un terminal no se sale").
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
| Job de cierre (`ghosting`) | ✅ **prendido en production desde el 2026-10-27** (`CIERRE_GHOSTING_ACTIVO=true`); DT-11 cerrada · *(antes: job aplazado; 2026-10-19: en construcción en US-07.01; 2026-10-20 → 2026-10-27: en producción, apagado)* | ADR-12 §8 · DT-11 · [plan § Job G1](../US/07.01-registro-hechos.md#job-g1) |
| Corrección de un cierre equivocado | 🚧 **decidida el 2026-10-30** (dentro de 7 días); se construye en US-07.02, bloqueada desde el 2026-10-30 (no perfila al paciente: podría separarse, sin decidir) · *antes: ⬜, se construye en US-07.02* | [ADR-14 §9](../Decisions/ADR-14.md#9-cambio-en-la-máquina-de-estados-extiende-adr-04) · [DT-48](../Deudas/DT-48.md) |
| Orden fiable de la bitácora | ⬜ **corregir antes de implementar US-07.02**, cuando se desbloquee; desde el 2026-10-30 ya no es un paso inmediato | [DT-47](../Deudas/DT-47.md) |
| Asistencia real | ✅ se registra desde el 2026-10-05 (Confirmar, Asistió y No asistió en el voucher; DT-30 mitigada); lo anterior no se recupera. **Desde el 2026-10-20 también sobre una cita `pendiente`** (US-07.01), y el dominio exige que haya llegado la hora ([ADR-14 §9](../Decisions/ADR-14.md#9-cambio-en-la-máquina-de-estados-extiende-adr-04)) · *(antes: "no se registra hasta la Fase 3"; luego, solo desde `confirmada`)* | DT-30 (mitigada) · ADR-14 §9 |
| Quién pidió cada cancelación o reagendamiento | ✅ en producción desde el 2026-10-20 (`cambios_cita.pedido_por`, US-07.01) | ADR-14 §10.c |
| Origen de la cita | ✅ en producción desde el 2026-10-20 (`citas.origen`: `manual` \| `solicitud_publica`, con relleno) | ADR-14 §10.b |
| Si el paciente abrió su enlace | ✅ en producción desde el 2026-10-20 (`enlaces_cita.primera_apertura_en`) | ADR-14 §10.a |
| Confirmación del paciente | ✅ en producción desde el 2026-10-17 (Fase 3); pesa igual que la del profesional (G2), el peso se decide aquí | ADR-10 · [Fase 3](fase-3-us04-respuesta-paciente.md) |
| Regla del `ghosting` | ✅ escrita (G1, 2026-10-14); corte = **2026-10-17, 03:22 UTC** (despliegue de la Fase 3) | [DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14) |
| Decisiones de producto de US-07.02 | ✅ aprobadas por el usuario el 2026-10-30 ([arriba](#decisiones-de-producto-de-us-0702-2026-10-30)); siguen vigentes tras el bloqueo | [ADR-14](../Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar) |
| Revisión legal | ⬜ pendiente; **sin abogado al 2026-10-30**. **US-07.02 y US-07.03 están 🚧 bloqueadas hasta ella, plan incluido** (2026-10-30); no bloquea US-07.01 · *antes: "bloquea la implementación de US-07.02 y US-07.03, no su plan ni US-07.01"* | [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) |

---

## Decisiones

| ADR | Qué aporta a esta fase | Estado |
|---|---|---|
| [ADR-14](../Decisions/ADR-14.md) | **el diseño de la fase**: calificación del paciente (puntos fijos, 12 meses, cuatro etiquetas), riesgo por cita, acciones permitidas, regla estricta de datos, transiciones desde `pendiente`, corrección de un cierre, registro de hechos de US-07.01 y contexto legal a validar | **Aceptado en lo que toca a US-07.01 (2026-10-19)** · US-07.02 y US-07.03 propuestas, con sus **decisiones de producto aprobadas el 2026-10-30**, y **🚧 bloqueadas** ese mismo día, plan incluido · abierto: revisión legal y calibración · *antes: también el peso de `nuevo` y las demás preguntas de US-07.02* |
| [ADR-04](../Decisions/ADR-04.md) | grafo de estados y materialización | Aceptado · §4 reemplazado por ADR-12 · §2 extendido por ADR-14 con dos transiciones desde `pendiente` y la guarda de la hora (aceptadas el 2026-10-19) y con **una excepción a "de un terminal no se sale"**: la corrección de un cierre dentro de 7 días (aprobada el 2026-10-30, nota en ADR-04) |
| [ADR-12](../Decisions/ADR-12.md) §8 | mecanismo del job de cierre | Aceptado · el job está en producción desde el 2026-10-20 y **prendido desde el 2026-10-27** (US-07.01) |
| [ADR-10](../Decisions/ADR-10.md) §5 | petición sin atender ≠ `ghosting`; regla G1 completa | ✅ Aceptado (2026-10-14) |

---

## Features, planes y commits

| Tipo | Documento | Estado |
|---|---|---|
| Plan | [US-07.01 · registro de hechos](../US/07.01-registro-hechos.md) | ✅ en producción (2026-10-20), job G1 prendido (2026-10-27) · cierre pendiente: pruebas manuales en curso ([arriba](#release-a-producción-2026-10-20)) · **cerrarla es el siguiente paso de la fase** (2026-10-30) |
| Plan | US-07.02 · calificación y riesgo | sin plan; **🚧 bloqueado, plan incluido (2026-10-30)**, hasta que un abogado revise el contexto legal de ADR-14 o el usuario decida otra cosa ([arriba](#bloqueo-de-us-0702-y-us-0703-2026-10-30)) · *antes (2026-10-30, hasta el bloqueo): "es el siguiente paso: las preguntas de producto ya no lo bloquean. La revisión legal bloquea su implementación, no el plan"; antes: "después de la revisión legal"* |
| Plan | US-07.03 · acciones | sin plan; 🚧 bloqueado (2026-10-30) |
| Feature | — | se crea al cerrar US-07.01 |
| Commits | `3e64472` → `bb90815`, merge `715c3f3`, release `313a506` · `c3e7b42` → `f6d0aa4` y su merge `33fc74c` | filas 105–115 y 117 de la [TRAZABILIDAD](../TRAZABILIDAD.md) (registradas el 2026-11-01; antes, sin filas) |

---

## Deudas

| Deuda | Relación |
|---|---|
| [DT-11](../Deudas/DT-11.md) | ✅ **cerrada el 2026-10-27** por US-07.01: el job G1 con su regla y el corte del 2026-10-17, desplegado apagado el 2026-10-20 y **prendido en production** el 2026-10-27. *(Antes: "se cierra al retomar RF-08 y decidir la pregunta 2 de Q6"; luego, "se cierra al prenderlo".)* |
| [DT-47](../Deudas/DT-47.md) | **detectada en US-07.01**: `cambios_cita.ocurrido_en` usa `DEFAULT now()` y, con transacciones concurrentes, la bitácora puede quedar en orden invertido. Baja hoy; media cuando US-07.02 lea ese orden. **Se corrige antes de implementar US-07.02** (2026-10-30), cuando se desbloquee: sigue abierta, pero con el bloqueo del mismo día deja de ser un paso inmediato |
| [DT-48](../Deudas/DT-48.md) | **contraída con US-07.01** (fichada el 2026-10-30): un cierre equivocado no se corrige. Salida decidida: corrección dentro de 7 días, en US-07.02; sigue abierta y hoy espera con ella (🚧). No perfila al paciente: podría separarse de US-07.02 si el usuario lo quiere (sin decidir) |
| [DT-49](../Deudas/DT-49.md) | **contraída con US-07.01** (fichada el 2026-10-30): la primera apertura la puede disparar un escáner que ejecuta la página; favorece al paciente |
| [DT-50](../Deudas/DT-50.md) | **contraída con US-07.01** (fichada el 2026-10-30): `cita` lee con SQL el esquema de `recordatorios` y `solicitudes_cita` (job G1) |
| [DT-30](../Deudas/DT-30.md) | sin asistencia registrada no hay qué calificar. US-07.01 cierra la brecha de las citas `pendiente` (ADR-14 §9 es la salida B que DT-30 dejaba para un ADR propio) y lleva al dominio el bloqueo por hora. Su punto 3 (aviso de citas sin cerrar) es la **lista de citas pasadas sin cerrar** que el usuario eligió el 2026-10-30 (candidata) |
| [DT-13](../Deudas/DT-13.md) | una cita creada en el pasado fabricaría un incumplimiento falso: G1 la deja fuera (nunca recibe recordatorio) y la calificación no la cuenta; la validación al crear sigue abierta |
| [DT-40](../Deudas/DT-40.md) | con `MENSAJERIA_ADAPTADOR=registro` un recordatorio queda `enviado` sin salir: el job G1 de US-07.01 no lo toma como vía real |
| [DT-44](../Deudas/DT-44.md) | una petición de otra hora rechazada en silencio no protege del `ghosting` (G1 solo excluye las `recibida`). **Decidido el 2026-10-30** (ADR-14 §8): mientras el rechazo no se avise, esa cita no cuenta como falta en la calificación |
| [DT-23](../Deudas/DT-23.md) | un tercero podría ensuciar la reputación de una persona real |
| [DT-29](../Deudas/DT-29.md) | los estados `recuperada` / `riesgo_alto` del diseño del dashboard dependen de RF-08 |

---

## Preguntas abiertas relacionadas

- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) — ✅
  respondida entera: la pregunta 1 (¿cuándo vence una cita?), por la regla G1 el 2026-10-14
  ([DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14)); la pregunta 2 (¿qué pasa con las `confirmada`
  sin cerrar?), **el 2026-10-30**: siguen neutras y van a una lista de citas pasadas sin cerrar. *(Antes:
  abierta; el job G1 no las toca.)*
- [Q16](../PREGUNTAS-ABIERTAS.md#q16--modelo-de-amenazas-de-la-vía-pública) —
  pregunta 2: suplantación y reputación.
- Las del [plan US-07.01](../US/07.01-registro-hechos.md#preguntas-abiertas) (ninguna bloquea): confirmar una
  `pendiente` que ya empezó, la precisión de la condición 2 de G1 y el valor inválido del interruptor. La de la
  corrección de un cierre equivocado quedó **resuelta el 2026-10-30** (7 días, sin margen para G1).
- Las de [ADR-14](../Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar) para US-07.02:
  **respondidas el 2026-10-30** las de producto ([arriba](#decisiones-de-producto-de-us-0702-2026-10-30)). Siguen
  abiertas la revisión legal y la calibración, y quedan detalles para el plan de US-07.02, en espera mientras dure
  el bloqueo ([arriba](#bloqueo-de-us-0702-y-us-0703-2026-10-30)).

---

## Contraparte en el frontend

**US-07.01** (`citia-frontend`, en paralelo al backend, mismo contrato; en producción desde el 2026-10-20,
[PR #14](https://github.com/Citia-solutions/citia-frontend/pull/14)): en el voucher, *Asistió* y *No asistió*
también sobre citas `pendiente` cuya hora ya llegó, guiados por `accionesPermitidas`; *"¿Quién lo pidió?"*
(*Paciente* / *Decisión mía*), obligatoria, al cancelar y al reagendar; el filtro *"Sin respuesta"* en la agenda.
Detalle en el [plan § Frontend](../US/07.01-registro-hechos.md#frontend-citia-frontend-en-vue).

---

## Depende de / desbloquea

- **Depende de:** [Fase 1](fase-1-us02-gestion-citas.md), [Fase 3](fase-3-us04-respuesta-paciente.md),
  el proceso de cierre (ADR-12) y la asistencia registrada (DT-30). **US-07.01 no depende de la
  [Fase 4](fase-4-us05-alertas.md)** y por eso se construyó antes. **US-07.02 y US-07.03, plan incluido,
  dependen además de la revisión legal** (🚧 bloqueadas desde el 2026-10-30), y la implementación de US-07.02,
  de corregir antes [DT-47](../Deudas/DT-47.md). *Antes (hasta el bloqueo): "La implementación de US-07.02 y
  US-07.03 depende además de la revisión legal (su plan, no)".*
- **Desbloquea:** la [Fase 6](fases-6-us09-sin-diseno.md#fase-6--us-08-monitoreo-y-seguimiento-del-paciente)
  (el ROADMAP la hace depender de US-07).
