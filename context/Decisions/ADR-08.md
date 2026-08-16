# ADR-08: El tenant sale del body del login y pasa a la URL (puerto `TenantResolver`)

**Fecha:** 2026-08-16
**Estado:** Propuesto · **Sin implementar**
**Commits:** — (pendiente)
**Relación:** supersede **parcialmente** a [ADR-03](ADR-03.md) — solo su regla 4 (*transporte* del
tenant). El resto de ADR-03 (unicidad compuesta, slug autogenerado, 401 genérico) sigue vigente.

---

## Contexto

[ADR-03](ADR-03.md) resolvió la ambigüedad del login multi-tenant enviando `tenantSlug` **en el body**:

```
POST /api/auth/login  { tenantSlug, email, password }
```

Fue la decisión correcta para arrancar: cero infraestructura y mantiene intacta la unicidad
compuesta `(tenant_id, email)` exigida por RNF-02. Pero el propio ADR-03 anotó dos deudas en sus
consecuencias negativas:

> *"El usuario debe recordar su tenant."*
> *"El frontend debe conocer y enviar el slug en el login."*

Y dejó explícitamente aplazada la alternativa:

> *"**Subdominio** — estándar SaaS elegante, pero exige infraestructura DNS/wildcard TLS […]
> Sobre-ingeniería para la fase actual. **Aplazada.**"*
> *"[el slug es] migrable a subdominio en el futuro reusando la misma columna `slug`."*

Este ADR ejecuta esa migración aplazada. **No revierte ADR-03: continúa su plan.**

### Observación que acota el problema

El `tenantSlug` **solo interviene en el handshake de login**. Una vez autenticado, el `tenantId`
viaja firmado dentro del JWT y `JwtStrategy` lo deja en `req.user.tenantId` para todas las
peticiones siguientes:

```
login  →  findBySlug(slug)  →  usuario  →  JWT { sub, email, tenantId, rol }
                                                       ↑
resto de requests  →  JwtStrategy  →  req.user.tenantId ┘
```

Esa segunda mitad **ya es correcta y no se toca**. El cambio se limita a *por qué canal llega el
tenant en una única petición*, lo que hace la superficie mucho menor de lo que aparenta.

---

## Opciones evaluadas

| Opción | Infra | ¿Resuelve "recordar el tenant"? | Veredicto |
|--------|-------|----------------------------------|-----------|
| **A. Body** (actual, ADR-03) | ninguna | ❌ el usuario lo teclea | Punto de partida |
| **B. Header `X-Tenant-Slug`** | ninguna | ❌ el front igual debe conocerlo | Limpia el body y poco más. Útil solo como transporte interno |
| **C. Segmento de path** `/api/t/:slug/auth/login` | ninguna | ✅ vive en la URL, bookmarkeable | **Elegida para Fase 1** |
| **D. Subdominio** `clinica-demo.citia.cl` | DNS wildcard + TLS wildcard | ✅ estándar SaaS + branding | **Elegida para Fase 2** |
| **E. Email único global** | migración destructiva | ✅ | **Descartada** — rompe `UNIQUE(tenant_id,email)` y RNF-02. Ya descartada en ADR-03 |
| **F. Búsqueda cross-tenant** | ninguna | ✅ | **Descartada** — permite enumerar tenants/usuarios. Ya descartada en ADR-03 |

E y F se mantienen descartadas por las mismas razones de ADR-03: la unicidad compuesta es un pilar
del modelo multi-tenant, no un detalle de implementación.

---

## Decisión

### 1. Puerto `TenantResolver` para desacoplar el transporte del caso de uso

El error a evitar es cablear "de dónde sale el slug" dentro de `AuthService`: eso obligaría a
reescribir la capa `application` en cada fase. Se introduce un **puerto**, mismo patrón ya validado
con `TransactionRunner` (ADR-06) y coherente con ADR-02:

