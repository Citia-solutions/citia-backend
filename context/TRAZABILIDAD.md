# Trazabilidad: commit → documentación

Mapa uno-a-uno entre cada commit del repo y su documentación (ADR y/o feature). Regla del
proyecto: **toda decisión de diseño vive en un ADR; toda funcionalidad vive en una feature; ningún
commit sustantivo queda sin doc.** Los chores/fixes puros de tooling se anotan aquí aunque no
tengan doc dedicada.

Orden cronológico (más antiguo arriba).

**Columna Fase** (fase del roadmap a la que pertenece el commit; guías en [`Fases/`](Fases/README.md)):
`Base` = [Fundaciones](Fases/fase-base-fundaciones.md) · `F0` = [Fase 0 — US-06](Fases/fase-0-us06-dashboard.md) ·
`F1` = [Fase 1 — US-02](Fases/fase-1-us02-gestion-citas.md) · `F2` = [Fase 2 — US-03](Fases/fase-2-us03-recordatorios.md) ·
`F3` = [Fase 3 — US-04](Fases/fase-3-us04-respuesta-paciente.md) · `F5` = [Fase 5 — US-07](Fases/fase-5-us07-scoring.md) ·
`F7` = [Fase 7 — US-10](Fases/fase-7-us10-perfil.md) · `—` = transversal. Dos códigos = el commit toca las dos; el
primero es el principal. *(Columna agregada el 2026-09-30; `F5` y `F7`, el 2026-11-01. Las Fases 4 y 6 no tienen
commits propios todavía.)*

