# ADR-01: Autenticación con Passport.js + JWT

**Fecha:** 2026-06-22
**Estado:** Aceptado · Implementado (2026-06-22)

---

## Contexto

- **RF-00** requiere que los usuarios puedan iniciar sesión con credenciales propias.
- **RNF-02** exige que cada profesional acceda únicamente a sus propios datos (aislamiento multi-tenant).
- El sistema debe ser stateless para facilitar el escalado horizontal y la integración con el frontend Vue desacoplado.

Se evaluaron las siguientes opciones:

| Opción                        | Notas                                                              |
|-------------------------------|--------------------------------------------------------------------|
| Passport.js + JWT (elegida)   | Stateless, ecosistema maduro en NestJS, flexible para multi-tenant |
| Sesiones con express-session  | Stateful, requiere store compartido (Redis), mayor complejidad     |
| Auth0 / servicio externo      | Dependencia de tercero, coste, menor control sobre claims          |

---

## Decisión

Se adopta **`@nestjs/passport` + `passport-jwt` + `@nestjs/jwt`**.

Reglas de implementación:

1. El payload del token JWT contiene obligatoriamente los claims `sub` (userId) y `tenantId`.
2. **El `tenantId` nunca llega del cliente en requests autenticados.** Se extrae exclusivamente del JWT en el guard (`JwtAuthGuard`). Ningún controller ni service acepta `tenantId` como parámetro de entrada en rutas protegidas.
3. El guard inyecta el `tenantId` en el objeto `request.user` para que los servicios lo consuman sin exponer la lógica de extracción.
4. Los tokens se firman con clave secreta gestionada por variable de entorno (`JWT_SECRET`, leída con `getOrThrow`); el algoritmo es `HS256` por defecto, revisable a `RS256` si se introduce un servidor de autorización externo.
5. La expiración del access token se configura via `JWT_EXPIRES_IN`.

---

## Notas de implementación (2026-06-22)

- **Validación de credenciales en `application`, sin passport-local.** A diferencia de lo que sugería la secuencia inicial, NO se usó `LocalStrategy`. La validación (`bcrypt.compare`) vive en `AuthService` (capa `application`), coherente con la pureza hexagonal de ADR-02. Para firmar el JWT sin importar `@nestjs/jwt` en `application`, se introdujo el puerto `ITokenSigner` (`auth/domain/token-signer.ts`) con adaptador `JwtTokenSigner` (`auth/infrastructure/jwt-token-signer.ts`). El error de dominio `CredencialesInvalidasError` se traduce a 401 en el controller.
- **Resolución del tenant en login por `tenantSlug`.** Como el email no es único globalmente (unicidad compuesta `(tenant_id, email)`), el login recibe `{ tenantSlug, email, password }` y resuelve el tenant por slug antes de validar. Ver ADR-03.
- **401 genérico.** Cualquier fallo (tenant/email inexistente o password incorrecta) responde 401 "Credenciales inválidas", sin revelar la causa.
- **CORS habilitado** en `main.ts`: `app.enableCors({ origin: FRONTEND_URL ?? 'http://localhost:5173', credentials: true })`.
- **`AuthModule`** exporta `JwtModule`, `PassportModule`, `JwtAuthGuard` y `JwtStrategy`; el guard deja `req.user = { userId, email, tenantId, rol }`.

### Desviación consciente y temporal: `JWT_EXPIRES_IN` por defecto `1d`

El ADR fijaba un default de `15m`. La implementación actual usa **`1d`** de forma pragmática **porque aún no existe refresh token**: un access token de 15m sin mecanismo de refresh deslogearía al usuario constantemente, degradando la experiencia.

Es una desviación **consciente y temporal**. El objetivo `15m` se retomará cuando se implemente **refresh token rotation**; en ese momento se reducirá el default del access token y la sesión se sostendrá con el refresh token.

---

## Consecuencias

**Positivas:**
- Stateless: cada request es autosuficiente, sin consultas a store de sesión.
- Escalable horizontalmente sin sesiones compartidas.
- Multi-tenant seguro: el `tenantId` queda sellado en el token, firmado por el servidor, no manipulable por el cliente.
- Compatible con el stack NestJS (guards, decoradores, módulos de Passport ya probados).

**Negativas / pendientes:**
- Sin mecanismo de revocación inmediata de tokens (logout no invalida el JWT hasta que expira). Mitigación futura: blacklist en Redis o refresh token rotation.
- Refresh token aún no diseñado ni implementado. Se define en el epic de auth.
- Si `JWT_SECRET` se filtra, todos los tokens activos quedan comprometidos. Mitigación: rotación de secreto + expiración corta.

---

## Estado y próximos pasos

La secuencia de implementación **ya se completó** (2026-06-22):

1. ✅ `database-agent`: entidad `Usuario` con campos de autenticación + columna `tenants.slug` (migración aditiva con backfill, ver ADR-03).
2. ✅ `api-agent`: módulo `auth` con `AuthController`, `AuthService`, `JwtStrategy`, `JwtAuthGuard` y el puerto `ITokenSigner` (en vez de `LocalStrategy`).
3. ✅ `testing-agent`: 25 unit, 8 e2e, 5 integration — todos verdes.

Próximos pasos pendientes:

- **Refresh token rotation**: una vez implementado, reducir `JWT_EXPIRES_IN` al objetivo `15m`.
- **Revocación de tokens** (logout efectivo): blacklist en Redis o invalidación vía rotación.

---

## Referencias

- ADR-02: Código en español + arquitectura hexagonal (puerto `ITokenSigner`, validación en `application`).
- ADR-03: Login multi-tenant por `tenantSlug` (resolución del tenant antes de firmar el JWT).
- RNF-02: aislamiento multi-tenant.
- `@nestjs/passport`: https://docs.nestjs.com/security/authentication
- `passport-jwt`: https://www.passportjs.org/packages/passport-jwt/

---

## Deudas técnicas asociadas

- [DT-01](../Deudas/DT-01.md) — sin renovación ni revocación de sesión (nace de la desviación consciente de `JWT_EXPIRES_IN`).
- [DT-02](../Deudas/DT-02.md) — el `rol` que emite la regla 3 no lo verifica ningún guard.

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