```ts
// src/modules/auth/domain/tenant-resolver.ts   (puerto — sin Nest, sin Express)
export abstract class TenantResolver {
  /** Devuelve el tenant de la peticion, o null si no se puede determinar. */
  abstract resolver(peticion: unknown): Promise<Tenant | null>;
}
```

Con adaptadores intercambiables en `auth/infrastructure/`:

| Adaptador | Lee de | Fase |
|-----------|--------|------|
| `PathTenantResolver` | segmento `:slug` de la ruta | 1 |
| `HeaderTenantResolver` | header `X-Tenant-Slug` | 1 (alternativa) |
| `SubdominioTenantResolver` | `Host` de la petición | 2 |

El adaptador activo se elige por configuración (`TENANT_TRANSPORT`) en `auth.module.ts` vía
`useFactory`, igual que ya se hace con `APP_TZ` en `CitaModule` (ADR-07).

Como en ADR-06, el parámetro es **opaco** (`unknown`) en el puerto: `application` no conoce Express
ni Nest; el cast vive dentro del adaptador.

### 2. `LoginDto` pierde `tenantSlug`

```ts
// antes                              // despues
{ tenantSlug, email, password }  →    { email, password }
```

`AuthService.login` recibe el tenant ya resuelto: `login(dto: LoginDto, tenant: Tenant)`. El
service deja de hacer `findBySlug` (lo hace el adaptador) y conserva el resto del flujo intacto:
`findByEmailAndTenant` → `bcrypt.compare` → firma del JWT.

### 3. El 401 genérico se mantiene — regla crítica

**Un slug inexistente debe responder exactamente igual que una password incorrecta:** `401
Credenciales inválidas`, sin distinción de causa ni de tiempo de respuesta apreciable.

Si al mover el tenant a la URL se responde `404` para un slug que no existe, se reintroduce
justamente la enumeración de tenants que la regla 5 de ADR-03 evita. **Este es el punto más fácil
de romper accidentalmente en la migración.**

### 4. Migración en dos fases

| | Fase 1 (cuando se aborde) | Fase 2 (cuando haya DNS) |
|---|---|---|
| **Transporte** | path (`/api/t/:slug/...`) o header | subdominio (`Host`) |
| **Infra nueva** | ninguna | DNS wildcard + TLS wildcard (Cloudflare) |
| **Cambio en backend** | introducir puerto + adaptador | cambiar el provider del adaptador |
| **Cambio en `application`** | firma de `login` | **ninguno** |
| **Cambio en BD / JWT** | **ninguno** | **ninguno** |

La Fase 1 ya entrega el beneficio de producto (el usuario no teclea el tenant: lo lleva la URL) sin
depender de infraestructura. La Fase 2 pasa a ser un cambio de una línea de configuración.

---

## Qué NO cambia

Conviene dejarlo explícito para dimensionar el riesgo:

- **Modelo de datos:** `tenants.slug` ya existe `NOT NULL UNIQUE` (migración `1750000001000`). **Sin
  migración nueva.**
- **Unicidad compuesta** `(tenant_id, email)`: intacta.
- **Payload del JWT** (`{ sub, email, tenantId, rol }`) y `JwtStrategy`: intactos.
- **Todos los endpoints ya protegidos** (`/api/citas/hoy`, etc.): intactos, siguen resolviendo el
  tenant desde el token.
- **Generación del slug en el registro** (`slugify` + sufijo incremental): intacta.
- `RegistroResponseDto` **ya devuelve `tenantSlug`**, así que el frontend puede redirigir al usuario
  a la URL de su tenant justo después del registro. La pieza ya está construida.

---

