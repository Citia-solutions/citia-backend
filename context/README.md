# Contexto del proyecto

Documentación viva de Citia. Regla del proyecto: **toda decisión de diseño vive en un ADR, toda
funcionalidad en una feature, toda limitación conocida en una deuda, y ningún commit sustantivo queda
sin doc.**

---

## Por dónde empezar

| Si quieres saber… | Ve a |
|---|---|
| **por qué existe el proyecto** y qué entra en la v1 | [`Descripcion/`](Descripcion/README.md) |
| **por qué está construido así** y qué se descartó | [`Decisions/`](Decisions/README.md) |
| **qué está construido** y cómo funciona | [`Features/`](Features/README.md) |
| **qué falta o está a medias**, y qué cuesta | [`Deudas/`](Deudas/README.md) |
| **qué falta decidir** y quién puede decidirlo | [`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md) |
| qué commit corresponde a qué documento | [`TRAZABILIDAD.md`](TRAZABILIDAD.md) |

---

## Contenido

### Carpetas

- **[`Descripcion/`](Descripcion/README.md)** — el producto por fases: problema, validación,
  requisitos y alcance del MVP.
- **[`Decisions/`](Decisions/README.md)** — ADRs. Una decisión por documento, con contexto,
  alternativas evaluadas y consecuencias.
- **[`Features/`](Features/README.md)** — una por funcionalidad implementada: qué hace, arquitectura,
  endpoints, esquema y pendientes.
- **[`Deudas/`](Deudas/README.md)** — deudas técnicas, cada una enlazada al párrafo del ADR o feature
  que la originó.
- **`US/`** — planes de historias de usuario previos a implementar: decisiones y orden de
  construcción, sin código. [US-00](US/00-auth.md) autenticación · [US-06](US/06-epic.md) dashboard ·
  [US-03](US/03-recordatorios.md) recordatorios al paciente (diseño cerrado, sin construir).
  **Subtareas de US-02** (archivos `02.NN-*`, no son historias propias):
  [US-02.07](US/02.07-paciente-reagenda-cancela.md) el paciente cancela o pide reagendar (bloqueada en
  diseño: [ADR-10](Decisions/ADR-10.md) propuesto) · [US-02.08](US/02.08-voucher-cita.md) voucher de la
  cita para el profesional (✅ implementada). US-02.09 (el dashboard refleja los cambios, ✅
  implementada) es solo de frontend y vive en `citia-frontend/context/us/`.

### Archivos sueltos

- **[`rf.md`](rf.md)** — requisitos funcionales. Fuente única.
- **[`rnf.md`](rnf.md)** — requisitos no funcionales. Fuente única.
- **[`rules.md`](rules.md)** — reglas transversales de código.
- **[`stack-tecnologico.md`](stack-tecnologico.md)** — stack y despliegue objetivo.
- **[`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md)** — las once decisiones que bloqueaban el MVP
  (cuatro ya respondidas), repartidas por rol (I+D, desarrollo, seguridad) con el entregable esperado
  de cada una.
- **[`TRAZABILIDAD.md`](TRAZABILIDAD.md)** — matriz commit ↔ documentación.

---

## Estado, de un vistazo

*(Actualizado el 2026-09-30.)*

**Alcance del MVP:** dashboard de citas · gestión de citas · **recordatorios al paciente**. La
calificación de asistencia (scoring) pasó a la v2 el 2026-09-30 ([fase 3](Descripcion/fase-3-mvp.md)).

**Implementado** (en `develop`, Fase 0 y Fase 1 cerradas el 2026-09-28): alta de organización y
administrador · login · dashboard de citas del día · **gestión de citas completa** (agendar, editar,
reagendar, cancelar, transiciones de estado, bitácora de cambios, publicación de hechos) · agenda
semanal · detalle de cita con `accionesPermitidas` para el voucher (US-02.08) · aviso de solapamiento
([ADR-11](Decisions/ADR-11.md)) · recepción pública de solicitudes de hora · **bandeja de solicitudes**
(listar, aceptar creando paciente y cita en una transacción, rechazar).

**Diseñado, sin construir (Fase 2):** recordatorios por correo con Resend ([ADR-13](Decisions/ADR-13.md))
sobre un outbox transaccional y un planificador en Postgres ([ADR-12](Decisions/ADR-12.md)). Plan en
[US-03](US/03-recordatorios.md).

**Lo más urgente:**

1. **Comprar el dominio y verificarlo en Resend.** Sin eso no se puede escribir a un paciente real, y
   la verificación depende de DNS, fuera del control del equipo.
2. **El outbox antes que los recordatorios** ([DT-27](Deudas/DT-27.md)): es barato mientras no haya
   ningún suscriptor.
3. **La asistencia real de las citas pasadas se está perdiendo** ([DT-30](Deudas/DT-30.md)): es la
   única deuda cuyo coste crece solo con el tiempo. Decisión (2026-09-30): esperar a la Fase 3, cuando
   el paciente confirme desde el enlace; hasta entonces no se registra. El `ghosting`, en cambio, se
   puede reconstruir después ([DT-11](Deudas/DT-11.md)).
4. **Consentimiento sin revisar, con fecha** ([DT-16](Deudas/DT-16.md)): riesgo aceptado hasta que
   entre en vigor la Ley 21.719 (prevista para el 2026-12-01).
