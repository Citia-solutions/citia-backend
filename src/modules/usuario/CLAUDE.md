# Módulo: usuario

Registro público de una organización con su primer usuario (US-00a) y la cuenta del usuario de la sesión (US-10:
perfil y cambio de contraseña, ADR-15). `POST /api/usuarios` crea, en una sola transacción, el **tenant** (con slug
autogenerado y único) y su **usuario ADMINISTRADOR**. Multi-tenant: el email es único por tenant, no globalmente. El
login vive en el módulo `auth`; la suscripción (`GET /api/organizacion/suscripcion`), en `tenant`.

## Estructura

```
src/modules/usuario/
├── domain/
│   ├── usuario.entity.ts       ← Clase plana TS, enum RolUsuario (PROFESIONAL | ADMINISTRADOR); especialidad y sesionesValidasDesde (US-10);
│   │                             LARGO_MAXIMO_NOMBRE (120), LARGO_MAXIMO_ESPECIALIDAD (100), normalizarCambiosPerfil y sinCambiosPerfil (+ spec)
│   ├── usuario.repository.ts   ← Puerto IUsuarioRepository (abstract class) + CambiosPerfil, CambioContrasena, EstadoSesionUsuario
│   ├── contrasena.ts           ← US-10: política de la nueva (≥ 8 caracteres, ≤ 72 bytes UTF-8), validarContrasenaNueva (+ spec)
│   ├── sesiones.ts             ← US-10: inicioSesionesValidas (truncar al segundo) y tokenEmitidoVigente (+ spec)
│   ├── emisor-sesion.ts        ← US-10: puerto EmisorSesion (lo implementa auth/infrastructure/jwt-emisor-sesion, lo provee FirmaJwtModule)
│   └── exceptions/
│       ├── email-ya-registrado.error.ts
│       ├── usuario-no-encontrado.error.ts            ← US-10 (401)
│       ├── perfil-invalido.error.ts                  ← US-10 (400, con `campo`)
│       ├── contrasena-actual-incorrecta.error.ts     ← US-10 (400, NUNCA 401)
│       ├── contrasena-no-valida.error.ts             ← US-10 (400)
│       ├── contrasena-repetida.error.ts              ← US-10 (400)
│       └── contrasena-cambiada-en-paralelo.error.ts  ← US-10 (409)
├── infrastructure/
│   └── persistence/
│       ├── usuario.orm-entity.ts         ← Entidad TypeORM tabla `usuarios`, FK tenant_id, CHECK de la especialidad (+ spec contra la migración)
│       └── typeorm-usuario.repository.ts ← Adaptador TypeORM con mappers toDomain/toPersistence; SQL explícito en los métodos de US-10 (+ spec)
├── application/
│   ├── usuarios.service.ts            ← Caso de uso registrar(): tenant + ADMINISTRADOR en un tx
│   ├── perfil.service.ts              ← US-10: obtener() y actualizar() del usuario de la sesión (+ spec)
│   └── cambiar-contrasena.service.ts  ← US-10: cambiar() con corte de sesiones y token nuevo (+ spec)
├── presentation/
│   ├── usuarios.controller.ts  ← POST /usuarios (@LimitarTasa('registro'): 5 por hora por IP). Público
│   ├── perfil.controller.ts    ← US-10: GET/PATCH /usuarios/me y PUT /usuarios/me/contrasena. JwtAuthGuard en la clase (+ spec)
│   └── dto/
│       ├── registro-usuario.dto.ts      ← nombreTenant, tipoTenant?, email, password (≥ 8), nombreCompleto
│       ├── registro-response.dto.ts     ← id, email, nombreCompleto, rol, tenantId, nombreTenant, tenantSlug, creadoEn
│       ├── perfil.dto.ts                ← US-10: id, email, nombreCompleto, especialidad, rol, tenantId, tenantSlug, tenantNombre, creadoEn
│       ├── actualizar-perfil.dto.ts     ← US-10: nombreCompleto?, especialidad? (recortados) (+ spec)
│       ├── cambiar-contrasena.dto.ts    ← US-10: contrasenaActual, contrasenaNueva (≥ 8) (+ spec)
│       └── contrasena-cambiada.dto.ts   ← US-10: accessToken
├── integration/
│   ├── registro-usuario.integration.spec.ts ← atomicidad contra Postgres (ADR-06)
│   └── sesiones-usuario.integration.spec.ts ← US-10: estadoSesion, cambio de contraseña condicional (dos a la vez), actualizarPerfil, CHECK
├── usuarios.module.ts          ← Tres servicios con useFactory; importa TenantModule, SharedModule y FirmaJwtModule (NO AuthModule)
└── usuarios.module.spec.ts     ← US-10: cableado sin base (AuthModule real + puertos en memoria) y contrato HTTP de las 4 rutas
```

