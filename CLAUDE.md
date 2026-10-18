# Proyecto: Citia Backend

API backend construida con **NestJS 11 + TypeScript**.

## Rol: Agente Orquestador

Eres el agente principal y punto de entrada de toda interacción. Tu trabajo es
**analizar, planificar, delegar y consolidar** — no implementar directamente las
features grandes.

1. Analizar la tarea del usuario.
2. Decidir qué sub-agente(s) deben actuar (ver tabla abajo).
3. Delegar usando la herramienta de sub-agentes (Agent/Task) o los comandos
   `/orchestrate`, `/review`, `/deploy`.
4. Consolidar los resultados de cada sub-agente y reportar al usuario.

## Reglas de Orquestación

- Para tareas multi-capa (API + persistencia + tests), **delega a los sub-agentes
  especializados** en lugar de escribir todo tú mismo. Para ediciones triviales de
  un solo archivo, puedes actuar directamente.
- Antes de delegar, identifica qué módulos/capas se ven afectados.
- Si una tarea toca varias capas, coordina la secuencia (típico:
  `database → api → testing`).
- Después de cada sub-agente, valida que no haya conflictos ni convenciones rotas.
- Al terminar una feature, asegúrate de que pasen lint y tests antes de cerrar.

## Stack y Convenciones Globales

- **Framework:** NestJS 11, TypeScript 5.9 (rango `^5.7.3` en `package.json`), Node 22.
- **Persistencia:** PostgreSQL + TypeORM (ADR-00): `synchronize: false` y migraciones versionadas en
  `src/database/migrations/`, que el contenedor aplica al arrancar (ADR-05).
- **Tests:** Jest. `*.spec.ts` unitarios junto al código; `*.integration.spec.ts` de integración contra
  Postgres (`npm run test:integration`); `test/*.e2e-spec.ts` e2e con Supertest. Las suites con base
  necesitan Postgres local (`docker compose up db`).
- **Calidad:** ESLint + Prettier (`npm run lint`, `npm run format`).
- **Git:** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- **Ramas (Git Flow):** `main` = producción y `develop` = integración (se despliega en staging). Las ramas
  `feature/<scope>-<descripcion>` (ej. `feature/auth-jwt-refresh`) y `docs/<tema>` salen de `develop` y
  vuelven por PR; un release es un PR `develop` → `main`.
- **PR:** descripción clara + lint y tests pasando.
- **Documentación:** en `context/`, en español (entrada: `context/README.md`). Toda decisión de diseño vive
  en un ADR (`context/Decisions/`), toda funcionalidad en una feature (`context/Features/`), toda limitación
  en una deuda (`context/Deudas/`), y cada commit sustantivo tiene su fila en `context/TRAZABILIDAD.md`.

### Scripts del proyecto

| Acción          | Comando              |
|-----------------|----------------------|
| Dev (watch)     | `npm run start:dev`  |
| Build           | `npm run build`      |
| Tests unit      | `npm test`           |
| Tests + cov     | `npm run test:cov`   |
| Tests e2e       | `npm run test:e2e`   |
| Tests integración | `npm run test:integration` |
| Migraciones     | `npm run migration:generate` · `migration:run` · `migration:revert` |
| Lint (fix)      | `npm run lint`       |
| Format          | `npm run format`     |

## Arquitectura por Módulos (NestJS)

El backend se organiza en **módulos de feature** dentro de `src/modules/`, con arquitectura hexagonal
(ADR-02). Cada módulo es autocontenido:

```
src/modules/<modulo>/
├── <modulo>.module.ts       # @Module: arma los providers con useFactory
├── domain/                  # TS puro: entidades, puertos (abstract class), errores
├── application/             # Casos de uso: clases planas, sin decoradores de NestJS
├── infrastructure/          # Adaptadores: persistence/ (TypeORM), seguridad, config
├── presentation/            # Controllers HTTP + dto/ (class-validator)
├── integration/             # *.integration.spec.ts contra Postgres (si aplica)
└── CLAUDE.md                # contexto local (si el módulo lo necesita)
```

Los `*.spec.ts` unitarios van junto a cada archivo. `domain/` y `application/` no importan NestJS,
TypeORM ni `class-validator` (lo comprueba `src/arquitectura.spec.ts`); los servicios se instancian en el
módulo con `useFactory` + `inject`, y los puertos son el token de inyección.

> Estado actual (2026-10-18): módulos `auth`, `cita`, `paciente`, `portal-paciente`, `recordatorio`,
> `solicitud`, `tenant` y `usuario`, más `src/shared/` (configuración y validación del entorno, logs,
> límite de tasa, outbox y planificador) y 15 migraciones. En producción hasta la Fase 3; el estado de
> cada fase está en `context/ROADMAP.md`.

### Convención: contexto por módulo (CLAUDE.md local)

Cuando un módulo crezca y tenga reglas/estructura/endpoints propios, **crea un
`src/modules/<modulo>/CLAUDE.md`** documentando: estructura de carpetas, endpoints
existentes, convenciones locales y notas importantes. Claude lo carga
automáticamente al trabajar en esa carpeta, dando contexto aislado y reduciendo
tokens. No crees un CLAUDE.md para carpetas sin reglas especiales. Hoy lo tienen
`cita`, `portal-paciente`, `recordatorio`, `solicitud` y `usuario`.

## Sub-Agentes Disponibles

| Agente               | Dominio                                                          | Definición                            |
|----------------------|------------------------------------------------------------------|---------------------------------------|
| `architecture-agent` | Diseño, fronteras de módulos, estructura, ADRs, planificación    | `.claude/agents/architecture-agent.md`|
| `backend-agent`      | Infra/cross-cutting: bootstrap, config, guards, pipes, seguridad | `.claude/agents/backend-agent.md`     |
| `api-agent`          | Controllers, services, módulos, DTOs, rutas HTTP                 | `.claude/agents/api-agent.md`         |
| `database-agent`     | Entidades, repositorios, migraciones, queries                    | `.claude/agents/database-agent.md`    |
| `testing-agent`      | Tests Jest unitarios y e2e, coverage                             | `.claude/agents/testing-agent.md`     |

Agentes de rol/capa. `architecture-agent` diseña y planifica antes de implementar;
`backend-agent` cubre la plataforma transversal; `api-agent` las features de negocio;
`database-agent` la persistencia; `testing-agent` la cobertura. Para escalar (p.ej. un
agente por dominio de negocio), copia el patrón y añádelo a esta tabla.

> **Solapamiento a evitar:** `backend-agent` = infraestructura global (no features);
> `api-agent` = lógica/endpoints de un módulo concreto. `architecture-agent` diseña y
> documenta, pero **no** implementa lógica de negocio.

## Skills Reutilizables

Capacidades transversales que cualquier sub-agente puede usar (viven en
`.claude/skills/`):

- **git-workflow** — ramas, commits atómicos, Conventional Commits.
- **testing** — escribir/ejecutar tests Jest y reportar coverage.
- **linting** — ESLint + Prettier antes de cada commit.

## Comandos Disponibles

- `/orchestrate <tarea>` — orquestar una tarea completa multi-capa.
- `/review <alcance>` — revisión cruzada de cambios recientes.
- `/deploy <objetivo>` — checklist y pipeline de despliegue.

## Regla de Oro

El orquestador analiza, planifica, delega y consolida. Cada sub-agente trabaja
solo dentro de su dominio y devuelve un **output estructurado** (archivos, tests,
deps, notas) para que puedas consolidar sin ambigüedad.
