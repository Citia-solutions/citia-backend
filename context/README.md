# Contexto del proyecto

Documentación viva de Citia. Regla del proyecto: **toda decisión de diseño vive en un ADR, toda
funcionalidad en una feature, toda limitación conocida en una deuda, y ningún commit sustantivo queda
sin doc.**

---

## Por dónde empezar

| Si quieres saber… | Ve a |
|---|---|
| **todo lo de una fase** (qué se hizo, con qué decisiones, deudas y commits, en qué orden leerlo) | [`Fases/`](Fases/README.md) |
| **en qué estado está cada fase** y qué viene después | [`ROADMAP.md`](ROADMAP.md) |
| **por qué existe el proyecto** y qué entra en la v1 | [`Descripcion/`](Descripcion/README.md) |
| **por qué está construido así** y qué se descartó | [`Decisions/`](Decisions/README.md) |
| **qué está construido** y cómo funciona | [`Features/`](Features/README.md) |
| **qué falta o está a medias**, y qué cuesta | [`Deudas/`](Deudas/README.md) |
| **qué decidió el frontend** que afecta al backend | [`Frontend-Decisions/`](Frontend-Decisions/README.md) |
| **qué falta decidir** y quién puede decidirlo | [`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md) |
| qué commit corresponde a qué documento | [`TRAZABILIDAD.md`](TRAZABILIDAD.md) |

---

## Cómo leer este contexto

### Glosario de tipos de documento

| Tipo | Qué es | Dónde | Ejemplo |
|---|---|---|---|
| **Fase del roadmap** | Etapa de **construcción**: Fundaciones, Fase 0 … Fase 7, US-09. Cada una tiene una guía de lectura | [`Fases/`](Fases/README.md) · estado en el [ROADMAP](ROADMAP.md) | [Fase 2 — recordatorios](Fases/fase-2-us03-recordatorios.md) |
| **Etapa del producto** | Etapa de **descubrimiento**: problema, validación, requisitos, MVP. Los archivos se llaman `fase-*.md` por historia, pero **no** son fases del roadmap | [`Descripcion/`](Descripcion/README.md) | [etapa 3 — MVP](Descripcion/fase-3-mvp.md) |
| **US** | Historia de usuario. Su plan (decisiones y orden de construcción, sin código) va en `US/` antes de implementar. Los archivos `02.NN-*` son **subtareas** de US-02, no historias | `US/` | [US-03](US/03-recordatorios.md) |
| **ADR** | Una decisión de arquitectura: contexto, opciones, decisión, consecuencias | [`Decisions/`](Decisions/README.md) | [ADR-12](Decisions/ADR-12.md) |
| **Feature** | Una funcionalidad **implementada**: qué hace, endpoints, esquema, tests, pendientes | [`Features/`](Features/README.md) | [us02](Features/us02-gestion-citas.md) |
| **DT** | Deuda técnica: lo que el sistema no hace y debería, enlazada al párrafo que la originó | [`Deudas/`](Deudas/README.md) | [DT-30](Deudas/DT-30.md) |
| **FD** | Decisión de producto o diseño tomada del lado del frontend que condiciona al backend | [`Frontend-Decisions/`](Frontend-Decisions/README.md) | [FD-06](Frontend-Decisions/FD-06.md) |
| **Q / H** | Pregunta abierta: Q para I+D o desarrollo, H para el hacker ético | [`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md) | Q11, H7 |

> **Tres sentidos de "fase".** (1) **Fase del roadmap** = construcción, lo que significa "fase" en
> casi todo el repo. (2) **Etapa del producto** = los `fase-*.md` de `Descripcion/`; la etapa 3 (MVP)
> equivale a las fases 0, 1 y 2 del roadmap. (3) **Fases internas de un ADR**: ADR-08 (segmento de
> ruta → subdominio) y ADR-09 (pedir hora → modelo de disponibilidad) numeran sus propios pasos; no
> son fases del roadmap.

### Cada documento dice dónde está

Todo ADR, feature, deuda, US y FD lleva bajo el título una línea de navegación:

> **Fase:** … · **Feature:** … · **Plan:** … · **Relacionado:** …

Desde cualquier documento se llega a su fase, y desde la fase a todo lo demás.

### Camino según lo que buscas