## Endpoints

| Método | Ruta                       | Handler                         | Status |
|--------|----------------------------|---------------------------------|--------|
| POST   | `/usuarios`                | `registrar(dto)`                | 201 · 409 si el email ya existe en el tenant · 429 al pasarse del límite. Público |
| GET    | `/usuarios/me`             | `PerfilController.obtener`      | 200 `PerfilDto` · 401 |
| PATCH  | `/usuarios/me`             | `PerfilController.actualizar`   | 200 `PerfilDto` · 400 · 401 |
| PUT    | `/usuarios/me/contrasena`  | `PerfilController.cambiarContrasena` | 200 `{ accessToken }` · 400 · 401 · 409 · 429 (cubo `cambioContrasena`: 5 por hora por IP) |

Prefijo global `/api` → rutas reales: `POST /api/usuarios`, `GET|PATCH /api/usuarios/me`,
`PUT /api/usuarios/me/contrasena`. `/usuarios/me*` llevan `JwtAuthGuard` (en la clase de `PerfilController`); el
registro sigue público en `UsuariosController`, otro controller a propósito.

### Perfil (`GET`/`PATCH /usuarios/me`, ADR-15 §1 y §2)

- Todo sale del **token** (`@CurrentUser()`: `userId` y `tenantId`), nunca del cuerpo.
- `PerfilDto` = los campos de `LoginUsuarioDto` + `especialidad` y `creadoEn`. Nunca el hash ni el corte. El enlace
  público lo arma el frontend con `tenantSlug`.
- Editables: `nombreCompleto` (1 a 120, recortado, no se borra: `null` o en blanco → 400) y `especialidad` (≤ 100;
  `''` o `null` la borran → `null`). El correo, el rol, la organización y el slug se descartan en silencio
  (`whitelist`). `PATCH` sin campos → 200 con el perfil actual, sin escribir.
- `especialidad` **solo se muestra en el perfil**: nunca en recordatorios, correos al paciente ni la página pública.

### Cambio de contraseña (`PUT /usuarios/me/contrasena`, ADR-15 §4 y §5)

Orden de `CambiarContrasenaService.cambiar` (cada error, sin escribir nada):

1. formato del DTO → 400;
2. usuario inexistente en su organización → `UsuarioNoEncontradoError` → **401**;
3. `bcrypt.compare(actual, hash)` falso → `ContrasenaActualIncorrectaError` → **400** *"La contraseña actual no es
   correcta"*. **NUNCA 401**: el frontend cierra la sesión con cualquier 401;
4. `validarContrasenaNueva` (≥ 8 caracteres, ≤ 72 bytes UTF-8) → `ContrasenaNoValidaError` → 400;
5. `bcrypt.compare(nueva, hash)` verdadero → `ContrasenaRepetidaError` → 400 (contra el hash, no comparando textos);
6. `bcrypt.hash(nueva, 10)` **fuera** de la transacción;
7. corte = `inicioSesionesValidas(reloj())`; en `tx.run`, `cambiarContrasena` condicional al hash leído en 3 →
   `false` → `ContrasenaCambiadaEnParaleloError` → **409**;
