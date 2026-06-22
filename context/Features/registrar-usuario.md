# Feature: Registrar usuario en la base de datos

**Epic:** 06 — Dashboard de citas del día  
**Tarea:** Registrar un usuario en la base de datos  
**Estado:** ✅ Completado (2026-06-22)

---

## Qué se implementó

Endpoint `POST /api/usuarios` que registra un nuevo profesional de salud en la BD PostgreSQL, devolviendo sus datos sin exponer el hash de contraseña.

---

## Arquitectura (hexagonal)

```
src/modules/usuario/
├── domain/
│   ├── user.entity.ts              ← Entidad TypeORM (tabla `users`)
│   └── user.repository.ts          ← Puerto IUserRepository + token USER_REPOSITORY
├── infrastructure/
│   └── persistence/
│       └── typeorm-user.repository.ts  ← Adaptador TypeORM
├── application/
│   └── usuarios.service.ts         ← Caso de uso: registerUser
├── presentation/
│   ├── usuarios.controller.ts      ← POST /usuarios → 201
│   └── dto/
│       ├── create-user.dto.ts      ← Input validado con class-validator
│       └── user-response.dto.ts    ← Output sin passwordHash
└── usuarios.module.ts
```

---

## Endpoint

| Método | Ruta            | Status | Descripción               |
|--------|-----------------|--------|---------------------------|
| POST   | `/api/usuarios` | 201    | Registra un nuevo usuario |

**Body (JSON):**
```json
{
  "email": "profesional@ejemplo.com",
  "password": "minimo8chars",
  "fullName": "Dr. Juan Pérez",
  "role": "PROFESSIONAL"
}
```

**Response 201:**
```json
{
  "id": "uuid-generado",
  "email": "profesional@ejemplo.com",
  "fullName": "Dr. Juan Pérez",
  "role": "PROFESSIONAL",
  "createdAt": "2026-06-22T..."
}
```

**Errores:**
- `400 BadRequest` — validación del DTO falla (email inválido, password < 8 chars, etc.)
- `409 Conflict` — el email ya está registrado

---

## Entidad `User` (tabla `users`)

| Campo TS       | Columna BD      | Tipo        | Notas                          |
|----------------|-----------------|-------------|--------------------------------|
| `id`           | `id`            | uuid PK     | auto-generado                  |
| `email`        | `email`         | varchar     | único, not null                |
| `passwordHash` | `password_hash` | varchar     | hash bcrypt (saltRounds: 10)   |
| `fullName`     | `full_name`     | varchar     | not null                       |
| `role`         | `role`          | enum        | PROFESSIONAL \| ADMIN          |
| `createdAt`    | `created_at`    | timestamptz | auto                           |
| `updatedAt`    | `updated_at`    | timestamptz | auto                           |

---

## Infraestructura configurada (backend-agent)

- `@nestjs/config` + `ConfigModule.forRoot({ isGlobal: true })`
- `TypeOrmModule.forRootAsync` — lee `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- `ValidationPipe` global (`whitelist: true`, `transform: true`)
- Prefijo global `/api`
- Dependencias nuevas: `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/config`, `class-validator`, `class-transformer`, `bcrypt`

---

## Variables de entorno requeridas (`.env`)

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=citia_dev
```

---

## Tests

| Suite                        | Tests | Estado   | Coverage service |
|------------------------------|-------|----------|-----------------|
| `usuarios.service.spec.ts`   | 3     | ✅ verde  | 100%            |
| `usuarios.controller.spec.ts`| 3     | ✅ verde  | 100%            |

---

## Pendientes

- **Migración:** La tabla `users` aún no existe en la BD. Hay que generar y aplicar la migración TypeORM antes de usar el endpoint en un entorno real.
- **Auth/Login:** El hash se almacena pero el endpoint de login (JWT) es una tarea futura.
