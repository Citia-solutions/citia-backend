# ADR-01: Autenticación con Passport.js + JWT

**Fecha:** 2026-06-22
**Estado:** Pendiente de implementar (próximo epic: auth)

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
4. Los tokens se firman con clave secreta gestionada por variable de entorno (`JWT_SECRET`); el algoritmo es `HS256` por defecto, revisable a `RS256` si se introduce un servidor de autorización externo.
5. La expiración del access token se configura via `JWT_EXPIRES_IN` (valor por defecto: `15m`).

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

Este ADR queda aprobado en diseño. La implementación se delega al epic `feature/auth-jwt` con la siguiente secuencia:

1. `database-agent`: entidad `Usuario` con campos de autenticación.
2. `api-agent`: módulo `auth` con `AuthController`, `AuthService`, `JwtStrategy`, `JwtAuthGuard`.
3. `testing-agent`: tests unitarios de `AuthService` y tests e2e del flujo login.

---

## Referencias

- `@nestjs/passport`: https://docs.nestjs.com/security/authentication
- `passport-jwt`: https://www.passportjs.org/packages/passport-jwt/
