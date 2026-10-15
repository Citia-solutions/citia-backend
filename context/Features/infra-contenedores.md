# Feature: Contenedorización (Docker + compose + migraciones en arranque)

> **Fase:** [Fundaciones](../Fases/fase-base-fundaciones.md) (origen), [Fase 0 — US-06](../Fases/fase-0-us06-dashboard.md) (seed demo), [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md) (despliegue y observabilidad) · **Feature:** este documento · **Plan:** — · **Relacionado:** [ADR-05](../Decisions/ADR-05.md), [ADR-00](../Decisions/ADR-00.md), [ADR-12](../Decisions/ADR-12.md), [ADR-13 §16](../Decisions/ADR-13.md), [us03-recordatorios](us03-recordatorios.md), [DT-18](../Deudas/DT-18.md), [DT-19](../Deudas/DT-19.md), [DT-20](../Deudas/DT-20.md), [DT-21](../Deudas/DT-21.md), [stack](../stack-tecnologico.md)

**Tipo:** Infraestructura / cross-cutting (no es una US de negocio)
**Estado:** ✅ Implementado (2026-06-22) · ✅ Tooling de entorno local y seed demo (2026-08-16) · ✅ Fase 2:
logs con pino, health check, latidos, validación de entorno, CORS por lista y planificador (2026-10-03; en
producción desde el 2026-10-06) — [§ Fase 2](#fase-2-observabilidad-planificador-y-variables-nuevas) ·
entornos de despliegue en [stack § Mapa de entornos](../stack-tecnologico.md#mapa-de-entornos)
**Commits:** `b8cac2a` (Docker + compose + entrypoint), `df53128` (fix build), `0e54f0b` (scripts migración prod), `77a97c9` (puerto pgAdmin), `b623b6a` (carga de `.env` en CLI/e2e), `f200557` (seed demo) · Fase 2: `d45de20` (pino, health, latidos, entorno, CORS), `f95b637` (planificador y apagado ordenado), `db46e37` (e2e en serie), `f719c66` (`rawBody`, compose con mensajería), `8dd4747` (coverage sin specs)
**ADR:** [ADR-05](../Decisions/ADR-05.md)

---

## Qué provee

Empaqueta el backend en una imagen Docker de producción liviana y un entorno local con
`docker-compose`, aplicando las migraciones automáticamente antes de arrancar la app.

---

## Artefactos

```
Dockerfile                     ← multi-stage: deps → builder → runner (node:22-alpine)
entrypoint.sh                  ← corre migraciones (prod: dist, dev: ts-node) y luego arranca la app
docker-compose.yml             ← base/prod: servicios db (postgres:16) + app
docker-compose.override.yml    ← dev: hot-reload (código montado) + pgAdmin
docker/pgadmin/servers.json    ← conexión precargada de pgAdmin
.dockerignore                  ← excluye node_modules, dist, .git, etc.
```

---

## Dockerfile (3 stages)

| Stage | Rol |
|-------|-----|
| **`deps`** | `npm ci` con todas las dependencias (dev incluidas, para compilar). Copia solo `package*.json` primero → cache de capas. |
| **`builder`** | `npm run build` → `dist/` (incluye `data-source.js` y `migrations/*.js`), luego `npm prune --omit=dev`. `typeorm` queda (es *dependency*) → CLI disponible en prod. |
| **`runner`** | Imagen final. `NODE_ENV=production`, `USER node` (no-root), `tini` como PID 1, `EXPOSE 3000`. Copia solo `node_modules` (prod) + `dist/` + `package*.json` + `entrypoint.sh`. |

Arranque: `tini` → `entrypoint.sh` (migraciones) → `CMD ["node", "dist/main"]`.

---

## `entrypoint.sh` — migraciones antes de la app

Elige el mecanismo según el entorno (detecta por la presencia de `dist/`):

| Entorno | Condición | Comando |
|---------|-----------|---------|
| Producción | existe `dist/database/data-source.js` | `npm run migration:run:prod` (JS compilado, sin ts-node) |
| Desarrollo | no hay `dist/` | `npm run migration:run` (ts-node sobre `src/`) |

No hace polling de la DB: espera al `healthcheck` de compose (`depends_on: service_healthy`).

> Ver la **reconciliación con ADR-00** (migraciones en prod como paso explícito) y el **riesgo
> multi-instancia** en [ADR-05](../Decisions/ADR-05.md).

---

## docker-compose

- **`db`**: `postgres:16-alpine`, volumen `pgdata`, **healthcheck** `pg_isready`, puerto expuesto
  al host para inspección.
- **`app`**: `build target: runner`, `depends_on: db: condition: service_healthy`. Dentro de la red
  de compose el host de la DB es **`db`**, no `localhost`. `JWT_SECRET` **debe** venir del entorno.
- **override (dev)**: monta el código para hot-reload y añade **pgAdmin**.

> **Puerto de pgAdmin (`77a97c9`).** El 5050 original cae dentro del rango **5041-5140 que
> Windows/Hyper-V reserva**, así que el contenedor no podía publicar el puerto en local. Se usa
> **15050** por defecto, sobreescribible con `PGADMIN_PORT` en el `.env`.

**Uso:**
```bash
# Producción
docker compose up --build -d
# Desarrollo (hot-reload + pgAdmin)
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

---

## Scripts de migración (`package.json`)

| Script | Uso |
|--------|-----|
| `migration:run` / `migration:revert` | dev (ts-node sobre `src/database/data-source.ts`) |
| `migration:run:prod` / `migration:revert:prod` | prod (JS compilado en `dist/`) — commit `0e54f0b` |
| `migration:generate` | genera una migración desde el diff del schema (revisar SIEMPRE a mano, ADR-00) |

---

## Carga de `.env` fuera de Nest (`b623b6a`)

`ConfigModule.forRoot()` solo carga el `.env` **dentro** del ciclo de vida de Nest. Dos caminos
quedaban fuera y leían `process.env` vacío:

| Camino | Problema | Solución |
|--------|----------|----------|
| CLI de migraciones (`ts-node` sobre `data-source.ts`) | El data-source corre en el host, sin Nest | `config()` de dotenv al tope de `data-source.ts`. En la imagen de producción las vars vienen del contenedor y `config()` es no-op |
| Tests e2e | `typeorm-test.config.ts` lee `process.env` **en tiempo de import**, antes del `beforeAll` | `test/setup-env.ts` registrado como `setupFiles` en `jest-e2e.json` |

También se corrigió la ruta del CLI a `./node_modules/typeorm/cli.js`, que es la que resuelve
correctamente en Windows.

---

## Seed de datos demo (`f200557`)

`npm run seed` puebla la BD con lo mínimo para probar el dashboard de US-06
(`GET /api/citas/hoy`) sin crear datos a mano:

- 1 Tenant `CLINICA` + 1 Usuario `ADMINISTRADOR` con **credenciales fijas** (`clinica-demo` /
  `admin@clinicademo.cl` / `Demo1234`), que el script imprime al terminar.
- 3 Pacientes del tenant.
- 6 Citas de **hoy** con estados variados (PENDIENTE, CONFIRMADA, ASISTIO, NO_ASISTIO, CANCELADA).

Decisiones de diseño:

- **Reutiliza los servicios y repositorios ya wired** (`NestFactory.createApplicationContext`), así
  hereda bcrypt, la generación de slug y la máquina de estados de Cita. **No hace `INSERT`s crudos**
  que salten invariantes del dominio (ADR-04).
- **Idempotente:** si el tenant demo ya existe (por slug), borra *solo* sus datos y los recrea. Se
  puede correr N veces sin chocar con los `UNIQUE` ni acumular basura.
- Las horas se generan como **offsets relativos a `ahora`**, no absolutas: así caen en el "hoy" de
  la clínica tanto si el seed corre en el host como dentro del contenedor en UTC (ADR-07).

---

## Nota de build (`df53128`)

Un `.ts` suelto en `context/` elevaba el `rootDir` y hacía que Nest emitiera a `dist/src/main.js`,
rompiendo `node dist/main`. Se **excluyó `context/`** de `tsconfig.build.json`. Regla derivada:
`context/` es documentación, no debe contener fuentes `.ts` compilables.

---

## Variables de entorno

Ver `.env.example`. Claves de infra: `DB_HOST/PORT/USER/PASS/NAME`, `PORT`, `JWT_SECRET`,
`JWT_EXPIRES_IN`, `FRONTEND_URL`, `APP_TZ`, `PGADMIN_PORT` (default `15050`).

> **Desde la Fase 2 (2026-10-03)** todas se **validan al arrancar** y hay varias nuevas (CORS, logs,
> Better Stack, planificador, mensajería, recordatorios): ver
> [§ Fase 2](#fase-2-observabilidad-planificador-y-variables-nuevas) y la tabla completa en
> [us03 § Variables de entorno](us03-recordatorios.md#variables-de-entorno).

Los tests e2e usan además `TEST_DB_*`, cargadas por `test/setup-env.ts`.

---

## Fase 2: observabilidad, planificador y variables nuevas

*(2026-10-03, rama `feature/fase2-recordatorios`; en `develop` desde el 2026-10-04 y en producción desde el
2026-10-06.)* Piezas
transversales que trajo la Fase 2; el detalle funcional está en [us03-recordatorios](us03-recordatorios.md).

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Validación del entorno** | `ConfigModule.forRoot({ validate: validarEntorno })`, sin librerías. Si algo falta o está mal, la app **no arranca** y lista todos los errores juntos, sin mostrar secretos. Fuera de producción todo tiene default salvo `JWT_SECRET`. **En producción** exige `DB_*`, `FRONTEND_URL` (origen exacto, sin ruta ni comodín), `JWT_SECRET` de **32 caracteres o más** que no sea de ejemplo, y `MENSAJERIA_ADAPTADOR` | `src/shared/infrastructure/config/entorno.ts` |
| **Logs con pino** | `nestjs-pino` reemplaza el logger de Nest (`app.useLogger`, `bufferLogs`). JSON a la salida estándar (Railway), `pino-pretty` en desarrollo, id por petición en `X-Request-Id`, redacción de credenciales y datos personales; copia a Better Stack solo con `BETTERSTACK_SOURCE_TOKEN`. `pino-pretty` es devDependency: en la imagen de producción cae a JSON | `src/shared/infrastructure/observabilidad/opciones-logger.ts`, `src/shared/observabilidad.module.ts` |
| **Health check** | `GET /api/health`: público, `SELECT 1` con tope de 2 s, 200 o 503 sin detalles, sin log por petición | `src/shared/presentation/salud.controller.ts` |
| **Latidos** | heartbeats de Better Stack para los jobs `salida` y `recordatorios`; nunca lanzan | `src/shared/infrastructure/observabilidad/latidos-better-stack.ts` |
| **CORS por lista** | `FRONTEND_URL` (canónico) + `CORS_ORIGENES_EXTRA`: orígenes exactos y **un** comodín, `https://*.<proyecto>.pages.dev`, traducido a una expresión anclada de un solo nivel de subdominio, solo https. `credentials: true` se mantiene | `src/shared/infrastructure/config/origenes-cors.ts`, `main.ts` |
| **Planificador en proceso** | `ScheduleModule` en `PlanificacionModule`; jobs del outbox y de recordatorios; nada si `PLANIFICADOR_ACTIVO=false` | `src/shared/planificacion.module.ts`, `src/modules/recordatorio/recordatorio-planificacion.module.ts` |
| **Apagado ordenado** | `app.enableShutdownHooks()`: con el `SIGTERM` que reenvía `tini`, los jobs dejan de tomar trabajo y se espera el tick en curso antes de cerrar la base | `main.ts` |
| **Cuerpo crudo** | `NestFactory.create(AppModule, { rawBody: true })`: el webhook de Resend verifica la firma sobre `req.rawBody` | `main.ts` |
| **Tests en serie** | `maxWorkers: 1` en `test/jest-e2e.json` y `--runInBand` en `test:integration` (comparten `citia_test`); `test:cov` excluye los `*.spec.ts` | `test/jest-e2e.json`, `package.json` |

**`docker-compose.yml`** reenvía al contenedor `app`, además de las de antes, las cuatro variables de
mensajería: `MENSAJERIA_ADAPTADOR` (sin default: con la imagen de producción la app no arranca si falta),
`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` y `CORREO_DOMINIO`. **No reenvía** `CORS_ORIGENES_EXTRA`,
`APP_TZ`, `LOG_*`, `BETTERSTACK_*`, `PLANIFICADOR_ACTIVO` ni las `EVENTOS_SALIDA_*` / `RECORDATORIO_*`:
con compose toman su default. En Railway no aplica (las variables se cargan en el servicio).

**Variables nuevas** (tabla completa con defaults en
[us03 § Variables de entorno](us03-recordatorios.md#variables-de-entorno)): `CORS_ORIGENES_EXTRA`,
`LOG_NIVEL`, `LOG_FORMATO`, `BETTERSTACK_SOURCE_TOKEN`, `BETTERSTACK_INGESTING_HOST`,
`BETTERSTACK_HEARTBEAT_SALIDA_URL`, `BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL`, `PLANIFICADOR_ACTIVO`,
`EVENTOS_SALIDA_*`, `MENSAJERIA_ADAPTADOR`, `RESEND_*`, `CORREO_DOMINIO`, `CORREO_REMITENTE`,
`CUOTA_UMBRAL_AVISO` y `RECORDATORIO_*`.

**Migraciones nuevas** que corre el `entrypoint.sh` al arrancar: `1750000008000-CreateEventosSalida`,
`1750000009000-CreateConfiguracionesRecordatorio`, `1750000010000-CreateRecordatorios` y
`1750000011000-CreateSupresionesCorreo`.

---

## Pendientes

1. **Migraciones en despliegue multi-instancia:** moverlas a un job/release phase dedicado antes
   de escalar a >1 réplica (evita carrera entre réplicas) — ver ADR-05.
2. **Deploy en Railway** y, más adelante, VPS (DigitalOcean) — stack-tecnologico.md.
3. **Observabilidad** (Sentry, logs estructurados) — aún no incorporada.

> **Nota (2026-09-30).** Dos puntos de esta lista quedaron atrás. **Observabilidad:** el proveedor es
> **Better Stack**, no Sentry (descartado), con logs JSON vía `pino` y `GET /api/health`; ver
> [stack-tecnologico.md](../stack-tecnologico.md) punto 6, [ADR-13 §16](../Decisions/ADR-13.md) y
> [DT-19](../Deudas/DT-19.md). Se implementa con la [Fase 2](../Fases/fase-2-us03-recordatorios.md).
> **Despliegue:** según [DT-18](../Deudas/DT-18.md) (2026-09-29) el backend ya se despliega desde
> `develop` en Railway; la Fase 2 exige además el contenedor siempre encendido
> ([ADR-12 §7](../Decisions/ADR-12.md)).
>
> **Actualizado 2026-10-04:** la observabilidad está **implementada** en la rama de la Fase 2
> ([§ Fase 2](#fase-2-observabilidad-planificador-y-variables-nuevas)); falta crear la cuenta de Better
> Stack y probar el latido y una alerta ([DT-19](../Deudas/DT-19.md)). Para Railway: "App Sleeping"
> apagado y las variables nuevas cargadas (checklist en la
> [Fase 2](../Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción)). Sigue pendiente el punto 1
> (migraciones fuera del arranque antes de escalar a más de una réplica).

---

## Deudas técnicas asociadas

- [DT-18](../Deudas/DT-18.md) — no existe límite de tasa en ninguna superficie.
- [DT-19](../Deudas/DT-19.md) — sin observabilidad: **implementada** en la Fase 2 y **verificada en
  producción** (2026-10-07: heartbeats y monitor en Up); falta la fuente de logs y la prueba de alerta
  forzada.
- [DT-20](../Deudas/DT-20.md) — e2e sin pipeline (las suites con base ya corren en verde).
- [DT-21](../Deudas/DT-21.md) — carpetas vacías con nombres mal escritos: **cerrada** (2026-10-03).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
