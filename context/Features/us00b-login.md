# Feature: US-00b — Login (autenticación JWT multi-tenant)

**Epic:** 00 — Autenticación y registro  
**Historia:** US-00b  
**Estado:** ✅ Implementado (2026-06-22) · 25 unit · 8 e2e · 5 integration — todos verdes

---

## Qué hace este endpoint

`POST /api/auth/login` autentica a un usuario dentro de su tenant y devuelve un JWT.

Como el email **no es único globalmente** (unicidad compuesta `(tenant_id, email)`), el login
no puede basarse solo en email + password: sería ambiguo entre tenants. Por eso el body incluye
`tenantSlug`, que resuelve el tenant antes de validar las credenciales (ver ADR-03).

Cualquier fallo (tenant inexistente, email inexistente o password incorrecta) responde un
**401 genérico** "Credenciales inválidas", sin revelar la causa.

---

## Arquitectura (hexagonal)

```
src/modules/auth/
├── domain/
│   ├── token-signer.ts                    ← Abstract class ITokenSigner (puerto)
│   └── exceptions/
│       └── credenciales-invalidas.error.ts  ← CredencialesInvalidasError → 401
├── application/
│   └── auth.service.ts                    ← valida credenciales (bcrypt.compare) y firma JWT
├── infrastructure/
│   ├── jwt-token-signer.ts                ← JwtTokenSigner: adaptador de ITokenSigner (@nestjs/jwt)
│   ├── jwt.strategy.ts                    ← JwtStrategy (passport-jwt)
│   ├── jwt-auth.guard.ts                  ← JwtAuthGuard
│   └── jwt-payload.interface.ts           ← { sub, email, tenantId, rol }
├── presentation/
│   ├── auth.controller.ts                 ← POST /auth/login → 200
│   └── dto/
│       ├── login.dto.ts                   ← { tenantSlug, email, password }
│       └── login-response.dto.ts          ← { accessToken, usuario }
└── auth.module.ts                         ← exporta JwtModule, PassportModule, JwtAuthGuard, JwtStrategy
```

**Pureza hexagonal:** NO se usó `passport-local`. La validación de credenciales vive en
`AuthService` (`application`). Para firmar el JWT sin importar `@nestjs/jwt` en `application`,
se creó el puerto `ITokenSigner` (`domain/`) con adaptador `JwtTokenSigner` (`infrastructure/`),
coherente con ADR-02.

**Regla hexagonal verificada:** `grep -rE "from 'typeorm'|from '@nestjs'" src/modules/*/domain src/modules/*/application` → 0 coincidencias.

---

## Endpoint

| Método | Ruta              | Status | Body         |
|--------|-------------------|--------|--------------|
| POST   | `/api/auth/login` | 200 (`@HttpCode(200)`) | `LoginDto` |

**Request body:**
```json
{
  "tenantSlug": "clinica-sur",
  "email": "admin@clinica.com",
  "password": "minimo8chars"
}
```

**Response 200:**
```json
{
  "accessToken": "<jwt>",
  "usuario": {
    "id": "<uuid-usuario>",
    "email": "admin@clinica.com",
    "nombreCompleto": "Dra. Ana López",
    "rol": "ADMINISTRADOR",
    "tenantId": "<uuid-tenant>"
  }
}
```
El `passwordHash` nunca aparece en la respuesta.

**Errores:**
- `400` — validación del DTO
- `401` — credenciales inválidas (genérico: tenant inexistente / email inexistente / password incorrecta)

---

## Flujo de autenticación

1. `ITenantRepository.findBySlug(tenantSlug)` — resuelve el tenant.
2. `IUsuarioRepository.findByEmailAndTenant(email, tenant.id)` — busca el usuario dentro del tenant.
3. `bcrypt.compare(password, usuario.passwordHash)` — valida la contraseña.
4. Si todo es válido, `ITokenSigner.sign(payload)` firma el JWT.

Cualquier paso fallido lanza `CredencialesInvalidasError`, que el controller traduce a 401 genérico.

---

## JWT

- **Payload:** `{ sub (userId), email, tenantId, rol }`.
- **Algoritmo:** `HS256`.
- **Secreto:** `JWT_SECRET` (leído con `getOrThrow`).
- **Expiración:** `JWT_EXPIRES_IN`, default actual `1d` (desviación temporal documentada en ADR-01 — el objetivo `15m` se retoma con refresh tokens).
- **Guard:** `JwtAuthGuard` valida el token y deja `req.user = { userId, email, tenantId, rol }`.

---

## Decisiones de seguridad

- **`tenantSlug` en el body solo para login.** En requests autenticados el `tenantId` se extrae del JWT, nunca del body (RNF-02, ADR-01).
- **401 genérico** ante cualquier fallo: no se revela si el tenant o el email existen (evita enumeración).
- **`passwordHash` nunca** aparece en respuestas.
- **CORS** habilitado en `main.ts`: `app.enableCors({ origin: FRONTEND_URL ?? 'http://localhost:5173', credentials: true })`.

---

## Slug del tenant (prerequisito del login)

- Columna `tenants.slug` `NOT NULL UNIQUE`, añadida con migración aditiva `1750000001000-AddSlugToTenants` (con backfill de filas existentes).
- Autogenerado en el registro (`UsuariosService.registrar`) vía `slugify(nombreTenant)` (`tenant/domain/slug.ts`): NFKD para quitar acentos, lowercase, no-`[a-z0-9]` → `-`, fallback `'tenant'`. Ante colisión añade sufijo `-2`, `-3`, ... verificando con `findBySlug`.
- Puerto `ITenantRepository.findBySlug(slug)` añadido.
- `RegistroResponseDto` ahora incluye `nombreTenant` y `tenantSlug`.

Detalle completo en ADR-03.

---

## Variables de entorno nuevas (`.env`)

```
JWT_SECRET=<secreto>
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:5173
```

---

## ADRs relacionados

- ADR-01: Passport + JWT — implementado; validación en `application` vía `ITokenSigner`; default `JWT_EXPIRES_IN=1d` (desviación temporal).
- ADR-02: Código en español + arquitectura hexagonal (puerto como abstract class, sin imports de NestJS/TypeORM en `application`).
- ADR-03: Login multi-tenant por `tenantSlug` (columna `slug`, 401 genérico).

---

## Tests

| Suite          | Cantidad | Estado   |
|----------------|----------|----------|
| Unit           | 25       | ✅ verde  |
| e2e            | 8        | ✅ verde  |
| Integration    | 5        | ✅ verde  |

Migraciones (tablas + slug) aplicables vía `migration:run` / entrypoint Docker.

---

## Pendientes

1. **Refresh token rotation:** al implementarse, reducir `JWT_EXPIRES_IN` al objetivo `15m` (ADR-01).
2. **Revocación de tokens** (logout efectivo): blacklist en Redis o invalidación vía rotación.
3. **Login por subdominio** (sub-opción aplazada en ADR-03), reusando la columna `slug`.

---

## Deudas técnicas asociadas

- [DT-01](../Deudas/DT-01.md) — sin renovación ni revocación de sesión (por eso la caducidad es `1d` y no `15m`).
- [DT-02](../Deudas/DT-02.md) — el `rol` viaja en el token y nadie lo verifica.
- [DT-03](../Deudas/DT-03.md) — sin recuperación de contraseña.
- [DT-04](../Deudas/DT-04.md) — sin límite de intentos.
- [DT-05](../Deudas/DT-05.md) — el 401 genérico no es uniforme en el tiempo.

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
