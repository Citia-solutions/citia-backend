# ADR-03: Login multi-tenant por tenantSlug

**Fecha:** 2026-06-22
**Estado:** Aceptado · ⚠️ **regla 4 superseded por [ADR-08](ADR-08.md)** (propuesto)

> **Nota.** [ADR-08](ADR-08.md) retoma la sub-opción de *subdominio* que este ADR dejó **aplazada** y
> mueve el tenant del **body** a la **URL**. Solo cambia la **regla 4** (transporte). Siguen
> plenamente vigentes: la unicidad compuesta `(tenant_id, email)`, el slug autogenerado (regla 2), el
> puerto `findBySlug` (regla 3) y el **401 genérico** (regla 5).

---

## Contexto

- **RF-00** requiere que los usuarios inicien sesión con credenciales válidas.
- **RNF-02** exige aislamiento multi-tenant: cada profesional accede únicamente a sus propios datos.
- Por decisión de registro (US-00a / ADR-01), el email **no es único globalmente**: la unicidad es compuesta `(tenant_id, email)`. El mismo email puede existir en dos tenants distintos.

Esto crea un problema para el login: un par `email + password` es **ambiguo** entre tenants. Si dos tenants tienen `admin@clinica.com`, el servidor no puede saber a cuál autenticar sin un discriminador de tenant.

Se evaluaron las siguientes opciones para resolver la ambigüedad:

| Opción | Notas |
|--------|-------|
| **A. Email único global** | Romper la unicidad compuesta y forzar email único en toda la plataforma. Permite login solo con email+password, pero rompe el modelo multi-tenant (un profesional no podría reusar su email en otra organización) y contradice US-00a/RNF-02. **Descartada.** |
| **B. `tenantSlug` en el body (ELEGIDA)** | El cliente envía `{ tenantSlug, email, password }`. El servidor resuelve el tenant por slug y luego busca el usuario dentro de ese tenant. Mantiene la unicidad compuesta intacta. |
| **C. Búsqueda cross-tenant** | Buscar el email en todos los tenants y autenticar si hay match único. Inseguro (enumera tenants/usuarios), ambiguo ante colisiones y costoso. **Descartada.** |

Dentro de la opción B se evaluó **cómo** transportar el tenant:

| Sub-opción | Notas |
|------------|-------|
| **Subdominio** (`clinica-sur.citia.app`) | Estándar SaaS elegante, pero exige infraestructura DNS/wildcard TLS y enrutamiento por host que el proyecto aún no tiene. Sobre-ingeniería para la fase actual. **Aplazada.** |
| **Slug en el body (ELEGIDA)** | Simple, sin dependencias de infraestructura. El frontend envía el slug en el formulario de login. Migrable a subdominio en el futuro reusando la misma columna `slug`. |

---

## Decisión

Se adopta el **login multi-tenant por `tenantSlug` enviado en el body** de la petición.

Reglas:

1. **Columna `tenants.slug`** `NOT NULL UNIQUE`, añadida con migración aditiva (`1750000001000-AddSlugToTenants`) que incluye backfill de las filas existentes.
2. **Slug autogenerado en el registro** (US-00a). `UsuariosService.registrar()` genera el slug a partir del nombre del tenant vía `slugify(nombreTenant)` (`tenant/domain/slug.ts`):
   - Normaliza NFKD para quitar acentos, pasa a minúsculas, reemplaza todo lo que no sea `[a-z0-9]` por `-`, y usa el fallback `'tenant'` si el resultado queda vacío.
   - Ante colisión, añade sufijo incremental `-2`, `-3`, ... verificando con `ITenantRepository.findBySlug`.
3. **Puerto** `ITenantRepository.findBySlug(slug)` para resolver el tenant en login.
4. **Body de login:** `{ tenantSlug, email, password }`. Flujo: `findBySlug(tenantSlug)` → `findByEmailAndTenant(email, tenant.id)` → `bcrypt.compare` → firma JWT.
5. **401 genérico** ante cualquier fallo (tenant inexistente / email inexistente / password incorrecta): mensaje "Credenciales inválidas". No se revela la causa, para no filtrar la existencia de tenants ni usuarios.
6. El `RegistroResponseDto` ahora incluye `nombreTenant` y `tenantSlug` para que el cliente conozca el slug a usar en login.

---

## Consecuencias

**Positivas:**
- Patrón SaaS multi-tenant estándar: el tenant es explícito y la unicidad compuesta `(tenant_id, email)` se mantiene intacta (coherente con RNF-02).
- El `slug` es estable, legible y URL-friendly: reutilizable a futuro como subdominio o segmento de path sin migración de datos.
- El 401 genérico evita la enumeración de tenants y usuarios.
- Sin dependencias de infraestructura DNS/TLS adicionales.

**Negativas / riesgos:**
- El frontend debe **conocer y enviar el slug** en el login (se entrega en el response del registro). Mitigación: documentado en el response del registro y en el doc de feature.
- Posibles colisiones de slug entre nombres de tenant similares. Mitigación: sufijo incremental verificado contra BD en el registro.
- El usuario debe recordar su tenant. Mitigación futura: opción de subdominio (sub-opción aplazada) o un selector de tenant en el frontend.

---

## Referencias

- ADR-01: Autenticación con Passport.js + JWT (el slug resuelve el tenant antes de firmar el JWT).
- RNF-02: aislamiento multi-tenant (cada profesional accede solo a sus datos).
- `tenant/domain/slug.ts` — función `slugify`.
- Migración `1750000001000-AddSlugToTenants`.
