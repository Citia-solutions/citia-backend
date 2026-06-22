## US-00 — Autenticación y registro

---

### US-00a — Registro inicial (signup)

**Historia:** Como profesional de la salud (o clínica) quiero registrarme en la plataforma para poder acceder a mis datos de forma aislada de otros tenants.

**Criterios de aceptación:**
- `POST /api/usuarios` crea un Tenant + un Usuario ADMINISTRADOR en una operación atómica
- El `tenantId` lo genera el servidor — nunca llega del cliente (RNF-02)
- El mismo email puede existir en dos tenants distintos (unicidad compuesta por tenant)
- El password se almacena hasheado con bcrypt — nunca en texto plano
- Respuesta 201 incluye `tenantId` (necesario hasta que haya JWT)
- Respuesta 409 si el email ya existe en ese tenant

**To Do:**
- [x] Entidad `Tenant` (dominio puro + ORM entity)
- [x] Entidad `Usuario` (dominio puro + ORM entity con FK tenantId)
- [x] Puerto `IUsuarioRepository` + adaptador TypeORM con mapper
- [x] Puerto `ITenantRepository` + adaptador TypeORM con mapper
- [x] `RegistroUsuarioDto` sin `tenantId` (campo generado server-side)
- [x] `UsuariosService.registrar()` — crea Tenant → Usuario atómicamente
- [x] `POST /api/usuarios` → 201 `RegistroResponseDto`
- [ ] Migración TypeORM: tablas `tenants` + `usuarios`
- [ ] Tests de integración contra BD real (crear, leer, duplicado por tenant, distinto tenant)

---

### US-00b — Login (autenticación JWT)

**Historia:** Como usuario registrado quiero iniciar sesión con mi email y contraseña para obtener un JWT que me permita acceder a los recursos de mi tenant.

**Criterios de aceptación:**
- `POST /api/auth/login` recibe `{ email, password }` y devuelve `{ accessToken }`
- El JWT contiene `sub` (userId) y `tenantId` como claims
- Requests autenticados extraen el `tenantId` del token — nunca del body (RNF-02)
- Contraseña incorrecta → 401 Unauthorized
- Usuario no encontrado → 401 (no revelar si el email existe)

**To Do:**
- [ ] `AuthModule` con `PassportModule` + `JwtModule` (ADR-01)
- [ ] `LocalStrategy` (passport-local) para validar credenciales
- [ ] `JwtStrategy` para validar tokens en requests subsiguientes
- [ ] `AuthGuard` global o por ruta
- [ ] `POST /api/auth/login` → `{ accessToken }`
- [ ] Tests unitarios de `AuthService` + tests e2e del flujo login → recurso protegido
