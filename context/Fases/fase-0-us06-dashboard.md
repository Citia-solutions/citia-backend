# Fase 0 — US-06: Dashboard de citas del día (RF-03)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 0 del producto](../Descripcion/fase-0-problema.md) (el problema). Índice: [Fases](README.md) ·
> Estado en el [ROADMAP § Fase 0](../ROADMAP.md#fase-0--us-06-dashboard-de-citas-del-día-rf-03).

| | |
|---|---|
| **Objetivo** | Que el profesional vea sus citas del día con datos reales del backend, detrás del `JwtAuthGuard`. |
| **Entregable** | `GET /api/citas/hoy` filtrado por tenant y profesional, en la zona de la clínica; y la fundación que no existía: módulo `Cita` con máquina de estados, `Paciente` mínimo y `POST /api/citas`. |
| **Estado** | ✅ cerrada: conectada al backend real y probada contra Postgres (2026-09-28). Pendiente: las métricas del dashboard siguen con datos de prueba. |
| **Fechas** | backend 2026-06-30 · zona horaria 2026-07-06 · seed demo 2026-08-16 · lista real y voucher en el front 2026-09-24 · cierre 2026-09-28 · marcada cerrada en el ROADMAP el 2026-09-29 (`31ea490`). |
| **Historia** | US-06 — plan en [US/06-epic.md](../US/06-epic.md). |
| **Commits** | filas 20–25 y 28 de [TRAZABILIDAD](../TRAZABILIDAD.md) (`9ab2bec` → `08dad63`, `f200557`). El cierre llegó con commits de la Fase 1. |

---

## Orden de lectura recomendado

1. **[US/06-epic.md](../US/06-epic.md)** — por qué el dashboard obligó a construir antes `Cita` y
   `Paciente`, y las seis decisiones (estados, job de ghosting, alcance sin dinero).
2. **[ADR-04](../Decisions/ADR-04.md)** — máquina de estados en el dominio, `ghosting` ≠ `no_asistio`,
   estado materializado. Lee también sus dos notas de cabecera: ADR-09 la extiende y ADR-12 reemplaza
   el mecanismo de su §4.
3. **[us06-dashboard-citas](../Features/us06-dashboard-citas.md)** — endpoints, esquema, tests y cómo
   probar a mano con el seed.
4. **[ADR-07](../Decisions/ADR-07.md)** — el día y la hora en la zona de la clínica (el bug de UTC).
5. **Deudas que nacieron aquí** y cómo siguieron: DT-10 y DT-22 se cerraron en la
   [Fase 1](fase-1-us02-gestion-citas.md); DT-11 se aplazó en la [Fase 2](fase-2-us03-recordatorios.md)
   y pasa a la [Fase 5](fase-5-us07-scoring.md).
6. **Frontend:** [dashboard-citas-del-dia](../../../citia-frontend/context/Features/dashboard-citas-del-dia.md).

---

## Qué se construyó

- **Paciente mínimo** (`POST /api/pacientes`) y **Cita** en hexagonal completo: `inicio` como
  `timestamptz` único, seis estados (`pendiente`, `confirmada`, `cancelada`, `asistio`, `no_asistio`,
  `ghosting`) y transiciones validadas en la entidad.
- **`POST /api/citas`** y **`GET /api/citas/hoy`**: primer uso real del `JwtAuthGuard`; filtro por
  `tenantId` y `usuarioId` del token; orden cronológico.
- **Zona de la clínica** (`APP_TZ`, ADR-07): fronteras del día y hora mostrada con `Intl`, sin
  depender de la zona del servidor.
- **Seed demo** con seis citas de hoy en estados variados.
- **Cierre (2026-09-28):** el front consume la lista real, marca las citas pasadas y abre el voucher
  (US-02.08); se refresca tras crear, reagendar o cancelar (US-02.09). `GET /citas/hoy` gana `fecha`
  (`9140bc3`, Fase 1).

**Lo que US-06 dejó para después:** el job de ghosting (paso 7 del plan) → aplazado con el scoring
([DT-11](../Deudas/DT-11.md), [Fase 5](fase-5-us07-scoring.md)); el scoring (paso 8) → v2. La medición
de "carga en < 2 s" de la Definición de Terminado **no consta** en ningún documento.

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documento |
|---|---|---|---|---|
| 20 | `9ab2bec` | 2026-06-30 | módulo paciente mínimo | [us06](../Features/us06-dashboard-citas.md) |
| 21 | `e592d74` | 2026-06-30 | cita con máquina de estados y endpoints | **[ADR-04](../Decisions/ADR-04.md)** + us06 |
| 22–23 | `b485e1f`, `76157dc` | 2026-06-30 | wiring de módulos y tests | us06 §Tests |
| 24 | `77523c9` | 2026-06-30 | docs de US-06 y ADR-04 | ADR-04 · us06 · [US-06](../US/06-epic.md) |
| 25 | `08dad63` | 2026-07-06 | día y hora en la zona de la clínica | **[ADR-07](../Decisions/ADR-07.md)** + us06 §Zona horaria |
| 28 | `f200557` | 2026-08-16 | seed demo del dashboard | [infra §Seed](../Features/infra-contenedores.md#seed-de-datos-demo-f200557) · us06 §Probar a mano |
| 48 | `9140bc3` | 2026-09-28 | `fecha` en `GET /citas/hoy` (commit de la Fase 1) | [us02 §a](../Features/us02-gestion-citas.md#a-get-apicitasdesdehasta--agenda-por-rango) |
| 57 | `31ea490` | 2026-09-29 | el ROADMAP marca la Fase 0 como cerrada | [ROADMAP](../ROADMAP.md) |

---

## Decisiones

| ADR | En una línea | Estado |
|---|---|---|
| [ADR-04](../Decisions/ADR-04.md) | Máquina de estados de `Cita` en el dominio, grafo cerrado y estado materializado | Aceptado · extendido por ADR-09 · mecanismo del §4 (BullMQ) reemplazado por ADR-12 (2026-09-30) |
| [ADR-07](../Decisions/ADR-07.md) | Día y hora en la zona de la clínica, DST-safe con `Intl` | Aceptado · Implementado |

**Decisiones del frontend:** ninguna en esta fase. **Decisión de alcance** (US-06 §6, 2026-06-30):
el dashboard no expone nada de dinero.

---

## Features

- [us06-dashboard-citas](../Features/us06-dashboard-citas.md) — ✅ backend + zona horaria.

---

## Deudas

**Creadas** (origen en ADR-04, ADR-07 o us06):

| Deuda | Estado hoy |
|---|---|
| [DT-10](../Deudas/DT-10.md) máquina de estados inalcanzable | ✅ cerrada en la Fase 1 (2026-08-23) |
| [DT-11](../Deudas/DT-11.md) el historial de comportamiento no se acumula | 🔵 aplazada (Fase 2, 2026-09-30) → [Fase 5](fase-5-us07-scoring.md) |
| [DT-12](../Deudas/DT-12.md) solapamiento no detectado | 🟢 resuelta en diseño por ADR-11 e implementada en la Fase 1 (ver la nota de la deuda) |
| [DT-13](../Deudas/DT-13.md) se aceptan citas en el pasado | abierta |
| [DT-14](../Deudas/DT-14.md) `inicio` sin zona horaria en la entrada | abierta (agravada por reagendar) |
| [DT-15](../Deudas/DT-15.md) no se puede buscar un paciente | abierta · neutralizada para crear cita por el RUT (Fase 1) |
| [DT-16](../Deudas/DT-16.md) el consentimiento se captura y nadie lo lee | 🟠 riesgo aceptado (Fase 2) |
| [DT-17](../Deudas/DT-17.md) zona horaria única para toda la instalación | 🔵 aplazada |
| [DT-20](../Deudas/DT-20.md) los e2e nunca se ejecutaron | abierta · avance en la Fase 1 |
| [DT-22](../Deudas/DT-22.md) sin vínculo entre citas reagendadas | ✅ cerrada en la Fase 1 (2026-08-23) |

**Cerradas en esta fase:** ninguna. **Afectadas:** ninguna.

---

## Preguntas abiertas relacionadas

- [Q4](../PREGUNTAS-ABIERTAS.md#q4--solapamiento-avisar-o-rechazar) — solapamiento (DT-12); respondida
  el 2026-09-25 con [ADR-11](../Decisions/ADR-11.md).
- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) — el job
  de ghosting (DT-11); mecanismo decidido en [ADR-12](../Decisions/ADR-12.md), el job aplazado.

---

## Planes de US

- [US/06-epic.md](../US/06-epic.md) — pasos 1 a 5 hechos; 6 (frontend) cerrado con la Fase 1; 7 y 8
  aplazados.

---

## Contraparte en el frontend

- [us/06-epic.md](../../../citia-frontend/context/us/06-epic.md) — la historia del lado del front.
- [Features/dashboard-citas-del-dia.md](../../../citia-frontend/context/Features/dashboard-citas-del-dia.md)
  — la lista conectada (US-06 + US-02.09).
- [us/02.09-dashboard-refleja-cambios.md](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md)
  — el refresco tras cada cambio.
- [DTF-03](../../../citia-frontend/context/Deudas/DTF-03.md) — métricas, ausentismo y actividad siguen
  con datos de prueba (lo único pendiente de la fase).

---

## Depende de / desbloquea

- **Depende de:** [Fundaciones](fase-base-fundaciones.md) (guard JWT) y, para cerrarse, de la
  [Fase 1](fase-1-us02-gestion-citas.md): lista real de citas, voucher y refresco.
- **Desbloquea:** la [Fase 1](fase-1-us02-gestion-citas.md) se construye sobre `Cita` y `Paciente`; la
  [Fase 5](fase-5-us07-scoring.md) necesita los estados `ghosting` y `no_asistio` que se modelaron aquí.
