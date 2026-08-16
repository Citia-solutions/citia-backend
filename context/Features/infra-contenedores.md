# Feature: Contenedorización (Docker + compose + migraciones en arranque)

**Tipo:** Infraestructura / cross-cutting (no es una US de negocio)
**Estado:** ✅ Implementado (2026-06-22) · ✅ Tooling de entorno local y seed demo (2026-08-16)
**Commits:** `b8cac2a` (Docker + compose + entrypoint), `df53128` (fix build), `0e54f0b` (scripts migración prod), `77a97c9` (puerto pgAdmin), `b623b6a` (carga de `.env` en CLI/e2e), `f200557` (seed demo)
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

Los tests e2e usan además `TEST_DB_*`, cargadas por `test/setup-env.ts`.

---

## Pendientes

1. **Migraciones en despliegue multi-instancia:** moverlas a un job/release phase dedicado antes
   de escalar a >1 réplica (evita carrera entre réplicas) — ver ADR-05.
2. **Deploy en Railway** y, más adelante, VPS (DigitalOcean) — stack-tecnologico.md.
3. **Observabilidad** (Sentry, logs estructurados) — aún no incorporada.
