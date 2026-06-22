---
description: Revisión cruzada de cambios recientes contra convenciones del proyecto
argument-hint: <alcance, ej. "últimos cambios de la feature">
---

# Comando: Revisión Cruzada

Revisa los cambios recientes buscando problemas y conflictos. Alcance: **$ARGUMENTS**

1. `git diff --name-only HEAD~5` (o contra `main`) para ver archivos cambiados.
2. Agrupa los cambios por capa/módulo (api, database, testing, config).
3. Para cada módulo, carga su `CLAUDE.md` (si existe) y verifica:
   - ¿Se respetan las convenciones de NestJS y del módulo?
   - ¿Controllers delgados / lógica en services? ¿DTOs validados?
   - ¿Hay tests para el código nuevo? ¿Pasan?
   - ¿Hay imports cruzados indebidos entre módulos?
4. Revisa cambios en código compartido / config global por **breaking changes**.
5. Reporta hallazgos clasificados:
   - 🔴 **Crítico:** rompe funcionalidad o viola reglas.
   - 🟡 **Mejora:** funciona pero podría ser mejor.
   - 🟢 **Sugerencia:** opcional, nice-to-have.

No modifiques código en este comando: solo reporta. Si el usuario quiere aplicar
los arreglos, delega después en el sub-agente correspondiente.