| Buscas… | Camino |
|---|---|
| ponerte al día con el proyecto | este README → [ROADMAP § Resumen](ROADMAP.md#resumen) → [Fases/](Fases/README.md) → la guía de la fase en curso |
| entender los recordatorios (lo último construido) | [Fase 2](Fases/fase-2-us03-recordatorios.md) —guía de lectura del diseño y de la implementación, checklist de salida a producción— y la feature [us03-recordatorios](Features/us03-recordatorios.md) |
| qué quedó al cerrar la gestión de citas | [Fase 1 § Cierre](Fases/fase-1-us02-gestion-citas.md#cierre-de-la-fase-resumen) |
| por qué una pieza es como es | la feature → su ADR → las alternativas descartadas del ADR |
| qué riesgo se está aceptando | [Deudas/README § Lo que hay que mirar primero](Deudas/README.md#lo-que-hay-que-mirar-primero) → la deuda |
| qué hay que decidir antes de avanzar | [PREGUNTAS-ABIERTAS § Por fase](PREGUNTAS-ABIERTAS.md#por-fase-del-roadmap) |
| de dónde salió un cambio | [TRAZABILIDAD](TRAZABILIDAD.md) (commit → documento, con su fase) |
| qué hizo el frontend | la sección *Contraparte en el frontend* de cada fase |

---

## Contenido

### Carpetas

- **[`Fases/`](Fases/README.md)** — una guía por fase del roadmap: objetivo, estado, orden de lectura,
  cronología commit → documento, decisiones, features, deudas, preguntas, contraparte del frontend y
  dependencias. Es navegación: no reemplaza a ningún documento.
- **[`Descripcion/`](Descripcion/README.md)** — el producto por **etapas**: problema, validación,
  requisitos y alcance del MVP.
- **[`Decisions/`](Decisions/README.md)** — ADRs. Una decisión por documento, con contexto,
  alternativas evaluadas y consecuencias.
- **[`Features/`](Features/README.md)** — una por funcionalidad implementada: qué hace, arquitectura,
  endpoints, esquema y pendientes.
- **[`Deudas/`](Deudas/README.md)** — deudas técnicas, cada una enlazada al párrafo del ADR o feature
  que la originó.
- **[`Frontend-Decisions/`](Frontend-Decisions/README.md)** — decisiones del frontend (FD-01 a FD-06)
  que afectan al backend.
- **`US/`** — planes de historias de usuario previos a implementar: decisiones y orden de
  construcción, sin código. [US-00](US/00-auth.md) autenticación · [US-06](US/06-epic.md) dashboard ·
  [US-03](US/03-recordatorios.md) recordatorios al paciente (✅ implementada en rama, pendiente de merge).
  **Subtareas de US-02** (archivos `02.NN-*`, no son historias propias):
  [US-02.07](US/02.07-paciente-reagenda-cancela.md) el paciente cancela o pide reagendar (⏸ aplazada
  fuera de la v1; [ADR-10](Decisions/ADR-10.md) propuesto; se retoma en la
  [Fase 3](Fases/fase-3-us04-respuesta-paciente.md)) · [US-02.08](US/02.08-voucher-cita.md) voucher de la
  cita para el profesional (✅ implementada). US-02.09 (el dashboard refleja los cambios, ✅
  implementada) es solo de frontend y vive en `citia-frontend/context/us/`.

### Archivos sueltos

- **[`ROADMAP.md`](ROADMAP.md)** — orden, dependencias y estado real de cada fase. Fuente única del
  estado.
- **[`rf.md`](rf.md)** — requisitos funcionales. Fuente única.
- **[`rnf.md`](rnf.md)** — requisitos no funcionales. Fuente única.
- **[`rules.md`](rules.md)** — reglas transversales de código.
- **[`stack-tecnologico.md`](stack-tecnologico.md)** — stack y despliegue objetivo.
- **[`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md)** — las once decisiones que bloqueaban el MVP
  (cuatro ya respondidas), repartidas por rol (I+D, desarrollo, seguridad) con el entregable esperado
  de cada una, más cuatro pendientes que dejó la implementación de la Fase 2 (Q12–Q15, no bloquean).
- **[`TRAZABILIDAD.md`](TRAZABILIDAD.md)** — matriz commit ↔ documentación, con la fase de cada commit.

---

## Estado, de un vistazo

*(Actualizado el 2026-10-04. Fuente: [ROADMAP § Resumen](ROADMAP.md#resumen).)*

**Alcance del MVP:** dashboard de citas (Fase 0) · gestión de citas (Fase 1) · **recordatorios al
paciente** (Fase 2). La calificación de asistencia (scoring, Fase 5) pasó a la v2 el 2026-09-30
([etapa 3 del producto](Descripcion/fase-3-mvp.md)).

| Fase | Estado |
|---|---|
| [Fundaciones](Fases/fase-base-fundaciones.md) — registro, login, infraestructura | ✅ cerrada |
| [Fase 0](Fases/fase-0-us06-dashboard.md) — US-06 dashboard | ✅ cerrada (2026-09-28) · métricas aún de prueba |
| [Fase 1](Fases/fase-1-us02-gestion-citas.md) — US-02 gestión de citas | ✅ cerrada (2026-09-28) · US-02.07 aplazada |
| [Fase 2](Fases/fase-2-us03-recordatorios.md) — US-03 recordatorios | ✅ implementada en rama (2026-10-04) · ⏳ pendiente de merge y de los prerrequisitos operativos |
| [Fase 3](Fases/fase-3-us04-respuesta-paciente.md) — US-04 respuesta del paciente | ⬜ fuera del MVP |
| [Fase 4](Fases/fase-4-us05-alertas.md) — US-05 alertas | ⬜ fuera del MVP |
| [Fase 5](Fases/fase-5-us07-scoring.md) — US-07 scoring | ⏸ v2 |
| [Fases 6, 7 y US-09](Fases/fases-6-7-us09-sin-diseno.md) | ⬜ sin diseño |

**En `develop`** (Fase 0 y Fase 1 cerradas el 2026-09-28): alta de organización y administrador · login ·
dashboard de citas del día · **gestión de citas completa** (agendar, editar, reagendar, cancelar,
transiciones de estado, bitácora de cambios, publicación de hechos) · agenda semanal · detalle de cita
con `accionesPermitidas` para el voucher (US-02.08) · aviso de solapamiento ([ADR-11](Decisions/ADR-11.md)) ·
recepción pública de solicitudes de hora · **bandeja de solicitudes** (listar, aceptar creando paciente
y cita en una transacción, rechazar). También el **diseño** de la Fase 2 (ADR-12, ADR-13, US-03), desde
el merge `510015a` (2026-10-01).

**Implementado en la rama `feature/fase2-recordatorios`, pendiente de merge** (2026-10-04,
[PR #1](https://github.com/Citia-solutions/citia-backend/pull/1); el frontend en
[PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2), mismo release): **recordatorios por
correo** con Resend sobre un **outbox** transaccional y un **planificador** en Postgres, con logs JSON,
`GET /api/health`, latidos y alertas para Better Stack; correo del paciente obligatorio y
`PATCH /api/pacientes/:id`. 1274 unitarios, 212 e2e y 80 de integración en verde. Ver
[us03-recordatorios](Features/us03-recordatorios.md).

**Lo más urgente:**

1. **Los prerrequisitos operativos de la Fase 2**
   ([checklist](Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción)). El dominio
   `citiahealth.cl` ya está comprado y delegado a Cloudflare; falta **verificar el subdominio de envío en
   Resend** y crear el webhook (dependen de DNS y del proveedor), Better Stack, las variables en Railway
   y "App Sleeping" apagado. Sin eso no se escribe a pacientes reales.
2. **Mergear los dos PR en el mismo release** y hacer la prueba manual del frontend contra el backend
   real. Sin el frontend nuevo, el modal "Nueva cita" recibe 400 por el correo.
3. **Cuatro decisiones del usuario** que dejó la implementación, ninguna bloqueante:
   [Q12–Q15](PREGUNTAS-ABIERTAS.md#fase-2--decisiones-pendientes-tras-implementar-2026-10-04).
4. **La asistencia real de las citas pasadas se está perdiendo** ([DT-30](Deudas/DT-30.md)): es la
   única deuda cuyo coste crece solo con el tiempo. Decisión (2026-09-30): esperar a la Fase 3, cuando
   el paciente confirme desde el enlace; hasta entonces no se registra. El `ghosting`, en cambio, se
   puede reconstruir después ([DT-11](Deudas/DT-11.md)).
5. **Consentimiento sin revisar, con fecha** ([DT-16](Deudas/DT-16.md)): riesgo aceptado hasta que
   entre en vigor la Ley 21.719 (prevista para el 2026-12-01). La política ya existe y está apagada.