**Ramas.** Git Flow: `develop` es la integración y se despliega en **staging**; `main` se despliega en
**production**. Desde la fila 75, `main` comparte historia con `develop` y recibe los releases. Los merges
de un PR a `develop` son filas de tipo `merge`; los que llegan a `main`, de tipo `release`. *(Agregado el
2026-10-07.)* *(2026-11-01: dos excepciones a Git Flow. El PR #14, de docs, se mergeó directo a `main` (fila 117, de
tipo `merge`), y la Fase 7 llegó a `develop` por fast-forward, sin PR ni commit de merge, llevando con ella las filas
113–116; ver las notas de las filas 117 y 118–123.)*

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
| 41 | `2877b13` docs(us-02): voucher US-02.08, ADR-10 y plan de US-02.07 | 2026-09-25 | feature/decisión | **[ADR-10](Decisions/ADR-10.md)** (propuesto); **[US-02.07](US/02.07-paciente-reagenda-cancela.md)** y **[US-02.08](US/02.08-voucher-cita.md)** (nuevos); [us02 §Detalle](Features/us02-gestion-citas.md#detalle-de-la-cita-us-0208); [DT-20](Deudas/DT-20.md) avance, [DT-29](Deudas/DT-29.md) mitigada; Q11 en PREGUNTAS (ver nota) | F1 · F3 |
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
| 60 | `2f33394` docs(context): navegación por fases y enlaces cruzados | 2026-09-30 | docs | **[`Fases/`](Fases/README.md)** (nueva: una guía por fase); columna Fase de este archivo; bloque de navegación en cada ADR, deuda, feature, US y FD; secciones *Por fase* en los índices | — |
| 61 | `510015a` merge `docs/fase2-recordatorios` → `develop` | 2026-10-01 | merge | — (lleva 59 y 60 a `develop`) | F2 |
| 62 | `daf0617` feat(database): tabla `eventos_salida` y repositorio del outbox | 2026-10-01 | feature | [ADR-12](Decisions/ADR-12.md) §1, §3 y [notas](Decisions/ADR-12.md#notas-de-implementación-2026-10-04); [us03 § Esquema](Features/us03-recordatorios.md#esquema-de-bd) | F2 |
| 63 | `a6c237f` refactor(shared): `publicar(evento, tx)` exige la transacción | 2026-10-01 | refactor | [ADR-12](Decisions/ADR-12.md) §2; [us02 § Publicación de hechos](Features/us02-gestion-citas.md#publicación-de-hechos) | F2 · F1 |
| 64 | `d45de20` feat(backend): pino, health check, latidos, validación de entorno y CORS por lista | 2026-10-03 | feature/infra | [ADR-13](Decisions/ADR-13.md) §16, §18; [DT-19](Deudas/DT-19.md); [infra § Fase 2](Features/infra-contenedores.md#fase-2-observabilidad-planificador-y-variables-nuevas); [us03 § Observabilidad](Features/us03-recordatorios.md#observabilidad) | F2 |
| 65 | `f95b637` feat(backend): outbox real con despachador y planificador (cierra DT-27) | 2026-10-03 | feature | [ADR-12](Decisions/ADR-12.md) §2–§5; **cierra [DT-27](Deudas/DT-27.md)**; [us03 § Jobs](Features/us03-recordatorios.md#jobs-del-planificador) | F2 |
| 66 | `db46e37` test(outbox): integración con Postgres, e2e en serie y planificador con AppModule | 2026-10-03 | test | [ADR-12 § Verificación](Decisions/ADR-12.md#verificación); [DT-20](Deudas/DT-20.md) avance; [US-03 § DoD](US/03-recordatorios.md#definición-de-terminado) | F2 |
| 67 | `a37f175` feat(paciente): correo obligatorio y `PATCH /api/pacientes/:id` | 2026-10-03 | feature | [ADR-13](Decisions/ADR-13.md) §14; [us02 § Correo del paciente](Features/us02-gestion-citas.md#correo-del-paciente-obligatorio-fase-2); [DT-21](Deudas/DT-21.md) (`paciente/`); nota en `solicitud/CLAUDE.md` | F2 · F1 |
| 68 | `f2d80aa` feat(database): persistencia de recordatorios (cierra DT-21) | 2026-10-03 | feature | [ADR-13](Decisions/ADR-13.md) §1–§2 y [notas](Decisions/ADR-13.md#notas-de-implementación-2026-10-04); **cierra [DT-21](Deudas/DT-21.md)**; [us03 § Esquema](Features/us03-recordatorios.md#esquema-de-bd) | F2 |
| 69 | `a13d80a` feat(recordatorio): dominio, planificación pura y reconciliación | 2026-10-03 | feature | [ADR-13](Decisions/ADR-13.md) §3–§8; [us03 § Flujo](Features/us03-recordatorios.md#flujo-de-punta-a-punta) (ver nota) | F2 |
| 70 | `f719c66` feat(recordatorio): envío por Resend, webhook firmado y rutas | 2026-10-03 | feature | [ADR-13](Decisions/ADR-13.md) §7–§13, §16–§17; [us03 § Endpoints](Features/us03-recordatorios.md#endpoints); `src/modules/recordatorio/CLAUDE.md` (nuevo) | F2 |
| 71 | `a938f9d` test(recordatorio): Definición de Terminado de US-03 | 2026-10-04 | test | [US-03 § DoD](US/03-recordatorios.md#definición-de-terminado); **nota en [ADR-02](Decisions/ADR-02.md#nota-2026-10-04-el-check-del-4-pasa-a-ser-un-test)** (`src/arquitectura.spec.ts`); [DT-31](Deudas/DT-31.md) | F2 |
| 72 | `8dd4747` chore(test): excluir los specs del coverage | 2026-10-04 | chore | — (tooling; [us03 § Tests](Features/us03-recordatorios.md#tests)) | F2 |
| 73 | `f2ccb01` chore(tooling): vista previa del backend | 2026-10-04 | chore | — (tooling: `.claude/launch.json`) | F2 |
| 74 | `4967ab5` docs(context): Fase 2 implementada (ADR-12/13, feature US-03, deudas y checklist de producción) | 2026-10-04 | docs | **[us03-recordatorios](Features/us03-recordatorios.md)** y **[DT-31](Deudas/DT-31.md)…[DT-39](Deudas/DT-39.md)** (nuevos); notas de implementación en [ADR-12](Decisions/ADR-12.md#notas-de-implementación-2026-10-04) y [ADR-13](Decisions/ADR-13.md#notas-de-implementación-2026-10-04); nota en [ADR-02](Decisions/ADR-02.md#nota-2026-10-04-el-check-del-4-pasa-a-ser-un-test); [checklist de salida a producción](Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción); [US-03 § DoD](US/03-recordatorios.md#definición-de-terminado); Q12–Q15; filas 60–73 de este archivo (ver nota) | F2 |
| 75 | `f1f711f` merge `develop` → `main` (`--allow-unrelated-histories`) | 2026-10-04 | release | — (**primer release a producción**: Fundaciones, Fase 0, Fase 1 y el diseño de la Fase 2, hasta `510015a`; ver nota) | — |
| 76 | `060303c` merge PR #1 `feature/fase2-recordatorios` → `develop` | 2026-10-04 | merge | — (lleva 62–74 a `develop`: **implementación de la Fase 2**, se despliega en staging) | F2 |
| 77 | `893c112` docs(context): el frontend se queda en Netlify | 2026-10-04 | docs/decisión | [stack § Despliegue del frontend](stack-tecnologico.md#despliegue-del-frontend-netlify) (revierte Cloudflare Workers); [ROADMAP](ROADMAP.md#fase-2--us-03-recordatorios-al-paciente), [Fase 2](Fases/fase-2-us03-recordatorios.md) y [US-03](US/03-recordatorios.md) | F2 |
| 78 | `31d2c9e` merge PR #2 `docs/frontend-netlify` → `develop` | 2026-10-04 | merge | — (integra 77) | F2 |
| 79 | `173d6b6` feat(auth): incluir `tenantNombre` en la respuesta del login | 2026-10-05 | feature | [us00b § Nota 2026-10-05](Features/us00b-login.md) (el sidebar del frontend muestra el nombre de la organización; no entra al JWT) | F2 · Base |
| 80 | `9fdb989` chore(tooling): el backend de la vista previa acepta el frontend local | 2026-10-05 | chore | — (tooling: `FRONTEND_URL` fijo en `.claude/launch.json`) | F2 |
| 81 | `e603ed3` docs(context): asistencia desde el voucher mitiga DT-30 | 2026-10-05 | docs/decisión | [DT-30](Deudas/DT-30.md) mitigada (el usuario revierte la decisión del 2026-09-30); [DT-29](Deudas/DT-29.md) (rutas consumidas); [Deudas/README](Deudas/README.md) | F2 · F3 |
| 82 | `4fc9a86` merge PR #3 `feature/login-tenant-nombre` → `develop` | 2026-10-05 | merge | — (integra 79–81) | F2 |
| 83 | `c057ade` merge PR #4 `develop` → `main` | 2026-10-06 | release | — (**release de la Fase 2 a producción**: lleva 74 y 76–82 a `main`; el frontend sale con citia-frontend#6) · cierre en [Fase 2 § Cierre](Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07) | F2 |
| 84 | `9fc1ddd` docs(context): cierre de la Fase 2 en producción | 2026-10-07 | docs | [Fase 2 § Cierre](Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07) (prueba de punta a punta, incidentes y lecciones); [stack § Mapa de entornos](stack-tecnologico.md#mapa-de-entornos) e [Infraestructura en producción](stack-tecnologico.md#infraestructura-en-producción-2026-10-07); [us03 § En producción](Features/us03-recordatorios.md#en-producción-2026-10-07); [DT-19](Deudas/DT-19.md) verificada en producción; **[DT-40](Deudas/DT-40.md)** y **[DT-41](Deudas/DT-41.md)** (nuevas); estado de ADR-12 y ADR-13; filas 74–83 de este archivo (ver nota) | F2 |
| 85 | `c757e0e` feat(infra): límite de tasa, trust proxy y clave del enlace del paciente | 2026-10-15 | feature/infra | [us04 § Límite de tasa](Features/us04-respuesta-paciente.md#límite-de-tasa) y [§ Configuración](Features/us04-respuesta-paciente.md#configuración); [infra § Fase 3](Features/infra-contenedores.md#fase-3-límite-de-tasa-trust-proxy-y-la-clave-del-enlace); [DT-18](Deudas/DT-18.md); [ADR-10](Decisions/ADR-10.md) §10 | F3 · Base |
| 86 | `6fbf4e3` feat(database): enlaces_cita y solicitudes de reagendamiento | 2026-10-15 | feature/BD | [us04 § Esquema de BD](Features/us04-respuesta-paciente.md#esquema-de-bd) (migraciones `1750000012000` a `1750000014000`); [DT-46](Deudas/DT-46.md) (corrige `recibida_en`) | F3 |
| 87 | `4d3d88f` feat(cita): enlace por cita con HMAC y actor en la bitácora | 2026-10-15 | feature | [us04](Features/us04-respuesta-paciente.md) (enlace, invalidación, `confirmadaPor` / `canceladaPor`); [ADR-10 § Notas de implementación](Decisions/ADR-10.md#notas-de-implementación-2026-10-15); [DT-45](Deudas/DT-45.md) (corrección); `src/modules/cita/CLAUDE.md` (nuevo) | F3 |
| 88 | `5f8ac6d` feat(recordatorio): el correo lleva el enlace del paciente | 2026-10-15 | feature | [us04](Features/us04-respuesta-paciente.md); [ADR-13](Decisions/ADR-13.md) §1 y §12 (bloque `accion`); `src/modules/recordatorio/CLAUDE.md` | F3 · F2 |
| 89 | `92b8020` feat(solicitud): pedir otra hora como solicitud de reagendamiento | 2026-10-15 | feature | [us04 § Hechos y suscriptor](Features/us04-respuesta-paciente.md#hechos-y-suscriptor); [DT-44](Deudas/DT-44.md) (parte 2 resuelta); [ADR-12](Decisions/ADR-12.md) §4 (suscriptor nuevo); `src/modules/solicitud/CLAUDE.md` | F3 |
| 90 | `143c8fb` feat(portal-paciente): portal público del paciente por el enlace de su cita | 2026-10-15 | feature | [us04 § Endpoints](Features/us04-respuesta-paciente.md#endpoints) y [§ Seguridad y privacidad](Features/us04-respuesta-paciente.md#seguridad-y-privacidad); `src/modules/portal-paciente/CLAUDE.md` (nuevo) | F3 |
| 91 | `3b312f9` test(e2e): Definición de Terminado de la Fase 3 | 2026-10-15 | test | [US-04 § Definición de Terminado](US/04-respuesta-paciente.md#definición-de-terminado); [us04 § Tests y verificación](Features/us04-respuesta-paciente.md#tests-y-verificación) | F3 |
| 92 | `b93f2c0` docs(context): Fase 3 documentada y equipo sin hacker ético ni QA | 2026-10-15 | docs/decisión | **[us04-respuesta-paciente](Features/us04-respuesta-paciente.md)**, **[US-04](US/04-respuesta-paciente.md)** y **[DT-42](Deudas/DT-42.md)…[DT-46](Deudas/DT-46.md)** (nuevos); [ADR-10](Decisions/ADR-10.md) aceptado con notas de implementación; regla G1 en [ADR-04](Decisions/ADR-04.md) y [DT-11](Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14); [DT-18](Deudas/DT-18.md) implementada; [US-02.07](US/02.07-paciente-reagenda-cancela.md) absorbida; [FD-06](Frontend-Decisions/FD-06.md) resuelta en parte; [checklist de salida](Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción); PREGUNTAS (ver nota) | F3 |
| 93 | `72d117f` merge PR #5 `docs/cierre-fase2` → `develop` | 2026-10-15 | merge | — (integra 84) | F2 |
| 94 | `ce0c533` merge PR #6 `feature/fase3-respuesta-paciente` → `develop` | 2026-10-15 | merge | — (lleva 85–92 a `develop`: **implementación de la Fase 3**, se despliega en staging; el frontend, con citia-frontend#7) | F3 |
| 95 | `05bae58` merge PR #7 `develop` → `main` | 2026-10-17 | release | — (**release de la Fase 3 a producción**: lleva 84–94 a `main`; el frontend sale con citia-frontend#8) · [Fase 3 § Release a producción](Fases/fase-3-us04-respuesta-paciente.md#release-a-producción-2026-10-17) (ver nota) | F3 |
| 96 | `5042888` feat(recordatorio): el correo sale a nombre de citiahealth | 2026-10-18 | feature | [us03 § Variables de entorno](Features/us03-recordatorios.md#variables-de-entorno) (`CORREO_REMITENTE` por defecto y pie del correo); la nota fechada va en [ADR-13](Decisions/ADR-13.md) con la fila 97 | F2 |
| 97 | `865354f` docs(context): remitente citiahealth en los documentos vigentes | 2026-10-18 | docs | [ADR-13](Decisions/ADR-13.md) (nota fechada del cambio de nombre; la decisión queda como estaba); [us03](Features/us03-recordatorios.md); [ROADMAP § Fase 2](ROADMAP.md#fase-2--us-03-recordatorios-al-paciente) (remitente); [stack](stack-tecnologico.md); `src/modules/recordatorio/CLAUDE.md` | F2 |
| 98 | `01619ba` merge PR #8 `feature/correo-citiahealth` → `develop` | 2026-10-18 | merge | — (integra 96 y 97) | F2 |
| 99 | `932d416` merge PR #9 `develop` → `main` | 2026-10-18 | release | — (lleva 96–98 a `main`: el remitente *citiahealth* en producción; ver nota) | F2 |
| 100 | `8208a56` docs(context): guía Explicado del proyecto en lenguaje simple | 2026-10-18 | docs | **[`Explicado/`](Explicado/index.md)** (nueva: once capítulos más uno a fondo de la Fase 3, y un índice; traduce a los documentos oficiales) | — |
| 101 | `be69c27` docs(context): Fase 3 en producción y coherencia de la documentación | 2026-10-18 | docs | [Fase 3 § Release a producción](Fases/fase-3-us04-respuesta-paciente.md#release-a-producción-2026-10-17) (cómo salió, el corte de ~9 minutos y sus lecciones); filas 84–95 de este archivo; estado en ADR-10, [US-04](US/04-respuesta-paciente.md) y [us04](Features/us04-respuesta-paciente.md); [DT-11](Deudas/DT-11.md) (fecha de corte), [DT-12](Deudas/DT-12.md) cerrada, [DT-42](Deudas/DT-42.md)…[DT-45](Deudas/DT-45.md) abiertas, [DT-18](Deudas/DT-18.md) en producción; cabeceras de ADR-08, ADR-09 y ADR-11, nota en ADR-02 §2; PREGUNTAS (Q5, Q6, Q8, Q11); guías de las demás fases; README y [stack](stack-tecnologico.md) (ver nota) | F3 · — |
| 102 | `555b060` docs(claude): CLAUDE.md, módulo usuario y agentes al día con el código | 2026-10-18 | docs | `CLAUDE.md` raíz (TypeScript 5.9, TypeORM, estructura hexagonal real, Git Flow, estado actual); `src/modules/usuario/CLAUDE.md`; `.claude/agents/` (`api-agent`, `architecture-agent`, `database-agent`) | — |
| 103 | `d496a86` merge PR #10 `docs/coherencia-contexto` → `develop` | 2026-10-18 | merge | — (integra 100–102) | F3 · — |
| 104 | `ce7105e` merge PR #11 `develop` → `main` | 2026-10-18 | release | — (lleva 100–103 a `main`: solo documentación; ver nota) | F3 · — |
| 105 | `3e64472` docs(context): ADR-14 y plan de US-07.01, la Fase 5 en construcción | 2026-10-19 | docs/decisión | **[ADR-14](Decisions/ADR-14.md)** (aceptado en lo que toca a US-07.01) y **[US-07.01](US/07.01-registro-hechos.md)** (nuevos); nota en [ADR-04](Decisions/ADR-04.md) (dos transiciones desde `pendiente`); [DT-11](Deudas/DT-11.md) (el job G1 entra en US-07.01); [rf.md](rf.md) (RF-08); [Fase 5](Fases/fase-5-us07-scoring.md), ROADMAP y README | F5 |
| 106 | `1545ad7` feat(cita): esquema de US-07.01 para registrar hechos de asistencia | 2026-10-19 | feature/BD | [US-07.01 § Modelo de datos](US/07.01-registro-hechos.md#modelo-de-datos) (migraciones `1750000015000` a `1750000018000`); [ADR-14 §10](Decisions/ADR-14.md#10-us-0701-los-datos-que-hoy-se-pierden-va-primero); `CLAUDE.md` de `cita`, `recordatorio` y `solicitud` | F5 |
| 107 | `f123617` feat(cita): asistencia sobre citas pendientes, quién pidió el cambio y job G1 | 2026-10-19 | feature | [ADR-14 §9](Decisions/ADR-14.md#9-cambio-en-la-máquina-de-estados-extiende-adr-04) y §10; [US-07.01 § Aplicación y API](US/07.01-registro-hechos.md#aplicación-y-api), [§ Primera apertura](US/07.01-registro-hechos.md#primera-apertura-del-portal) y [§ Job G1](US/07.01-registro-hechos.md#job-g1); [DT-11](Deudas/DT-11.md) (job detrás de `CIERRE_GHOSTING_ACTIVO`, apagado); `CLAUDE.md` de `cita`, `portal-paciente`, `recordatorio` y `solicitud` | F5 · F3 |
| 108 | `8a7953b` test(cita): Definición de Terminado de US-07.01 | 2026-10-19 | test | [US-07.01 § Definición de Terminado](US/07.01-registro-hechos.md#definición-de-terminado) (ver nota) | F5 |
| 109 | `d4aa920` test(cita): la segunda réplica del job G1 usa su propio DataSource | 2026-10-20 | test | [US-07.01 § Definición de Terminado](US/07.01-registro-hechos.md#definición-de-terminado) (corrige la integración de varias réplicas de la fila 108) | F5 |
| 110 | `bb90815` docs(context): DT-47, la bitácora puede quedar en orden invertido | 2026-10-20 | docs | **[DT-47](Deudas/DT-47.md)** (nueva); nota en [DT-46](Deudas/DT-46.md); [Deudas/README](Deudas/README.md) | F5 |
| 111 | `715c3f3` merge PR #12 `feature/fase5-registro-hechos` → `develop` | 2026-10-20 | merge | — (lleva 105–110 a `develop`: **US-07.01**, se despliega en staging; el frontend, con citia-frontend#13) | F5 |
| 112 | `313a506` merge PR #13 `develop` → `main` | 2026-10-20 | release | — (**release de US-07.01 a producción**, con el job G1 apagado: lleva 105–111 a `main`; el frontend sale con citia-frontend#14) · [Fase 5 § Release a producción](Fases/fase-5-us07-scoring.md#release-a-producción-2026-10-20) (ver nota) | F5 |
| 113 | `c3e7b42` docs(context): decisiones de US-07.02, US-07.01 con G1 prendido y DT-48 a DT-50 | 2026-10-30 | docs/decisión | [ADR-14](Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar) (decisiones de producto de US-07.02 aprobadas por el usuario); nota en [ADR-04](Decisions/ADR-04.md) (excepción a "de un terminal no se sale"); [DT-11](Deudas/DT-11.md) cerrada (G1 prendido el 2026-10-27); **[DT-48](Deudas/DT-48.md)…[DT-50](Deudas/DT-50.md)** (nuevas); DT-30, DT-44 y DT-47; Q6 respondida; [Fase 5 § Decisiones de producto](Fases/fase-5-us07-scoring.md#decisiones-de-producto-de-us-0702-2026-10-30); [US-07.01](US/07.01-registro-hechos.md) | F5 |
| 114 | `8c74f70` docs(context): ajustes de revisión a las decisiones de US-07.02 | 2026-10-30 | docs | [US-07.01](US/07.01-registro-hechos.md) (estado al 2026-10-30); [ADR-12](Decisions/ADR-12.md) §8 (el cierre ya no está aplazado); [DT-11](Deudas/DT-11.md); [ADR-14](Decisions/ADR-14.md) | F5 |
| 115 | `f6d0aa4` docs(context): US-07.02 y US-07.03 bloqueadas hasta la revisión legal | 2026-10-30 | docs/decisión | [Fase 5 § Bloqueo](Fases/fase-5-us07-scoring.md#bloqueo-de-us-0702-y-us-0703-2026-10-30); [ADR-14 § Contexto legal](Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado); DT-47 y DT-48; ROADMAP y README | F5 |
| 116 | `8304107` docs(context): cumplimiento de protección de datos y DT-51 a DT-56 | 2026-10-31 | docs | **[`Cumplimiento/`](Cumplimiento/README.md)** (nueva, con el [pre-análisis con IA](Cumplimiento/pre-analisis-ia-2026-10-30.md), que no es una opinión legal) y **[DT-51](Deudas/DT-51.md)…[DT-56](Deudas/DT-56.md)** (nuevas); [DT-26](Deudas/DT-26.md) ampliada; notas en DT-16, Q17, ADR-13 y ADR-14; [ROADMAP § Cumplimiento](ROADMAP.md#cumplimiento-ley-21719--transversal) | — |
| 117 | `33fc74c` merge PR #14 `docs/fase5-decisiones-us0702` → `main` | 2026-10-31 | merge | — (lleva 113–116 **directo a `main`**, sin pasar por `develop`; ver nota) | F5 · — |
| 118 | `6e597be` docs(context): ADR-15, plan y estado de la Fase 7 (US-10) | 2026-11-01 | docs/decisión | **[ADR-15](Decisions/ADR-15.md)** (aceptado, con sus notas de implementación), **[US-10](US/10-perfil-cuenta.md)**, **[Fase 7](Fases/fase-7-us10-perfil.md)** y **[DT-57](Deudas/DT-57.md)…[DT-61](Deudas/DT-61.md)** (nuevos); Q18 y Q19; notas en DT-01, DT-02, DT-03, DT-26, DT-36, DT-46, DT-52, DT-53, DT-56 y [Cumplimiento](Cumplimiento/README.md); la guía de la Fase 6 pasa a [`fases-6-us09-sin-diseno.md`](Fases/fases-6-us09-sin-diseno.md); `CLAUDE.md` raíz (módulo `soporte`) (ver nota) | F7 |
| 119 | `a2058aa` feat(usuario): perfil editable y cambio de contraseña con corte de sesiones | 2026-11-01 | feature | [us10 § Perfil](Features/us10-perfil-cuenta.md#perfil), [§ Cambio de contraseña](Features/us10-perfil-cuenta.md#cambio-de-contraseña) y [§ Corte de sesiones](Features/us10-perfil-cuenta.md#corte-de-sesiones) (migración `1750000019000`); [ADR-15](Decisions/ADR-15.md) §1, §4–§6 y §8; [DT-01](Deudas/DT-01.md) (revocación al cambiar la contraseña); `src/modules/usuario/CLAUDE.md` | F7 · Base |
| 120 | `35aec28` feat(tenant): suscripción en lectura solo para el administrador | 2026-11-01 | feature | [us10 § Suscripción](Features/us10-perfil-cuenta.md#suscripción); [ADR-15](Decisions/ADR-15.md) §3; [DT-02](Deudas/DT-02.md) (primera comprobación de rol) | F7 |
| 121 | `fcfeac3` feat(soporte): mensajes a soporte con su propio envío | 2026-11-01 | feature | [us10 § Soporte](Features/us10-perfil-cuenta.md#soporte) y [§ Envío a soporte](Features/us10-perfil-cuenta.md#envío-a-soporte) (migración `1750000020000`); [ADR-15](Decisions/ADR-15.md) §7 y §9; [DT-59](Deudas/DT-59.md); `src/modules/soporte/CLAUDE.md` (nuevo) y `src/modules/recordatorio/CLAUDE.md` | F7 |
| 122 | `c090105` test: Definición de Terminado de US-10 | 2026-11-01 | test | [US-10 § Definición de Terminado](US/10-perfil-cuenta.md#definición-de-terminado); [us10 § Tests](Features/us10-perfil-cuenta.md#tests-y-verificación) | F7 |
| 123 | `aeab86d` docs(context): resultados de integración y e2e de US-10 | 2026-11-01 | docs | [US-10 § Definición de Terminado](US/10-perfil-cuenta.md#definición-de-terminado) (13 / 253 de integración y 18 / 379 e2e); [ADR-15 § Verificación](Decisions/ADR-15.md#verificación-2026-11-01); ROADMAP y [Fases](Fases/README.md) | F7 |
| 124 | `cd659c1` merge PR #15 `develop` → `main` | 2026-11-01 | release | — (**release de la Fase 7 a producción**: lleva 118–123 a `main`) · [Fase 7 § Release a producción](Fases/fase-7-us10-perfil.md#release-a-producción-2026-11-01) (ver nota) | F7 |

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

> **Nota fila 60.** Es el commit que la convención de abajo dejó "sin fila" el 2026-09-30. Su columna
> Fase es `—`: la navegación por fases es transversal, aunque entró en la rama del diseño de la Fase 2.

> **Nota fila 69.** El cuerpo del commit avisa que se verificaron build, lint y 1022 unitarios, y que
> los e2e y la integración contra Postgres quedaron pendientes (Docker caído). Corrieron después, en
> verde, con las filas 70 y 71.

> **Nota filas 62–73.** Al 2026-10-04 viven **solo en la rama `feature/fase2-recordatorios`**
> ([PR #1](https://github.com/Citia-solutions/citia-backend/pull/1) a `develop`, pendiente de merge). El
> plan de [US-03](US/03-recordatorios.md) proponía dos PR (outbox y recordatorios); se hizo en uno.
> *(2026-10-07: en `develop` desde `060303c` —fila 76— y en `main` desde `c057ade` —fila 83—.)*

> **Nota fila 74.** Es el commit que cerró la pasada del 2026-10-04 (registró las filas 60–73): por la
> convención de abajo, se registra en esta.

> **Nota fila 75.** `main` solo tenía el commit inicial que crea GitHub (`16f0680`, un README), **sin
> historia común** con `develop`. Se unió con `--allow-unrelated-histories` conservando el README de
> `develop`. Este merge vive **solo en `main`**: `develop` no lo contiene, y desde aquí los releases
> (`develop` → `main`) ya tienen historia común. No incluye la implementación de la Fase 2 (PR #1 seguía
> en revisión); esa llegó a producción con la fila 83.

> **Nota fila 83.** No trae cambios propios (el árbol es idéntico al de `4fc9a86`). La Fase 2 se dio por
> **cerrada** el 2026-10-07, tras la prueba de punta a punta en producción.

> **Nota fila 84.** Es el commit que cerró la pasada del 2026-10-07 (registró las filas 74–83): por la
> convención de abajo, se registra en esta. Vivió en la rama `docs/cierre-fase2` hasta el merge `72d117f`
> (fila 93), y la rama de la Fase 3 partió de él: `c757e0e` es su hijo.

> **Nota filas 85–92.** Se commitearon el 2026-10-15 en cuatro segundos (10:41:58 → 10:42:02), con la
> implementación ya terminada y verificada en local: un commit por paso del
> [orden de construcción de US-04](US/04-respuesta-paciente.md#orden-de-construcción) (85 = paso 1, …, 91 =
> paso 7) más el de documentación. No hay commits intermedios de trabajo.

> **Nota fila 92.** Además de documentar la Fase 3, deja al equipo sin roles de hacker ético ni QA: las
> preguntas de seguridad pasan al arquitecto (Q5, Q7, Q8, Q11, Q16 y Q17) y la fila 41 de este archivo deja
> de mencionar la pregunta H7.

> **Nota fila 95.** Como la 83, vive **solo en `main`**: `develop` no la contiene. El backend de production
> no arrancó durante unos 9 minutos (00:13 a 00:22, hora de Chile): `ENLACE_CITA_CLAVE` no le llegaba al
> contenedor y la validación del entorno detuvo la app; las migraciones ya habían corrido. El frontend
> (citia-frontend#8, `1a7f324`) se mergeó después, con el backend ya verificado. Detalle en el
> [incidente](Fases/fase-3-us04-respuesta-paciente.md#incidente-production-caído-9-minutos).

> **Nota filas 99, 104, 112, 117 y 124.** Como la 83 y la 95, son merges que viven **solo en `main`**: `develop` no
> los contiene. Los de tipo `release` (99, 104, 112 y 124) no traen cambios propios: el árbol de cada uno es idéntico
> al de la punta de `develop` que llevan (`01619ba`, `d496a86`, `715c3f3` y `aeab86d`). La 117 es distinta: ver su
> nota.

> **Nota fila 101.** Es el commit que cerró la pasada del 2026-10-18 (registró las filas 84–95): por la convención
> de abajo, se registra en esta. Vivió en la rama `docs/coherencia-contexto` con las filas 100 y 102 hasta el merge
> `d496a86` (fila 103); esa rama partió de `ce0c533` (fila 94), no de la 98.

> **Nota fila 104.** El release a `main` lleva solo documentación (`context/`, `CLAUDE.md` y `.claude/agents/`): no
> cambia el código de production.

> **Nota fila 108.** El cuerpo del commit avisa que la integración y los e2e quedaron escritos y verificados con
> `tsc`, **sin ejecutar**. La fila 109 corrigió la integración de varias réplicas, y antes del release (fila 112)
> corrieron en verde: 1987 unitarios, 212 de integración y 326 e2e
> ([Fase 5 § Release](Fases/fase-5-us07-scoring.md#release-a-producción-2026-10-20)).

> **Nota fila 112.** US-07.01 salió con el job G1 **apagado** (`CIERRE_GHOSTING_ACTIVO=false`). Se prendió el
> 2026-10-27 con la variable en Railway, **sin commit**: no tiene fila; lo registra la 113. US-07.01 todavía no tiene
> feature (se crea al cerrarla): su documentación es [ADR-14](Decisions/ADR-14.md) y el plan
> [US-07.01](US/07.01-registro-hechos.md).

> **Nota fila 117.** El PR #14 (`docs/fase5-decisiones-us0702`) se mergeó **directo a `main`**, en vez de a
> `develop` como pide Git Flow. Es de tipo `merge` y no `release` porque es un PR de docs, no un `develop` → `main`.
> Sus cuatro commits (filas 113–116) llegaron a `develop` recién el 2026-11-01, con el fast-forward de la Fase 7 (ver
> la nota de las filas 118–123); el merge `33fc74c` sigue solo en `main`.

> **Nota filas 118–123.** Las filas 118–122 se commitearon el 2026-11-01 en dos segundos (00:43:47 → 00:43:48), con la
> implementación ya terminada, en la rama `feature/fase7-perfil-cuenta`, que sale de `8304107` (fila 116): por eso la
> 118 ya trae las notas de implementación de ADR-15 y las DT-60 y DT-61, detectadas al implementar. La 123 es de las
> 12:35, con los resultados de integración y e2e. **Llegaron a `develop` sin PR ni commit de merge**: un push por fast-forward
> (`715c3f3..aeab86d`, 2026-11-01 12:36 -0300), que se desvía de Git Flow (pide PR) y llevó a `develop` también las
> filas 113–116. La rama `feature/fase7-perfil-cuenta` quedó en origin. Por eso no hay fila de merge a `develop` para
> la Fase 7.

> **Nota fila 124.** El PR #15 lo creó y lo mergeó el usuario desde GitHub, porque el token de `gh` estaba vencido y
> no se pudo hacer desde la terminal (merge `cd659c1`, 2026-11-01 14:09 -0300). Production (Railway, desde `main`)
> corre al arrancar las migraciones `1750000019000-AddPerfilYSesionesAUsuarios` y `1750000020000-CreateMensajesSoporte`.
> **Nadie revisó todavía los Deploy Logs** de staging ni de production. En production no hay
> `SOPORTE_CORREO_DESTINO` ([Q19](PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) sin respuesta): el job `soporte.envio`
> no se registra y los mensajes esperan en `pendiente`. El frontend no está registrado en este repo. Detalle en la
> [Fase 7 § Release a producción](Fases/fase-7-us10-perfil.md#release-a-producción-2026-11-01).

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
> `docs/fase2-recordatorios`; al 2026-09-30 no están en `develop`. *(Ya lo están: merge `510015a`,
> 2026-10-01, fila 61. El de la navegación es `2f33394`, fila 60.)*
>
> *Pasada del 2026-10-04:* registra hasta `f2ccb01` inclusive (filas 60–73). El commit de documentación
> que cierre esta pasada (implementación de la Fase 2 en `context/`) **no tiene fila**: se registra en la
> siguiente. *(Es `4967ab5`, fila 74.)*
>
> *Pasada del 2026-10-07:* registra hasta `c057ade` inclusive (filas 74–83), tomadas de
> `git log --date=short` sobre `origin/main` y `origin/develop`. El commit de documentación que cierre
> esta pasada (cierre de la Fase 2 en `context/`, rama `docs/cierre-fase2`) **no tiene fila**: se registra
> en la siguiente. *(Es `9fc1ddd`, fila 84.)*
>
> *Pasada del 2026-10-18:* registra hasta `05bae58` inclusive (filas 84–95), tomadas de
> `git log --date=short` sobre `origin/main` y `origin/develop`. El commit de documentación que cierre esta
> pasada (coherencia de `context/` tras la Fase 3, rama `docs/coherencia-contexto`) **no tiene fila**: se
> registra en la siguiente. *(Es `be69c27`, fila 101.)*
>
> *Pasada del 2026-11-01:* registra hasta `cd659c1` inclusive (filas 96–124), tomadas de
> `git log --reverse 05bae58..origin/main`. Las filas de US-07.01 (105–115) estaban atrasadas desde el 2026-10-19. El
> commit de documentación que cierre esta pasada (Fase 7 en producción y la feature de US-10, rama
> `docs/fase7-post-release`) **no tiene fila**: se registra en la siguiente.

## Cobertura por decisión (ADR ↔ commits)

| ADR | Tema | Commits |
|-----|------|---------|
| ADR-00 | TypeORM definitivo, migraciones versionadas | `389eb81`, `b8cac2a` |
| ADR-01 | Auth Passport + JWT | `45198c3`, `346a034` · `a2058aa` (ADR-15 lo extiende: la estrategia consulta el corte de sesiones) |
| ADR-02 | Español + hexagonal | `718fe1f`, `ce7d99e` (regla transversal), `a938f9d` (el check del §4 pasa a ser `src/arquitectura.spec.ts`) |
| ADR-03 | Login multi-tenant por `tenantSlug` | `195431b`, `cfa35f3`, `45198c3` |
| ADR-04 | Máquina de estados de Cita + ghosting | `e592d74`, `77523c9`, `ab30bb7` (nota: BullMQ → ADR-12), `b93f2c0` (regla G1) · `3e64472` (nota: ADR-14 extiende el §2), `f123617` (las dos transiciones desde `pendiente`), `c3e7b42` (nota: excepción a "de un terminal no se sale") |
| **ADR-05** | Contenedorización Docker + migraciones en arranque | `b8cac2a`, `df53128`, `0e54f0b`, `77a97c9`, `b623b6a` |
| **ADR-06** | Atomicidad transaccional (TransactionRunner opaco) | `d4fa476`, `f573485`, `a6c237f` (el `tx` llega a `publicar`) |
| **ADR-07** | Día/hora en zona de la clínica (DST-safe) | `08dad63`, `717800e` (rangos y corrección del inicio del día en DST) |
| ADR-08 | Tenant en la URL | `bfeada0` (propuesto) · fase 1 adoptada en la ruta pública por `e1253c3` |
| **ADR-09** | Gestión de citas: solicitud aparte, RUT como identidad, reagendar con bitácora | `f2a7dff` (§3–§7), `e1253c3` (§1,§2,§8–§11), `439a5fe` (docs), `e06862a` (bandeja), `4c543a5`, `31ea490` (decisión 2 reafirmada, límite de tasa), `ab30bb7` (matiz §3) |
| ADR-10 | Enlace por cita del paciente (US-04 + US-02.07) | `2877b13` (propuesto), `4c543a5` (aplazado), `b93f2c0` (aceptado y notas de implementación), `c757e0e`, `6fbf4e3`, `4d3d88f`, `5f8ac6d`, `92b8020`, `143c8fb`, `3b312f9` (implementación) · `ce0c533` (a `develop`), `05bae58` (a producción) |
| ADR-11 | Solapamiento: avisar y permitir | `4c543a5` (doc), `538657e`, `9140bc3` (implementación), `06858f2` (tests) |
| ADR-12 | Outbox transaccional + planificador en Postgres | `ab30bb7` (diseño), `daf0617`, `a6c237f`, `d45de20` (latidos, entorno), `f95b637`, `db46e37` (implementación) · `060303c` (a `develop`), `c057ade` (a producción) · `9fc1ddd` (estado) · `92b8020` (suscriptor de solicitudes, Fase 3), `b93f2c0` (nota) · `f123617` (job G1 en el planificador, Fase 5), `8c74f70` (nota §8: el cierre ya no está aplazado) · `fcfeac3` (job `soporte.envio`, Fase 7) |
| ADR-13 | Recordatorios por correo (Resend) | `ab30bb7` (diseño), `d45de20`, `a37f175`, `f2d80aa`, `a13d80a`, `f719c66`, `a938f9d` (implementación) · `060303c` (a `develop`), `c057ade` (a producción) · `9fc1ddd` (estado) · `5f8ac6d` (bloque `accion`, Fase 3), `b93f2c0` (nota) · `5042888`, `865354f` (remitente *citiahealth*, nota), `932d416` (a producción) · `8304107` (nota de cumplimiento) · `fcfeac3` (soporte reutiliza `CanalMensajeria`, Fase 7) |
| ADR-14 | Calificación de asistencia y riesgo de la cita (Fase 5) | `3e64472` (diseño; aceptado en lo que toca a US-07.01), `1545ad7`, `f123617`, `8a7953b`, `d4aa920` (implementación de US-07.01) · `715c3f3` (a `develop`), `313a506` (a producción) · `c3e7b42`, `8c74f70` (decisiones de producto de US-07.02), `f6d0aa4` (US-07.02 y US-07.03 bloqueadas), `8304107` (nota de cumplimiento) · `33fc74c` (docs directo a `main`) |
| ADR-15 | Cuenta del profesional: perfil, corte de sesiones, suscripción y soporte (Fase 7) | `6e597be` (diseño, aceptado, con notas de implementación), `a2058aa`, `35aec28`, `fcfeac3`, `c090105` (implementación) · `aeab86d` (verificación) · a `develop` por fast-forward, sin merge · `cd659c1` (a producción) |

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
| [Fase 2 — US-03](Fases/fase-2-us03-recordatorios.md) | 59, 61–74, 76–84, 93, 96–99 | `ab30bb7` (diseño) · `daf0617` → `f2ccb01` (implementación) · `060303c` (a `develop`) · `893c112` → `4fc9a86` (Netlify, `tenantNombre`, DT-30) · `c057ade` (release a producción, 2026-10-06) · `9fc1ddd` (cierre, 2026-10-07) y su merge `72d117f` · `5042888` → `932d416` (remitente *citiahealth*, a producción el 2026-10-18) |
| [Fase 3 — US-04](Fases/fase-3-us04-respuesta-paciente.md) | 85–92, 94, 95 (antes, ADR-10 y FD-06 entraron en 38, 41 y 54) · 101, 103, 104 (docs tras el release) | `c757e0e` → `b93f2c0` (implementación y docs, 2026-10-15) · `ce0c533` (a `develop`) · `05bae58` (release a producción, 2026-10-17) · `be69c27` (en producción y coherencia, 2026-10-18), su merge `d496a86` y su release `ce7105e` |
| [Fase 5 — US-07](Fases/fase-5-us07-scoring.md) | 105–115, 117 | `3e64472` (ADR-14 y plan de US-07.01, 2026-10-19) · `1545ad7` → `bb90815` (implementación de US-07.01) · `715c3f3` (a `develop`) · `313a506` (release a producción, 2026-10-20) · `c3e7b42` → `f6d0aa4` (decisiones de US-07.02 y bloqueo, 2026-10-30) · `33fc74c` (PR de docs directo a `main`) |
| [Fase 7 — US-10](Fases/fase-7-us10-perfil.md) | 118–124 | `6e597be` (ADR-15 y plan) · `a2058aa` → `c090105` (implementación, 2026-11-01) · `aeab86d` (verificación) · a `develop` por fast-forward, sin fila · `cd659c1` (release a producción, 2026-11-01) |
| transversal | 40 (ROADMAP), 60 (navegación por fases), 75 (primer release a `main`), 100 (`Explicado/`), 102 (`CLAUDE.md` y agentes), 116 (`Cumplimiento/`) | `cea0bd1`, `2f33394`, `f1f711f`, `8208a56`, `555b060`, `8304107` |
