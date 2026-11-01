# ADR-15: Cuenta del profesional (US-10, RF-04) — perfil editable, corte de sesiones al cambiar la contraseña, suscripción en lectura y mensajes a soporte con su propio envío

> **Fase:** [Fase 7 — US-10](../Fases/fase-7-us10-perfil.md) · **Feature:** [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md) · **Plan:** [US-10](../US/10-perfil-cuenta.md) · **Relacionado:** [ADR-01](../Decisions/ADR-01.md), [ADR-02](../Decisions/ADR-02.md), [ADR-03](../Decisions/ADR-03.md), [ADR-06](../Decisions/ADR-06.md), [ADR-08](../Decisions/ADR-08.md), [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [DT-01](../Deudas/DT-01.md), [DT-02](../Deudas/DT-02.md), [DT-03](../Deudas/DT-03.md), [DT-26](../Deudas/DT-26.md), [DT-36](../Deudas/DT-36.md), [DT-46](../Deudas/DT-46.md), [DT-52](../Deudas/DT-52.md), [DT-57](../Deudas/DT-57.md), [DT-58](../Deudas/DT-58.md), [DT-59](../Deudas/DT-59.md), [DT-60](../Deudas/DT-60.md), [DT-61](../Deudas/DT-61.md), [Q7](../PREGUNTAS-ABIERTAS.md#q7--renovación-y-revocación-de-sesión-bloqueado-hasta-que-el-arquitecto-defina-el-requisito), [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free), [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte), [Cumplimiento](../Cumplimiento/README.md)

**Fecha:** 2026-10-31 (propuesto y aceptado) · 2026-11-01 (implementado y en producción)
**Estado:** **Aceptado** (2026-10-31) · **implementado y en producción (2026-11-01)**: release a `main` con el
[PR #15](https://github.com/Citia-solutions/citia-backend/pull/15) (`cd659c1`); a `develop` llegó por fast-forward, sin PR.
El cierre queda pendiente de las pruebas manuales y de [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free)
y [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) ([guía de la fase](../Fases/fase-7-us10-perfil.md#release-a-producción-2026-11-01)).
Cómo quedó: [Notas de implementación](#notas-de-implementación-2026-11-01) y la feature
[us10-perfil-cuenta](../Features/us10-perfil-cuenta.md). Las decisiones de producto (P1 a P8) las tomó el
usuario (arquitecto y dueño del producto) el 2026-10-31 y **no se reabren**; el diseño técnico de este ADR lo aprobó
ese mismo día. Lo que queda por decidir está en [Preguntas abiertas](#preguntas-abiertas): **sin respuesta al
2026-11-01**, el código usa sus valores provisionales.
*Antes:* **Aceptado** · implementado (2026-11-01), en `develop` (staging) con el release a `main` abierto · *antes:*
**Aceptado** (2026-10-31) · en construcción · *antes:* **Propuesto** (2026-10-31).
**Historia:** US-10 — plan y contrato en [US/10-perfil-cuenta.md](../US/10-perfil-cuenta.md)
**Relación:** **cierra la parte de revocación** de [DT-01](../Deudas/DT-01.md) que corta las demás sesiones al
cambiar la contraseña y deja fuera a un usuario borrado (en diseño el 2026-10-31; **implementada y en producción el
2026-11-01**); la renovación sigue abierta · **extiende**
[ADR-01](ADR-01.md): la estrategia JWT pasa a consultar la base en cada petición autenticada · **usa** el planificador
de [ADR-12](ADR-12.md) y su patrón "fila de trabajo + job" (§4, regla 4) para el correo a soporte, **sin** un
suscriptor del outbox · **reutiliza** el puerto `CanalMensajeria` de [ADR-13 §8](ADR-13.md) sin importar
`RecordatorioModule` (§1 se respeta; el acoplamiento por archivo queda en [DT-59](../Deudas/DT-59.md)) · **replica** la
atomicidad de [ADR-06](ADR-06.md) y los puertos de [ADR-02](ADR-02.md) · **respeta** el slug inmutable de
[ADR-03](ADR-03.md) y deja que el frontend arme la URL pública ([ADR-08](ADR-08.md)) · **estrena** una comprobación de
rol en una sola ruta ([DT-02](../Deudas/DT-02.md)) · **deja fuera** la recuperación de contraseña
([DT-03](../Deudas/DT-03.md), decisión P6).

---

## Contexto

### Decisiones de producto de partida (usuario, 2026-10-31)

Este ADR no reabre ninguna; las convierte en diseño.

| # | Decisión |
|---|---|
| P1 | **a.** Se agrega `especialidad`, texto libre opcional. **Sin foto**: el frontend muestra un avatar con iniciales; la foto queda como deuda ([DT-57](../Deudas/DT-57.md)) |
| P2 | **a.** El correo es **solo lectura** (es la credencial del login y no está verificado, [DT-03](../Deudas/DT-03.md)). Editables: `nombreCompleto` y `especialidad` |
| P3 | **a.** El perfil muestra el nombre de la clínica y su enlace público **en lectura**. El slug nunca se edita. El nombre editable queda como deuda ([DT-58](../Deudas/DT-58.md)) |
| P4 | **a, solo ADMINISTRADOR.** La suscripción es lectura de lo que hay: plan con nombre legible, fecha de alta (`tenant.creadoEn`), renovación y método de pago en `null` y el texto "sin cobro durante el piloto". Sin tabla `suscripciones`. Un PROFESIONAL recibe 403 |
| P5 | **b.** Cambio de contraseña con **revocación mínima**: columna `usuarios.sesiones_validas_desde`; los tokens con `iat` anterior dejan de valer y la sesión actual recibe un token nuevo. Contraseña actual obligatoria, nueva ≥ 8 (como el registro), distinta de la actual, límite de tasa. Sin correo de aviso |
| P6 | **a.** Recuperar la contraseña olvidada **queda fuera** (sigue en [DT-03](../Deudas/DT-03.md)), a decidir con el P1 de [Cumplimiento](../Cumplimiento/README.md) antes de la primera clínica real |
| P7 | **a.** Soporte guarda el mensaje en `mensajes_soporte` **y** lo envía por correo a una casilla configurable por variable de entorno (la dirección, sin dar: [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)). Límite de tasa, mensaje ≤ 2000 caracteres y aviso en el frontend de no incluir datos de pacientes |
| P8 | **a.** `usuario` crece con `GET/PATCH /api/usuarios/me` y `PUT /api/usuarios/me/contrasena`; `tenant` expone la suscripción; `soporte` es un módulo nuevo |

### Lo que hay hoy (verificado en el código, 2026-10-31)

| Pieza | Estado |
|---|---|
| `Usuario` (`usuario/domain/usuario.entity.ts`) | `id, email, passwordHash, nombreCompleto, rol, tenantId, creadoEn, actualizadoEn`. Sin `especialidad` ni foto. Único por `(tenant_id, email)`. Todo usuario nace `ADMINISTRADOR` al registrar su organización: no hay alta de `PROFESIONAL` ([DT-07](../Deudas/DT-07.md)) |
| `IUsuarioRepository` | solo `findByEmailAndTenant` y `guardar(Partial<Usuario>)`. `guardar` con un parcial devuelve una entidad incompleta (TypeORM `save` devuelve lo que recibió): no sirve para actualizar campos sueltos |
| `Tenant` | `id, nombre, slug, tipo, plan, creadoEn`; `plan VARCHAR NOT NULL DEFAULT 'free'` (migración `1750000000000`). El módulo `tenant` no tiene controller |
| JWT (`auth/`) | claims `{ sub, email, tenantId, rol }` más los estándar que pone `jsonwebtoken` (`iat` en **segundos**, `exp`). `JwtStrategy.validate` **no consulta la base** (DT-01). `JWT_EXPIRES_IN` = `1d`. Nadie lee `iat` |
| Ciclo de módulos | `AuthModule` importa `UsuariosModule` (para `IUsuarioRepository`) y registra el `JwtModule` dentro de sí. `usuario` **no puede** importar `AuthModule` |
| `JwtStrategy` en los tests | cuatro e2e sin base la declaran como proveedor directo (`citas-detalle`, `citas-rango`, `recordatorios-http`, `solicitudes-bandeja`) |
| Frontend | un **401 global cierra la sesión** (`citia-frontend/src/app/providers/index.ts`); la sesión se rehidrata de `citia.user` + el token, sin `GET /me` ([DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md), cerrada); `BaseAvatar.vue` ya dibuja iniciales; el enlace público lo arma el router con `tenantSlug` (`CopiarEnlaceAgenda.vue`) |
| Rol | nadie lo comprueba ([DT-02](../Deudas/DT-02.md)) |
| Correo | `CanalMensajeria` vive en `recordatorio/domain/canal-mensajeria.ts`; los adaptadores (`ResendCanalMensajeria`, `RegistroCanalMensajeria`) y la fábrica `crearCanalMensajeria` en `recordatorio/infrastructure/mensajeria/`. Remitente `CORREO_REMITENTE`. El contador local de cuota sale de `recordatorios.enviado_en` ([DT-36](../Deudas/DT-36.md)). El webhook ignora los correos que no son recordatorios (`recordatorios.webhook_desconocido`, nivel `info`) |
| Outbox | [ADR-12 §4](ADR-12.md), regla 4: **los suscriptores no tienen efectos externos**; dejan una fila de trabajo y otro proceso la ejecuta. *"Una alerta futura (RF-05) debe seguir el mismo patrón"* |
| Límite de tasa | cubos por nombre con clave `ip` o `enlace`; el `ThrottlerGuard` es global y corre **antes** que `JwtAuthGuard` (todavía no hay `req.user`) |
| Logs | `CAMPOS_SENSIBLES` redacta `contrasena`, `password`, `token`, `body`…; no `contrasenaActual`, `contrasenaNueva` ni `mensaje` (los cuerpos ya se redactan enteros) |
| Migraciones | la última es `1750000018000` |

---

## Opciones evaluadas

### A. Dónde se comprueba que un token sigue valiendo (P5)

| Opción | Veredicto |
|---|---|
| **A1. En `JwtStrategy.validate` (ELEGIDA)** | Una sola pieza, registrada una vez en passport: cubre **todas** las rutas con `JwtAuthGuard` sin tocar ningún controller. `validate` puede ser asíncrono y lanzar 401 |
| A2. Un guard nuevo detrás de `JwtAuthGuard` | Hay que acordarse de ponerlo en cada controller (olvidarlo deja una ruta sin revocación), y un guard con dependencias se resuelve en el módulo del controller: obligaría a importar `AuthModule` en todos. Descartada |
| A3. Middleware o interceptor global | Corre también en las rutas públicas y vuelve a leer el JWT. Descartada |

### B. El borde del mismo segundo

`iat` está en segundos; un `TIMESTAMPTZ` guarda microsegundos. Si la columna guarda el instante exacto del cambio
(p. ej. `12:00:00.700`), el token nuevo firmado en ese mismo segundo tendría `iat = 12:00:00` y **quedaría revocado
por su propio corte**.

| Opción | Veredicto |
|---|---|
| **B1. Truncar la columna al segundo y firmar el token nuevo con `iat` = ese segundo (ELEGIDA)** | Regla `iat × 1000 ≥ sesiones_validas_desde`. El token nuevo vale siempre (son iguales). Un token emitido **en el mismo segundo y antes** del cambio también vale: ventana < 1 s, aceptada |
| B2. Comparar en milisegundos con un claim propio (`iatMs`) | Exacto, pero suma un claim a todos los tokens y los que ya existen no lo traen. Descartada |
| B3. Redondear hacia arriba y firmar el token nuevo con `iat` en el futuro | Cierra la ventana, pero emite un token "del futuro" (< 1 s) que confunde a cualquiera que lo lea. Descartada |
| B4. Contador `version_sesion` en la fila y en el token | Exacto y sin reloj, pero P5 fijó la columna de fecha, y los tokens actuales no traen el claim. Descartada |

### C. Caché de la consulta

| Opción | Veredicto |
|---|---|
| **C1. Sin caché (ELEGIDA)** | Una consulta por clave primaria por petición autenticada. El corte es inmediato en todos los procesos, también en el solapamiento de despliegues de Railway ([ADR-12](ADR-12.md), *Contexto*) |
| C2. Caché en memoria con TTL | Retrasa el corte hasta el TTL en los demás procesos y solo se invalida en el proceso que atendió el cambio. Es la evolución si la consulta llegara a pesar (ver [Consecuencias](#consecuencias)) |

### D. Cómo emite `usuario` el token nuevo sin un ciclo con `auth`

| Opción | Veredicto |
|---|---|
| D1. `forwardRef` entre `AuthModule` y `UsuariosModule` | Esconde el ciclo en vez de quitarlo. Descartada |
| D2. Llevar el cambio de contraseña a `auth` (un controller `usuarios/me` dentro de `AuthModule`) | El cableado más simple, pero contradice P8 (la ruta es de `usuario`) y parte `/usuarios/me` entre dos módulos. Queda como alternativa si el usuario prefiere menos piezas |
| **D3. Puerto `EmisorSesion` en `usuario/domain`, adaptador en `auth`, y la firma JWT en un módulo propio, `FirmaJwtModule`, que importan `AuthModule` y `UsuariosModule` (ELEGIDA)** | Todas las dependencias van de `auth` hacia `usuario`; la configuración del JWT sigue en un solo lugar |

### E. Cómo sale el correo de soporte (P7)

| Opción | Veredicto |
|---|---|
| E1. Dentro de la petición HTTP | La latencia y los errores de Resend caen sobre el profesional, y si falla después del commit, el correo se pierde. Descartada |
| E2. Hecho en `eventos_salida` y un suscriptor que envía | Contradice la regla 4 de [ADR-12 §4](ADR-12.md) y deja la transacción del despachador abierta durante la llamada a Resend, frenando todos los demás hechos (recordatorios incluidos). Descartada |
| **E3. La fila de `mensajes_soporte` es la fila de trabajo, escrita en la misma transacción que la petición, y un job del planificador la envía con `FOR UPDATE SKIP LOCKED` y reintentos (ELEGIDA)** | Es el patrón de `recordatorios`, que es lo que la regla 4 pide. La fila **es** el outbox de ese correo: existe si y solo si la petición se confirmó. Como no hace falta un suscriptor, tampoco se publica un hecho |
| E4. Tabla genérica `correos_salida` en `shared` con un job genérico | Serviría también a las alertas (RF-05) y a la recuperación de contraseña, pero es prematura con un solo tipo de correo nuevo. Es el paso natural con el tercero ([DT-59](../Deudas/DT-59.md)) |

### F. Con qué canal se envía

| Opción | Veredicto |
|---|---|
| F1. Un adaptador de Resend propio en `soporte` | Duplica la clasificación de errores de [ADR-13 §8](ADR-13.md), verificada contra Resend. Descartada |
| **F2. Reutilizar `CanalMensajeria` y `crearCanalMensajeria` de `recordatorio`, sin importar `RecordatorioModule` (ELEGIDA)** | Cero lógica de correo nueva; misma clasificación, tiempo límite, `Idempotency-Key` y modo `registro`. Acopla por archivo `soporte` a `recordatorio`: [DT-59](../Deudas/DT-59.md) |
| F3. Mover ya el canal a `shared/` | Toca el envío de recordatorios en producción (su tipo de resultado lleva `MotivoRecordatorio`) por un formulario de soporte. Se hace con el tercer consumidor ([DT-59](../Deudas/DT-59.md)) |

### G. Cómo se le niega la suscripción a un PROFESIONAL (P4)

| Opción | Veredicto |
|---|---|
| G1. Guard de rol y decorador generales | Es lo que pide [DT-02](../Deudas/DT-02.md), *"en el mismo release que el alta de usuarios"* ([DT-07](../Deudas/DT-07.md)). Hoy todos son `ADMINISTRADOR`: sería infraestructura para una ruta. Descartada por ahora |
| **G2. Comprobación en el caso de uso (ELEGIDA)** | Tres líneas, probadas con un unitario. El guard general llega con DT-07 y reemplaza esta comprobación |

### H. El enlace público en el perfil (P3)

| Opción | Veredicto |
|---|---|
| H1. El backend devuelve la URL absoluta | Necesita `FRONTEND_URL` y duplica la ruta que el frontend ya arma; con el subdominio de la fase 2 de [ADR-08](ADR-08.md) habría que cambiarla en dos lugares. Descartada |
| **H2. El backend devuelve `tenantSlug` y el frontend arma el enlace con la misma función que "Copiar enlace de agenda" (ELEGIDA)** | Una sola fuente de la URL, la del frontend |

---

## Decisión

### 1. Perfil: `GET` y `PATCH /api/usuarios/me`

- Siempre el usuario del token (`userId` y `tenantId`); nada sale del cuerpo.
- **Respuesta** (`PerfilDto`): `id`, `email`, `nombreCompleto`, `especialidad`, `rol`, `tenantId`, `tenantSlug`,
  `tenantNombre` y `creadoEn`. Son los nombres de `LoginUsuarioDto` más `especialidad` y `creadoEn`: el frontend
  refresca `citia.user` con el mismo mapeo del login (lo que [DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md)
  dejó previsto).
- **Editable** (P2): `nombreCompleto` (1 a 120 caracteres, sin espacios a los lados) y `especialidad` (hasta 100; vacía
  o `null` la borra). El correo, el rol, la organización y el slug no están en el DTO: si llegan, la validación global
  (`whitelist`) los descarta en silencio, como en toda la API.
- **`especialidad` solo se muestra en el perfil.** No va en el recordatorio, en ningún correo al paciente ni en la
  página pública: una especialidad puede delatar la condición del paciente, igual que el nombre de la organización
  ([ADR-13 §12](ADR-13.md), [DT-52](../Deudas/DT-52.md)). Mostrarla en otro lugar es la
  [pregunta 6](../US/10-perfil-cuenta.md#preguntas-abiertas) del plan.
- **Sin foto** (P1): el frontend usa `BaseAvatar` con iniciales ([DT-57](../Deudas/DT-57.md)).

### 2. La organización, en lectura (P3)

El perfil trae `tenantNombre` y `tenantSlug`; el frontend arma el enlace público (opción H2). El slug nunca cambia
([ADR-03](ADR-03.md)): es la URL que el profesional ya compartió. El nombre no se edita en esta fase
([DT-58](../Deudas/DT-58.md)).

### 3. Suscripción: `GET /api/organizacion/suscripcion`, solo ADMINISTRADOR (P4)

- Lee `tenants.plan` y `tenants.creado_en` de la organización del token. **No hay tabla nueva.**
- **Catálogo de planes** en el dominio de `tenant` (`domain/plan.ts`): `free` → nombre legible
  ([Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free); provisional *"Plan piloto"*) y descripción
  *"Sin cobro durante el piloto"*. Un código desconocido no falla: se muestra el código tal cual, sin descripción.
- `renovacionEn` y `metodoPago` van siempre en `null`: no hay dinero en la v1
  ([etapa 3 del producto §2](../Descripcion/fase-3-mvp.md#2-qué-queda-fuera-de-la-v1), [Q2](../PREGUNTAS-ABIERTAS.md#q2--el-prepago-entra-alguna-vez)).
- **403 a un PROFESIONAL**, decidido en el caso de uso con el `rol` del token (opción G2). Es la primera ruta que mira
  el rol ([DT-02](../Deudas/DT-02.md)). Hoy es inalcanzable en la práctica (todos son `ADMINISTRADOR`) y se prueba con
  un unitario y con un e2e que pasa un usuario a `PROFESIONAL` por SQL antes de iniciar sesión.
- La ruta usa la palabra del producto, *organización*; el código sigue diciendo *tenant*.

### 4. Cambio de contraseña: `PUT /api/usuarios/me/contrasena` (P5)

Cuerpo `{ contrasenaActual, contrasenaNueva }`; respuesta `200 { accessToken }`. En este orden:

1. Formato (DTO) → **400**.
2. El usuario existe en su organización; si no → **401** (la sesión apunta a nadie).
3. `bcrypt.compare(contrasenaActual, hash)`; si no coincide → **400**, *"La contraseña actual no es correcta"*.
   **Nunca 401:** el frontend cierra la sesión con cualquier 401.
4. La nueva cumple la política: **al menos 8 caracteres** (como el registro) y **como mucho 72 bytes en UTF-8**
   (bcrypt ignora lo que pase de 72 bytes; sin el tope, alguien creería tener una contraseña más larga de la que
   tiene) → si no, **400**.
5. La nueva es distinta de la actual, comprobado contra el hash (`bcrypt.compare(contrasenaNueva, hash)`), no
   comparando textos → si es la misma, **400**.
6. `hash = bcrypt.hash(nueva, 10)` fuera de la transacción (es CPU).
7. En una transacción: `UPDATE` **condicional** de `password_hash` y `sesiones_validas_desde`, solo si el hash sigue
   siendo el leído en el paso 3. Si otra petición lo cambió entretanto → **409**.
8. Firma el token nuevo (decisión 6) y responde.

Sin correo de aviso (P5). Límite de tasa propio (decisión 8). En el log, `usuarios.contrasena_cambiada` con
`usuarioId` y `tenantId`; nunca las contraseñas ni el token.

### 5. Corte de sesiones: `usuarios.sesiones_validas_desde` (P5)

- **Columna** `TIMESTAMPTZ NULL`. **`NULL` = sin corte**: valen todos los tokens no vencidos. Es el valor de todos los
  usuarios existentes al migrar (**nadie queda fuera**) y el de los que se registran; solo el cambio de contraseña la
  escribe.
- **Al cambiar la contraseña:** `sesiones_validas_desde = truncar al segundo(ahora)`, con el **reloj de la app**, no el
  `now()` de la base: el `iat` del token nuevo sale del mismo reloj.
- **La regla** (función pura `tokenEmitidoVigente(iat, sesionesValidasDesde)` en `usuario/domain/sesiones.ts`):
  - `sesionesValidasDesde` nulo → vale;
  - token sin `iat` → no vale (todos los que firma Citia lo traen);
  - si no, vale si `iat × 1000 ≥ sesionesValidasDesde`.
- **El token nuevo** se firma con `iat = ⌊ahora / 1000⌋`, que es exactamente el corte: vale. `jsonwebtoken` respeta un
  `iat` dado y calcula `exp` desde él.
- **El borde** (opción B1): un token emitido en el **mismo segundo** del cambio, pero antes, sigue valiendo hasta que
  vence. Para aprovecharlo, un atacante tendría que iniciar sesión en ese mismo segundo con la contraseña vieja.
- **Dónde** (opción A1): `JwtStrategy.validate` pasa a ser asíncrono y llama a `VerificarSesionService.vigente(sub,
  tenantId, iat)` (`auth/application`, clase plana), que pide al puerto `IUsuarioRepository.estadoSesion(id,
  tenantId)` **solo esa columna** (no carga el hash en cada petición). Usuario inexistente o token anterior al corte →
  `UnauthorizedException` → **401**, el mismo de un token vencido.
- **Usuario borrado:** hoy no hay baja (ni ruta ni flujo), pero si la fila desaparece, su próxima petición recibe 401.
  Es la otra mitad de "un usuario dado de baja sigue dentro" de [DT-01](../Deudas/DT-01.md).
- **Costo:** una consulta por clave primaria por petición autenticada (una página del panel hace unas cinco a ocho).
  **Sin caché** (opción C1). Si algún día pesa, caché en memoria de ≤ 30 s, aceptando ese retraso en el corte.
- **Si la base no responde**, la petición falla con 500, como todo lo demás que la usa.
- **Lo que no cierra de [DT-01](../Deudas/DT-01.md):** la renovación (`JWT_EXPIRES_IN` sigue en `1d` y no se puede
  bajar sin ella), el cierre de sesión real de **un** dispositivo y un botón "cerrar todas mis sesiones" (casi gratis
  con esta misma columna: [pregunta 7](../US/10-perfil-cuenta.md#preguntas-abiertas) del plan).

### 6. Emitir el token nuevo sin ciclo entre módulos (opción D3)

```
                 ┌──────────────────────────────┐
AuthModule ──────┤ importa                      │
 JwtStrategy     ▼                              ▼
 VerificarSesion UsuariosModule ──importa──▶ FirmaJwtModule (auth/firma-jwt.module.ts)
                  PerfilController             JwtModule.registerAsync (sale de AuthModule, misma config)
                  CambiarContrasenaService     ITokenSigner  → JwtTokenSigner
                    └─ EmisorSesion (puerto) ◀─ EmisorSesion  → JwtEmisorSesion (auth/infrastructure)
```

- **`EmisorSesion`** (puerto, `usuario/domain/emisor-sesion.ts`): `emitir(usuario, emitidoEn): string`. El caso de uso
  de `usuario` solo conoce su puerto.
- **`JwtEmisorSesion`** (`auth/infrastructure/`) lo implementa con `ITokenSigner` y `crearPayloadJwt`.
- **`crearPayloadJwt(usuario, emitidoEn?)`** (`auth/jwt-payload.interface.ts`) es el único lugar donde se arman los
  claims; lo usan el login y el emisor. `JwtPayload` suma `iat` y `exp` opcionales (ya venían en cada token).
- **`FirmaJwtModule`** registra el `JwtModule` (lo que hoy hace `AuthModule`) y exporta `JwtModule`, `ITokenSigner` y
  `EmisorSesion`. `AuthModule` lo importa y lo reexporta: quien importaba `AuthModule` por el `JwtModule` sigue igual.
- **Sin ciclo:** `AuthModule → UsuariosModule → FirmaJwtModule` y `AuthModule → FirmaJwtModule`; `FirmaJwtModule` no
  importa a nadie del negocio. A nivel de archivos, todo va de `auth` hacia `usuario/domain`.

### 7. Soporte: `POST /api/soporte/mensajes`, tabla `mensajes_soporte` y su propio envío (P7)

- **La petición** valida el mensaje (1 a 2000 caracteres) y una categoría opcional, comprueba el **tope por
  organización** (5 mensajes en 24 horas; si se pasa → **429**), inserta la fila en `pendiente` dentro de una
  transacción y responde **201** `{ id, creadoEn }`. **No envía nada.**
- **El envío** (opción E3) lo hace un job del planificador, `soporte.envio`, **cada minuto**: reclama una fila
  (`FOR UPDATE SKIP LOCKED`, barrido global marcado como en [ADR-12 §6](ADR-12.md)), lee el usuario y la
  organización por sus puertos, arma el correo con una plantilla pura (todo escapado) y lo envía por
  `CanalMensajeria` con `Idempotency-Key = soporte/<id>` y la etiqueta `mensaje_soporte_id`. Una transacción por
  mensaje, abierta durante la llamada (≤ 10 s), como los recordatorios ([ADR-13 §7](ADR-13.md)).
- **Resultados** (los seis de [ADR-13 §8](ADR-13.md)): `aceptado` y `posible_duplicado` → `enviado` · `transitorio` →
  reintento con la espera de [ADR-12](ADR-12.md) (`calcularEsperaReintentoMs`: 1, 2, 4… hasta 60 min; `fallido` al
  octavo fallo, unas 2 horas después) · `cuota_agotada` → otra vez en 1 hora, sin gastar un intento · `permanente` →
  `fallido` · `configuracion` → no toca la fila, corta el lote y alerta. Un error propio (no del proveedor) revierte y
  se registra como un fallo más, en otra transacción, como hace el despachador del outbox.
- **Sin hecho en `eventos_salida`.** P7 dice "vía outbox": aquí **la fila es el outbox de ese correo** (se escribe en
  la transacción de la petición y otro proceso la entrega con reintentos). Un hecho sin suscriptor solo sumaría una
  fila; si la Fase 4 lo necesita, se agrega entonces.
- **Destino:** `SOPORTE_CORREO_DESTINO`, **opcional**. Sin ella el job no se registra, los mensajes **esperan en
  `pendiente`** (no se pierden) y el arranque deja un `warn`. Es opcional a propósito: una variable obligatoria nueva
  tumbó production nueve minutos en el release de la Fase 3
  ([incidente](../Fases/fase-3-us04-respuesta-paciente.md#incidente-production-caído-9-minutos)). Si viene y está mal
  escrita, el arranque se detiene, como cualquier variable inválida.
- **Remitente** `CORREO_REMITENTE` (el mismo de los recordatorios). **`Reply-To` = el correo del profesional**, leído
  al enviar: soporte contesta y le llega a él. Ese correo no está verificado ([DT-03](../Deudas/DT-03.md)).
- **El correo lleva**: quién escribe (nombre, correo, rol), la organización (nombre y slug), la fecha en `APP_TZ`, la
  categoría, los ids (mensaje, usuario, organización) y el texto.
- **Privacidad:** el texto **nunca** va a los logs (solo ids, estados y códigos), pero sí a la base (Railway), a Resend
  y a la casilla de soporte: es un **flujo de datos nuevo**. Si el profesional escribe datos de un paciente, esos datos
  salen del encargo ([Cumplimiento](../Cumplimiento/README.md)). El frontend avisa; el backend no filtra. Plazo de
  conservación: [DT-26](../Deudas/DT-26.md). Proveedores: [DT-52](../Deudas/DT-52.md).
- **Webhook de Resend:** los eventos de estos correos llegan a `/api/webhooks/resend` y se ignoran como desconocidos
  (`recordatorios.webhook_desconocido`, `info`). No se sigue su entrega: `enviado` es el estado final.
- **Cuota:** comparten la cuenta de Resend y **no los cuenta** el contador local de los recordatorios
  ([DT-36](../Deudas/DT-36.md)). El tope por organización los acota.

### 8. Límite de tasa

| Cubo | Límite | Clave | Ruta |
|---|---|---|---|
| `cambioContrasena` | 5 por hora | IP | `PUT /api/usuarios/me/contrasena` |
| `soporte` | 5 por hora | IP | `POST /api/soporte/mensajes` |

**Por IP y no por usuario:** el guard global corre antes que `JwtAuthGuard`, así que una clave por usuario exigiría
leer el token sin verificar. Y el login ya es por IP ([DT-04](../Deudas/DT-04.md)): el eslabón más débil no cambia. El
tope por organización de soporte (decisión 7) no es un cubo: vive en el caso de uso y cuenta filas.

### 9. Módulos y dependencias

| Módulo | Qué suma | Importa |
|---|---|---|
| `usuario` | `PerfilController` (`usuarios/me`), `PerfilService`, `CambiarContrasenaService`, `especialidad`, `sesiones_validas_desde`, `EmisorSesion` (puerto) | `TenantModule`, `SharedModule`, **`FirmaJwtModule`** |
| `auth` | `FirmaJwtModule`, `JwtEmisorSesion`, `VerificarSesionService`, `JwtStrategy` asíncrona, `crearPayloadJwt` | `UsuariosModule`, `FirmaJwtModule` |
| `tenant` | `SuscripcionController` (`organizacion`), `ConsultarSuscripcionService`, catálogo de planes | — |
| `soporte` (nuevo) | `SoporteController`, `RegistrarMensajeSoporteService`, `EnviarMensajesSoporteService`, plantilla, tabla | `UsuariosModule`, `TenantModule`, `SharedModule`; por archivo, el canal de `recordatorio` ([DT-59](../Deudas/DT-59.md)) |
| `soporte-planificacion` (nuevo) | `PlanificadorSoporte` | `SoporteModule`; solo lo importa `AppModule` |
| `shared` | dos cubos, `SOPORTE_CORREO_DESTINO`, tres campos sensibles más | — |

Sin ciclos. `RecordatorioModule` sigue sin que nadie lo importe ([ADR-13 §1](ADR-13.md)).

---

## Qué NO cambia

- **El login**: ruta, cuerpo, respuesta, 401 genérico y su límite de tasa. **El registro**, igual.
- **Los claims del token** (los mismos cuatro; `iat` ya venía) y `JWT_EXPIRES_IN`.
- **`AuthenticatedUser`, `@CurrentUser()` y `JwtAuthGuard`**: ningún controller existente se toca.
- **Los recordatorios**: plantilla, cuota, políticas y webhook.
- **El outbox y sus suscriptores**: ningún hecho nuevo.
- **El contrato de todas las demás rutas.**

---

## Consecuencias

**Positivas**

- Cambiar la contraseña por fin sirve contra un token robado, y un usuario borrado deja de entrar en su siguiente
  petición: la mitad "revocación" de [DT-01](../Deudas/DT-01.md) se cierra para estos dos casos.
- La columna deja preparado, casi gratis, un "cerrar todas mis sesiones".
- El perfil devuelve lo mismo que el login: el frontend refresca la sesión sin mapeos nuevos.
- El correo a soporte no frena la petición ni el outbox, sobrevive a una caída de Resend y no se pierde sin la
  variable de destino.
- Ninguna lógica de correo nueva: la clasificación de Resend ya probada en producción se reutiliza.

**Negativas / riesgos**

- **Una consulta más por petición autenticada.** Acotada (clave primaria, una columna); sin caché, a propósito.
- **Cuatro e2e sin base** declaran `JwtStrategy` y tendrán que proveer un doble de `VerificarSesionService`; y los tests
  que arman `UsuariosModule` necesitan `JWT_SECRET`, porque ahora importa `FirmaJwtModule`.
- **Ventana de menos de 1 segundo** para un token emitido justo antes del cambio (opción B1).
- **Relojes de dos procesos** durante un despliegue: si el reloj del proceso que atiende un login es unos milisegundos
  más lento que el del que atendió el cambio, ese login recién hecho podría recibir 401. Raro; se vuelve a iniciar
  sesión.
- **Un mensaje a soporte puede traer datos de pacientes** hacia Resend y la casilla de soporte, fuera del encargo
  ([DT-52](../Deudas/DT-52.md), [DT-26](../Deudas/DT-26.md)).
- **Resend sin contar** los correos a soporte en la cuota local ([DT-36](../Deudas/DT-36.md)).
- **Un `fallido` de soporte solo se ve en los logs**, que hoy no le llegan a nadie ([DT-19](../Deudas/DT-19.md)).
- **`soporte` depende por archivo del código de correo de `recordatorio`** ([DT-59](../Deudas/DT-59.md)).
- **El rol sale del token**: si algún día cambia el rol de alguien, el 403 de la suscripción lo verá recién con su
  próximo token ([DT-02](../Deudas/DT-02.md), [DT-07](../Deudas/DT-07.md)).

---

## Plan de ejecución

| # | Agente | Pieza |
|---|---|---|
| 0 | `architecture-agent` | ✅ (2026-10-31) este ADR, el plan [US-10](../US/10-perfil-cuenta.md), las deudas DT-57 a DT-59 y las notas en DT-01, DT-02, DT-03, DT-26, DT-36, DT-52, DT-53 y DT-56 |
| 1 | `database-agent` | ✅ (2026-11-01) migraciones `1750000019000` (usuarios) y `1750000020000` (`mensajes_soporte`), entidades ORM, campos de dominio, puertos y adaptadores |
| 2 | `backend-agent` | ✅ (2026-11-01) `FirmaJwtModule`, `JwtEmisorSesion`, `crearPayloadJwt`, `VerificarSesionService` y la `JwtStrategy` asíncrona; los dos cubos; `SOPORTE_CORREO_DESTINO`; campos sensibles; dobles de la estrategia en los cuatro e2e |
| 3 | `api-agent` | ✅ (2026-11-01) perfil, cambio de contraseña, suscripción y el módulo `soporte` con su job |
| 4 | `testing-agent` | ✅ (2026-11-01) unitarios, integración y e2e en verde, con la autorización del usuario. Estado por punto en la [Definición de Terminado](../US/10-perfil-cuenta.md#definición-de-terminado) |
| 5 | `architecture-agent` | ✅ (2026-11-01) [notas de implementación](#notas-de-implementación-2026-11-01), deudas, ROADMAP y Fases al día; después del release, la feature [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md) y las filas 118–124 de la [TRAZABILIDAD](../TRAZABILIDAD.md) · *antes: 🔶, faltaban la feature y TRAZABILIDAD* |
| F | frontend | la sección *Frontend* del plan, en paralelo a 2 y 3; se despliega **después** del backend. Su estado no se registra en este repo |

---

## Notas de implementación (2026-11-01)

> Las decisiones de arriba **no cambian**: ninguna nota rediseña. El backend está **implementado** (pasos 1 a 4 del
> [plan](../US/10-perfil-cuenta.md#orden-de-construcción)) y **en producción desde el 2026-11-01** (*antes: en `develop`
> (staging) con el release a `main` abierto*). Las
> preguntas abiertas siguen **sin respuesta**: el código usa los provisionales (*Plan piloto*, categoría cerrada, tope
> de 5 en 24 h, especialidad solo en el perfil, sin "cerrar todas mis sesiones"). Sin `SOPORTE_CORREO_DESTINO`
> ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)), en staging y en production los mensajes quedan
> `pendiente` y el arranque deja el `warn` `soporte.sin_destino`, como dice la decisión 7.

### Lo que toca una decisión de este ADR

| # | Decisión | Cómo quedó | Por qué |
|---|---|---|---|
| 1 | §5: `VerificarSesionService.vigente(sub, tenantId, iat)` | Además de `vigente()`, **`verificar()`**, que devuelve el **motivo** (`anterior_al_corte` \| `usuario_inexistente`). La estrategia usa `verificar()` y deja `auth.sesion_cortada` (`info`: `usuarioId`, `tenantId`, `motivo`; nunca el token) antes del 401 | el log del plan necesitaba el motivo, y `vigente()` sigue siendo el contrato simple |
| 2 | §5: usuario inexistente → 401 | Un `sub` o `tenantId` que **no es un UUID** también cuenta como inexistente: los repositorios tienen **guardas de UUID** y devuelven `null`/`false` en vez de dejar que Postgres falle con `22P02` (que sería un 500) | un token bien firmado con un id raro no debe dar 500 |
| 3 | §5: *"Si la base no responde, la petición falla con 500"* | Así quedó: si la consulta del corte falla, **500, no 401** | un 401 cerraría la sesión en el frontend por una caída de la base |
| 4 | §6: `EmisorSesion.emitir(usuario, emitidoEn)` con un `Usuario` | Recibe **`UsuarioSesion = Pick<Usuario, 'id' \| 'email' \| 'tenantId' \| 'rol'>`**. `sesiones.ts` tiene `inicioSesionesValidas` y `tokenEmitidoVigente`, como en el plan | el emisor solo necesita los cuatro claims; no exige cargar el hash |
| 5 | §4 paso 4: nueva ≥ 8 caracteres "como el registro" | El dominio cuenta **caracteres reales** (puntos de código); el `MinLength(8)` del DTO cuenta **unidades UTF-16**. Con 4 emojis (8 unidades) el DTO deja pasar y el dominio responde 400. El registro solo tiene el `MinLength(8)` del DTO y **ningún tope de 72 bytes**: la política del cambio es más estricta que la del registro ([DT-61](../Deudas/DT-61.md)) | el tope de bytes es lo que el ADR pedía; el registro no estaba en el alcance |
| 6 | §4 y plan: forma del 400 | Los 400 **de dominio** traen `message: string` en español; los del **`ValidationPipe`**, `message: string[]` con los textos por defecto de `class-validator`, **en inglés** (salvo la categoría de soporte, que tiene el suyo). El frontend tiene que aceptar las dos formas | es la convención de toda la API; ver [lo que conviene decidir](#lo-que-conviene-que-el-usuario-mire) |
| 7 | §3: respuesta de la suscripción | `{ plan, planNombre, descripcion, altaEn, renovacionEn: null, metodoPago: null }`, como el plan. Error nuevo **`OrganizacionNoEncontradaError`** (→ 401) para una organización que ya no existe | el plan decía "401, inalcanzable"; ahora tiene nombre |
| 8 | §7: el registro del mensaje | `RegistrarMensajeSoporteService.registrar` **devuelve la entidad**; el controller arma el DTO `{ id, creadoEn }` y el log. El texto se valida **antes** de abrir la transacción | el caso de uso no conoce Nest; no se abre una transacción para un texto inválido |
| 9 | §7: transacción abierta durante la llamada, *"≤ 10 s"* | Tope **propio de 11 s** por llamada además de los 10 s del adaptador, y **pausa de 500 ms** entre dos llamadas al proveedor: lo mismo que los recordatorios ([ADR-13, desvío 8](ADR-13.md#desvíos-y-precisiones)). La fila queda bloqueada como mucho 11 s | la cuenta de Resend es compartida ([DT-59](../Deudas/DT-59.md)); con los dos jobs enviando a la vez quedan como mucho unas 4 llamadas por segundo, bajo las 10 del proveedor |
| 10 | §7: *"Un error propio (no del proveedor) revierte y se registra como un fallo más"* | Un canal que **lanza** o pasa de los **11 s** se trata como **error propio**: se revierte y, en otra transacción, `bloquearPorId` → `registrarFallo(<nombre del error>)`. **Los recordatorios lo tratan como `transitorio`** | el efecto es el mismo (un intento y la espera); cambia el código en `ultimo_error` y la transacción. Divergencia entre los dos usuarios del canal, anotada en [DT-59](../Deudas/DT-59.md) |
| 11 | §7: sin destino, el job no se registra | Así quedó, con el `warn`. Además, si alguien invoca el envío a mano sin destino, `ejecutar` **no reclama nada** y devuelve `configuracion = 'sin_destino'` (`CODIGO_SIN_DESTINO`) | una invocación manual (e2e, consola) no puede marcar filas sin tener adónde mandarlas |
| 12 | §7: los seis resultados | `intentos` suma en **`marcarEnviado`**, `registrarFallo` y `marcarFallido` (cuenta los intentos que terminaron en algo, también el aceptado); **no** en `posponer` ni en `configuracion`. `marcarEnviado` **conserva** `ultimo_error` como historial. `guardarEnvio` **lanza** si no escribe (el plan decía `void`) | una fila que no se actualiza no puede pasar en silencio |
| 13 | §7: privacidad, *"el texto nunca va a los logs"* | `CAMPOS_SENSIBLES` suma `contrasenaActual`, `contrasenaNueva` y **`mensaje`**. La clave `mensaje` se redacta **entera en cualquier log**: para registrar un `MensajeSaliente` hay que usar otra clave (los logs de soporte usan `mensajeId`) | la redacción es por nombre de campo; es un control, no solo una convención |
| 14 | §7, *Destino*: dirección simple | `SOPORTE_CORREO_DESTINO` rechaza también **listas** (`,` o `;`), un **nombre visible** y `<>`; mal escrita, detiene el arranque | una sola casilla, como dice la decisión |
| 15 | §9: `tenant` sin importar a nadie | `SuscripcionController` usa `JwtAuthGuard` **sin importar `AuthModule`** (como `cita` y `paciente`): sin ciclo. `UsuarioDeSesion` vive en `usuario/application/perfil.service.ts` para que `usuario` no importe `auth`. El log `usuarios.contrasena_cambiada` lo escribe el controller después del 200 | las fronteras de §9 quedan como se diseñaron |

### Persistencia

- Las dos migraciones (`1750000019000` y `1750000020000`) son las del plan; **los dos `down` son destructivos** (pierden
  las especialidades, devuelven la validez a los tokens anteriores a un cambio y borran todos los mensajes).
- El CHECK `btrim(...) <> ''` de `usuarios.especialidad` y de `mensajes_soporte.mensaje` **solo quita espacios**: un texto
  de solo saltos de línea o tabulaciones lo pasaría. La defensa es el dominio, que recorta con `trim()` antes de
  guardar.
- La entidad ORM de `mensajes_soporte` **nombra** la PK y las FK como la migración.
- `seed.ts` borra los `mensajes_soporte` del tenant demo **antes** de sus usuarios (las FK son `RESTRICT`).
- `src/database/data-source.ts` **no lista** la entidad nueva (tampoco las de las Fases 2 y 3): solo pesa en
  `migration:generate`; las migraciones se cargan por glob.
- [DT-46](../Deudas/DT-46.md) **sigue abierta**: las columnas nuevas declaran `timestamptz`, pero `usuarios.creado_en`,
  `usuarios.actualizado_en` y `tenants.creado_en` no, y ahora se muestran (`creadoEn` del perfil, `altaEn` de la
  suscripción).

### Menores, sin efecto en el contrato

- Dominio de `usuario`: helper `sinCambiosPerfil` (el `PATCH` vacío no escribe).
- Dominio de `soporte`: constantes `VENTANA_TOPE_SOPORTE_MS` y `CODIGO_SIN_DESTINO` (además de
  `PAUSA_ENTRE_ENVIOS_SOPORTE_MS` y `TIEMPO_MAXIMO_ENVIO_SOPORTE_MS` en el caso de uso) y el error
  `TransicionEnvioSoporteInvalidaError` (una transición desde un estado que no es `pendiente`; el job lo trata como
  error propio).
- La plantilla de soporte tiene **su propio `escaparHtml`** (no importa el de `recordatorio`).
- La instancia del canal de `soporte` registra con el contexto **`CanalMensajeriaSoporte`**; el texto de arranque sigue
  diciendo *"Recordatorios: …"* ([DT-59](../Deudas/DT-59.md)).
- Logs de soporte: los del plan más uno nuevo, **`soporte.envio_error_interno`** (`warn`: `mensajeId`, `tenantId`,
  `codigo`) cuando un mensaje tiene un error propio. Lista completa en `src/modules/soporte/CLAUDE.md`.
- El decorador **`Recortar`** quedó **en tres copias** (`portal-paciente`, `usuario` y `soporte`): [DT-60](../Deudas/DT-60.md).
- `src/modules/soporte/CLAUDE.md` creado; `usuario/CLAUDE.md` y `recordatorio/CLAUDE.md` al día.

### Verificación (2026-11-01)

- `tsc`, ESLint, Prettier y `npm test` en verde: **131 suites, 2385 tests**.
- Contra Postgres 16 local, con la autorización del usuario: **integración 13 suites / 253 tests** y **e2e 18 suites /
  379 tests**, en verde ([Definición de Terminado](../US/10-perfil-cuenta.md#definición-de-terminado)).
- Pruebas manuales en staging y production: pendientes ([verificación manual](../US/10-perfil-cuenta.md#verificación-manual-mínima)).
  Después del release (2026-11-01), los Deploy Logs de staging y production, **sin revisar**.

### Lo que conviene que el usuario mire

Nada contradice una decisión de este ADR. Dos puntos rozan el contrato con el frontend o una decisión de producto:

1. **Los 400 de validación salen en inglés** (nota 6). Si el frontend muestra *"el mensaje del backend junto al
   campo"*, como dice el plan, un nombre en blanco mostraría `nombreCompleto should not be empty`. Opciones: (a) el
   frontend valida antes de enviar (largo y obligatorios) y, ante un `message: string[]`, muestra un texto propio;
   (b) mensajes en español en los DTO de esta fase; (c) dejarlo. *Inclinación:* (a), sin tocar el backend: los límites
   son pocos y fijos, y (b) sería la única parte de la API con mensajes traducidos.
2. **La política de la contraseña no es la misma en el registro** (nota 5, [DT-61](../Deudas/DT-61.md)): hoy alguien
   puede registrarse con una contraseña de más de 72 bytes que bcrypt recorta en silencio, y después no podría
   elegirla como nueva. Es anterior a esta fase y de severidad baja.

---

## Preguntas abiertas

Las de producto están, con opciones e inclinación, en el
[plan § Preguntas abiertas](../US/10-perfil-cuenta.md#preguntas-abiertas). Las dos que conviene contestar antes del
release, también en [PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md#fase-7--decisiones-pendientes-del-diseño-2026-10-31):

- [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) — el nombre legible del plan `free`.
- [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) — la casilla de soporte y su proveedor.

---

## Referencias

- [ADR-01](ADR-01.md) — el JWT y su desviación consciente (sin renovación ni revocación).
- [ADR-12 §4, §5 y §6](ADR-12.md) — reglas de los suscriptores, planificador y barridos globales.
- [ADR-13 §7, §8, §10, §11 y §12](ADR-13.md) — envío con la transacción abierta, el puerto `CanalMensajeria`, el
  webhook, la cuota y la privacidad del correo.
- `src/modules/auth/` (`auth.module.ts`, `jwt.strategy.ts`, `jwt-payload.interface.ts`, `domain/token-signer.ts`),
  `src/modules/usuario/`, `src/modules/tenant/`, `src/modules/recordatorio/domain/canal-mensajeria.ts`,
  `src/modules/recordatorio/infrastructure/mensajeria/crear-canal-mensajeria.ts`,
  `src/shared/application/politica-reintento-salida.ts`, `src/shared/presentation/limitar-tasa.decorator.ts`,
  `src/shared/infrastructure/observabilidad/opciones-logger.ts`.
- Frontend: `src/app/providers/index.ts` (401 global), `src/shared/ui/BaseAvatar.vue`,
  `src/features/compartir-enlace-agenda/ui/CopiarEnlaceAgenda.vue`, `src/entities/session/`.

---

## Deudas técnicas asociadas

**Cierra en parte:** [DT-01](../Deudas/DT-01.md) — el corte de las demás sesiones al cambiar la contraseña y la salida
de un usuario borrado (en diseño el 2026-10-31; **implementado y en producción el 2026-11-01**). La renovación y el
cierre de sesión real siguen abiertos.

**Toca:** [DT-02](../Deudas/DT-02.md) (primera ruta que mira el rol, sin guard general; implementada el 2026-11-01) ·
[DT-46](../Deudas/DT-46.md) (las fechas nuevas declaran `timestamptz`; `usuarios.creado_en` y `tenants.creado_en`, que
ahora se muestran, no) ·
[DT-03](../Deudas/DT-03.md) (la recuperación sigue fuera; cambiar el correo depende de su verificación) ·
[DT-04](../Deudas/DT-04.md) (el cambio de contraseña, como el login, solo tiene límite por IP) ·
[DT-26](../Deudas/DT-26.md) (`mensajes_soporte` sin plazo) · [DT-36](../Deudas/DT-36.md) (otro tipo de correo por la
misma cuenta) · [DT-52](../Deudas/DT-52.md) (la casilla de soporte y Resend reciben el texto) ·
[DT-53](../Deudas/DT-53.md) y [DT-56](../Deudas/DT-56.md) (el flujo de soporte en la política y en los incidentes).

**Nuevas** (fichadas el 2026-10-31):

1. [DT-57](../Deudas/DT-57.md) — sin foto de perfil (🔵 aplazada, P1).
2. [DT-58](../Deudas/DT-58.md) — el nombre de la organización no se puede corregir (🔵 aplazada, P3).
3. [DT-59](../Deudas/DT-59.md) — el canal de correo vive en `recordatorio` y lo usa `soporte` (⚪ prevista; **contraída
   el 2026-11-01** al implementar: abierta).

**Detectadas al implementar** (fichadas el 2026-11-01):

4. [DT-60](../Deudas/DT-60.md) — el decorador `Recortar` está copiado en tres módulos (🟡 baja).
5. [DT-61](../Deudas/DT-61.md) — el registro no aplica la política de contraseña del cambio: sin tope de 72 bytes
   (🟡 baja; el origen es el registro, de Fundaciones).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
