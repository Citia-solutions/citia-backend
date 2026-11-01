# Fase 6 y US-09 — sin diseño todavía

> **Fases del roadmap** (construcción). Índice: [Fases](README.md). Comparten documento porque ninguna
> tiene ADR, FD, plan, feature ni commit propios: su único contenido es el desglose de tareas del
> [ROADMAP](../ROADMAP.md), que no se copia aquí. Cuando alguna tenga diseño, se separa en su propio
> archivo `fase-<n>-<us>-<tema>.md`.
>
> *Antes (hasta el 2026-10-31):* el archivo se llamaba `fases-6-7-us09-sin-diseno.md` y también tenía a la **Fase 7**
> (US-10). Ese día la Fase 7 entró en diseño y pasó a su propia guía,
> [`fase-7-us10-perfil.md`](fase-7-us10-perfil.md).

---

## Fase 6 — US-08: Monitoreo y seguimiento del paciente

| | |
|---|---|
| **Objetivo** | Que el profesional gestione y siga a sus pacientes con notas e historial (RF-01). |
| **Estado** | 🔶 solo existen `POST /api/pacientes` (de la [Fase 0](fase-0-us06-dashboard.md), sin consumidor) y `PATCH /api/pacientes/:id` (de la [Fase 2](fase-2-us03-recordatorios.md): teléfono y correo, lo usa la vista *Contacto* del voucher). |
| **Tareas** | [ROADMAP § Fase 6](../ROADMAP.md#fase-6--us-08-monitoreo-y-seguimiento-del-paciente) |
| **Depende de** | [Fase 1](fase-1-us02-gestion-citas.md) (historial de citas) y [Fase 5](fase-5-us07-scoring.md) (US-07). |

**Relacionado por tema** (ningún documento enlaza todavía a esta fase):

- [DT-15](../Deudas/DT-15.md) — no se puede buscar ni listar pacientes; la lista de esta fase lo
  resolvería.
- [DT-29](../Deudas/DT-29.md) — `POST /api/pacientes` existe y nadie lo consume.
- [ADR-13 §14](../Decisions/ADR-13.md) — la Fase 2 agrega un `PATCH /api/pacientes/:id` mínimo
  (teléfono y correo).

---

## Fase 7 — US-10: Perfil, suscripción y soporte

**Se mudó** a su propia guía el 2026-10-31, al entrar en diseño: [`fase-7-us10-perfil.md`](fase-7-us10-perfil.md).

---

## US-09 — Sin definir

| | |
|---|---|
| **Estado** | ⬜ título y subtareas sin definir ([ROADMAP](../ROADMAP.md#us-09--pendiente-de-definir)). |

> No confundir con la subtarea **US-02.09** (el dashboard refleja los cambios), que es de la
> [Fase 1](fase-1-us02-gestion-citas.md) y está implementada. Los números US-07/08/09 no los ocupan las
> subtareas de US-02 ([etapa 3 del producto §1](../Descripcion/fase-3-mvp.md#1-las-tres-cosas)).
