# Etapa 2 del producto — Requisitos

> **Etapa 2 del producto**, no una fase del roadmap. Las etapas (problema → validación → requisitos → MVP)
> explican cómo se llegó al alcance; el archivo conserva el nombre `fase-*` por historia. Las fases de
> construcción están en [`Fases/`](../Fases/README.md): la "Fase 2" del roadmap son los
> [recordatorios](../Fases/fase-2-us03-recordatorios.md).

**Objetivo:** traducir el problema a **qué debe hacer el sistema** y bajo qué condiciones.
**Estado:** ✅ requisitos definidos · ⚠️ criterios de aceptación solo en lo implementado
**Entregable:** user stories con criterios de aceptación verificables.

---

## Preguntas clave

1. **Funcionales:** ¿qué acciones concretas podrá hacer el usuario?
2. **No funcionales:** rendimiento, seguridad, disponibilidad, escala esperada.
3. ¿Cuál es el **criterio de aceptación verificable** de cada cosa?

---

## Requisitos funcionales

> Fuente única: [`../rf.md`](../rf.md). No se duplican aquí para que no se desincronicen.

| RF | Tema | Estado |
|----|------|--------|
| RF-00 | Inicio de sesión | ✅ implementado |
| RF-01 | Monitoreo del comportamiento del paciente | ❌ |
| RF-02 | Sincronización con calendarios externos | ❌ |
| RF-03 | Dashboard de citas del día | ✅ implementado |
| RF-04 | Perfil y configuración | ❌ |
| RF-05 | Alertas al profesional | ❌ · los hechos ya se publican, falta el consumidor |
| RF-06 | Recordatorios al paciente | ❌ |
| RF-07 | Respuesta del paciente | ❌ |
| RF-08 | Calificación de asistencia | ❌ · **el historial aún no se acumula** ([DT-11](../Deudas/DT-11.md)) |

Además, fuera de la numeración RF pero ya en el sistema: el **alta inicial de organización y
administrador** (US-00) y la **gestión de citas** (US-02, parcialmente entregada).

> **Nota (2026-09-30).** Esta tabla quedó atrás. Estado vigente, según el
> [ROADMAP](../ROADMAP.md#resumen) y la [etapa 3](fase-3-mvp.md):
> **RF-06 entra en el MVP** (Q1 → A): diseño cerrado en [ADR-13](../Decisions/ADR-13.md) e
> **implementado** el 2026-10-04 y **en producción** desde el 2026-10-06 ([Fase 2](../Fases/fase-2-us03-recordatorios.md),
> [us03](../Features/us03-recordatorios.md)). **RF-07** es la
> [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md), fuera del MVP. **RF-08** pasa a la v2; su
> historial ya no depende solo de DT-11 (aplazada) sino sobre todo de [DT-30](../Deudas/DT-30.md).
> **RF-05** sigue igual: los hechos se publican y falta el consumidor
> ([Fase 4](../Fases/fase-4-us05-alertas.md)). La **gestión de citas** (US-02) está **cerrada** desde
> el 2026-09-28 ([Fase 1](../Fases/fase-1-us02-gestion-citas.md)). En la tabla de RNF de abajo, DT-27
> y DT-19 están **resueltas en diseño** (ADR-12 y ADR-13) y DT-16 es un riesgo aceptado. *(2026-10-04: con
> la Fase 2 implementada en rama, DT-27 está **cerrada**, DT-19 implementada a falta de la prueba manual en
> Better Stack, y la política de consentimiento de DT-16 existe y está apagada.)* *(2026-10-07: RF-06 está
> **en producción**; DT-19 verificada, abierta solo por la fuente de logs.)*

## Requisitos no funcionales

> Fuente única: [`../rnf.md`](../rnf.md).

Tres tienen consecuencia directa sobre decisiones ya tomadas o pendientes:

| RNF | Qué exige | Dónde impacta |
|-----|-----------|---------------|
| RNF-02 | Aislamiento por profesional, cifrado, consentimiento del paciente | Resuelto estructuralmente: el tenant viaja sellado en el token ([ADR-01 §2](../Decisions/ADR-01.md)). El consentimiento se captura pero **nadie lo lee** ([DT-16](../Deudas/DT-16.md)) |
| RNF-03 | ≥99% de recordatorios entregados, con reintento y registro | Es lo que obliga a una cola con reintentos. Hoy los hechos se publican fuera de la transacción ([DT-27](../Deudas/DT-27.md)) |
| RNF-08 | Observabilidad para detectar recordatorios fallidos | No existe ([DT-19](../Deudas/DT-19.md)). Sin esto, **RNF-03 es inverificable** |

---

## Criterios de aceptación

La pregunta 3 está respondida **solo donde hay código**. Los criterios verificables viven junto a
cada feature implementada, no en este documento:

| Historia | Documento | Criterios |
|---|---|---|
| US-00 registro inicial | [us00a](../Features/us00a-registro-inicial.md) | ✅ con tests |
| US-01 login | [us00b](../Features/us00b-login.md) | ✅ con tests |
| US-06 dashboard | [us06](../Features/us06-dashboard-citas.md) | ✅ unitarios · ⚠️ e2e nunca ejecutado ([DT-20](../Deudas/DT-20.md)) |
| US-02 gestión de citas | [us02](../Features/us02-gestion-citas.md) | ✅ unitarios · ⚠️ sin e2e ([DT-20](../Deudas/DT-20.md)) |

> **Actualización 2026-09-10:** US-02 ya tiene documento de feature. Era el único caso en que había
> código sin doc, que es justo lo que la convención del repo no permite.
>
> **Nota (2026-09-30).** "US-01 login" es **US-00b** (la numeración US-01 no existe). Y las suites
> e2e ya corren contra Postgres: 89/89 el 2026-09-28 ([ROADMAP § Fase 1](../ROADMAP.md#integración));
> [DT-20](../Deudas/DT-20.md) sigue abierta porque no corren en un pipeline.

**Las historias no implementadas no tienen criterios de aceptación escritos.** Es correcto que sea
así mientras no se aborden —escribirlos ahora sería adivinar— pero conviene no confundir *"el
requisito está enunciado"* con *"sabemos cuándo está terminado"*.

---

**Anterior:** [Etapa 1 — Validación](fase-1-validacion.md) · **Siguiente:** [Etapa 3 — MVP](fase-3-mvp.md)
