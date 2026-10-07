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
| entender los recordatorios (lo último construido) | [Fase 2](Fases/fase-2-us03-recordatorios.md) —guía de lectura del diseño y de la implementación, checklist de salida a producción y [cierre](Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07)— y la feature [us03-recordatorios](Features/us03-recordatorios.md) |
| qué está desplegado y dónde (staging y production) | [stack § Mapa de entornos](stack-tecnologico.md#mapa-de-entornos) e [Infraestructura en producción](stack-tecnologico.md#infraestructura-en-producción-2026-10-07) |
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
  [US-03](US/03-recordatorios.md) recordatorios al paciente (✅ cerrada en producción, 2026-10-07).
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
- **[`stack-tecnologico.md`](stack-tecnologico.md)** — stack, despliegue, mapa de entornos (staging y
  production) e infraestructura en producción.
- **[`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md)** — las once decisiones que bloqueaban el MVP
  (cuatro ya respondidas), repartidas por rol (I+D, desarrollo, seguridad) con el entregable esperado
  de cada una, más cuatro pendientes que dejó la implementación de la Fase 2 (Q12–Q15, no bloquean).
- **[`TRAZABILIDAD.md`](TRAZABILIDAD.md)** — matriz commit ↔ documentación, con la fase de cada commit.

---

## Estado, de un vistazo

*(Actualizado el 2026-10-07. Fuente: [ROADMAP § Resumen](ROADMAP.md#resumen).)*

**El MVP está en producción.** Alcance: dashboard de citas (Fase 0) · gestión de citas (Fase 1) ·
**recordatorios al paciente** (Fase 2). Release a `main` el 2026-10-06 en los dos repos; la Fase 2 se cerró
el 2026-10-07, cuando tres recordatorios reales llegaron a la bandeja de entrada y el voucher los mostró
*Entregado*. La calificación de asistencia (scoring, Fase 5) pasó a la v2 el 2026-09-30
([etapa 3 del producto](Descripcion/fase-3-mvp.md)).

| Fase | Estado |
|---|---|
| [Fundaciones](Fases/fase-base-fundaciones.md) — registro, login, infraestructura | ✅ cerrada · en producción |
| [Fase 0](Fases/fase-0-us06-dashboard.md) — US-06 dashboard | ✅ cerrada (2026-09-28) · sin mock desde el 2026-10-05 · en producción |
| [Fase 1](Fases/fase-1-us02-gestion-citas.md) — US-02 gestión de citas | ✅ cerrada (2026-09-28) · en producción · US-02.07 aplazada |
| [Fase 2](Fases/fase-2-us03-recordatorios.md) — US-03 recordatorios | ✅ **cerrada en producción (2026-10-07)** · [pendientes posteriores](Fases/fase-2-us03-recordatorios.md#pendientes-posteriores) |
| [Fase 3](Fases/fase-3-us04-respuesta-paciente.md) — US-04 respuesta del paciente | ⬜ **siguiente** · fuera del MVP |
| [Fase 4](Fases/fase-4-us05-alertas.md) — US-05 alertas | ⬜ fuera del MVP |
| [Fase 5](Fases/fase-5-us07-scoring.md) — US-07 scoring | ⏸ v2 |
| [Fases 6, 7 y US-09](Fases/fases-6-7-us09-sin-diseno.md) | ⬜ sin diseño |

**Entornos** ([mapa](stack-tecnologico.md#mapa-de-entornos)): `develop` → **staging** (Railway +
`citia-staging.netlify.app`, correo simulado con `registro`) · `main` → **production** (Railway +
`app.citiahealth.cl`, correo real por Resend desde `notificaciones.citiahealth.cl`, Better Stack).

**En producción** (`main`): alta de organización y administrador · login (con `tenantSlug` y
`tenantNombre`) · dashboard con datos reales · **gestión de citas completa** (agendar, editar, reagendar,
cancelar, confirmar, asistencia e inasistencia desde el voucher, bitácora) · agenda semanal · aviso de
solapamiento ([ADR-11](Decisions/ADR-11.md)) · solicitudes públicas de hora y su bandeja · **recordatorios
por correo** con Resend sobre un **outbox** transaccional y un **planificador** en Postgres, con estado por
cita en el voucher y configuración por profesional · correo del paciente obligatorio y
`PATCH /api/pacientes/:id` · logs JSON, `GET /api/health`, latidos y validación estricta del entorno. Ver
[us03-recordatorios](Features/us03-recordatorios.md#en-producción-2026-10-07).

**Lo siguiente:**

1. **Fase 3 — US-04, respuesta del paciente**: el paciente confirma o cancela desde el enlace del
   recordatorio (el bloque `accion` de la plantilla ya existe). Para arrancar hay que **aceptar
   [ADR-10](Decisions/ADR-10.md)**, que espera [H7 y Q11](PREGUNTAS-ABIERTAS.md)
   ([ROADMAP § Fase 3](ROADMAP.md#fase-3--us-04-respuesta-del-paciente)).
2. **Cerrar [DT-40](Deudas/DT-40.md)**: con `MENSAJERIA_ADAPTADOR=registro`, los recordatorios quedan
   "Enviado" sin enviarse. Pasó en producción con variables copiadas de staging y se repite con solo
   volver a copiarlas.
3. **La fuente de logs de Better Stack** ([DT-19](Deudas/DT-19.md)): sin ella, la alerta de tasa de fallo
   (RNF-03) y las de cuota quedan en los logs de Railway y no le llegan a nadie.
4. **Pendientes operativos menores:** registro DMARC ([DT-41](Deudas/DT-41.md)), Resend en staging,
   redirigir el dominio raíz y `www` a `app.citiahealth.cl`, confirmar "App Sleeping" y el `FRONTEND_URL`
   de staging ([lista](ROADMAP.md#pendientes-posteriores-al-cierre)).
5. **Consentimiento sin revisar, con fecha** ([DT-16](Deudas/DT-16.md)): riesgo aceptado hasta que entre en
   vigor la Ley 21.719 (prevista para el 2026-12-01). La política ya existe y está apagada.
6. **Cuatro decisiones del usuario**, ninguna bloqueante:
   [Q12–Q15](PREGUNTAS-ABIERTAS.md#fase-2--decisiones-pendientes-tras-implementar-2026-10-04).

> *Antes (2026-10-04):* lo más urgente eran los prerrequisitos operativos y el merge conjunto de los dos PR
> de la Fase 2; los dos quedaron hechos. La pérdida de la asistencia real ([DT-30](Deudas/DT-30.md)) quedó
> **mitigada** el 2026-10-05: el voucher ya la registra; lo anterior a esa fecha no se recupera.
