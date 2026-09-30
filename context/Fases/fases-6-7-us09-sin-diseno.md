# Fases 6, 7 y US-09 — sin diseño todavía

> **Fases del roadmap** (construcción). Índice: [Fases](README.md). Comparten documento porque ninguna
> tiene ADR, FD, plan, feature ni commit propios: su único contenido es el desglose de tareas del
> [ROADMAP](../ROADMAP.md), que no se copia aquí. Cuando alguna tenga diseño, se separa en su propio
> archivo `fase-<n>-<us>-<tema>.md`.

---

## Fase 6 — US-08: Monitoreo y seguimiento del paciente

| | |
|---|---|
| **Objetivo** | Que el profesional gestione y siga a sus pacientes con notas e historial (RF-01). |
| **Estado** | 🔶 solo existe `POST /pacientes` (de la [Fase 0](fase-0-us06-dashboard.md)). |
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

| | |
|---|---|
| **Objetivo** | Que el profesional gestione su cuenta (perfil, suscripción, contraseña) y contacte a soporte (RF-04). |
| **Estado** | ⬜ nada. |
| **Tareas** | [ROADMAP § Fase 7](../ROADMAP.md#fase-7--us-10-perfil-suscripción-y-soporte) |
| **Depende de** | nada (ROADMAP: puede entrar en cualquier momento). |

**Relacionado por tema** (ningún documento enlaza todavía a esta fase):

- [DT-01](../Deudas/DT-01.md) — sesión sin renovación ni revocación: mientras siga así, cambiar la
  contraseña no invalida los tokens ya emitidos.
- [DT-03](../Deudas/DT-03.md) — sin verificación de correo ni recuperación de contraseña.
- [DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md) — el front tiene un `fetchCurrentUser()`
  que apunta a un endpoint inexistente (hoy nadie lo llama); "obtener perfil" es el candidato natural.
- **Dinero:** la suscripción es lectura; cobrar queda fuera de la v1
  ([etapa 3 del producto §2](../Descripcion/fase-3-mvp.md#2-qué-queda-fuera-de-la-v1)) y el prepago es
  [Q2](../PREGUNTAS-ABIERTAS.md#q2--el-prepago-entra-alguna-vez).

---

## US-09 — Sin definir

| | |
|---|---|
| **Estado** | ⬜ título y subtareas sin definir ([ROADMAP](../ROADMAP.md#us-09--pendiente-de-definir)). |

> No confundir con la subtarea **US-02.09** (el dashboard refleja los cambios), que es de la
> [Fase 1](fase-1-us02-gestion-citas.md) y está implementada. Los números US-07/08/09 no los ocupan las
> subtareas de US-02 ([etapa 3 del producto §1](../Descripcion/fase-3-mvp.md#1-las-tres-cosas)).
