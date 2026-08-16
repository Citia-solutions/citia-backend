# ADR-05: Contenedorización Docker multi-stage y migraciones en el arranque del contenedor

**Fecha:** 2026-06-22
**Estado:** Aceptado · Implementado (2026-06-22)
**Commits:** `b8cac2a` (Docker), `df53128` (fix build), `0e54f0b` (scripts de migración prod), `77a97c9` (puerto pgAdmin), `b623b6a` (carga de `.env` en CLI/e2e)

---

## Contexto

El despliegue objetivo (stack-tecnologico.md) es un PaaS con soporte de Docker (**Railway**),
con posible migración futura a un VPS (DigitalOcean). Se necesita una imagen de producción:

- **liviana** y reproducible,
- que **no arrastre** dependencias de desarrollo ni el código fuente TypeScript,
- que **aplique las migraciones** antes de exponer la app (una base sin las tablas es inútil),
- y que corra de forma **segura** (no como root, con manejo correcto de señales como PID 1).

Al mismo tiempo, ADR-00 fija una regla dura: **nunca `synchronize`; el schema solo cambia por
migraciones versionadas y revisadas**, y en producción las migraciones son un **paso explícito**,
no un efecto colateral silencioso del framework.

---

## Decisión

### 1. Dockerfile multi-stage (`deps` → `builder` → `runner`)

Sobre `node:22-alpine`:

- **`deps`**: `npm ci` con *todas* las dependencias (incluye dev, necesarias para compilar).
  Copia solo `package*.json` primero para aprovechar la cache de capas.
- **`builder`**: compila `npm run build` → `dist/` (incluye `dist/database/data-source.js` y
  `dist/database/migrations/*.js`) y luego `npm prune --omit=dev`.
  `typeorm` queda incluido porque es *dependency* (no *devDependency*): el CLI de migraciones
  debe estar disponible en producción.
- **`runner`**: imagen final. Copia solo `node_modules` (prod), `dist/`, `package*.json` y
  `entrypoint.sh`. `NODE_ENV=production`, usuario **no-root** (`USER node`), **`tini`** como PID 1
  para señales y reaping, `EXPOSE 3000`.

### 2. Migraciones aplicadas por el `entrypoint.sh`, antes de arrancar la app

El entrypoint corre las migraciones como un **paso discreto y explícito** previo al proceso de la
app, eligiendo el mecanismo según el entorno:

| Entorno | Detección | Mecanismo |
|---------|-----------|-----------|
| **Producción** (imagen compilada) | existe `dist/database/data-source.js` | `npm run migration:run:prod` (CLI de TypeORM sobre JS compilado; sin `ts-node`) |
| **Desarrollo** (código montado, hot-reload) | no hay `dist/` | `npm run migration:run` (`ts-node` sobre `src/database/data-source.ts`) |

Se añadieron los scripts `migration:run:prod` / `migration:revert:prod` apuntando a `dist/`
(commit `0e54f0b`).

### 3. `docker-compose` en dos archivos

- **`docker-compose.yml`** (base/prod): servicios `db` (`postgres:16-alpine`, volumen `pgdata`,
  **healthcheck** `pg_isready`) y `app` (`build target: runner`, `depends_on: db: service_healthy`).
  Dentro de la red de compose, la DB es el host `db`, **no** `localhost`.
- **`docker-compose.override.yml`** (dev): hot-reload con el código montado + **pgAdmin** para
  inspección (`docker/pgadmin/servers.json`).

La app **no** hace polling de la base: espera al `healthcheck` de compose vía
`depends_on: condition: service_healthy`.

### 4. Fix de build asociado (`df53128`)

Un `.ts` suelto en `context/` elevaba el `rootDir` de TypeScript y hacía que Nest emitiera a
`dist/src/main.js` (rompiendo `node dist/main`). Se **excluyó `context/`** de `tsconfig.build.json`
para que `dist/main.js` se emita en la ruta esperada por la imagen.

---

## Reconciliación con ADR-00 (migraciones en prod)

ADR-00 dice: *"en producción las migraciones se ejecutan como paso explícito del pipeline CI/CD,
nunca de forma automática al arrancar la aplicación"*. El entrypoint corre migraciones al iniciar
el contenedor, lo que **aparenta** contradecir esa regla. Se reconcilia así:

- El **espíritu** de ADR-00 (nunca `synchronize`, solo migraciones **revisadas y versionadas**) se
  respeta al 100%: el entrypoint ejecuta exactamente las mismas migraciones que se revisan y
  versionan, con `migration:run`, **no** `synchronize`.
- Correrlas en el entrypoint es un **paso explícito y observable** (se loguea, es un proceso
  separado del `CMD` de la app, y falla el arranque si la migración falla), adecuado para un
  despliegue **single-node en PaaS** (Railway).
- **Riesgo conocido:** en un despliegue **multi-instancia**, varias réplicas correrían las
  migraciones en paralelo (condición de carrera / lock). **Mitigación futura obligatoria:** al
  escalar horizontalmente, mover las migraciones a una **release phase / job dedicado** del
  pipeline (un solo ejecutor) y quitar ese paso del entrypoint de la app.

Este punto queda registrado como deuda a resolver antes de escalar a >1 instancia.

---

## Consecuencias

**Positivas:**
- Imagen de producción liviana (sin dev deps ni fuentes `.ts`) y con cache de capas eficiente.
- Arranque seguro: no-root + `tini` para señales.
- La base siempre queda migrada antes de recibir tráfico; mismo entrypoint sirve dev y prod.
- El CLI de TypeORM disponible en prod permite `migration:run:prod` / `migration:revert:prod`.

**Negativas / riesgos:**
- Migraciones en el entrypoint no son seguras con múltiples réplicas (ver reconciliación).
- El `entrypoint.sh` decide el modo por la presencia de `dist/`: si alguien monta `dist/` en dev
  por error, elegiría el modo prod. Aceptable dado el flujo actual.

---

## Referencias

- ADR-00: TypeORM — `synchronize: false`, migraciones versionadas.
- `Dockerfile`, `entrypoint.sh`, `docker-compose.yml`, `docker-compose.override.yml`.
- `context/Features/infra-contenedores.md` — guía operativa de la feature.
- Railway (deploy con Docker), stack-tecnologico.md punto 6.
