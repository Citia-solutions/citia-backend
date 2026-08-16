# Feature: Contenedorización (Docker + compose + migraciones en arranque)

**Tipo:** Infraestructura / cross-cutting (no es una US de negocio)
**Estado:** ✅ Implementado (2026-06-22)
**Commits:** `b8cac2a` (Docker + compose + entrypoint), `df53128` (fix build), `0e54f0b` (scripts migración prod)
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

## Nota de build (`df53128`)

Un `.ts` suelto en `context/` elevaba el `rootDir` y hacía que Nest emitiera a `dist/src/main.js`,
rompiendo `node dist/main`. Se **excluyó `context/`** de `tsconfig.build.json`. Regla derivada:
`context/` es documentación, no debe contener fuentes `.ts` compilables.

---

## Variables de entorno

Ver `.env.example`. Claves de infra: `DB_HOST/PORT/USER/PASS/NAME`, `PORT`, `JWT_SECRET`,
`JWT_EXPIRES_IN`, `FRONTEND_URL`, `APP_TZ`.

---

## Pendientes

1. **Migraciones en despliegue multi-instancia:** moverlas a un job/release phase dedicado antes
   de escalar a >1 réplica (evita carrera entre réplicas) — ver ADR-05.
2. **Deploy en Railway** y, más adelante, VPS (DigitalOcean) — stack-tecnologico.md.
3. **Observabilidad** (Sentry, logs estructurados) — aún no incorporada.
