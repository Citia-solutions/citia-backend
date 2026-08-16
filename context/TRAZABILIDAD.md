# Trazabilidad: commit → documentación

Mapa uno-a-uno entre cada commit del repo y su documentación (ADR y/o feature). Regla del
proyecto: **toda decisión de diseño vive en un ADR; toda funcionalidad vive en una feature; ningún
commit sustantivo queda sin doc.** Los chores/fixes puros de tooling se anotan aquí aunque no
tengan doc dedicada.

Orden cronológico (más antiguo arriba).

| # | Commit | Fecha | Tipo | Documentación |
|---|--------|-------|------|---------------|
| 1 | `258542f` First commit (scaffold NestJS) | 2026-06-18 | bootstrap | — (scaffold) |
| 2 | `2ca87d1` scaffolding multi-agente + context inicial | 2026-06-22 | chore/docs | `CLAUDE.md`, `context/` (rf, rnf, stack, rules, epic-06) |
| 3 | `aee9407` docs: ADRs + trazabilidad de epic | 2026-06-22 | docs | ADR-00, ADR-01, ADR-02; US/00-auth |
| 4 | `ce7d99e` feat(tenant): módulo tenant | 2026-06-22 | feature | [us00a](Features/us00a-registro-inicial.md) |
| 5 | `718fe1f` refactor(usuario): split dominio/ORM hexagonal | 2026-06-22 | feature | [us00a](Features/us00a-registro-inicial.md); regla en ADR-02 |
| 6 | `2ee856f` feat(usuario): POST /api/usuarios atómico | 2026-06-22 | feature | [us00a](Features/us00a-registro-inicial.md) |
| 7 | `706f12f` test(usuario): unit + integración | 2026-06-22 | test | [us00a](Features/us00a-registro-inicial.md) §Tests |
| 8 | `389eb81` chore(database): migración inicial + CLI | 2026-06-22 | chore | [us00a](Features/us00a-registro-inicial.md) §BD; regla en ADR-00 |
| 9 | `df53128` fix(build): excluir context/ de la compilación | 2026-06-22 | fix | [ADR-05](Decisions/ADR-05.md) §fix build; [infra](Features/infra-contenedores.md) |
| 10 | `b8cac2a` chore(docker): multi-stage + compose + entrypoint | 2026-06-22 | infra | **[ADR-05](Decisions/ADR-05.md)** + **[infra-contenedores](Features/infra-contenedores.md)** |
| 11 | `195431b` feat(tenant): slug único + findBySlug + slugify | 2026-06-22 | feature | ADR-03; [us00a](Features/us00a-registro-inicial.md), [us00b](Features/us00b-login.md) |
| 12 | `cfa35f3` feat(usuario): slug único en el registro | 2026-06-22 | feature | ADR-03; [us00a](Features/us00a-registro-inicial.md) |
| 13 | `45198c3` feat(auth): login JWT multi-tenant + CORS | 2026-06-22 | feature | ADR-01, ADR-03; [us00b](Features/us00b-login.md) |
| 14 | `0e54f0b` chore(tooling): scripts migración prod + fix Jest 30 | 2026-06-22 | chore | [ADR-05](Decisions/ADR-05.md) §scripts; [infra](Features/infra-contenedores.md) |
| 15 | `c911bce` test: login + slug + slugify | 2026-06-22 | test | [us00b](Features/us00b-login.md) §Tests |
| 16 | `346a034` docs(context): auth + login por slug | 2026-06-22 | docs | ADR-01 (Implementado), ADR-03; us00b |
| 17 | `d4fa476` feat(usuario): registro atómico con TransactionRunner | 2026-06-23 | feature/decisión | **[ADR-06](Decisions/ADR-06.md)** + [us00a §Atomicidad](Features/us00a-registro-inicial.md) |
| 18 | `f573485` test(usuario): rollback transaccional | 2026-06-23 | test | [ADR-06](Decisions/ADR-06.md) §Verificación; us00a §Atomicidad |
| 19 | `055f33e` explained code main (comentarios) | 2026-06-29 | docs/chore | comentarios en `app.module.ts` / `main.ts` |
| 20 | `9ab2bec` feat(paciente): módulo paciente mínimo | 2026-06-30 | feature | [us06](Features/us06-dashboard-citas.md) |
| 21 | `e592d74` feat(cita): máquina de estados + endpoints | 2026-06-30 | feature/decisión | **ADR-04** + [us06](Features/us06-dashboard-citas.md) |
| 22 | `b485e1f` feat(cita): wiring módulos + ORM entities | 2026-06-30 | feature | [us06](Features/us06-dashboard-citas.md) |
| 23 | `76157dc` test(cita): dominio/servicio/controller/e2e | 2026-06-30 | test | [us06](Features/us06-dashboard-citas.md) §Tests |
| 24 | `77523c9` docs(context): US-06 + ADR-04 | 2026-06-30 | docs | ADR-04; us06; epic-06 |
| 25 | `08dad63` fix(cita): día/hora en la zona de la clínica | 2026-07-06 | fix/decisión | **[ADR-07](Decisions/ADR-07.md)** + [us06 §Zona horaria](Features/us06-dashboard-citas.md) |
| 26 | `77a97c9` fix(docker): puerto de pgAdmin fuera del rango reservado de Windows | 2026-08-16 | fix/infra | [infra §docker-compose](Features/infra-contenedores.md); ADR-05 |
| 27 | `b623b6a` fix(tooling): cargar `.env` en el CLI de TypeORM y en los e2e | 2026-08-16 | fix/infra | [infra §Carga de .env](Features/infra-contenedores.md); ADR-05 |
| 28 | `f200557` feat(database): seed idempotente de datos demo | 2026-08-16 | feature/tooling | [infra §Seed](Features/infra-contenedores.md) + [us06 §Probar a mano](Features/us06-dashboard-citas.md) |
| 29 | `298967d` style(main): formato prettier en comentarios | 2026-08-16 | style | — (solo formato, sin cambio de comportamiento) |
| 30 | `3db199a` docs(context): ADR-05/06/07 + índices + trazabilidad | 2026-08-16 | docs | ADR-05, ADR-06, ADR-07; este archivo |
| 31 | `a5a5f58` chore(git): normalizar fin de línea con `.gitattributes` | 2026-08-16 | chore | — (tooling; ver nota abajo) |
| 32 | `cc362ee` docs(context): alinear trazabilidad y features con la consolidación | 2026-08-16 | docs | este archivo; [infra](Features/infra-contenedores.md), [us06](Features/us06-dashboard-citas.md), ADR-05, índices |

