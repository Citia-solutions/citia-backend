---
description: Orquestar una tarea completa multi-capa delegando en sub-agentes
argument-hint: <descripción de la tarea>
---

# Comando: Orquestar Tarea

Actúa como orquestador para esta solicitud: **$ARGUMENTS**

Sigue este flujo:

## Paso 1 — Análisis
- ¿Qué capas/módulos se ven afectados? (arquitectura, infra/backend, api, database, testing)
- ¿La tarea necesita una decisión de diseño previa? Si sí, empieza por `architecture-agent`.
- ¿Hay dependencias entre capas? ¿Cuál es el orden correcto?
- Revisa el `CLAUDE.md` raíz y cualquier `src/<modulo>/CLAUDE.md` relevante.

## Paso 2 — Plan
Presenta al usuario, de forma concisa:
- Sub-agentes que se activarán y en qué orden. Secuencia típica:
  `architecture (si hay diseño) → backend (infra) → database → api → testing`.
- Riesgos o conflictos potenciales (cambios destructivos, deps nuevas).
Espera confirmación antes de ejecutar cambios no triviales.

## Paso 3 — Ejecución
Para cada sub-agente involucrado, delega con la herramienta de agentes
(`architecture-agent`, `backend-agent`, `api-agent`, `database-agent`, `testing-agent`):
1. Carga su definición desde `.claude/agents/<nombre>.md`.
2. Dale el contexto del módulo (`src/<modulo>/CLAUDE.md` si existe).
3. Ejecuta la tarea acotada a su dominio.
4. Recoge su **output estructurado**.

## Paso 4 — Consolidación
- Verifica que no haya conflictos entre los cambios de cada agente.
- Ejecuta `npm run lint` y `npm test` (y `test:e2e` si aplica) tras cambios cross-capa.
- Reporta al usuario un resumen: qué cambió, tests, deps nuevas, pendientes.

## Paso 5 — Commit/PR (solo si el usuario lo pide)
- Prepara commit(s) organizados por capa con Conventional Commits.
- Genera descripción de PR si se solicita.
