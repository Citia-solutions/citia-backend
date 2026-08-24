# Fase 2 — Requisitos

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
| RF-05 | Alertas al profesional | ❌ · hechos ya publicados, falta el consumidor |
| RF-06 | Recordatorios al paciente | ❌ |
| RF-07 | Respuesta del paciente | ❌ |
| RF-08 | Calificación de asistencia | ❌ · **el historial aún no se acumula** ([DT-11](../Deudas/DT-11.md)) |

Además, fuera de la numeración RF pero ya en el sistema: el **alta inicial de organización y
administrador** (US-00) y la **gestión de citas** (US-02, parcialmente entregada).

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
| US-02 gestión de citas | pendiente de escribir | ⚠️ release 1 entregado sin doc de feature |

**Las historias no implementadas no tienen criterios de aceptación escritos.** Es correcto que sea
así mientras no se aborden —escribirlos ahora sería adivinar— pero conviene no confundir *"el
requisito está enunciado"* con *"sabemos cuándo está terminado"*.

---

**Anterior:** [Fase 1 — Validación](fase-1-validacion.md) · **Siguiente:** [Fase 3 — MVP](fase-3-mvp.md)
