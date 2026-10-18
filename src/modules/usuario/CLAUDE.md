# Módulo: usuario

Registro público de una organización con su primer usuario (US-00a). `POST /api/usuarios` crea, en una sola transacción, el **tenant** (con slug autogenerado y único) y su **usuario ADMINISTRADOR**. Multi-tenant: el email es único por tenant, no globalmente. El login vive en el módulo `auth`.

## Estructura

```
src/modules/usuario/
├── domain/
│   ├── usuario.entity.ts       ← Clase plana TS, enum RolUsuario (PROFESIONAL | ADMINISTRADOR)
│   ├── usuario.repository.ts   ← Puerto IUsuarioRepository (abstract class)
│   └── exceptions/
│       └── email-ya-registrado.error.ts
├── infrastructure/
│   └── persistence/
│       ├── usuario.orm-entity.ts         ← Entidad TypeORM tabla `usuarios`, FK tenant_id
│       └── typeorm-usuario.repository.ts ← Adaptador TypeORM con mappers toDomain/toPersistence
├── application/
│   └── usuarios.service.ts     ← Caso de uso registrar(): tenant + ADMINISTRADOR en un tx
├── presentation/
│   ├── usuarios.controller.ts  ← POST /usuarios (@LimitarTasa('registro'): 5 por hora por IP)
│   └── dto/
│       ├── registro-usuario.dto.ts   ← nombreTenant, tipoTenant?, email, password (≥ 8), nombreCompleto
│       └── registro-response.dto.ts  ← id, email, nombreCompleto, rol, tenantId, nombreTenant, tenantSlug, creadoEn
├── integration/
│   └── registro-usuario.integration.spec.ts ← atomicidad contra Postgres (ADR-06)
└── usuarios.module.ts          ← UsuariosService con useFactory (repo de usuario, de tenant y TransactionRunner)
```

## Endpoints

| Método | Ruta        | Handler              | Status |
|--------|-------------|----------------------|--------|
| POST   | `/usuarios` | `registrar(dto)`     | 201 · 409 si el email ya existe en el tenant · 429 al pasarse del límite |

Prefijo global `/api` → ruta real: `POST /api/usuarios`.

## Convenciones locales

- `UsuariosService` es una clase plana (sin `@Injectable`); el módulo la arma con `useFactory` e inyecta `IUsuarioRepository`, `ITenantRepository` y `TransactionRunner` (abstract classes como token NestJS). No usar tokens string.
- El registro es **atómico** (ADR-06): genera el slug único del tenant (`slugify` + sufijo `-2`, `-3`… si existe), guarda el tenant (tipo `INDEPENDIENTE` por defecto) y el usuario con rol `ADMINISTRADOR` dentro del mismo `tx.run`.
- El controller devuelve `RegistroResponseDto` (nunca la entidad cruda ni el `passwordHash`).
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
| tenant_id        | tenantId         | UUID FK      | referencia tenants.id     |
| creado_en        | creadoEn         | timestamptz  | @CreateDateColumn (la entidad no declara el tipo: DT-46) |
| actualizado_en   | actualizadoEn    | timestamptz  | @UpdateDateColumn (ídem) |

## Contratos IUsuarioRepository

```typescript
abstract findByEmailAndTenant(email: string, tenantId: string, tx?: TransactionContext): Promise<Usuario | null>;
abstract guardar(usuario: Partial<Usuario>, tx?: TransactionContext): Promise<Usuario>;
```

## Pendientes

- ~~Migración TypeORM para crear la tabla `usuarios`~~ → hecha: `1750000000000-CreateTenantsAndUsuarios`.
- ~~Módulo de autenticación (login JWT)~~ → hecho: módulo `auth` (`POST /api/auth/login`).
- El frontend no consume `POST /api/usuarios` (DT-29); verificación de correo y defensas del registro que no son de tasa: DT-03 y DT-06.