## Plan de ejecución (checklist para la Fase 1)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `auth/domain/tenant-resolver.ts` | **nuevo** — puerto abstracto |
| 2 | `auth/infrastructure/path-tenant-resolver.ts` | **nuevo** — adaptador (usa `ITenantRepository.findBySlug`, que ya existe) |
| 3 | `auth/presentation/dto/login.dto.ts` | quitar `tenantSlug` |
| 4 | `auth/application/auth.service.ts` | `login(dto, tenant)`; quitar el `findBySlug` interno |
| 5 | `auth/presentation/auth.controller.ts` | resolver el tenant y pasarlo al service; mapear "no resuelto" a **401**, no 404 |
| 6 | `auth/auth.module.ts` | proveer `TenantResolver` con `useFactory` según `TENANT_TRANSPORT` |
| 7 | `main.ts` | **CORS dinámico** (ver riesgos) |
| 8 | `auth.service.spec.ts`, `auth.controller.spec.ts` | ajustar a la nueva firma |
| 9 | `test/auth-login.e2e-spec.ts` | nueva forma de la petición + caso "slug inexistente ⇒ 401" |
| 10 | `.env.example` | `TENANT_TRANSPORT` |
| 11 | `context/Features/us00b-login.md` | actualizar contrato del endpoint |
| 12 | `src/database/seed.ts` | actualizar el mensaje final de credenciales demo (hoy imprime `tenantSlug` para el body) |

Frontend (fuera de este repo): rutear `/t/:slug/login` y derivar el slug de la URL.

---

## Consecuencias

**Positivas:**
- El usuario deja de teclear/recordar su tenant: lo lleva la URL (bookmark).
- El transporte del tenant queda **intercambiable por configuración**; migrar a subdominio no toca
  `application`, ni la BD, ni el JWT.
- Prepara el terreno para branding por cliente (Fase 2), habitual en SaaS de salud.
- Reutiliza el patrón de puerto+adaptador ya validado en el proyecto (ADR-02, ADR-06): consistencia
  arquitectónica, sin conceptos nuevos que aprender.

**Negativas / riesgos:**
- **CORS deja de ser un origen fijo.** Hoy `main.ts` usa un único `FRONTEND_URL`. Con subdominios el
  origen varía por tenant → hay que pasar a una función validadora (p. ej. `*.citia.cl`). Es el
  cambio **menos obvio y el que más puede romper en producción**; verificar antes de desplegar.
- **Riesgo de reintroducir enumeración de tenants** si "slug no encontrado" responde distinto de
  "credenciales inválidas" (ver decisión 3).
- **Fase 2 añade dependencias de infraestructura**: DNS wildcard y certificado wildcard. Cloudflare
  (ya en el stack para TLS) lo soporta, pero es un paso de despliegue nuevo.
- **Dev local con subdominios**: `*.localhost` funciona en navegadores modernos sin tocar `hosts`,
  pero conviene confirmarlo antes de comprometerse con la Fase 2.
- Rompe el contrato actual del endpoint de login → el frontend debe migrar en el mismo release
  (hoy no hay clientes en producción, así que el costo es bajo: **cuanto antes se haga, más barato**).

---

## Referencias

- [ADR-03](ADR-03.md): login multi-tenant por `tenantSlug` — este ADR supersede solo su regla 4
  (transporte); mantiene vigentes la unicidad compuesta, el slug autogenerado y el 401 genérico.
- [ADR-01](ADR-01.md): Passport + JWT — el `tenantId` viaja en el token; no se altera.
- [ADR-02](ADR-02.md): español + hexagonal — el puerto vive en `domain/`, el adaptador en
  `infrastructure/`.
- [ADR-06](ADR-06.md): `TransactionRunner` — patrón de puerto con contexto opaco que aquí se replica.
- [ADR-07](ADR-07.md): `APP_TZ` inyectada con `useFactory` — patrón de selección por configuración.
- [us00b-login](../Features/us00b-login.md): feature del login (a actualizar al implementar).
- `src/modules/tenant/domain/tenant.repository.ts` — `findBySlug` ya existe, se reutiliza tal cual.
- Migración `1750000001000-AddSlugToTenants` — la columna `slug` ya está en producción.
