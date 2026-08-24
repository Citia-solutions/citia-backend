# Feature: US-00a — Registro inicial (Tenant + Usuario)

**Epic:** 00 — Autenticación y registro  
**Historia:** US-00a  
**Estado:** ✅ Implementado (2026-06-22) · ✅ Atomicidad transaccional (2026-06-23, ADR-06) · ✅ Migración aplicable + tests de integración en verde
**Commits:** `ce7d99e` (tenant), `718fe1f` (refactor hexagonal), `2ee856f` (endpoint), `706f12f` (tests), `389eb81` (migración), `195431b`+`cfa35f3` (slug), `d4fa476`+`f573485` (transaccional)

---

## Qué hace este endpoint

`POST /api/usuarios` crea un Tenant y su primer Usuario ADMINISTRADOR en una **operación atómica**
(envuelta en una transacción — ver [Atomicidad transaccional](#atomicidad-transaccional-anti-tenant-huérfano)).
El `tenantId` lo genera el servidor al crear el Tenant — nunca llega del cliente (RNF-02).

---

## Arquitectura (hexagonal)

```
src/modules/
├── tenant/
│   ├── domain/
│   │   ├── tenant.entity.ts          ← Clase plana: Tenant, TipoTenant enum
│   │   └── tenant.repository.ts      ← Abstract class ITenantRepository
│   ├── infrastructure/persistence/
│   │   ├── tenant.orm-entity.ts      ← TypeORM @Entity('tenants')
│   │   └── typeorm-tenant.repository.ts  ← Adaptador + mapper
│   └── tenant.module.ts
└── usuario/
    ├── domain/
    │   ├── usuario.entity.ts         ← Clase plana: Usuario, RolUsuario enum
    │   └── usuario.repository.ts     ← Abstract class IUsuarioRepository
    ├── infrastructure/persistence/
    │   ├── usuario.orm-entity.ts     ← TypeORM @Entity('usuarios'), @Unique(['tenantId','email'])
    │   └── typeorm-usuario.repository.ts  ← Adaptador + mapper toDomain/toPersistence
    ├── application/
    │   └── usuarios.service.ts       ← registrar(): tx.run( slug → Tenant → email check → hash → Usuario )
    ├── presentation/
    │   ├── usuarios.controller.ts    ← POST /usuarios → 201
    │   └── dto/
    │       ├── registro-usuario.dto.ts   ← sin tenantId
    │       └── registro-response.dto.ts  ← incluye tenantId, nombreTenant, tenantSlug
    └── usuarios.module.ts            ← importa TenantModule + SharedModule

src/shared/                          ← infraestructura transversal (ADR-06)
├── application/transaction-runner.ts       ← Abstract class TransactionRunner + TransactionContext (opaco)
├── infrastructure/typeorm-transaction-runner.ts  ← Adaptador sobre dataSource.transaction()
└── shared.module.ts                        ← provee y exporta TransactionRunner
```

**Regla hexagonal verificada:** `grep -rE "from 'typeorm'|from '@nestjs'" src/modules/*/domain src/modules/*/application` → 0 coincidencias.

---

## Endpoint

| Método | Ruta            | Status | Body                        |
|--------|-----------------|--------|-----------------------------|
| POST   | `/api/usuarios` | 201    | `RegistroUsuarioDto`        |

**Request body:**
```json
{
  "nombreTenant": "Clínica Sur",
  "tipoTenant": "CLINICA",
  "email": "admin@clinica.com",
  "password": "minimo8chars",
  "nombreCompleto": "Dra. Ana López"
}
```
`tipoTenant` es opcional — default `INDEPENDIENTE`.

**Response 201:**
```json
{
  "id": "<uuid-usuario>",
  "email": "admin@clinica.com",
  "nombreCompleto": "Dra. Ana López",
  "rol": "ADMINISTRADOR",
  "tenantId": "<uuid-tenant>",
  "nombreTenant": "Clínica Sur",
  "tenantSlug": "clinica-sur",
  "creadoEn": "2026-06-22T..."
}
```
> `tenantSlug` se autogenera a partir de `nombreTenant` (slugify + sufijo `-2`, `-3`… ante colisión). Es el identificador que el frontend usará luego para el login (ver US-00b / ADR-03).

**Errores:**
- `400` — validación del DTO
- `409` — email duplicado en el tenant

---

## Decisiones de seguridad

- `tenantId` nunca llega del cliente. Se genera server-side al crear el Tenant (RNF-02).
- El primer usuario siempre es `ADMINISTRADOR`. El rol no es configurable desde el signup.
- `passwordHash` nunca aparece en ninguna respuesta.
- Unicidad: `(tenantId, email)` compuesta — mismo email en dos tenants distintos es válido.

---

## Atomicidad transaccional (anti-tenant-huérfano)

**Decisión completa en [ADR-06](../Decisions/ADR-06.md). Commits `d4fa476` + `f573485`.**

El registro inserta dos filas en secuencia (Tenant → Usuario). En la primera versión (2026-06-22)
esto corría **sin transacción**: si algo fallaba tras insertar el Tenant (email duplicado, error de
hash, fallo al guardar el usuario), el **Tenant quedaba huérfano** (sin usuario, ensuciando la
unicidad de `slug`). La atomicidad se añadió el 2026-06-23.

`registrar()` se envuelve en `TransactionRunner.run(...)`. Todo el flujo corre dentro de la
transacción; cualquier excepción hace **rollback completo** → cero huérfanos.

```
tx.run(async (tx) => {
  slug   = generarSlugUnico(nombreTenant, tx)   // verifica findBySlug dentro de la tx
  tenant = tenantRepository.guardar({...}, tx)
  if (usuarioRepository.findByEmailAndTenant(email, tenant.id, tx)) → EmailYaRegistradoError (409)
  hash   = bcrypt.hash(password, 10)
  usuario= usuarioRepository.guardar({..., rol: ADMINISTRADOR}, tx)
})  // throw en cualquier punto → ROLLBACK del INSERT del tenant
```

- **Puerto `TransactionRunner`** (`shared/application/`) con `TransactionContext = unknown`
  (**opaco**): `application` no conoce TypeORM (ADR-02). Adaptador `TypeOrmTransactionRunner`
  (`shared/infrastructure/`) sobre `dataSource.transaction()`.
- Los repos de tenant y usuario aceptan un `tx?` **opcional**: cuando viene, resuelven el
  repositorio desde el `EntityManager` transaccional. **Backward compatible** (siguen usables sin `tx`).
- **Verificado** por un test de integración que fuerza el fallo al guardar el usuario y comprueba
  que el Tenant no persiste (`registro-usuario.integration.spec.ts`).

---

## Esquema de BD

### Tabla `tenants`
| Columna    | Tipo     | Notas            |
|------------|----------|------------------|
| id         | uuid PK  | auto-generado    |
| nombre     | varchar  | not null         |
| slug       | varchar  | not null, **UNIQUE** — autogenerado (ADR-03) |
| tipo       | enum     | CLINICA/INDEPENDIENTE |
| plan       | varchar  | default 'free'   |
| creado_en  | timestamptz | @CreateDateColumn |

### Tabla `usuarios`
| Columna         | Tipo     | Notas                          |
|-----------------|----------|--------------------------------|
| id              | uuid PK  | auto-generado                  |
| email           | varchar  | not null, sin unique global    |
| password_hash   | varchar  | bcrypt saltRounds=10           |
| nombre_completo | varchar  | not null                       |
| rol             | enum     | PROFESIONAL/ADMINISTRADOR      |
| tenant_id       | varchar  | FK → tenants.id, not null      |
| creado_en       | timestamptz |                             |
| actualizado_en  | timestamptz |                             |

Constraints: `UNIQUE(tenant_id, email)`, `INDEX(tenant_id)`.

---

## ADRs relacionados
- ADR-00: TypeORM como ORM — `synchronize: false` en dev/prod
- ADR-01: Passport + JWT — tenantId del token, no del body (aplica en US-00b)
- ADR-02: Código en español + regla de dependencias hexagonal
- ADR-03: Login multi-tenant por `tenantSlug` — el `slug` del tenant se genera en este registro
- **ADR-06: Atomicidad transaccional — puerto `TransactionRunner` con contexto opaco (anti-huérfano)**

---

## Pendientes
1. ✅ **Migración:** `1750000000000-CreateTenantsAndUsuarios` (tablas) + `1750000001000-AddSlugToTenants` (columna slug). Aplicables con `npm run migration:run` o vía entrypoint Docker.
2. ✅ **Tests de integración:** en verde contra BD real (crear, leer, duplicado mismo tenant, mismo email distinto tenant, slugs únicos entre tenants homónimos).
3. ✅ **US-00b (login):** `POST /api/auth/login` → JWT con `sub` + `tenantId` — implementado (ver `us00b-login.md`).

---

## Deudas técnicas asociadas

- [DT-03](../Deudas/DT-03.md) — sin verificación de correo ni recuperación de contraseña.
- [DT-06](../Deudas/DT-06.md) — registro público sin freno: un correo puede fundar organizaciones ilimitadas.
- [DT-07](../Deudas/DT-07.md) — no existe alta de un segundo usuario; `CLINICA` es inalcanzable.
- [DT-09](../Deudas/DT-09.md) — la comprobación de correo duplicado es inalcanzable.

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
