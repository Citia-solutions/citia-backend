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

- **Framework:** NestJS 11, TypeScript 5.7, Node 22.
- **Tests:** Jest (`*.spec.ts` unit, `test/` e2e con Supertest).
- **Calidad:** ESLint + Prettier (`npm run lint`, `npm run format`).
- **Git:** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`).
- **Ramas:** `feature/<scope>-<descripcion>` (ej. `feature/auth-jwt-refresh`).
- **PR:** descripción clara + lint y tests pasando.

### Scripts del proyecto

| Acción          | Comando              |
|-----------------|----------------------|
| Dev (watch)     | `npm run start:dev`  |
| Build           | `npm run build`      |
| Tests unit      | `npm test`           |
| Tests + cov     | `npm run test:cov`   |
| Tests e2e       | `npm run test:e2e`   |
| Lint (fix)      | `npm run lint`       |
| Format          | `npm run format`     |

## Arquitectura por Módulos (NestJS)

El backend se organiza en **módulos de feature** dentro de `src/`. Cada módulo es
autocontenido:

```
src/<modulo>/
├── <modulo>.module.ts       # @Module: declara controllers + providers
├── <modulo>.controller.ts   # Rutas HTTP + validación de entrada
├── <modulo>.service.ts      # Lógica de negocio
├── dto/                     # DTOs con class-validator (request/response)
├── entities/                # Entidades de persistencia (cuando aplique)
├── <modulo>.controller.spec.ts
└── <modulo>.service.spec.ts
```

> Estado actual: el proyecto está recién inicializado (`src/main.ts`,
> `src/app.module.ts`). Aún no hay módulos de feature ni capa de persistencia.

### Convención: contexto por módulo (CLAUDE.md local)

Cuando un módulo crezca y tenga reglas/estructura/endpoints propios, **crea un
`src/<modulo>/CLAUDE.md`** documentando: estructura de carpetas, endpoints
existentes, convenciones locales y notas importantes. Claude lo carga
automáticamente al trabajar en esa carpeta, dando contexto aislado y reduciendo
tokens. No crees un CLAUDE.md para carpetas sin reglas especiales.

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
