# Fundaciones — registro, login e infraestructura (antes del roadmap)

> **Fase del roadmap** (construcción), la base de todas las demás. No confundir con las
> [etapas del producto](../Descripcion/README.md). Índice: [Fases](README.md) · Estado en el
> [ROADMAP](../ROADMAP.md#convenciones) ("Auth y registro quedan fuera: ya están cerrados").

| | |
|---|---|
| **Objetivo** | Dejar lista la base multi-tenant: una organización con su primer administrador, login con JWT que sella el tenant, convenciones de código, ORM con migraciones y un contenedor desplegable. |
| **Entregable** | `POST /api/usuarios` (tenant + administrador, atómico) · `POST /api/auth/login` (JWT por `tenantSlug`) · `JwtAuthGuard` · imagen Docker con migraciones en el arranque · `docker-compose` local con pgAdmin · seed demo. |
| **Estado** | ✅ cerrada. |
| **Fechas** | scaffold 2026-06-18 · grueso 2026-06-22 · atomicidad 2026-06-23 · comentarios 2026-06-29 · tooling, consolidación de docs y ADR-08 (propuesto) el 2026-08-16. |
| **Historias** | US-00a registro · US-00b login — plan en [US/00-auth.md](../US/00-auth.md). |
| **Commits** | filas 1–19 y 26–34 de [TRAZABILIDAD](../TRAZABILIDAD.md) (`258542f` → `bfeada0`). |

---

## Orden de lectura recomendado

1. **[US/00-auth.md](../US/00-auth.md)** — las dos historias y sus criterios. Todo está tildado.
2. **[ADR-02](../Decisions/ADR-02.md)** — español + hexagonal. Es la regla que se aplica en todo el
   repo; conviene tenerla antes de abrir cualquier feature.
3. **[ADR-00](../Decisions/ADR-00.md)** — TypeORM definitivo, `synchronize:false`, migraciones
   versionadas.
4. **[us00a-registro-inicial](../Features/us00a-registro-inicial.md)** y después
   **[ADR-06](../Decisions/ADR-06.md)** — el registro y cómo se hizo atómico (el `TransactionRunner`
   que luego reutilizan la Fase 1 y la Fase 2).
5. **[ADR-03](../Decisions/ADR-03.md)** → **[ADR-01](../Decisions/ADR-01.md)** →
   **[us00b-login](../Features/us00b-login.md)** — por qué el login lleva `tenantSlug`, cómo se firma
   el JWT y el 401 genérico.
6. **[ADR-05](../Decisions/ADR-05.md)** + **[infra-contenedores](../Features/infra-contenedores.md)**
   — Docker, entrypoint, scripts de migración, `.env` en el CLI y el seed.
7. **[ADR-08](../Decisions/ADR-08.md)** (propuesto) — cómo cambiaría el login al llevar el tenant en la
   URL. Su "fase 1" ya se usa en la ruta pública de la [Fase 1](fase-1-us02-gestion-citas.md).
8. **Deudas** de la sección de abajo, empezando por las tres 🔴: DT-01, DT-03, DT-06.

---

## Qué se construyó

- **Tenant y usuario** en hexagonal: dominio puro, puertos como `abstract class`, adaptadores TypeORM
  con mapper; tablas `tenants` y `usuarios` con unicidad compuesta `(tenant_id, email)`.
- **Registro atómico** (`POST /api/usuarios`): crea la organización y su primer ADMINISTRADOR en una
  transacción; el `tenantId` lo genera el servidor; el slug se autogenera con sufijo ante colisión.
- **Login** (`POST /api/auth/login`): resuelve el tenant por `tenantSlug`, compara con bcrypt, firma un
  JWT HS256 con `sub`, `email`, `tenantId` y `rol`; cualquier fallo es un 401 genérico. El guard queda
  construido; se estrena en la [Fase 0](fase-0-us06-dashboard.md).
- **Infraestructura:** Dockerfile de tres etapas (`node:22-alpine`), compose con Postgres 16 y pgAdmin,
  migraciones antes de arrancar la app, scripts de migración para producción, carga de `.env` en el
  CLI de TypeORM y en los e2e, fin de línea normalizado con `.gitattributes`.

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documento |
|---|---|---|---|---|
| 1 | `258542f` | 2026-06-18 | scaffold NestJS | — |
| 2 | `2ca87d1` | 2026-06-22 | scaffolding multi-agente y `context/` inicial | `rf`, `rnf`, `stack`, `rules`, [US-06](../US/06-epic.md) |
| 3 | `aee9407` | 2026-06-22 | primeros ADRs | [ADR-00](../Decisions/ADR-00.md), [ADR-01](../Decisions/ADR-01.md), [ADR-02](../Decisions/ADR-02.md), [US-00](../US/00-auth.md) |
| 4–8 | `ce7d99e` … `389eb81` | 2026-06-22 | tenant, refactor hexagonal, registro, tests, migración inicial | [us00a](../Features/us00a-registro-inicial.md) · ADR-00 · ADR-02 |
| 9–10 | `df53128`, `b8cac2a` | 2026-06-22 | fix de build y Docker | [ADR-05](../Decisions/ADR-05.md) · [infra](../Features/infra-contenedores.md) |
| 11–13 | `195431b`, `cfa35f3`, `45198c3` | 2026-06-22 | slug único y login JWT + CORS | [ADR-03](../Decisions/ADR-03.md), ADR-01 · [us00b](../Features/us00b-login.md) |
| 14–16 | `0e54f0b`, `c911bce`, `346a034` | 2026-06-22 | scripts de migración, tests del login, docs | ADR-05 · us00b |
| 17–18 | `d4fa476`, `f573485` | 2026-06-23 | registro atómico y su test de rollback | [ADR-06](../Decisions/ADR-06.md) · us00a §Atomicidad |
| 19 | `055f33e` | 2026-06-29 | comentarios en el bootstrap | — |
| 26–27 | `77a97c9`, `b623b6a` | 2026-08-16 | puerto de pgAdmin, `.env` en CLI y e2e | infra · ADR-05 |
| 28 | `f200557` | 2026-08-16 | seed demo (compartido con la Fase 0) | [infra §Seed](../Features/infra-contenedores.md#seed-de-datos-demo-f200557) |
| 29–33 | `298967d` … `73029e0` | 2026-08-16 | formato, `.gitattributes`, pasada de alineación de docs | ADR-05, ADR-06, ADR-07, índices, TRAZABILIDAD |
| 34 | `bfeada0` | 2026-08-16 | ADR-08 propuesto | [ADR-08](../Decisions/ADR-08.md) |

> Las deudas de esta fase no se ficharon en ella: el registro de [`Deudas/`](../Deudas/README.md) se
> creó el 2026-08-24, dentro de `f2a7dff` (fila 35), que es ya de la Fase 1.

---

## Decisiones

| ADR | En una línea | Estado |
|---|---|---|
| [ADR-00](../Decisions/ADR-00.md) | TypeORM como ORM definitivo; el esquema solo cambia por migraciones versionadas | Aceptado |
| [ADR-01](../Decisions/ADR-01.md) | Passport + JWT; el `tenantId` sale siempre del token | Aceptado · Implementado |
| [ADR-02](../Decisions/ADR-02.md) | Código en español y arquitectura hexagonal con regla de dependencias | Aceptado |
| [ADR-03](../Decisions/ADR-03.md) | Login multi-tenant por `tenantSlug`, 401 genérico | Aceptado · regla 4 superada por ADR-08 (propuesto) |
| [ADR-05](../Decisions/ADR-05.md) | Docker multi-stage y migraciones en el arranque del contenedor | Aceptado · Implementado |
| [ADR-06](../Decisions/ADR-06.md) | Atomicidad con un puerto `TransactionRunner` de contexto opaco | Aceptado · Implementado |
| [ADR-08](../Decisions/ADR-08.md) | El tenant sale del body del login y pasa a la URL (`TenantResolver`) | **Propuesto** · sin implementar en el login; su fase 1 la adoptó la ruta pública (ADR-09 §11.b) |

**Decisiones del frontend:** ninguna en esta fase.

---

## Features

- [us00a-registro-inicial](../Features/us00a-registro-inicial.md) — ✅ registro + atomicidad.
- [us00b-login](../Features/us00b-login.md) — ✅ login JWT multi-tenant.
- [infra-contenedores](../Features/infra-contenedores.md) — ✅ Docker, tooling y seed.
- [registrar-usuario](../Features/registrar-usuario.md) — ⛔ en desuso, solo histórico.

---

## Deudas

**Creadas** (su origen está en esta fase):

| Deuda | Estado hoy |
|---|---|
| [DT-01](../Deudas/DT-01.md) sin renovación ni revocación de sesión | 🔴 abierta |
| [DT-02](../Deudas/DT-02.md) el rol se emite y nadie lo verifica | abierta (escala con DT-07) |
| [DT-03](../Deudas/DT-03.md) sin verificación de correo ni recuperación de contraseña | 🔴 abierta |
| [DT-04](../Deudas/DT-04.md) login sin límite de intentos | abierta |
| [DT-05](../Deudas/DT-05.md) respuesta de login no uniforme en el tiempo | abierta |
| [DT-06](../Deudas/DT-06.md) registro público sin freno | 🔴 abierta |
| [DT-07](../Deudas/DT-07.md) no existe alta de un segundo usuario | abierta |
| [DT-08](../Deudas/DT-08.md) colisión de slug bajo concurrencia | abierta |
| [DT-09](../Deudas/DT-09.md) comprobación de correo duplicado inalcanzable | abierta |
| [DT-18](../Deudas/DT-18.md) sin límite de tasa (transversal) | aceptada sin límite por ahora (2026-09-29, Fase 1) |
| [DT-19](../Deudas/DT-19.md) sin observabilidad | 🟢 resuelta en diseño (2026-09-30, Fase 2) |
| [DT-21](../Deudas/DT-21.md) carpetas vacías mal escritas | 🟢 resuelta en diseño para `recordatorio/` (Fase 2) |

**Cerradas:** ninguna. **Afectadas:** ninguna.

---

## Preguntas abiertas relacionadas

- [Q5](../PREGUNTAS-ABIERTAS.md#q5--registro-abierto-por-invitación-o-lista-de-espera) y
  [H2](../PREGUNTAS-ABIERTAS.md#h2--superficie-de-abuso-del-registro-la-otra-mitad-de-q5) — registro
  abierto o por invitación (DT-06).
- [Q7](../PREGUNTAS-ABIERTAS.md#q7--renovación-de-sesión-bloqueado-hasta-que-el-hacker-defina-el-requisito)
  y [H1](../PREGUNTAS-ABIERTAS.md#h1--requisito-de-revocación-de-sesión-desbloquea-q7) — renovación y
  revocación de sesión (DT-01).
- [Q8](../PREGUNTAS-ABIERTAS.md#q8--adr-08-el-tenant-en-la-url-dev-b--prioridad-2) y
  [H4](../PREGUNTAS-ABIERTAS.md#h4--revisión-de-adr-08-antes-del-merge) — implementar ADR-08 en el login.
- [H6](../PREGUNTAS-ABIERTAS.md#h6--hallazgos-ya-fichados-para-confirmar-o-descartar) — confirmar
  DT-02, DT-04, DT-05 y DT-18.
- [Q3](../PREGUNTAS-ABIERTAS.md#q3--la-agenda-es-del-profesional-o-de-la-organización) — si la agenda
  es del profesional o de la organización; toca DT-07.

---

## Planes de US

- [US/00-auth.md](../US/00-auth.md) — US-00a y US-00b, completas.

---

## Contraparte en el frontend

- El login está implementado y conectado **sin documento propio** en el front (ver las notas de
  [`citia-frontend/context/Features/README.md`](../../../citia-frontend/context/Features/README.md)).
- Deudas del front sobre la sesión: [DTF-01](../../../citia-frontend/context/Deudas/DTF-01.md),
  [DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md),
  [DTF-04](../../../citia-frontend/context/Deudas/DTF-04.md) (esta última depende de DT-07 y DT-02).

---

## Depende de / desbloquea

- **Depende de:** nada.
- **Desbloquea:** todas las fases. El `JwtAuthGuard` y el `tenantId` del token son la base de la
  [Fase 0](fase-0-us06-dashboard.md); el `TransactionRunner` lo reutilizan la
  [Fase 1](fase-1-us02-gestion-citas.md) (bitácora, bandeja) y la [Fase 2](fase-2-us03-recordatorios.md)
  (outbox).