> **Nota commit 31.** `core.autocrlf=true` marcaba ~32 archivos como modificados con contenido
> idéntico, ensuciando `git status` y los diffs de cada PR. `.gitattributes` fija LF para repo y
> working tree (CRLF solo en `.bat`/`.cmd`, binarios excluidos).

> **Convención — el último commit de docs.** Un commit no puede citar su propio hash, así que el
> commit de documentación que **cierra** una pasada de alineación siempre se registra en la pasada
> siguiente (como pasó con `77523c9` y con `3db199a`). Si al auditar aparece exactamente **un**
> commit `docs(context)` sin fila al final del historial, es esto y no un hueco.

## Cobertura por decisión (ADR ↔ commits)

| ADR | Tema | Commits |
|-----|------|---------|
| ADR-00 | TypeORM definitivo, migraciones versionadas | `389eb81`, `b8cac2a` |
| ADR-01 | Auth Passport + JWT | `45198c3`, `346a034` |
| ADR-02 | Español + hexagonal | `718fe1f`, `ce7d99e` (regla transversal) |
| ADR-03 | Login multi-tenant por `tenantSlug` | `195431b`, `cfa35f3`, `45198c3` |
| ADR-04 | Máquina de estados de Cita + ghosting | `e592d74`, `77523c9` |
| **ADR-05** | Contenedorización Docker + migraciones en arranque | `b8cac2a`, `df53128`, `0e54f0b`, `77a97c9`, `b623b6a` |
| **ADR-06** | Atomicidad transaccional (TransactionRunner opaco) | `d4fa476`, `f573485` |
| **ADR-07** | Día/hora en zona de la clínica (DST-safe) | `08dad63` |

> **ADRs en negrita** = creados en la pasada de alineación (2026-07-12) para cerrar decisiones que
> estaban implementadas en el código pero no documentadas.
