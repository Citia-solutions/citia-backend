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
  construcción, sin código. [US-00](US/00-auth.md) autenticación · [US-06](US/06-epic.md) dashboard.
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
- **[`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md)** — las once decisiones pendientes, repartidas
  por rol (I+D, desarrollo, seguridad) con el entregable esperado de cada una.
- **[`TRAZABILIDAD.md`](TRAZABILIDAD.md)** — matriz commit ↔ documentación.

---

## Estado, de un vistazo

**Implementado:** alta de organización y administrador · login · dashboard de citas del día ·
**gestión de citas completa** (agendar, editar, reagendar, cancelar, transiciones de estado,
bitácora de cambios, publicación de hechos) · **detalle de cita con `accionesPermitidas`** para el
voucher del profesional (US-02.08) · **recepción pública de solicitudes de hora** del paciente.

**A medias:** la bandeja de solicitudes — el dominio soporta aceptar y rechazar, pero sin endpoints
una solicitud entra y nadie la ve.

**Lo más urgente:** el proceso que cierra las citas vencidas. Es lo único que impide que el historial
de comportamiento del paciente —el diferenciador del producto— empiece a acumularse, y es la única
deuda cuyo coste crece solo con el tiempo. Ver [DT-11](Deudas/DT-11.md).
