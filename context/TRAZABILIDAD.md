# Trazabilidad: commit → documentación

Mapa uno-a-uno entre cada commit del repo y su documentación (ADR y/o feature). Regla del
proyecto: **toda decisión de diseño vive en un ADR; toda funcionalidad vive en una feature; ningún
commit sustantivo queda sin doc.** Los chores/fixes puros de tooling se anotan aquí aunque no
tengan doc dedicada.

Orden cronológico (más antiguo arriba).

**Columna Fase** (fase del roadmap a la que pertenece el commit; guías en [`Fases/`](Fases/README.md)):
`Base` = [Fundaciones](Fases/fase-base-fundaciones.md) · `F0` = [Fase 0 — US-06](Fases/fase-0-us06-dashboard.md) ·
`F1` = [Fase 1 — US-02](Fases/fase-1-us02-gestion-citas.md) · `F2` = [Fase 2 — US-03](Fases/fase-2-us03-recordatorios.md) ·
`F3` = [Fase 3 — US-04](Fases/fase-3-us04-respuesta-paciente.md) · `—` = transversal. Dos códigos = el commit toca las dos; el
primero es el principal. *(Columna agregada el 2026-09-30.)*

| # | Commit | Fecha | Tipo | Documentación | Fase |
|---|--------|-------|------|---------------|------|
| 1 | `258542f` First commit (scaffold NestJS) | 2026-06-18 | bootstrap | — (scaffold) | Base |
| 2 | `2ca87d1` scaffolding multi-agente + context inicial | 2026-06-22 | chore/docs | `CLAUDE.md`, `context/` (rf, rnf, stack, rules, epic-06) | Base |
| 3 | `aee9407` docs: ADRs + trazabilidad de epic | 2026-06-22 | docs | ADR-00, ADR-01, ADR-02; US/00-auth | Base |
| 4 | `ce7d99e` feat(tenant): módulo tenant | 2026-06-22 | feature | [us00a](Features/us00a-registro-inicial.md) | Base |
| 5 | `718fe1f` refactor(usuario): split dominio/ORM hexagonal | 2026-06-22 | feature | [us00a](Features/us00a-registro-inicial.md); regla en ADR-02 | Base |
| 6 | `2ee856f` feat(usuario): POST /api/usuarios atómico | 2026-06-22 | feature | [us00a](Features/us00a-registro-inicial.md) | Base |
| 7 | `706f12f` test(usuario): unit + integración | 2026-06-22 | test | [us00a](Features/us00a-registro-inicial.md) §Tests | Base |
| 8 | `389eb81` chore(database): migración inicial + CLI | 2026-06-22 | chore | [us00a](Features/us00a-registro-inicial.md) §BD; regla en ADR-00 | Base |
| 9 | `df53128` fix(build): excluir context/ de la compilación | 2026-06-22 | fix | [ADR-05](Decisions/ADR-05.md) §fix build; [infra](Features/infra-contenedores.md) | Base |
| 10 | `b8cac2a` chore(docker): multi-stage + compose + entrypoint | 2026-06-22 | infra | **[ADR-05](Decisions/ADR-05.md)** + **[infra-contenedores](Features/infra-contenedores.md)** | Base |
| 11 | `195431b` feat(tenant): slug único + findBySlug + slugify | 2026-06-22 | feature | ADR-03; [us00a](Features/us00a-registro-inicial.md), [us00b](Features/us00b-login.md) | Base |
| 12 | `cfa35f3` feat(usuario): slug único en el registro | 2026-06-22 | feature | ADR-03; [us00a](Features/us00a-registro-inicial.md) | Base |
| 13 | `45198c3` feat(auth): login JWT multi-tenant + CORS | 2026-06-22 | feature | ADR-01, ADR-03; [us00b](Features/us00b-login.md) | Base |
| 14 | `0e54f0b` chore(tooling): scripts migración prod + fix Jest 30 | 2026-06-22 | chore | [ADR-05](Decisions/ADR-05.md) §scripts; [infra](Features/infra-contenedores.md) | Base |
| 15 | `c911bce` test: login + slug + slugify | 2026-06-22 | test | [us00b](Features/us00b-login.md) §Tests | Base |
| 16 | `346a034` docs(context): auth + login por slug | 2026-06-22 | docs | ADR-01 (Implementado), ADR-03; us00b | Base |
| 17 | `d4fa476` feat(usuario): registro atómico con TransactionRunner | 2026-06-23 | feature/decisión | **[ADR-06](Decisions/ADR-06.md)** + [us00a §Atomicidad](Features/us00a-registro-inicial.md) | Base |
| 18 | `f573485` test(usuario): rollback transaccional | 2026-06-23 | test | [ADR-06](Decisions/ADR-06.md) §Verificación; us00a §Atomicidad | Base |
| 19 | `055f33e` explained code main (comentarios) | 2026-06-29 | docs/chore | comentarios en `app.module.ts` / `main.ts` | Base |
| 20 | `9ab2bec` feat(paciente): módulo paciente mínimo | 2026-06-30 | feature | [us06](Features/us06-dashboard-citas.md) | F0 |
| 21 | `e592d74` feat(cita): máquina de estados + endpoints | 2026-06-30 | feature/decisión | **ADR-04** + [us06](Features/us06-dashboard-citas.md) | F0 |
| 22 | `b485e1f` feat(cita): wiring módulos + ORM entities | 2026-06-30 | feature | [us06](Features/us06-dashboard-citas.md) | F0 |
| 23 | `76157dc` test(cita): dominio/servicio/controller/e2e | 2026-06-30 | test | [us06](Features/us06-dashboard-citas.md) §Tests | F0 |
| 24 | `77523c9` docs(context): US-06 + ADR-04 | 2026-06-30 | docs | ADR-04; us06; epic-06 | F0 |
| 25 | `08dad63` fix(cita): día/hora en la zona de la clínica | 2026-07-06 | fix/decisión | **[ADR-07](Decisions/ADR-07.md)** + [us06 §Zona horaria](Features/us06-dashboard-citas.md) | F0 |
| 26 | `77a97c9` fix(docker): puerto de pgAdmin fuera del rango reservado de Windows | 2026-08-16 | fix/infra | [infra §docker-compose](Features/infra-contenedores.md); ADR-05 | Base |
| 27 | `b623b6a` fix(tooling): cargar `.env` en el CLI de TypeORM y en los e2e | 2026-08-16 | fix/infra | [infra §Carga de .env](Features/infra-contenedores.md); ADR-05 | Base |
| 28 | `f200557` feat(database): seed idempotente de datos demo | 2026-08-16 | feature/tooling | [infra §Seed](Features/infra-contenedores.md) + [us06 §Probar a mano](Features/us06-dashboard-citas.md) | Base · F0 |
| 29 | `298967d` style(main): formato prettier en comentarios | 2026-08-16 | style | — (solo formato, sin cambio de comportamiento) | Base |
| 30 | `3db199a` docs(context): ADR-05/06/07 + índices + trazabilidad | 2026-08-16 | docs | ADR-05, ADR-06, ADR-07; este archivo | Base · F0 |
| 31 | `a5a5f58` chore(git): normalizar fin de línea con `.gitattributes` | 2026-08-16 | chore | — (tooling; ver nota abajo) | Base |
| 32 | `cc362ee` docs(context): alinear trazabilidad y features con la consolidación | 2026-08-16 | docs | este archivo; [infra](Features/infra-contenedores.md), [us06](Features/us06-dashboard-citas.md), ADR-05, índices | Base · F0 |
| 33 | `73029e0` docs(context): trazar el commit de cierre y documentar la convención | 2026-08-16 | docs | este archivo (fila 32 + convención) | Base |
| 34 | `bfeada0` docs(adr): ADR-08 — tenant del body a la URL | 2026-08-16 | docs/decisión | **[ADR-08](Decisions/ADR-08.md)** (propuesto) | Base · F1 |
| 35 | `f2a7dff` feat: release 1 de US-02 + RUT + conexión con el frontend | 2026-08-24 | feature/decisión | **[ADR-09](Decisions/ADR-09.md)** §3–§7 + [us02](Features/us02-gestion-citas.md); cierra [DT-10](Deudas/DT-10.md) y [DT-22](Deudas/DT-22.md) | F1 |
| 36 | `e1253c3` feat(solicitud): recepción pública de solicitudes de hora | 2026-09-10 | feature | [ADR-09](Decisions/ADR-09.md) §1,§2,§8–§11 + [us02](Features/us02-gestion-citas.md) §Pública | F1 |
| 37 | `439a5fe` docs(context): vía pública en ADR-09 + tablero de deudas | 2026-09-10 | docs | ADR-09 §11; [DT-29](Deudas/DT-29.md) nueva; [DT-28](Deudas/DT-28.md) mitigada; [DT-18](Deudas/DT-18.md) aplazada | F1 |
| 38 | `16b50e1` docs(frontend-decisions): decisiones del front sobre el enlace público | 2026-09-10 | docs/decisión (front) | **[FD-01…FD-06](Frontend-Decisions/README.md)** (nuevas) | F1 · F3 |
| 39 | `7327d6c` docs(us-02): feature de US-02 y trazabilidad | 2026-09-10 | docs | **[us02](Features/us02-gestion-citas.md)** (nueva); filas 34–37 y nota 35 de este archivo; [Features/README](Features/README.md); etapas [2](Descripcion/fase-2-requisitos.md) y [3](Descripcion/fase-3-mvp.md) del producto; README | F1 |
| 40 | `cea0bd1` docs(roadmap): hoja de ruta de US-02 a US-10 | 2026-09-25 | docs | **[ROADMAP](ROADMAP.md)** (nuevo) | — |
| 41 | `2877b13` docs(us-02): voucher US-02.08, ADR-10 y plan de US-02.07 | 2026-09-25 | feature/decisión | **[ADR-10](Decisions/ADR-10.md)** (propuesto); **[US-02.07](US/02.07-paciente-reagenda-cancela.md)** y **[US-02.08](US/02.08-voucher-cita.md)** (nuevos); [us02 §Detalle](Features/us02-gestion-citas.md#detalle-de-la-cita-us-0208); [DT-20](Deudas/DT-20.md) avance, [DT-29](Deudas/DT-29.md) mitigada; Q11 y H7 en PREGUNTAS (ver nota) | F1 · F3 |
| 42 | `e9ec6ba` merge `feature/us02-voucher-cita` → `docs/frontend-decisions` | 2026-09-25 | merge | — (integra 36, 37, 39 y 41) | F1 |
| 43 | `dbeb8c1` docs(us-02): retoque del roadmap | 2026-09-25 | docs | [ROADMAP](ROADMAP.md) (una línea); `data-source.ts` sin cambio funcional (ver nota) | F1 |
| 44 | `b83209b` merge `docs/frontend-decisions` → `develop` | 2026-09-25 | merge | — (lleva 38–43 a `develop`: vía pública, US-02.08, ADR-10, FDs y ROADMAP) | F1 |
| 45 | `717800e` feat(shared): rangos de fechas en la zona de la clínica | 2026-09-28 | feature/fix | [ADR-07](Decisions/ADR-07.md) (misma utilidad); [us02 §a](Features/us02-gestion-citas.md#a-get-apicitasdesdehasta--agenda-por-rango); corrige el inicio del día en el cambio de horario | F1 |
| 46 | `538657e` feat(cita): choques de horario en el dominio | 2026-09-28 | feature | **[ADR-11](Decisions/ADR-11.md)** §1–§2; [DT-12](Deudas/DT-12.md) | F1 |
| 47 | `6192e02` feat(solicitud): persistir la resolución de solicitudes | 2026-09-28 | feature | [us02 §Migración](Features/us02-gestion-citas.md#migración) y [§c](Features/us02-gestion-citas.md#c-bandeja-de-solicitudes-autenticada) | F1 |
| 48 | `9140bc3` feat(cita): agenda por rango y avisos de solapamiento | 2026-09-28 | feature | [ADR-11](Decisions/ADR-11.md) §3; [us02 §a](Features/us02-gestion-citas.md#a-get-apicitasdesdehasta--agenda-por-rango) y [§b](Features/us02-gestion-citas.md#b-aviso-de-solapamiento-en-las-respuestas-de-cita) | F1 · F0 |
| 49 | `e06862a` feat(solicitud): bandeja para aceptar o rechazar | 2026-09-28 | feature | [ADR-09](Decisions/ADR-09.md) (bandeja) + [us02 §c](Features/us02-gestion-citas.md#c-bandeja-de-solicitudes-autenticada); `src/modules/solicitud/CLAUDE.md` | F1 |
| 50 | `7635645` feat(auth): devolver `tenantSlug` en el login | 2026-09-28 | feature | [us02 §d](Features/us02-gestion-citas.md#d-enlace-para-compartir-la-url-pública); nota en [us00b](Features/us00b-login.md) | F1 |
| 51 | `a6b0a63` fix(database): limpiar historial y solicitudes antes del seed | 2026-09-28 | fix | [infra §Seed](Features/infra-contenedores.md#seed-de-datos-demo-f200557) | F1 |
| 52 | `c6df6c1` fix(test): corregir las suites con base de datos | 2026-09-28 | fix | [DT-20](Deudas/DT-20.md) avance; [ROADMAP § Fase 1 → Integración](ROADMAP.md#integración) | F1 |
| 53 | `06858f2` test(us-02): agenda por rango, avisos y bandeja | 2026-09-28 | test | [ROADMAP § Fase 1 → Integración](ROADMAP.md#integración) (ver nota) | F1 |
| 54 | `4c543a5` docs(us-02): contrato de cierre de la Fase 1, ADR-11 y roadmap | 2026-09-28 | docs/decisión | **[ADR-11](Decisions/ADR-11.md)** (nuevo); [us02 §Cierre de Fase 1](Features/us02-gestion-citas.md#cierre-de-fase-1--contrato-2026-09-25); [DT-12](Deudas/DT-12.md) resuelta en diseño; Q4 y Q11 respondidas; [US-02.07](US/02.07-paciente-reagenda-cancela.md) aplazada; [ROADMAP](ROADMAP.md) | F1 |
| 55 | `b07d839` chore(tooling): vista previa del frontend | 2026-09-28 | chore | — (tooling: `.claude/launch.json`) | F1 |
| 56 | `abe9045` merge `feature/us02-cierre-fase1` → `develop` | 2026-09-28 | merge | — (**cierre de la Fase 1**: lleva 45–55 a `develop`) | F1 |
| 57 | `31ea490` docs(context): descartar FD-01 y aceptar DT-18 sin límite | 2026-09-29 | docs/decisión | [FD-01](Frontend-Decisions/FD-01.md) descartada; [ADR-09](Decisions/ADR-09.md) decisiones 2 y 8; [DT-18](Deudas/DT-18.md) aceptada; [ROADMAP](ROADMAP.md): Fases 0 y 1 cerradas | F1 · F0 |
| 58 | `c9ac69f` merge `docs/decisiones-fd01-dt18` → `develop` | 2026-09-29 | merge | — (integra 57) | F1 |
| 59 | `ab30bb7` docs(arch): ADR-12 outbox y planificador, ADR-13 recordatorios, DT-30 | 2026-09-30 | docs/decisión | **[ADR-12](Decisions/ADR-12.md)**, **[ADR-13](Decisions/ADR-13.md)**, **[US-03](US/03-recordatorios.md)** y **[DT-30](Deudas/DT-30.md)** (nuevos); DT-11, DT-16, DT-19, DT-21, DT-27 y DT-29 actualizadas; notas en ADR-04 y ADR-09 §3; Q1 y Q6; [stack](stack-tecnologico.md); [etapa 3 del producto](Descripcion/fase-3-mvp.md); índices, README y ROADMAP | F2 |

> **Nota commit 31.** `core.autocrlf=true` marcaba ~32 archivos como modificados con contenido
> idéntico, ensuciando `git status` y los diffs de cada PR. `.gitattributes` fija LF para repo y
> working tree (CRLF solo en `.bat`/`.cmd`, binarios excluidos).

> **Nota commit 35.** El mensaje (`Connect api with btn`) describe solo la parte visible: ese commit
> trae además el release 1 completo de US-02 —transiciones de estado expuestas, `reagendar()`,
> bitácora `cambios_cita`, publicación de hechos— y el RUT como identidad del paciente. Es el commit
> más grande del repo y su asunto no lo refleja; de ahí esta nota.
>
> *Agregado el 2026-09-30:* ese mismo commit creó además la base del contexto de producto y de deudas
> —[`README.md`](README.md), [`Descripcion/`](Descripcion/README.md), [`Deudas/`](Deudas/README.md)
> (DT-01 a DT-28, incluidas las de Fundaciones y de la Fase 0) y
> [`PREGUNTAS-ABIERTAS.md`](PREGUNTAS-ABIERTAS.md)—, y las secciones *Deudas técnicas asociadas* de
> ADR-01, ADR-03, ADR-04, ADR-07 y de las features us00a, us00b, us06 e infra.

> **Nota fila 38.** `16b50e1` es anterior en el tiempo a las filas 36 y 37 (12:43 frente a 16:30 del
> mismo día) pero vivió en otra rama (`docs/frontend-decisions`) y no se registró en la pasada que
> cerró `7327d6c`. Se numera aquí para no renumerar las filas existentes.

> **Nota fila 39.** `7327d6c` es el commit que cerró la pasada anterior (registró las filas 34–37):
> por la convención de abajo, se registra en esta.

> **Nota fila 41.** Como la 35, el asunto (`update documentation and traceability`) no refleja el
> contenido: además de docs trae **código** de US-02.08 —`GET /api/citas/:id` con
> `accionesPermitidas` en la entidad, DTO de detalle, `@MaxLength(300)` en los motivos— y el primer e2e
> sin base de datos (`test/citas-detalle.e2e-spec.ts`).

> **Nota fila 43.** Pese al asunto, solo toca una línea del ROADMAP y quita el salto de línea final de
> `src/database/data-source.ts`. Sin cambio funcional.

> **Nota fila 53.** Los tests del cierre de la Fase 1 no se listaron en la tabla de
> [us02 §Tests](Features/us02-gestion-citas.md#tests), que quedó en el estado del 2026-09-24. La
> verificación del cierre está en el ROADMAP.

> **Convención — el último commit de docs.** Un commit no puede citar su propio hash, así que el
> commit de documentación que **cierra** una pasada de alineación siempre se registra en la pasada
> siguiente (como pasó con `77523c9` y con `3db199a`). Si al auditar aparece exactamente **un**
> commit `docs(context)` sin fila al final del historial, es esto y no un hueco.
>
> *Pasada del 2026-09-30:* registra hasta `ab30bb7` inclusive. El commit que agregue la navegación
> por fases (`Fases/`, esta columna y los bloques de navegación) **no tiene fila**: se registra en la
> pasada siguiente, como indica esta convención. `ab30bb7` y ese commit viven en la rama
> `docs/fase2-recordatorios`; al 2026-09-30 no están en `develop`.

## Cobertura por decisión (ADR ↔ commits)

| ADR | Tema | Commits |
|-----|------|---------|
| ADR-00 | TypeORM definitivo, migraciones versionadas | `389eb81`, `b8cac2a` |
| ADR-01 | Auth Passport + JWT | `45198c3`, `346a034` |
| ADR-02 | Español + hexagonal | `718fe1f`, `ce7d99e` (regla transversal) |
| ADR-03 | Login multi-tenant por `tenantSlug` | `195431b`, `cfa35f3`, `45198c3` |
| ADR-04 | Máquina de estados de Cita + ghosting | `e592d74`, `77523c9`, `ab30bb7` (nota: BullMQ → ADR-12) |
| **ADR-05** | Contenedorización Docker + migraciones en arranque | `b8cac2a`, `df53128`, `0e54f0b`, `77a97c9`, `b623b6a` |
| **ADR-06** | Atomicidad transaccional (TransactionRunner opaco) | `d4fa476`, `f573485` |
| **ADR-07** | Día/hora en zona de la clínica (DST-safe) | `08dad63`, `717800e` (rangos y corrección del inicio del día en DST) |
| ADR-08 | Tenant en la URL | `bfeada0` (propuesto) · fase 1 adoptada en la ruta pública por `e1253c3` |
| **ADR-09** | Gestión de citas: solicitud aparte, RUT como identidad, reagendar con bitácora | `f2a7dff` (§3–§7), `e1253c3` (§1,§2,§8–§11), `439a5fe` (docs), `e06862a` (bandeja), `4c543a5`, `31ea490` (decisión 2 reafirmada, límite de tasa), `ab30bb7` (matiz §3) |
| ADR-10 | Enlace por cita del paciente (US-02.07) | `2877b13` (propuesto), `4c543a5` (aplazado) |
| ADR-11 | Solapamiento: avisar y permitir | `4c543a5` (doc), `538657e`, `9140bc3` (implementación), `06858f2` (tests) |
| ADR-12 | Outbox transaccional + planificador en Postgres | `ab30bb7` (diseño; sin implementar) |
| ADR-13 | Recordatorios por correo (Resend) | `ab30bb7` (diseño; sin implementar) |

> **ADRs en negrita** = creados en la pasada de alineación (2026-07-12) para cerrar decisiones que
> estaban implementadas en el código pero no documentadas.
> *(Nota del 2026-09-30: el commit de esa pasada, `3db199a`, es del 2026-08-16; la fecha 2026-07-12 no
> aparece en el historial de git. ADR-09 también figura en negrita aunque se creó con `f2a7dff`.)*

## Cobertura por fase

| Fase | Filas | Rango |
|---|---|---|
| [Fundaciones](Fases/fase-base-fundaciones.md) | 1–19, 26–34 | `258542f` → `bfeada0` |
| [Fase 0 — US-06](Fases/fase-0-us06-dashboard.md) | 20–25, 28 (+ 30, 32 en docs; 48, 57 para el cierre) | `9ab2bec` → `08dad63`, `f200557` |
| [Fase 1 — US-02](Fases/fase-1-us02-gestion-citas.md) | 35–39, 41–58 | `f2a7dff` → `c9ac69f` |
| [Fase 2 — US-03](Fases/fase-2-us03-recordatorios.md) | 59 | `ab30bb7` |
| [Fase 3 — US-04](Fases/fase-3-us04-respuesta-paciente.md) | ninguna propia (ADR-10 y FD-06 entraron en 38, 41 y 54) | — |
| transversal | 40 (ROADMAP) | `cea0bd1` |
