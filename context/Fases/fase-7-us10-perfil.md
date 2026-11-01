# Fase 7 — US-10: Perfil, suscripción y soporte (RF-04)

> **Fase del roadmap** (construcción). Índice: [Fases](README.md) · Estado y desglose de tareas en el
> [ROADMAP § Fase 7](../ROADMAP.md#fase-7--us-10-perfil-suscripción-y-soporte).
>
> *Antes (hasta el 2026-10-31):* compartía guía con la Fase 6 y US-09 en `fases-6-7-us09-sin-diseno.md` (hoy
> [`fases-6-us09-sin-diseno.md`](fases-6-us09-sin-diseno.md)), porque no tenía diseño.

| | |
|---|---|
| **Objetivo** | Que el profesional gestione su cuenta —ver y corregir su perfil, ver su suscripción, cambiar su contraseña— y contacte a soporte desde la aplicación (RF-04). |
| **Entregable** | El profesional gestiona su cuenta y contacta soporte (ROADMAP). |
| **Estado** | ✅ **en producción desde el 2026-11-01** ([PR #15](https://github.com/Citia-solutions/citia-backend/pull/15), `cd659c1`) · **cierre pendiente** de las pruebas manuales y de [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) y [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) ([abajo](#release-a-producción-2026-11-01)). Diseño en [ADR-15](../Decisions/ADR-15.md), **aceptado** (2026-10-31), con sus [notas de implementación](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01); contrato en el plan [US-10](../US/10-perfil-cuenta.md); lo construido, en la feature [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md). No depende de ninguna otra fase. *Antes:* 🔶 implementada (2026-11-01), en `develop` (staging) con el release a `main` abierto · *antes:* 🔶 en diseño (2026-10-31), ADR-15 propuesto, sin implementar. |
| **Fechas** | decisiones del usuario, diseño y aceptación de ADR-15 2026-10-31 · implementación (backend) 2026-11-01 · a `develop` por fast-forward 2026-11-01 (12:36, hora de Chile) · **release a producción 2026-11-01** (14:09, hora de Chile). |
| **Historia** | US-10, con plan propio en [US/10-perfil-cuenta.md](../US/10-perfil-cuenta.md). |
| **Rama** | `feature/fase7-perfil-cuenta` (backend), que sale de `docs/fase5-decisiones-us0702`. Ese PR (#14) se mergeó directo a `main`, no a `develop`: esta rama trajo también sus commits de docs y llegó a `develop` por **fast-forward**, sin PR ni commit de merge (Git Flow pide PR). Quedó en origin. El release fue el PR #15, `develop` → `main`. |
| **Commits** | filas 118–124 de la [TRAZABILIDAD](../TRAZABILIDAD.md): seis commits, `6e597be` → `aeab86d`, sin merge a `develop` (fast-forward), y el release `cd659c1` (PR #15) a `main`. El mismo fast-forward llevó a `develop` las filas 113–116 (Fase 5 y Cumplimiento), del PR #14. [Cronología](#features-planes-y-commits). |
| **Feature** | [Features/us10-perfil-cuenta.md](../Features/us10-perfil-cuenta.md) (nueva, 2026-11-01, después del release) |

---

## Release a producción (2026-11-01)

La Fase 7 está **en producción** desde la tarde del 2026-11-01. Queda abierta hasta las pruebas manuales de la
[verificación manual mínima](../US/10-perfil-cuenta.md#verificación-manual-mínima) y las respuestas a Q18 y Q19, como la
[Fase 3](fase-3-us04-respuesta-paciente.md#release-a-producción-2026-10-17) queda abierta hasta las suyas. **Sin
verificar en los entornos:** nadie revisó todavía los Deploy Logs de staging ni de production.

### Cómo salió

| Hora (UTC) | Hora (Chile) | Qué |
|---|---|---|
| 03:43 | 00:43 | los commits `6e597be` → `c090105` en `feature/fase7-perfil-cuenta` (implementación ya terminada) |
| 15:35 | 12:35 | `aeab86d`: los resultados de integración y e2e |
| 15:36 | 12:36 | push por **fast-forward** de `develop` (`715c3f3..aeab86d`), **sin PR ni commit de merge**; trae también los cuatro commits de docs del PR #14. Staging (Railway) se despliega desde `develop`: sus Deploy Logs, **sin revisar** |
| 17:09 | 14:09 | el usuario crea y mergea desde GitHub el [PR #15](https://github.com/Citia-solutions/citia-backend/pull/15) `develop` → `main` (`cd659c1`): el token de `gh` estaba vencido y no se pudo desde la terminal. Production (Railway, desde `main`) corre al arrancar las migraciones `1750000019000-AddPerfilYSesionesAUsuarios` y `1750000020000-CreateMensajesSoporte`: sus Deploy Logs, **sin revisar** |

El frontend (`citia-frontend`) no está registrado en este repo: si salió, cuándo y en qué orden, sin registrar. El plan
pide desplegarlo **después** del backend.

### Cómo se verificó

| Nivel | Qué | Resultado |
|---|---|---|
| Código (2026-11-01, antes del release) | `tsc`, ESLint, Prettier y `npm test`; integración y e2e contra Postgres 16 local, con la autorización del usuario | ✅ 131 suites / 2385 unitarios · 13 / 253 de integración · 18 / 379 e2e |
| Staging (desde `develop`) | arranque, `soporte.sin_destino` en los Deploy Logs, pasos 1 a 6 de la verificación manual | ⬜ sin verificar |
| Production, backend | arranque, migraciones `1750000019000` y `1750000020000` aplicadas, `soporte.sin_destino`, `/api/health` | ⬜ sin verificar (nadie revisó los Deploy Logs) |
| Production, pasos 7 a 9 | un mensaje que llegue a la casilla y la consulta de solo lectura | ⬜ esperan a [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) (el 9 se puede hacer ya) |
| Frontend | build y despliegue | sin registrar en este repo |

### En production, sin `SOPORTE_CORREO_DESTINO`

[Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) sigue sin respuesta, así que la variable **no está cargada en
production**: el job `soporte.envio` no se registra, el arranque avisa `soporte.sin_destino` (`warn`) y los mensajes a
soporte se guardan y **esperan en `pendiente`** (es lo que hace el código sin la variable; el `warn`, todavía sin verlo
en los Deploy Logs). No se pierden: salen con el primer tick después de cargar la variable
(20 por minuto). [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) también sigue abierta: la suscripción
muestra el provisional *Plan piloto*.

### Desvíos del proceso

1. **A `develop` sin PR.** La rama llegó por fast-forward (`715c3f3..aeab86d`), sin PR ni commit de merge: Git Flow pide
   un PR hacia `develop`. Por eso la Fase 7 no tiene fila de merge a `develop` en la TRAZABILIDAD.
2. **El PR #14 de docs entró directo a `main`** (`33fc74c`, 2026-10-31) y sus cuatro commits llegaron a `develop` recién
   con ese fast-forward (filas 113–116; el merge `33fc74c`, fila 117, sigue solo en `main`).
3. **El PR #15 se creó y se mergeó desde GitHub**, no desde la terminal, porque el token de `gh` estaba vencido.

### Para cerrar la fase

1. Revisar los **Deploy Logs** de staging y production: arranque sin error, las dos migraciones aplicadas y
   `soporte.sin_destino` (la [lección de la Fase 3](fase-3-us04-respuesta-paciente.md#lecciones-aprendidas): un
   arranque se confirma en los Deploy Logs, no en el estado del despliegue).
2. La [verificación manual mínima](../US/10-perfil-cuenta.md#verificación-manual-mínima) en staging y production.
3. Responder Q19 y cargar `SOPORTE_CORREO_DESTINO` (la casilla entra antes a [DT-52](../Deudas/DT-52.md)); responder
   Q18.
4. El frontend, desplegado después del backend (sin registrar en este repo).
5. Revisar la severidad de [DT-01](../Deudas/DT-01.md), que se revisa al cerrar la fase.

---

## Orden de lectura del diseño (2026-10-31; implementación, 2026-11-01)

Para saber **qué existe en el código**, empieza por la feature [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md)
(2026-11-01). Para el porqué y el contrato:

1. **[US-10](../US/10-perfil-cuenta.md)** — el plan y el **contrato**: decisiones (P1 a P8 del usuario, T1 a T14 del
   `architecture-agent`), las dos migraciones, el dominio, las cinco rutas con sus DTO, el orden por agente (con su
   estado), los [desvíos de la implementación](../US/10-perfil-cuenta.md#desvíos-de-la-implementación-2026-11-01), la
   Definición de Terminado, los riesgos y las preguntas abiertas.
2. **[ADR-15](../Decisions/ADR-15.md)** — el porqué. Mira las opciones A a C (dónde y cómo se corta una sesión, el borde
   del mismo segundo, sin caché), D (cómo emite `usuario` un token sin depender de `auth`), E y F (por qué el correo a
   soporte sale por un job y no por un suscriptor del outbox, y con qué canal), la decisión 5 (la regla del corte) y
   las [notas de implementación](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01) (cómo quedó y dos puntos
   para el usuario).
3. **[DT-01](../Deudas/DT-01.md)** — la deuda de sesión que esta fase ataca en parte, con su nota del 2026-10-31.
4. **[ADR-12 §4](../Decisions/ADR-12.md)** — la regla 4 de los suscriptores, que explica la forma del envío a soporte.
5. **[ADR-13 §8, §11 y §12](../Decisions/ADR-13.md)** — el puerto de correo que se reutiliza, la cuota compartida y
   la privacidad del correo.
6. **Deudas nuevas:** [DT-57](../Deudas/DT-57.md), [DT-58](../Deudas/DT-58.md) y [DT-59](../Deudas/DT-59.md) (del
   diseño) · [DT-60](../Deudas/DT-60.md) y [DT-61](../Deudas/DT-61.md) (detectadas al implementar).
7. **[Cumplimiento](../Cumplimiento/README.md)** — el flujo nuevo de los mensajes a soporte.
8. **Código:** `src/modules/soporte/CLAUDE.md` (nuevo) y `src/modules/usuario/CLAUDE.md` (perfil, contraseña y corte).

---

## Implementación (2026-11-01)

**El backend está implementado** tal como se diseñó (pasos 1 a 4 del [plan](../US/10-perfil-cuenta.md#orden-de-construcción)):
`tsc`, ESLint, Prettier y `npm test` en verde (131 suites, 2385 tests); integración (13 suites, 253 tests) y
e2e (18 suites, 379 tests), autorizadas por el usuario, en verde contra Postgres 16 local. Llegó a `develop` (staging)
por fast-forward y a producción el mismo 2026-11-01 ([arriba](#release-a-producción-2026-11-01)). Ningún desvío
rediseña; los que tocan una decisión están en las
[notas de ADR-15](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01) y el resto, en los
[desvíos del plan](../US/10-perfil-cuenta.md#desvíos-de-la-implementación-2026-11-01). Lo que más conviene saber:

- **El corte de sesiones funciona como se diseñó:** la estrategia JWT consulta la base en cada petición autenticada; un
  token anterior al corte o de un usuario que ya no existe recibe 401 (con el log `auth.sesion_cortada` y su motivo);
  si la base falla, 500 y no 401.
- **Sin `SOPORTE_CORREO_DESTINO`** ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) sin respuesta), en staging y
  en production los mensajes se guardan y quedan `pendiente`; el arranque deja el `warn` `soporte.sin_destino`. Salen
  con el primer tick después de cargar la variable (20 por minuto).
- **Las preguntas del plan siguen sin respuesta:** el código usa los provisionales (*Plan piloto*, categoría cerrada,
  tope de 5 en 24 h, especialidad solo en el perfil, sin "cerrar todas mis sesiones").
- **Dos puntos para el usuario** ([detalle](../Decisions/ADR-15.md#lo-que-conviene-que-el-usuario-mire)): los 400 de
  validación salen en inglés (el frontend debe aceptar `message` como texto o como lista) y el registro no aplica la
  política de contraseña del cambio ([DT-61](../Deudas/DT-61.md)).

**Para cerrar la fase:** la lista está en [Release a producción § Para cerrar la fase](#para-cerrar-la-fase). Ya
hechos: los conteos de integración y e2e, el release, la feature y las filas de la TRAZABILIDAD con los hashes.
*Antes (2026-11-01, antes del release):* "los conteos de integración y e2e; las pruebas manuales en staging y
production; Q18 y Q19 (y, con Q19, cargar `SOPORTE_CORREO_DESTINO`); el frontend desplegado **después** del backend; la
feature y las filas de TRAZABILIDAD con los hashes".

---

## Qué hay diseñado (y qué no)

**Propuesto el 2026-10-31** ([ADR-15](../Decisions/ADR-15.md), contrato en [US-10](../US/10-perfil-cuenta.md)) y
**aceptado ese mismo día**; **implementado el 2026-11-01** (arriba) y **en producción desde ese día**:

- **Perfil** (`GET` y `PATCH /api/usuarios/me`): devuelve lo mismo que el login más la especialidad; se editan el
  nombre y la especialidad (texto libre, ≤ 100). El correo, la organización y su enlace público, en lectura. Sin foto:
  avatar con iniciales.
- **Suscripción** (`GET /api/organizacion/suscripcion`, solo el administrador): el plan con su nombre legible, la fecha
  de alta, *"Sin cobro durante el piloto"*, y renovación y método de pago vacíos. Sin tabla nueva.
- **Cambio de contraseña** (`PUT /api/usuarios/me/contrasena`): exige la actual (un error es 400, nunca 401, porque el
  frontend cierra la sesión con cualquier 401); nueva ≥ 8 caracteres y ≤ 72 bytes; **corta las demás sesiones** con la
  columna `usuarios.sesiones_validas_desde`, que la estrategia JWT consulta en cada petición; la sesión actual recibe un
  token nuevo.
- **Soporte** (`POST /api/soporte/mensajes`): guarda el mensaje (≤ 2000) en `mensajes_soporte` y un job lo envía cada
  minuto a la casilla de `SOPORTE_CORREO_DESTINO`, con *Responder a* = el correo del profesional. Tope de 5 por
  organización en 24 horas y límite de tasa por IP.
- **Módulos:** `usuario` y `tenant` crecen; `soporte` es nuevo, con su módulo de planificación; `auth` gana
  `FirmaJwtModule` para que `usuario` firme el token nuevo sin depender de `AuthModule`.

**Fuera de la fase** (decisiones del usuario): la foto ([DT-57](../Deudas/DT-57.md)), cambiar el correo y recuperar la
contraseña olvidada ([DT-03](../Deudas/DT-03.md)), corregir el nombre de la organización
([DT-58](../Deudas/DT-58.md)), el slug (nunca) y todo lo que sea cobrar ([Q2](../PREGUNTAS-ABIERTAS.md#q2--el-prepago-entra-alguna-vez)).

**Por decidir** (ninguna bloquea la construcción): el nombre del plan ([Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free)),
la casilla de soporte ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)) y seis más en el
[plan](../US/10-perfil-cuenta.md#preguntas-abiertas).

> **Lo que el diseño hizo distinto de lo pedido** ([detalle](../US/10-perfil-cuenta.md#contradicciones-con-lo-pedido)):
> P7 decía "vía outbox", y ADR-12 §4 prohíbe los efectos externos en un suscriptor: el correo sale por un job sobre la
> fila de `mensajes_soporte`, sin hecho ni suscriptor. Y son dos migraciones (`1750000019000` y `1750000020000`), no una.

---

## Decisiones

| Documento | En una línea | Estado |
|---|---|---|
| [ADR-15](../Decisions/ADR-15.md) | Perfil editable, corte de sesiones al cambiar la contraseña, suscripción en lectura y soporte con su propio envío | **Aceptado** (2026-10-31) · **implementado y en producción** (2026-11-01); [notas](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01) · *antes: implementado, en `develop`; antes: propuesto* |
| [ADR-01](../Decisions/ADR-01.md) | El JWT sin renovación ni revocación; ADR-15 lo extiende con la consulta del corte (implementada el 2026-11-01) | Aceptado · implementado · la extensión, en producción desde el 2026-11-01 |
| [ADR-12](../Decisions/ADR-12.md) §4, §5 y §6 | La regla 4 de los suscriptores, el planificador y los barridos globales que usa el job de soporte | Aceptado · en producción |
| [ADR-13](../Decisions/ADR-13.md) §1 y §8 | El puerto `CanalMensajeria` que soporte reutiliza sin importar `RecordatorioModule` | Aceptado · en producción |
| [ADR-03](../Decisions/ADR-03.md) | El slug no se edita | Aceptado |

**Decisiones del frontend:** ninguna (las de producto las tomó el usuario para los dos repos).

---

## Features, planes y commits

- **Plan:** [US-10](../US/10-perfil-cuenta.md) — ✅ implementado y en producción (2026-11-01), cierre pendiente de las
  pruebas manuales y de Q18/Q19 · *antes: 🔶 implementado, en `develop` con el release a `main` abierto; antes: 🔶 en
  diseño (2026-10-31)*.
- **Feature:** [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md) (nueva, 2026-11-01): perfil, cambio de
  contraseña con corte de sesiones, suscripción y soporte; incluye lo que la fase cambió en `auth` y `tenant`.
- **Commits** (filas 118–124 de la [TRAZABILIDAD](../TRAZABILIDAD.md)):

| Fila | Commit | Fecha | Qué | Documento |
|---|---|---|---|---|
| 118 | `6e597be` | 2026-11-01 | ADR-15 aceptado (con sus notas de implementación), plan, esta guía, DT-57 a DT-61, Q18 y Q19, notas en deudas y Cumplimiento | [ADR-15](../Decisions/ADR-15.md) · [US-10](../US/10-perfil-cuenta.md) · [DT-57](../Deudas/DT-57.md)…[DT-61](../Deudas/DT-61.md) |
| 119 | `a2058aa` | 2026-11-01 | Perfil, cambio de contraseña y corte de sesiones (migración `1750000019000`, `FirmaJwtModule`, estrategia JWT asíncrona, dos cubos, `SOPORTE_CORREO_DESTINO`) | [us10 § Perfil](../Features/us10-perfil-cuenta.md#perfil) · [§ Corte de sesiones](../Features/us10-perfil-cuenta.md#corte-de-sesiones) · [DT-01](../Deudas/DT-01.md) · `CLAUDE.md` de `usuario` |
| 120 | `35aec28` | 2026-11-01 | Suscripción en lectura, solo el administrador | [us10 § Suscripción](../Features/us10-perfil-cuenta.md#suscripción) · [DT-02](../Deudas/DT-02.md) |
| 121 | `fcfeac3` | 2026-11-01 | Módulo `soporte`: tabla (migración `1750000020000`), ruta y job | [us10 § Soporte](../Features/us10-perfil-cuenta.md#soporte) · [DT-59](../Deudas/DT-59.md) · `CLAUDE.md` de `soporte` (nuevo) |
| 122 | `c090105` | 2026-11-01 | Definición de Terminado: e2e, integración de las migraciones y `app.module.spec.ts` | [US-10 § Definición de Terminado](../US/10-perfil-cuenta.md#definición-de-terminado) |
| 123 | `aeab86d` | 2026-11-01 | Resultados de integración y e2e | [ADR-15 § Verificación](../Decisions/ADR-15.md#verificación-2026-11-01) |
| — | — | 2026-11-01 | A `develop` por fast-forward (`715c3f3..aeab86d`), sin PR ni merge | — |
| 124 | `cd659c1` | 2026-11-01 | **Release a producción** (PR #15 a `main`) | [§ Release a producción](#release-a-producción-2026-11-01) |

---

## Deudas

| Deuda | Por qué pesa en esta fase |
|---|---|
| [DT-01](../Deudas/DT-01.md) | **se cierra en parte**: cambiar la contraseña corta las demás sesiones y un usuario borrado deja de entrar (**implementado el 2026-11-01** y **en producción desde ese día**); la renovación sigue abierta; la severidad se revisa al cerrar la fase |
| [DT-57](../Deudas/DT-57.md) | **nueva**, 🔵 aplazada: sin foto de perfil (P1) |
| [DT-58](../Deudas/DT-58.md) | **nueva**, 🔵 aplazada: el nombre de la organización no se puede corregir, y va en cada recordatorio (P3) |
| [DT-59](../Deudas/DT-59.md) | **nueva**, ⚪ prevista el 2026-10-31 → **abierta** desde la implementación (2026-11-01): `soporte` usa el canal de correo de `recordatorio` por archivo, con su propia instancia |
| [DT-60](../Deudas/DT-60.md) | **nueva** (detectada al implementar, 2026-11-01), 🟡 baja: el decorador `Recortar` está copiado en `portal-paciente`, `usuario` y `soporte` |
| [DT-61](../Deudas/DT-61.md) | **nueva** (detectada al implementar, 2026-11-01), 🟡 baja: el registro no aplica la política de contraseña del cambio (sin tope de 72 bytes) |
| [DT-46](../Deudas/DT-46.md) | sigue abierta: las fechas nuevas declaran `timestamptz`, pero `usuarios.creado_en` y `tenants.creado_en` no, y ahora se muestran (perfil y suscripción) |
| [DT-02](../Deudas/DT-02.md) | la suscripción es la primera ruta que mira el rol, con una comprobación local (implementada el 2026-11-01); el guard general sigue pendiente |
| [DT-03](../Deudas/DT-03.md) | la recuperación de contraseña y el cambio de correo siguen fuera (P2, P6); el `Reply-To` de soporte usa un correo sin verificar |
| [DT-04](../Deudas/DT-04.md) | el cambio de contraseña, como el login, solo tiene límite por IP |
| [DT-36](../Deudas/DT-36.md) | otro tipo de correo por la misma cuenta de Resend; el contador local no lo ve (lo acota el tope por organización) |
| [DT-26](../Deudas/DT-26.md), [DT-52](../Deudas/DT-52.md), [DT-53](../Deudas/DT-53.md), [DT-56](../Deudas/DT-56.md) | el flujo nuevo de los mensajes a soporte: sin plazo de conservación, un proveedor nuevo (la casilla) y Resend con texto libre, la política y los incidentes |
| [DT-40](../Deudas/DT-40.md) | con `MENSAJERIA_ADAPTADOR=registro`, un mensaje a soporte queda `enviado` sin salir (como los recordatorios) |
| [DT-19](../Deudas/DT-19.md) | un mensaje a soporte `fallido` solo se ve en los logs, que hoy no le llegan a nadie |

---

## Preguntas abiertas relacionadas

- [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) — el nombre legible del plan `free` (nueva).
- [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) — la casilla de soporte y su proveedor (nueva).
- [Q7](../PREGUNTAS-ABIERTAS.md#q7--renovación-y-revocación-de-sesión-bloqueado-hasta-que-el-arquitecto-defina-el-requisito)
  — la revocación tras un cambio de contraseña queda fijada por esta fase; la renovación sigue abierta.
- [Q2](../PREGUNTAS-ABIERTAS.md#q2--el-prepago-entra-alguna-vez) — el cobro, fuera de la v1: por eso la suscripción
  es de lectura.
- [Plan US-10 § Preguntas abiertas](../US/10-perfil-cuenta.md#preguntas-abiertas) — las ocho, con opciones e
  inclinación.

---

## Contraparte en el frontend

- El trabajo del frontend —*Mi Perfil* en el sidebar, la vista con pestañas, los formularios, la suscripción en
  lectura y el modal de soporte— está en el [plan US-10 § Frontend](../US/10-perfil-cuenta.md#frontend-citia-frontend-en-vue).
  Su plan propio irá en `citia-frontend/context/us/10-perfil-cuenta.md`.
- [DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md) (cerrada) dejaba previsto pedir `GET /me` para refrescar
  la sesión: el perfil es ese endpoint, con los mismos nombres de campo que el login.

---

## Depende de / desbloquea

- **Depende de:** nada según el ROADMAP. Técnicamente se apoya en lo que ya está en producción: el JWT de
  Fundaciones, el planificador de la [Fase 2](fase-2-us03-recordatorios.md) y su canal de correo.
- **Desbloquea:** nada declarado. Deja lista la columna para un "cerrar todas mis sesiones" y el patrón de correo que
  las alertas de la [Fase 4](fase-4-us05-alertas.md) podrían seguir ([DT-59](../Deudas/DT-59.md)).
