# Módulo: usuario

Gestión de usuarios del sistema (profesionales de salud y admins). Multi-tenant: el email es único por tenant, no globalmente.

## Estructura

```
src/modules/usuario/
├── domain/
│   ├── usuario.entity.ts       ← Clase plana TS, enum RolUsuario, getter/setter passwordHash
│   └── usuario.repository.ts   ← Puerto IUsuarioRepository (abstract class)
├── infrastructure/
│   └── persistence/
│       ├── usuario.orm-entity.ts         ← Entidad TypeORM tabla `usuarios`, FK tenant_id
│       └── typeorm-usuario.repository.ts ← Adaptador TypeORM con mappers toDomain/toPersistence
├── application/
│   └── usuarios.service.ts     ← Caso de uso registerUser
├── presentation/
│   ├── usuarios.controller.ts  ← POST /usuarios
│   └── dto/
│       ├── create-user.dto.ts  ← email, password, nombreCompleto, tenantId, rol?
│       └── user-response.dto.ts
└── usuarios.module.ts
```

## Endpoints

| Método | Ruta        | Handler              | Status |
|--------|-------------|----------------------|--------|
| POST   | `/usuarios` | `registerUser(dto)`  | 201    |

Prefijo global `/api` → ruta real: `POST /api/usuarios`.

## Convenciones locales

- El service inyecta `IUsuarioRepository` directamente (abstract class como token NestJS). No usar tokens string.
- El controller devuelve `UserResponseDto` (nunca la entidad cruda ni el `passwordHash`).
- El hash de contraseña se hace en el service con `bcrypt` (saltRounds: 10).
- Errores: el service lanza `EmailYaRegistradoError` (dominio puro, `domain/exceptions/`); el controller la mapea a `ConflictException` HTTP 409.
- Unicidad compuesta: `(tenantId, email)` — un email puede existir en distintos tenants.
- FK `tenant_id` referencia tabla `tenants`.

## Campos de UsuarioOrmEntity

| Columna DB       | Propiedad ORM    | Tipo         | Notas                     |
|------------------|------------------|--------------|---------------------------|
| id               | id               | UUID PK      | auto-generado             |
| email            | email            | varchar      | no unique global          |
| password_hash    | passwordHash     | varchar      |                           |
| nombre_completo  | nombreCompleto   | varchar      |                           |
| rol              | rol              | enum         | default PROFESIONAL       |
| tenant_id        | tenantId         | varchar FK   | referencia tenants.id     |
| creado_en        | creadoEn         | timestamptz  | @CreateDateColumn         |
| actualizado_en   | actualizadoEn    | timestamptz  | @UpdateDateColumn         |

## Contratos IUsuarioRepository

```typescript
abstract findByEmailAndTenant(email: string, tenantId: string): Promise<Usuario | null>;
abstract guardar(usuario: Partial<Usuario>): Promise<Usuario>;
```

## Pendientes

- Migración TypeORM para crear la tabla `usuarios` (con tabla `tenants` como prerequisito).
- Módulo de autenticación (login JWT) — tarea futura.
