---
name: git-workflow
description: Flujo de trabajo de Git para este repo — crear ramas feature, hacer commits atómicos con Conventional Commits y verificar el diff antes de cerrar. Úsalo siempre que vayas a hacer commit, crear una rama o preparar cambios para un PR.
---

# Skill: Git Workflow

## Instrucciones

1. Verifica la rama actual: `git branch --show-current`.
2. Si estás en `main`/`master`/`develop`, crea una rama nueva antes de tocar código:
   `git checkout -b feature/<scope>-<descripcion>` (ej. `feature/users-crud`).
3. Haz cambios incrementales con **commits atómicos** (un commit por cambio lógico).
4. Formato de commit (**Conventional Commits**): `<type>(<scope>): <descripción>`
   - `feat(users): add create user endpoint`
   - `fix(auth): resolve token expiration check`
   - `test(orders): add service unit tests`
   - `refactor(shared): extract validation util`
   - Tipos: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.
5. Antes de finalizar: `git status` y `git diff --staged` para verificar qué entra.

## Reglas

- Un commit por cambio lógico — nada de commits gigantes mezclando capas.
- **Nunca** commitees `.env`, secretos, `dist/` ni `node_modules/`.
- Verifica siempre `git status` antes de hacer commit.
- No uses `--no-verify` ni saltes hooks salvo que el usuario lo pida explícitamente.
- Crea commits o pushes **solo cuando el usuario lo solicite**.
