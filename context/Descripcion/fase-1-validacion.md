# Fase 1 — Validación del problema

**Objetivo:** confirmar que el problema es real **antes** de invertir semanas de código.
**Estado:** ⚠️ **pendiente** — sin evidencia registrada
**Entregable:** evidencia de 5–10 conversaciones reales con usuarios potenciales, y un resumen de
patrones.

---

## Preguntas clave

1. ¿Hablamos con gente que tenga este problema, o lo asumimos?
2. ¿Cómo lo resuelven hoy, y cuánto les molesta la solución actual?
3. ¿Pagarían o cambiarían de hábito por esto?

---

## Estado real

**Ninguna de las tres está respondida con evidencia.** [Fase 0](fase-0-problema.md) describe el
problema con seguridad y detalle, pero esa descripción es **hipótesis**, no hallazgo de campo.

Conviene decirlo sin rodeos porque el objetivo declarado de esta fase es literalmente *"antes de
invertir semanas de código"* — y ya hay varias semanas invertidas. Eso no invalida el trabajo hecho:
la fundación construida (identidad, aislamiento entre clientes, agenda) sirve casi para cualquier
versión del producto. Pero **las decisiones que dependen del cliente concreto siguen sin base**:

- qué canal usar para los recordatorios (RF-06),
- si el prepago debe entrar al alcance pese a estar excluido (ver tensión 1 de Fase 0),
- qué tipos de consulta poblar,
- si el segmento "clínica" es real o si todos son independientes.

---

## Lo más barato que se puede hacer ahora

Hay una vía de validación que ya apareció al diseñar [ADR-09](../Decisions/ADR-09.md) y que sirve
exactamente para esto: **publicar un formulario simple y ver si los pacientes lo completan.**

En ese uso, un formulario de terceros es legítimo —no se conecta a la base de datos, los datos se
transcriben a mano— y responde la pregunta que más importa antes de construir la vía pública
completa: *¿los pacientes realmente llenan un enlace que les mandan por WhatsApp?*

Y por el lado del profesional, la conversación que falta es más corta de lo que parece: media hora
con dos o tres profesionales responde a la vez las tres preguntas de esta fase **y** la lista de
tipos de consulta que [ADR-09 §10](../Decisions/ADR-09.md) dejó abierta.

---

## Cuando haya evidencia

Registrarla aquí: quién, qué dijo, y —lo importante— **qué patrón se repitió**. Una sola conversación
que contradiga [Fase 0](fase-0-problema.md) vale más que cinco que la confirmen.

---

**Anterior:** [Fase 0 — Problema](fase-0-problema.md) · **Siguiente:** [Fase 2 — Requisitos](fase-2-requisitos.md)
