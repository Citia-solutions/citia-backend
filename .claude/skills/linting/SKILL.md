---
name: linting
description: Cómo aplicar ESLint y Prettier en este proyecto antes de hacer commit. Úsalo después de modificar código TypeScript para verificar formato y reglas de lint, y para corregir errores automáticos.
---

# Skill: Linting y Formato

## Instrucciones

1. Tras modificar código, ejecuta el linter con autofix.
2. Corre el formateador.
3. Si quedan errores de lint que no se autocorrigen, repórtalos al usuario/orquestador.

## Comandos

- Lint (con `--fix`): `npm run lint`
- Formato (Prettier): `npm run format`

## Reglas

- No commitees código con errores de lint pendientes.
- La configuración es centralizada: `eslint.config.mjs` y la config de Prettier del
  repo. No introduzcas reglas inline ni desactives reglas sin justificarlo.
- Lint y format son parte del "definition of done" de cualquier cambio de código.
