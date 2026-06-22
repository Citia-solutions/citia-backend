# Módulo: usuario

Gestión de usuarios del sistema (profesionales de salud y admins).

## Estructura

```
src/modules/usuario/
├── domain/
│   ├── user.entity.ts              ← Entidad TypeORM, tabla `users`, enum UserRole
│   └── user.repository.ts          ← Puerto IUserRepository + token USER_REPOSITORY
├── infrastructure/
│   └── persistence/
│       └── typeorm-user.repository.ts  ← Adaptador TypeORM
├── application/
│   └── usuarios.service.ts         ← Caso de uso registerUser
├── presentation/
│   ├── usuarios.controller.ts      ← POST /usuarios
│   └── dto/
│       ├── create-user.dto.ts
│       └── user-response.dto.ts
└── usuarios.module.ts
```

## Endpoints

| Método | Ruta        | Handler              | Status |
|--------|-------------|----------------------|--------|
| POST   | `/usuarios` | `registerUser(dto)`  | 201    |

Prefijo global `/api` → ruta real: `POST /api/usuarios`.

## Convenciones locales

- El service inyecta `IUserRepository` vía token `USER_REPOSITORY`, nunca la clase concreta.
- El controller devuelve `UserResponseDto` (nunca la entidad cruda ni el `passwordHash`).
- El hash de contraseña se hace en el service con `bcrypt` (saltRounds: 10).
- Errores: `ConflictException` si el email ya existe.

## Pendientes

- Migración TypeORM para crear la tabla `users` en BD.
- Módulo de autenticación (login JWT) — tarea futura.
