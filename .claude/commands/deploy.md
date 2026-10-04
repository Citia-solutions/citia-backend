---
description: Checklist y pipeline de despliegue con validaciones previas
argument-hint: <objetivo, ej. "release v1.2.0">
---

# Comando: Pipeline de Despliegue

Prepara el despliegue: **$ARGUMENTS**

1. Verifica que el árbol esté limpio: `git status`.
2. Build de producción: `npm run build`.
3. Ejecuta la suite completa: `npm test` y `npm run test:e2e`.
4. Verifica lint en todo el proyecto: `npm run lint`.
5. Si hay migraciones pendientes, lístalas y confirma que son reversibles y no
   destructivas (si lo son, advierte explícitamente).
6. Genera changelog desde el último tag: `git log --oneline <last-tag>..HEAD`.
7. Propón versión según Conventional Commits:
   - `feat` → minor · `fix` → patch · `BREAKING CHANGE` → major.
8. Presenta el resumen y **espera confirmación del usuario** antes de cualquier
   acción de release (tag, push, deploy).
9. Ejecuta los pasos de deploy configurados (cuando existan).

> Nota: este proyecto aún no tiene pipeline de deploy configurado. Hasta entonces,
> este comando sirve como checklist de pre-release.
