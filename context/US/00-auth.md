## US-00 — Autenticación y registro

---

### US-00a — Registro inicial (signup)

**Historia:** Como profesional de la salud (o clínica) quiero registrarme en la plataforma para poder acceder a mis datos de forma aislada de otros tenants.

**Criterios de aceptación:**
- `POST /api/usuarios` crea un Tenant + un Usuario ADMINISTRADOR en una operación atómica
- El `tenantId` lo genera el servidor — nunca llega del cliente (RNF-02)
- El mismo email puede existir en dos tenants distintos (unicidad compuesta por tenant)
- El password se almacena hasheado con bcrypt — nunca en texto plano
- Respuesta 201 incluye `tenantId`, `nombreTenant` y `tenantSlug` (el `tenantSlug` lo necesita el frontend para el login — ver US-00b)
- Respuesta 409 si el email ya existe en ese tenant

**To Do:**
- [x] Entidad `Tenant` (dominio puro + ORM entity)
- [x] Entidad `Usuario` (dominio puro + ORM entity con FK tenantId)
- [x] Puerto `IUsuarioRepository` + adaptador TypeORM con mapper
- [x] Puerto `ITenantRepository` + adaptador TypeORM con mapper
- [x] `RegistroUsuarioDto` sin `tenantId` (campo generado server-side)
- [x] `UsuariosService.registrar()` — crea Tenant → Usuario atómicamente; genera `slug` vía `slugify(nombreTenant)` con sufijo ante colisión
- [x] Atomicidad real vía puerto `TransactionRunner` (rollback anti-tenant-huérfano) — ADR-06
- [x] `POST /api/usuarios` → 201 `RegistroResponseDto` (incluye `nombreTenant` y `tenantSlug`)
- [x] Migración TypeORM: tablas `tenants` + `usuarios` (+ migración aditiva `AddSlugToTenants` con backfill)
- [x] Tests de integración contra BD real (crear, leer, duplicado por tenant, distinto tenant)

---

### US-00b — Login (autenticación JWT)

**Historia:** Como usuario registrado quiero iniciar sesión con mi tenant, email y contraseña para obtener un JWT que me permita acceder a los recursos de mi tenant.

**Criterios de aceptación:**
- `POST /api/auth/login` (`@HttpCode(200)`) recibe `{ tenantSlug, email, password }` y devuelve `{ accessToken, usuario }` (el `tenantSlug` es necesario porque el email no es único globalmente — ver ADR-03)
- La respuesta `usuario` incluye `{ id, email, nombreCompleto, rol, tenantId }`; nunca expone `passwordHash`
- El JWT contiene `sub` (userId), `email`, `tenantId` y `rol` como claims (HS256)
- Requests autenticados extraen el `tenantId` del token — nunca del body (RNF-02)
- Cualquier fallo (tenant inexistente / email inexistente / password incorrecta) → **401 genérico** "Credenciales inválidas" (no revela la causa)

**To Do:**
- [x] `AuthModule` con `PassportModule` + `JwtModule` (ADR-01); exporta `JwtModule`, `PassportModule`, `JwtAuthGuard`, `JwtStrategy`
- [x] Validación de credenciales en `AuthService` con `bcrypt.compare` — **NO** se usó `LocalStrategy` (pureza hexagonal, ADR-02)
- [x] Puerto `ITokenSigner` (`auth/domain/`) + adaptador `JwtTokenSigner` (`auth/infrastructure/`) para firmar el JWT sin acoplar `application` a `@nestjs/jwt`
- [x] `JwtStrategy` para validar tokens en requests subsiguientes (deja `req.user = { userId, email, tenantId, rol }`)
- [x] `JwtAuthGuard` por ruta
- [x] `POST /api/auth/login` → `{ accessToken, usuario }`; resuelve el tenant por `tenantSlug` (`findBySlug` → `findByEmailAndTenant`); 401 genérico ante fallo
- [x] Tests unitarios de `AuthService` + tests e2e del flujo login → recurso protegido