8. `EmisorSesion.emitir(usuario, corte)` → token nuevo con `iat` = el corte → 200 `{ accessToken }`.

Tras el 200, los tokens anteriores (de esta y de las demás sesiones) dan 401 en su siguiente petición (lo comprueba
`JwtStrategy` en `auth`). Log: `usuarios.contrasena_cambiada` (`info`, `usuarioId`, `tenantId`) lo escribe el
controller tras el 200; nunca las contraseñas ni el token. Sin correo de aviso (P5).

### Errores y su código

| Error de dominio | HTTP |
|---|---|
| `EmailYaRegistradoError` | 409 |
| `PerfilInvalidoError` | 400 (red de seguridad del DTO) |
| `UsuarioNoEncontradoError` | 401 (la sesión apunta a nadie; solo en una carrera tras la estrategia) |
| `ContrasenaActualIncorrectaError` | **400, nunca 401** |
| `ContrasenaNoValidaError` | 400 |
| `ContrasenaRepetidaError` | 400 |
| `ContrasenaCambiadaEnParaleloError` | 409 |

## Convenciones locales

- `UsuariosService` es una clase plana (sin `@Injectable`); el módulo la arma con `useFactory` e inyecta `IUsuarioRepository`, `ITenantRepository` y `TransactionRunner` (abstract classes como token NestJS). No usar tokens string.
- `PerfilService` (`IUsuarioRepository`, `ITenantRepository`, `TransactionRunner`) y `CambiarContrasenaService`
  (`IUsuarioRepository`, `TransactionRunner`, `EmisorSesion`; `reloj` opcional para las pruebas), igual: fábricas en
  el módulo. Reciben el usuario de la sesión como `UsuarioDeSesion` (`{ userId, tenantId }`, de `perfil.service.ts`),
  nunca `AuthenticatedUser` (`usuario/application` no importa `auth`).
- **Sin ciclo con `auth`** (ADR-15 §6): `UsuariosModule` importa `FirmaJwtModule`, **nunca `AuthModule`** (que importa
  este). `PerfilController` usa `JwtAuthGuard`, que no tiene dependencias; la estrategia `jwt` la registra
  `AuthModule`. Consecuencia: armar `UsuariosModule` exige `JWT_SECRET` en el entorno.
- El registro es **atómico** (ADR-06): genera el slug único del tenant (`slugify` + sufijo `-2`, `-3`… si existe), guarda el tenant (tipo `INDEPENDIENTE` por defecto) y el usuario con rol `ADMINISTRADOR` dentro del mismo `tx.run`.
- El controller devuelve `RegistroResponseDto` (nunca la entidad cruda ni el `passwordHash`).
- El hash de contraseña se hace en el service con `bcrypt` (saltRounds: 10).
- Errores: el service lanza `EmailYaRegistradoError` (dominio puro, `domain/exceptions/`); el controller la mapea a `ConflictException` HTTP 409.
- Unicidad compuesta: `(tenantId, email)` — un email puede existir en distintos tenants.
- FK `tenant_id` referencia tabla `tenants`.

## Campos de UsuarioOrmEntity

| Columna DB             | Propiedad ORM        | Tipo              | Notas                     |
|------------------------|----------------------|-------------------|---------------------------|
| id                     | id                   | UUID PK           | auto-generado             |
| email                  | email                | varchar           | no unique global          |
| password_hash          | passwordHash         | varchar           |                           |
| nombre_completo        | nombreCompleto       | varchar           | sin largo en la base (el perfil limita a 120 en el dominio) |
| especialidad           | especialidad         | varchar(100) NULL | US-10 (`1750000019000`). `NULL` = sin especialidad; nunca vacía (`CHK_usuarios_especialidad_no_vacia`: `NULL` o `btrim <> ''`). Solo se muestra en el perfil |
| rol                    | rol                  | enum              | default PROFESIONAL       |
| tenant_id              | tenantId             | UUID FK           | referencia tenants.id     |
| sesiones_validas_desde | sesionesValidasDesde | timestamptz NULL  | US-10 (`1750000019000`). Corte de sesiones: `NULL` = sin corte (todos los existentes al migrar). Solo la escribe `cambiarContrasena`, truncada al segundo; `guardar` nunca la mapea |
| creado_en              | creadoEn             | timestamptz       | @CreateDateColumn (la entidad no declara el tipo: DT-46) |
| actualizado_en         | actualizadoEn        | timestamptz       | @UpdateDateColumn (ídem); los UPDATE de US-10 la ponen con `now()` |

