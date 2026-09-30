# Citia — Descripción del producto

Qué es Citia, para quién, y cómo se llegó desde el problema hasta el alcance de la v1. Es el
documento de **por qué existe el proyecto**; el resto de `context/` describe **cómo está
construido**.

Se organiza por fases: cada una tiene un objetivo, sus preguntas clave y un entregable.

---

## Fases

| Fase | Objetivo | Estado | Entregable |
|------|----------|--------|-----------|
| [Fase 0 — Problema](fase-0-problema.md) | Qué problema, para quién, y qué NO haremos | ✅ definida | One-pager |
| [Fase 1 — Validación](fase-1-validacion.md) | Confirmar que el problema es real antes de escribir código | ⚠️ **pendiente** | 5–10 conversaciones con usuarios |
| [Fase 2 — Requisitos](fase-2-requisitos.md) | Qué debe hacer el sistema y bajo qué condiciones | ✅ requisitos · ⚠️ criterios parciales | User stories con criterios |
| [Fase 3 — MVP](fase-3-mvp.md) | La versión más pequeña que entrega valor | ✅ alcance decidido (2026-09-30): dashboard + gestión de citas + recordatorios | Alcance de la v1 |

---

## En una frase

> Citia ataca el **ausentismo en las horas médicas**: el paciente que reserva y no llega. Cada hora
> perdida es ingreso perdido y lista de espera más larga, y hoy el profesional lo combate
> persiguiendo gente por WhatsApp con una planilla al lado.

---

## Lo que hay que decidir

Tres cosas quedaron abiertas al ordenar este documento (la primera ya está resuelta). Están desarrolladas en las fases
correspondientes; se listan aquí para que no se pierdan.

1. ~~**El MVP no cumple sus propios criterios de éxito.**~~ **Resuelto el 2026-09-30:** los
   recordatorios entran en el MVP y la calificación de asistencia pasa a la v2. Los criterios 1 y 2
   se cumplen en parte hasta que el paciente pueda responder desde el correo (Fase 3). Ver
   [Fase 3 §3](fase-3-mvp.md).

2. **La palanca más fuerte contra el no-show está excluida del alcance.** El propio diagnóstico
   señala que los profesionales empiezan a cobrar por anticipado — y el alcance dice que no se maneja
   dinero. Puede ser correcto, pero es una apuesta que conviene tener escrita. Ver
   [Fase 0 §Tensiones](fase-0-problema.md).

3. **Nadie ha validado nada todavía.** El objetivo de la Fase 1 era hacerlo *antes* de escribir
   código, y ya hay varias semanas invertidas. La fundación construida sirve casi para cualquier
   versión del producto, pero las decisiones que dependen del cliente concreto siguen sin base. Ver
   [Fase 1](fase-1-validacion.md).

---

## Cómo se conecta con el resto de `context/`

| Documento | Qué aporta |
|---|---|
| [`../rf.md`](../rf.md) · [`../rnf.md`](../rnf.md) | Los requisitos en bruto. Fuente única: la Fase 2 los referencia, no los copia |
| [`../Decisions/`](../Decisions/README.md) | Cómo se resolvió cada decisión de arquitectura, con sus alternativas descartadas |
| [`../Features/`](../Features/README.md) | Qué está construido y cómo funciona |
| [`../Deudas/`](../Deudas/README.md) | Qué falta o está a medias, y qué cuesta cada cosa |
| [`../TRAZABILIDAD.md`](../TRAZABILIDAD.md) | Mapa commit ↔ documentación |