## Contratos IUsuarioRepository

```typescript
abstract findByEmailAndTenant(email: string, tenantId: string, tx?: TransactionContext): Promise<Usuario | null>;
abstract guardar(usuario: Partial<Usuario>, tx?: TransactionContext): Promise<Usuario>;

// US-10 (ADR-15 §4 y §5). Tipos en domain/usuario.repository.ts:
//   CambiosPerfil { nombreCompleto?: string; especialidad?: string | null }
//   CambioContrasena { hashAnterior: string; hashNuevo: string; sesionesValidasDesde: Date }
//   EstadoSesionUsuario { sesionesValidasDesde: Date | null }
abstract findById(id: string, tenantId: string, tx?: TransactionContext): Promise<Usuario | null>;
abstract actualizarPerfil(id: string, tenantId: string, cambios: CambiosPerfil, tx?: TransactionContext): Promise<Usuario | null>;
abstract cambiarContrasena(id: string, tenantId: string, cambio: CambioContrasena, tx?: TransactionContext): Promise<boolean>;
abstract estadoSesion(id: string, tenantId: string): Promise<EstadoSesionUsuario | null>;
```

- **`guardar` con un parcial devuelve una entidad incompleta** (`save` devuelve lo que recibió): las actualizaciones
  van por métodos propios. Las columnas que `save` no devuelve salen en `null` (`especialidad`, `sesionesValidasDesde`).
- `findById`, `actualizarPerfil`, `cambiarContrasena` y `estadoSesion` filtran por `id` **y** `tenant_id`; con un id o
  tenant que no es UUID devuelven `null` / `false` sin consultar (nunca un 22P02).
- `actualizarPerfil`: `UPDATE … SET <solo lo presente>, "actualizado_en" = now() … RETURNING`; `especialidad: null`
  la borra; **sin ningún campo no escribe** y devuelve el usuario tal como está (`findById`).
- `cambiarContrasena`: `UPDATE` **condicional** `… AND "password_hash" = <hashAnterior>` que escribe hash, corte y
  `actualizado_en`; `true` solo si escribió una fila. Con dos a la vez, el segundo espera el bloqueo y devuelve `false`
  (→ 409 en el caso de uso). Lanza si `hashNuevo` está vacío o el corte es una fecha inválida.
- `estadoSesion`: `SELECT "sesiones_validas_desde"` por clave primaria y tenant, **sin transacción y sin cargar el
  hash**; la llama la estrategia JWT en cada petición autenticada (sin caché, ADR-15 §5).

## Pendientes

- ~~Migración TypeORM para crear la tabla `usuarios`~~ → hecha: `1750000000000-CreateTenantsAndUsuarios`.
- ~~Módulo de autenticación (login JWT)~~ → hecho: módulo `auth` (`POST /api/auth/login`).
- US-10 (Fase 7, plan `context/US/10-perfil-cuenta.md`): persistencia, dominio, servicios y `PerfilController`
  listos. Faltan las e2e con base (`test/perfil-usuario.e2e-spec.ts`, `test/cambio-contrasena.e2e-spec.ts`, paso 5).
- El registro no limita el largo del nombre y el perfil sí (120): un nombre registrado más largo no se puede volver a
  guardar igual (riesgo 15 del plan; el registro no se toca en esta fase).
- El frontend no consume `POST /api/usuarios` (DT-29); verificación de correo y defensas del registro que no son de tasa: DT-03 y DT-06.
