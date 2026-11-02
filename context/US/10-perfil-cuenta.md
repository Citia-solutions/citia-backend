# Plan US-10 — Perfil, suscripción y soporte (RF-04)

> **Fase:** [Fase 7 — US-10](../Fases/fase-7-us10-perfil.md) · **Feature:** [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md) · **Plan:** este documento · **Relacionado:** [ADR-15](../Decisions/ADR-15.md), [ADR-01](../Decisions/ADR-01.md), [ADR-02](../Decisions/ADR-02.md), [ADR-03](../Decisions/ADR-03.md), [ADR-06](../Decisions/ADR-06.md), [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [DT-01](../Deudas/DT-01.md), [DT-02](../Deudas/DT-02.md), [DT-03](../Deudas/DT-03.md), [DT-04](../Deudas/DT-04.md), [DT-26](../Deudas/DT-26.md), [DT-36](../Deudas/DT-36.md), [DT-52](../Deudas/DT-52.md), [DT-57](../Deudas/DT-57.md), [DT-58](../Deudas/DT-58.md), [DT-59](../Deudas/DT-59.md), [DT-46](../Deudas/DT-46.md), [DT-60](../Deudas/DT-60.md), [DT-61](../Deudas/DT-61.md), [Q7](../PREGUNTAS-ABIERTAS.md#q7--renovación-y-revocación-de-sesión-bloqueado-hasta-que-el-arquitecto-defina-el-requisito), [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free), [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte), [DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md)

> **Estado (2026-11-01, después del release):** ✅ **en producción desde el 2026-11-01** (backend
> [PR #15](https://github.com/Citia-solutions/citia-backend/pull/15), `cd659c1`) · **cierre pendiente** de las pruebas
> manuales ([verificación manual mínima](#verificación-manual-mínima)) y de
> [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) y [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte).
> [ADR-15](../Decisions/ADR-15.md) **aceptado** (2026-10-31). Pasos 1 a 6 hechos: la feature es
> [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md) y los commits, las filas 118–124 de la
> [TRAZABILIDAD](../TRAZABILIDAD.md). Las [preguntas abiertas](#preguntas-abiertas) **siguen sin respuesta**: el código
> usa los valores provisionales y, sin `SOPORTE_CORREO_DESTINO` en production, los mensajes a soporte esperan en
> `pendiente`. Los Deploy Logs de staging y production, **sin revisar**. Lo que el código hizo distinto de este
> contrato: [Desvíos de la implementación](#desvíos-de-la-implementación-2026-11-01) y
> [ADR-15 § Notas de implementación](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01).
> **Rama:** `feature/fase7-perfil-cuenta`, que sale de `docs/fase5-decisiones-us0702`. Ese PR (#14) se mergeó
> directo a `main`, no a `develop`; esta rama trajo también sus commits y llegó a `develop` por **fast-forward**, sin PR
> ni commit de merge (2026-11-01, 12:36 de Chile). El release a `main` fue el PR #15 (14:09 de Chile), que el usuario
> creó y mergeó desde GitHub. El frontend usa una rama del mismo nombre en `citia-frontend` (su estado no se registra
> aquí).
>
> *Antes:* **Estado (2026-11-01, antes del release):** 🔶 implementada, en `develop` (staging) con el release a `main`
> abierto; el paso 6 (docs) a medias: faltaban la feature y TRAZABILIDAD.
>
> *Antes:* **Estado (2026-10-31):** 🔶 **en diseño.** Las decisiones de producto P1 a P8 son del usuario (2026-10-31) y
> no se reabren; el contrato técnico lo fija este plan, con [ADR-15](../Decisions/ADR-15.md) **propuesto**. Rama del
> backend: `feature/fase7-perfil-cuenta`, que sale de `docs/fase5-decisiones-us0702` (todavía sin mergear en
> `develop`); el PR va hacia `develop` (Git Flow). US-10 no depende de ninguna otra fase.

> Solo decisiones y orden. Sin código de negocio. Brief para los agentes. El porqué de cada pieza está en
> [ADR-15](../Decisions/ADR-15.md); aquí va el qué, en qué orden y cuándo está terminado. **Este plan es el
> contrato:** si algo choca con el código, se implementa lo más cercano posible y se reporta; no se rediseña.

---

## Descripción

- Como **profesional de la salud** quiero ver y corregir mi nombre y mi especialidad, ver el enlace de agenda de mi
  organización y cambiar mi contraseña, para mantener mi cuenta al día sin pedírselo a nadie.
- Como **administrador de la organización** quiero ver en qué plan estoy y desde cuándo, aunque todavía no se cobre.
- Como **profesional** quiero escribirle a soporte desde la aplicación cuando algo no funciona, y que me respondan a
  mi correo.

**Criterios de aceptación**

- *Mi Perfil* muestra nombre, especialidad, correo, rol, organización y su enlace público. Se editan **solo** el
  nombre y la especialidad; el correo, la organización y el enlace se ven, no se tocan.
- Guardar el perfil actualiza el nombre en todo el panel (sidebar incluido) sin volver a iniciar sesión.
- El administrador ve su suscripción: nombre del plan, desde cuándo, *"Sin cobro durante el piloto"*, y renovación y
  método de pago vacíos. Un profesional no la ve (403 si la pide).
- Cambiar la contraseña exige la actual. Con la actual mal escrita, el error aparece en el formulario y **la sesión
  sigue abierta**. Tras el cambio, **la sesión actual sigue funcionando** y las demás (otro navegador, otro equipo)
  vuelven al login en su siguiente acción. La contraseña vieja ya no sirve para entrar.
- *Contactar soporte* abre un formulario con el aviso de no incluir datos de pacientes. El mensaje queda guardado al
  instante y llega por correo a la casilla de soporte, con *Responder a* = el correo del profesional.
- Más de 5 mensajes a soporte de una misma organización en 24 horas reciben un aviso de límite (429).

---

## Punto de partida (verificado en el código, 2026-10-31)

- **`Usuario`** (`src/modules/usuario/domain/usuario.entity.ts`): clase plana con campos públicos (`id, email,
  passwordHash, nombreCompleto, rol, tenantId, creadoEn, actualizadoEn`). Sin `especialidad` ni foto. Único por
  `(tenant_id, email)` (`uq_usuario_email_tenant`). Hoy todo usuario es `ADMINISTRADOR` (no hay alta de
  `PROFESIONAL`, [DT-07](../Deudas/DT-07.md)). Contexto local en `src/modules/usuario/CLAUDE.md`.
- **`IUsuarioRepository`**: `findByEmailAndTenant` y `guardar(Partial<Usuario>)`. **`guardar` con un parcial devuelve
  una entidad incompleta** (`save` de TypeORM devuelve lo que recibió): las actualizaciones nuevas van por métodos
  propios.
- **`UsuarioOrmEntity`**: `nombre_completo VARCHAR` sin largo; `creado_en`/`actualizado_en` sin `type: 'timestamptz'`
  ([DT-46](../Deudas/DT-46.md)): **toda columna de fecha nueva declara `timestamptz`**.
- **`Tenant`**: `plan VARCHAR NOT NULL DEFAULT 'free'`, `creado_en` (migración `1750000000000`). `TenantModule` solo
  provee `ITenantRepository` (`guardar`, `findById`, `findBySlug`); **sin controller**.
- **Auth**: `AuthModule` registra `JwtModule.registerAsync` (`JWT_SECRET`, `JWT_EXPIRES_IN` = `1d`), provee
  `JwtStrategy`, `JwtAuthGuard`, `ITokenSigner` (`JwtTokenSigner`) y `AuthService` (fábrica), e **importa
  `UsuariosModule`**. `JwtStrategy.validate` es síncrono y no consulta la base. `AuthService.login` arma el payload a
  mano. `jsonwebtoken` agrega `iat` (segundos) y `exp`; si el payload trae `iat`, lo respeta y calcula `exp` desde él.
- **`JwtStrategy` como proveedor directo** en cuatro e2e sin base: `test/citas-detalle.e2e-spec.ts`,
  `test/citas-rango.e2e-spec.ts`, `test/recordatorios-http.e2e-spec.ts` y `test/solicitudes-bandeja.e2e-spec.ts`. Las
  demás e2e importan `AuthModule` y obtienen el token con registro y login reales (el usuario existe en la base).
- **`src/modules/usuario/integration/registro-usuario.integration.spec.ts`** arma `UsuariosModule` sin
  `ConfigModule.forRoot`: con `FirmaJwtModule` dentro necesitará `JWT_SECRET` en el entorno (lo carga
  `test/setup-env.ts` desde `.env`).
- **Capas:** los servicios de aplicación existentes reciben y devuelven DTO de `presentation/` (convención del
  repo; `arquitectura.spec.ts` lo permite). Los nuevos la siguen.
- **Límite de tasa:** `LIMITES_TASA` en `src/shared/presentation/limitar-tasa.decorator.ts` (cubos por nombre, clave
  `ip` o `enlace`); el `ThrottlerGuard` global corre antes que `JwtAuthGuard`. `LIMITE_TASA_ACTIVO=false` en tests.
- **Correo**: puerto `CanalMensajeria` y `MensajeSaliente` en `src/modules/recordatorio/domain/canal-mensajeria.ts`;
  `crearCanalMensajeria({ adaptador, apiKey, remitente, produccion }, logger?)` en
  `src/modules/recordatorio/infrastructure/mensajeria/crear-canal-mensajeria.ts` (su log de arranque dice
  *"Recordatorios: se envían por Resend"*). El webhook ignora los correos sin un recordatorio conocido
  (`recordatorios.webhook_desconocido`, `info`), sin suprimir nada.
- **Reintentos**: `calcularEsperaReintentoMs` y `agotoIntentos` en `src/shared/application/politica-reintento-salida.ts`
  (funciones puras, reutilizables).
- **Planificador**: patrón de `CitaPlanificacionModule` y `PlanificadorCierreCitas` (módulo hermano que solo importa
  `AppModule`, registro a mano en `SchedulerRegistry`, `TrabajoSinSolapamiento`, nada con `PLANIFICADOR_ACTIVO=false`).
- **Logs**: `CAMPOS_SENSIBLES` (`src/shared/infrastructure/observabilidad/opciones-logger.ts`) redacta `contrasena`,
  `password`, `token`, `accessToken`, `body`…; no `contrasenaActual`, `contrasenaNueva` ni `mensaje` (la clave
  `mensaje` no la usa hoy ningún log).
- **Validación**: `ValidationPipe({ whitelist: true, transform: true })`, sin `forbidNonWhitelisted`: un campo
  desconocido se descarta en silencio.
- **Frontend**: un **401 global cierra la sesión** (`src/app/providers/index.ts`); el token se lee del almacenamiento
  en cada petición (`src/shared/lib/authToken.ts`, `localStorage` o `sessionStorage`) y el usuario va en `citia.user`
  (`src/entities/session/model/storedUser.ts`); `BaseAvatar.vue` ya dibuja iniciales; el enlace público lo arma el
  router con `tenantSlug` (`src/features/compartir-enlace-agenda/ui/CopiarEnlaceAgenda.vue`). El login traduce `rol`
  (`ADMINISTRADOR` → `admin`) en `src/features/auth/api/authApi.ts`.
- **Migraciones:** la última es `1750000018000`. Corren al arrancar el contenedor, en un solo lote
  (`migrationsTransactionMode = 'all'`).

---

## Decisiones

Las de producto son del usuario (2026-10-31) y **no se reabren**. Las marcadas **(AA)** las tomó el
`architecture-agent` al fijar el contrato; el porqué está en [ADR-15](../Decisions/ADR-15.md) y, cuando conviene que
el usuario las mire, en [Riesgos](#riesgos) o en [Preguntas abiertas](#preguntas-abiertas).

| Id | Decisión | Fuente |
|---|---|---|
| P1 | `especialidad` texto libre opcional (≤ 100). Sin foto: avatar con iniciales ([DT-57](../Deudas/DT-57.md)) | usuario |
| P2 | Correo solo lectura. Editables: `nombreCompleto` y `especialidad` | usuario |
| P3 | Nombre de la organización y enlace público en lectura; el slug nunca se edita ([DT-58](../Deudas/DT-58.md)) | usuario |
| P4 | Suscripción en lectura, solo `ADMINISTRADOR` (PROFESIONAL → 403): plan legible, alta, renovación y método de pago `null`, *"Sin cobro durante el piloto"*. Sin tabla nueva | usuario |
| P5 | Cambio de contraseña con corte de sesiones por `usuarios.sesiones_validas_desde` y token nuevo para la sesión actual. Actual obligatoria, nueva ≥ 8, distinta, límite de tasa. Sin correo de aviso | usuario |
| P6 | Recuperar la contraseña olvidada, fuera ([DT-03](../Deudas/DT-03.md)) | usuario |
| P7 | Soporte guarda en `mensajes_soporte` y envía por correo a una casilla configurable; límite de tasa; ≤ 2000 caracteres; aviso de no incluir datos de pacientes | usuario |
| P8 | `GET/PATCH /api/usuarios/me` y `PUT /api/usuarios/me/contrasena` en `usuario`; suscripción en `tenant`; módulo nuevo `soporte` | usuario |
| T1 | **(AA)** El corte se comprueba en `JwtStrategy.validate` (asíncrono) → `VerificarSesionService` → `IUsuarioRepository.estadoSesion` (una columna). **Sin caché.** Usuario inexistente → 401 | AA · ADR-15 §5 |
| T2 | **(AA)** `sesiones_validas_desde` `NULL` = sin corte (todos los existentes). Se escribe **truncada al segundo** con el reloj de la app. Vale si `iat × 1000 ≥ sesiones_validas_desde`. El token nuevo se firma con `iat` = ese segundo. Ventana < 1 s aceptada | AA · ADR-15 §5 |
| T3 | **(AA)** Puerto `EmisorSesion` en `usuario/domain`; adaptador `JwtEmisorSesion` en `auth`; `FirmaJwtModule` con el `JwtModule`; `crearPayloadJwt` único para el login y el emisor | AA · ADR-15 §6 |
| T4 | **(AA)** Contraseña actual incorrecta → **400**, nunca 401 (el frontend cierra la sesión con cualquier 401). Nueva: ≥ 8 caracteres **y ≤ 72 bytes UTF-8**. "Distinta" se comprueba contra el hash. `UPDATE` condicional al hash leído → 409 si cambió entretanto | AA · ADR-15 §4 |
| T5 | **(AA)** El perfil devuelve los campos de `LoginUsuarioDto` más `especialidad` y `creadoEn`. El enlace público lo arma el frontend con `tenantSlug`. `especialidad` solo se muestra en el perfil | AA · ADR-15 §1, §2 |
| T6 | **(AA)** `nombreCompleto`: 1 a 120 caracteres, sin espacios a los lados, no se puede borrar. `especialidad`: ≤ 100; `''` o `null` la borran | AA |
| T7 | **(AA)** Suscripción en `GET /api/organizacion/suscripcion`; catálogo de planes en `tenant/domain/plan.ts`; el 403 lo decide el caso de uso con el `rol` del token | AA · ADR-15 §3 |
| T8 | **(AA)** La fila de `mensajes_soporte` **es** la fila de trabajo; la envía el job `soporte.envio` cada minuto. **Sin hecho en `eventos_salida`** (P7 "vía outbox" se cumple con la fila, ver [contradicción 1](#contradicciones-con-lo-pedido)) | AA · ADR-15 §7 |
| T9 | **(AA)** Se reutilizan `CanalMensajeria` y `crearCanalMensajeria` de `recordatorio`, sin importar `RecordatorioModule` ([DT-59](../Deudas/DT-59.md)) | AA · ADR-15 opción F2 |
| T10 | **(AA)** `SOPORTE_CORREO_DESTINO` **opcional**: sin ella el job no se registra y los mensajes esperan en `pendiente`; `warn` al arrancar | AA · ADR-15 §7 |
| T11 | **(AA)** Tope de **5 mensajes por organización en 24 horas** (429, en el caso de uso) y cubos `cambioContrasena` y `soporte`, de **5 por hora por IP** | AA · ADR-15 §7, §8 |
| T12 | **(AA)** Categoría cerrada **opcional**: `problema \| consulta \| sugerencia \| otro` (ausente → `otro`). Ver la [pregunta 4](#preguntas-abiertas) | AA |
| T13 | **(AA)** Remitente `CORREO_REMITENTE`; `Reply-To` = correo del profesional **leído al enviar**; destino = `SOPORTE_CORREO_DESTINO` | AA |
| T14 | **(AA)** **Dos migraciones**, `1750000019000` (usuarios) y `1750000020000` (`mensajes_soporte`), una por tabla, como en las fases anteriores | AA |

### Contradicciones con lo pedido

1. **P7 dice "lo envía por correo vía outbox"** y [ADR-12 §4](../Decisions/ADR-12.md), regla 4, prohíbe que un
   suscriptor del outbox tenga efectos externos (*"Una alerta futura (RF-05) debe seguir el mismo patrón"*). Este plan
   cumple la intención (el correo sale después del commit, por otro proceso, con reintentos) con el patrón que la
   regla pide: la fila de `mensajes_soporte`, escrita en la transacción de la petición, es la fila de trabajo de un
   job. No hay hecho ni suscriptor (T8).
2. **[DT-36](../Deudas/DT-36.md)** dice *"Si entra otro tipo de correo, mover el contador a una tabla propia de
   envíos"*. Soporte es ese otro tipo. Este plan **no** construye el contador común: el tope por organización (T11)
   acota el consumo, y queda anotado en DT-36 y en [DT-59](../Deudas/DT-59.md).
3. **[DT-02](../Deudas/DT-02.md)** pedía el guard de rol *"en el mismo release que el alta de usuarios. No antes"*. P4
   introduce el primer 403 por rol antes de DT-07; se hace con una comprobación local (T7), no con el guard general.
4. **El encargo hablaba de "la migración `1750000019000`"**, en singular. Son dos (T14).

---

## Modelo de datos

Dos migraciones TypeORM nuevas, versionadas ([ADR-00](../Decisions/ADR-00.md)), **aditivas** y **reversibles en
`down`**. Las entidades ORM declaran las mismas columnas, CHECK e índices para que el esquema de `synchronize` de los
tests quede igual al de la migración. Estados y categorías van como `VARCHAR` + `CHECK`, no como tipo enum: así no
aparece la diferencia de nombres de tipo entre la migración y `synchronize` (ver `context/US/07.01-registro-hechos.md`).

### `1750000019000-AddPerfilYSesionesAUsuarios.ts` (`usuarios`)

| Columna | Tipo | Notas |
|---|---|---|
| `especialidad` | `VARCHAR(100)` **NULL** | `NULL` = sin especialidad; nunca vacía |
| `sesiones_validas_desde` | `TIMESTAMPTZ` **NULL** | `NULL` = sin corte. Solo la escribe el cambio de contraseña, truncada al segundo |

```sql
ALTER TABLE "usuarios" ADD COLUMN "especialidad" VARCHAR(100);

ALTER TABLE "usuarios"
  ADD CONSTRAINT "CHK_usuarios_especialidad_no_vacia"
  CHECK ("especialidad" IS NULL OR btrim("especialidad") <> '');

ALTER TABLE "usuarios" ADD COLUMN "sesiones_validas_desde" TIMESTAMPTZ;
```

- **Sin relleno:** las filas existentes quedan con las dos columnas en `NULL`. **Nadie pierde su sesión al migrar.**
- Sin índice nuevo: `estadoSesion` busca por la clave primaria.
- ORM (`usuario.orm-entity.ts`): `@Column({ name: 'especialidad', type: 'varchar', length: 100, nullable: true })`,
  `@Check('CHK_usuarios_especialidad_no_vacia', …)` y `@Column({ name: 'sesiones_validas_desde', type:
  'timestamptz', nullable: true })`.
- `down`: `DROP CONSTRAINT` → `DROP COLUMN "sesiones_validas_desde"` → `DROP COLUMN "especialidad"`. ⚠️ Pierde las
  especialidades, y los tokens anteriores a un cambio de contraseña **vuelven a valer** hasta vencer (como mucho, 1 día).

### `1750000020000-CreateMensajesSoporte.ts` (`mensajes_soporte`)

```sql
CREATE TABLE "mensajes_soporte" (
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            UUID         NOT NULL,
  "usuario_id"           UUID         NOT NULL,
  "categoria"            VARCHAR(20)  NOT NULL DEFAULT 'otro',
  "mensaje"              TEXT         NOT NULL,
  "estado_envio"         VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  "intentos"             INTEGER      NOT NULL DEFAULT 0,
  "proximo_intento_en"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "ultimo_error"         VARCHAR(100),
  "proveedor"            VARCHAR(20),
  "proveedor_mensaje_id" VARCHAR(100),
  "enviado_en"           TIMESTAMPTZ,
  "creado_en"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "PK_mensajes_soporte_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_mensajes_soporte_tenant_id" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FK_mensajes_soporte_usuario_id" FOREIGN KEY ("usuario_id")
    REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CHK_mensajes_soporte_categoria"
    CHECK ("categoria" IN ('problema', 'consulta', 'sugerencia', 'otro')),
  CONSTRAINT "CHK_mensajes_soporte_mensaje"
    CHECK (char_length("mensaje") BETWEEN 1 AND 2000 AND btrim("mensaje") <> ''),
  CONSTRAINT "CHK_mensajes_soporte_estado_envio"
    CHECK ("estado_envio" IN ('pendiente', 'enviado', 'fallido')),
  CONSTRAINT "CHK_mensajes_soporte_enviado"
    CHECK (("estado_envio" = 'enviado') = ("enviado_en" IS NOT NULL)),
  CONSTRAINT "CHK_mensajes_soporte_intentos" CHECK ("intentos" >= 0)
);

-- El job: solo mira las pendientes por próximo intento.
CREATE INDEX "idx_mensajes_soporte_pendientes"
  ON "mensajes_soporte" ("proximo_intento_en") WHERE "estado_envio" = 'pendiente';

-- El tope por organización: cuenta las de las últimas 24 horas.
CREATE INDEX "idx_mensajes_soporte_tenant_creado"
  ON "mensajes_soporte" ("tenant_id", "creado_en");
```

- **El texto no tiene plazo de conservación** todavía ([DT-26](../Deudas/DT-26.md), [pregunta 5](#preguntas-abiertas)).
- `proveedor` = `'resend'` o `'registro'`: con `registro` (staging) un mensaje queda `enviado` **sin haber salido**,
  como los recordatorios ([DT-40](../Deudas/DT-40.md)).
- `ultimo_error` guarda **solo un código** (`<nombre del error>` o el código de Resend), nunca un mensaje.
- `char_length` cuenta caracteres; el `MaxLength` de `class-validator` cuenta unidades UTF-16, que nunca son menos: lo
  que pasa el DTO pasa el CHECK.
- Para que el planificador use el índice parcial, la consulta escribe el predicado **igual**:
  `"estado_envio" = 'pendiente'`.
- `down`: `DROP TABLE "mensajes_soporte"` (los índices caen con ella). ⚠️ Pierde todos los mensajes.

---

## Dominio

### `usuario`

| Dónde | Qué |
|---|---|
| `domain/usuario.entity.ts` | `especialidad: string \| null` y `sesionesValidasDesde: Date \| null`. Constantes `LARGO_MAXIMO_NOMBRE = 120` y `LARGO_MAXIMO_ESPECIALIDAD = 100`. Función pura `normalizarCambiosPerfil(cambios)`: recorta; `nombreCompleto` vacío o > 120 → `PerfilInvalidoError`; `especialidad` `''` → `null`, > 100 → `PerfilInvalidoError` |
| `domain/sesiones.ts` (nuevo) | `inicioSesionesValidas(ahora: Date): Date` = `ahora` truncado al segundo. `tokenEmitidoVigente(iat: number \| undefined, sesionesValidasDesde: Date \| null): boolean` (regla de T2) |
| `domain/contrasena.ts` (nuevo) | `LARGO_MINIMO_CONTRASENA = 8`, `BYTES_MAXIMOS_CONTRASENA = 72`, `validarContrasenaNueva(texto)` → `ContrasenaNoValidaError` (bytes con `new TextEncoder().encode(texto).length`) |
| `domain/emisor-sesion.ts` (nuevo) | puerto `abstract class EmisorSesion { abstract emitir(usuario: Usuario, emitidoEn: Date): string; }` |
| `domain/usuario.repository.ts` | métodos nuevos (abajo) |
| `domain/exceptions/` (nuevos) | `UsuarioNoEncontradoError`, `PerfilInvalidoError`, `ContrasenaActualIncorrectaError`, `ContrasenaNoValidaError`, `ContrasenaRepetidaError`, `ContrasenaCambiadaEnParaleloError` |

```ts
export interface CambiosPerfil {
  nombreCompleto?: string;
  especialidad?: string | null;
}

export interface CambioContrasena {
  hashAnterior: string;
  hashNuevo: string;
  sesionesValidasDesde: Date;
}

export interface EstadoSesionUsuario {
  sesionesValidasDesde: Date | null;
}

export abstract class IUsuarioRepository {
  // existentes: findByEmailAndTenant, guardar
  abstract findById(id: string, tenantId: string, tx?: TransactionContext): Promise<Usuario | null>;
  /** Actualiza solo lo presente y `actualizado_en`; devuelve la fila completa o null si no existe. */
  abstract actualizarPerfil(id: string, tenantId: string, cambios: CambiosPerfil, tx?: TransactionContext): Promise<Usuario | null>;
  /** UPDATE condicional al hash anterior. true si escribió. */
  abstract cambiarContrasena(id: string, tenantId: string, cambio: CambioContrasena, tx?: TransactionContext): Promise<boolean>;
  /** Solo la columna del corte; null si el usuario no existe en ese tenant. Lo llama la estrategia JWT. */
  abstract estadoSesion(id: string, tenantId: string): Promise<EstadoSesionUsuario | null>;
}
```

```sql
-- estadoSesion
SELECT "sesiones_validas_desde" FROM "usuarios" WHERE "id" = $1 AND "tenant_id" = $2;

-- cambiarContrasena (true si rowCount = 1)
UPDATE "usuarios"
   SET "password_hash" = $3, "sesiones_validas_desde" = $5, "actualizado_en" = now()
 WHERE "id" = $1 AND "tenant_id" = $2 AND "password_hash" = $4;
```

### `tenant`

| Dónde | Qué |
|---|---|
| `domain/plan.ts` (nuevo) | `PLAN_PILOTO = 'free'`; `describirPlan(codigo: string): { nombre: string; descripcion: string \| null }`. `free` → `{ nombre: 'Plan piloto', descripcion: 'Sin cobro durante el piloto' }` (el nombre es provisional hasta [Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free)). Un código desconocido → `{ nombre: codigo, descripcion: null }` |
| `domain/exceptions/solo-administrador.error.ts` (nuevo) | `SoloAdministradorError`: *"Solo el administrador de la organización puede ver la suscripción"* |

### `soporte` (módulo nuevo)

| Dónde | Qué |
|---|---|
| `domain/mensaje-soporte.entity.ts` | `enum CategoriaSoporte { PROBLEMA = 'problema', CONSULTA = 'consulta', SUGERENCIA = 'sugerencia', OTRO = 'otro' }`, `enum EstadoEnvioSoporte { PENDIENTE = 'pendiente', ENVIADO = 'enviado', FALLIDO = 'fallido' }`. `MensajeSoporte.crear({ tenantId, usuarioId, categoria, mensaje })` recorta el texto (solo los extremos) y exige 1 a 2000 → `MensajeSoporteInvalidoError`. `reconstituir(…)`. Transiciones, solo desde `pendiente`: `marcarEnviado(proveedor, proveedorMensajeId \| null, ahora)`, `registrarFallo(codigo, ahora, politica)` (suma un intento; `fallido` al agotar, si no, `proximoIntentoEn` con `calcularEsperaReintentoMs`), `posponer(hasta)` (sin sumar intento), `marcarFallido(codigo)` |
| `domain/limites-soporte.ts` | `LARGO_MAXIMO_MENSAJE_SOPORTE = 2000`, `TOPE_MENSAJES_SOPORTE_24H = 5`, `POLITICA_REINTENTO_SOPORTE = { maxIntentos: 8, esperaBaseMs: 60_000, esperaMaximaMs: 3_600_000, variacion: 0.2 }`, `ESPERA_CUOTA_AGOTADA_MS = 3_600_000` |
| `domain/mensaje-soporte.repository.ts` | puerto (abajo); **`tx` obligatorio** en todo |
| `domain/exceptions/` | `MensajeSoporteInvalidoError`, `TopeMensajesSoporteError` |

```ts
export abstract class MensajeSoporteRepository {
  abstract insertar(mensaje: MensajeSoporte, tx: TransactionContext): Promise<MensajeSoporte>;
  abstract contarCreadosDesde(tenantId: string, desde: Date, tx: TransactionContext): Promise<number>;
  /** BARRIDO GLOBAL (ADR-12 §6): la pendiente más antigua por próximo intento, bloqueada (FOR UPDATE SKIP LOCKED), o null. */
  abstract reclamarSiguientePendiente(ahora: Date, tx: TransactionContext): Promise<MensajeSoporte | null>;
  /** Bloquea una fila por id (FOR UPDATE), para registrar un fallo tras revertir. */
  abstract bloquearPorId(id: string, tx: TransactionContext): Promise<MensajeSoporte | null>;
  /** Persiste estado_envio, intentos, proximo_intento_en, ultimo_error, proveedor, proveedor_mensaje_id y enviado_en. */
  abstract guardarEnvio(mensaje: MensajeSoporte, tx: TransactionContext): Promise<void>;
}
```

```sql
-- reclamarSiguientePendiente — BARRIDO GLOBAL (ADR-12 §6)
SELECT <columnas> FROM "mensajes_soporte"
 WHERE "estado_envio" = 'pendiente' AND "proximo_intento_en" <= $1
 ORDER BY "proximo_intento_en", "id"
 LIMIT 1
 FOR UPDATE SKIP LOCKED;
```

`FOR UPDATE` (y no `FOR NO KEY UPDATE`): ninguna tabla referencia a `mensajes_soporte`, como `eventos_salida`.

### Errores y su código HTTP

| Error | Cuándo | HTTP |
|---|---|---|
| validación del DTO | formato | **400** |
| `PerfilInvalidoError` | nombre vacío tras recortar o largos fuera de rango (red de seguridad del DTO) | **400** |
| `UsuarioNoEncontradoError` | el usuario del token no existe en su organización (inalcanzable tras la estrategia, salvo una carrera) | **401** |
| `ContrasenaActualIncorrectaError` | la actual no coincide | **400** — *"La contraseña actual no es correcta"*. **Nunca 401** |
| `ContrasenaNoValidaError` | < 8 caracteres o > 72 bytes | **400** |
| `ContrasenaRepetidaError` | la nueva es la actual | **400** — *"La nueva contraseña debe ser distinta de la actual"* |
| `ContrasenaCambiadaEnParaleloError` | el `UPDATE` condicional no escribió | **409** — *"Tu contraseña cambió mientras tanto; vuelve a intentarlo"* |
| `SoloAdministradorError` | suscripción pedida por un no `ADMINISTRADOR` | **403** |
| `OrganizacionNoEncontradaError` | *(agregado al implementar, 2026-11-01)* la organización del token ya no existe, en la suscripción (inalcanzable tras la estrategia, salvo una carrera) | **401** |
| `MensajeSoporteInvalidoError` | texto vacío tras recortar (red de seguridad del DTO) | **400** |
| `TopeMensajesSoporteError` | 5 o más mensajes de la organización en las últimas 24 horas | **429** — *"Ya enviaste 5 mensajes a soporte en las últimas 24 horas. Vuelve a intentarlo más tarde."* |
| cubo `cambioContrasena` o `soporte` | más de 5 por hora por IP | **429** genérico del límite de tasa |

---

## Aplicación y API

### Rutas (prefijo global `/api`, todas con `JwtAuthGuard`)

| Método | Ruta | Módulo · controller | Límite | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/usuarios/me` | `usuario` · `PerfilController` | — | 200 `PerfilDto` | 401 |
| PATCH | `/usuarios/me` | `usuario` · `PerfilController` | — | 200 `PerfilDto` | 400, 401 |
| PUT | `/usuarios/me/contrasena` | `usuario` · `PerfilController` | `cambioContrasena` | 200 `ContrasenaCambiadaDto` | 400, 401, 409, 429 |
| GET | `/organizacion/suscripcion` | `tenant` · `SuscripcionController` | — | 200 `SuscripcionDto` | 401, 403 |
| POST | `/soporte/mensajes` | `soporte` · `SoporteController` | `soporte` | 201 `MensajeSoporteCreadoDto` | 400, 401, 429 |

- `PerfilController` es **otro controller** (`@Controller('usuarios/me')`, `@UseGuards(JwtAuthGuard)` en la clase): el
  registro (`POST /usuarios`) sigue público en `UsuariosController`.
- Todo sale de `@CurrentUser()` (`userId`, `tenantId`, `rol`); nada del cuerpo.
- Con el límite de tasa activo, el 429 del cubo llega **antes** que el 401 (el guard global corre primero).

### DTO

```ts
// usuario/presentation/dto/perfil.dto.ts — respuesta de GET y PATCH /usuarios/me
export class PerfilDto {
  id: string;
  email: string;
  nombreCompleto: string;
  especialidad: string | null;
  rol: RolUsuario;
  tenantId: string;
  tenantSlug: string;     // el frontend arma el enlace /agendar-cita/<slug>
  tenantNombre: string;
  creadoEn: Date;
}

// usuario/presentation/dto/actualizar-perfil.dto.ts — cuerpo de PATCH /usuarios/me
export class ActualizarPerfilDto {
  // Ausente → no cambia. Presente → texto no vacío tras recortar, ≤ 120. null → 400 (no se borra).
  @ValidateIf((o: ActualizarPerfilDto) => o.nombreCompleto !== undefined)
  @Transform(recortar) @IsString() @IsNotEmpty() @MaxLength(LARGO_MAXIMO_NOMBRE)
  nombreCompleto?: string;

  // Ausente → no cambia. null o '' (tras recortar) → se borra. ≤ 100.
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(LARGO_MAXIMO_ESPECIALIDAD)
  especialidad?: string | null;
}

// usuario/presentation/dto/cambiar-contrasena.dto.ts — cuerpo de PUT /usuarios/me/contrasena
export class CambiarContrasenaDto {
  @IsString() @IsNotEmpty() @MaxLength(1024)
  contrasenaActual: string;

  // ≥ 8 aquí; el tope de 72 bytes lo valida el dominio (class-validator cuenta caracteres).
  @IsString() @MinLength(8) @MaxLength(1024)
  contrasenaNueva: string;
}

// usuario/presentation/dto/contrasena-cambiada.dto.ts
export class ContrasenaCambiadaDto {
  accessToken: string;
}

// tenant/presentation/dto/suscripcion.dto.ts — respuesta de GET /organizacion/suscripcion
export class SuscripcionDto {
  plan: string;                 // código interno, hoy 'free'
  planNombre: string;           // Q18; provisional 'Plan piloto'
  descripcion: string | null;   // 'Sin cobro durante el piloto'
  altaEn: Date;                 // tenants.creado_en
  renovacionEn: Date | null;    // siempre null en la v1
  metodoPago: string | null;    // siempre null en la v1
}

// soporte/presentation/dto/crear-mensaje-soporte.dto.ts — cuerpo de POST /soporte/mensajes
export class CrearMensajeSoporteDto {
  @IsOptional()
  @IsEnum(CategoriaSoporte, { message: 'categoria debe ser problema, consulta, sugerencia u otro' })
  categoria?: CategoriaSoporte;   // ausente → 'otro'

  @Transform(recortar) @IsString() @IsNotEmpty() @MaxLength(LARGO_MAXIMO_MENSAJE_SOPORTE)
  mensaje: string;
}

// soporte/presentation/dto/mensaje-soporte-creado.dto.ts — respuesta 201
export class MensajeSoporteCreadoDto {
  id: string;
  creadoEn: Date;
}
```

- `recortar` = `({ value }) => (typeof value === 'string' ? value.trim() : value)` con `@Transform` de
  `class-transformer`, en `presentation` (como `@NormalizarCorreo`). El dominio vuelve a recortar y validar.
- `email`, `rol`, `tenantId` o `slug` en el cuerpo del `PATCH` **se descartan en silencio** (`whitelist`); la respuesta
  muestra el correo sin cambios.
- Un `PATCH` sin ningún campo → 200 con el perfil actual, **sin escribir**.

### Casos de uso

**`PerfilService`** (`usuario/application/perfil.service.ts`; `IUsuarioRepository`, `ITenantRepository`,
`TransactionRunner`):

- `obtener({ userId, tenantId })` → `findById` + `ITenantRepository.findById(tenantId)` → `PerfilDto`. Usuario (u
  organización) inexistente → `UsuarioNoEncontradoError`.
- `actualizar({ userId, tenantId }, dto)` → `normalizarCambiosPerfil` → si no hay cambios, `obtener`; si no, en una
  transacción `actualizarPerfil` y arma el `PerfilDto`.

**`CambiarContrasenaService`** (`usuario/application/cambiar-contrasena.service.ts`; `IUsuarioRepository`,
`TransactionRunner`, `EmisorSesion`, `reloj: () => Date = () => new Date()`):

```
cambiar({ userId, tenantId }, dto):
  usuario = findById(userId, tenantId)                         → null: UsuarioNoEncontradoError (401)
  si !bcrypt.compare(dto.contrasenaActual, usuario.passwordHash) → ContrasenaActualIncorrectaError (400)
  validarContrasenaNueva(dto.contrasenaNueva)                   → ContrasenaNoValidaError (400)
  si bcrypt.compare(dto.contrasenaNueva, usuario.passwordHash)   → ContrasenaRepetidaError (400)
  hashNuevo = bcrypt.hash(dto.contrasenaNueva, 10)               (fuera de la transacción)
  ahora = reloj(); desde = inicioSesionesValidas(ahora)
  tx.run: cambiarContrasena(userId, tenantId, { hashAnterior: usuario.passwordHash, hashNuevo, sesionesValidasDesde: desde })
          false → ContrasenaCambiadaEnParaleloError (409)
  accessToken = emisor.emitir(usuario, desde)                    (iat = desde, en segundos)
  → ContrasenaCambiadaDto
```

- `emitir` recibe **`desde`** (ya truncado): el `iat` del token nuevo es exactamente el corte.
- El log `usuarios.contrasena_cambiada` (`info`, `usuarioId`, `tenantId`) lo escribe el controller tras el 200.

**`ConsultarSuscripcionService`** (`tenant/application/consultar-suscripcion.service.ts`; `ITenantRepository`):

- `consultar({ tenantId, rol })`: `rol !== RolUsuario.ADMINISTRADOR` → `SoloAdministradorError` (403) **antes** de
  leer nada; organización inexistente → 401 (inalcanzable tras la estrategia); si no, `describirPlan(tenant.plan)` →
  `SuscripcionDto` con `renovacionEn: null` y `metodoPago: null`. `tenant/application` importa `RolUsuario` de
  `usuario/domain` (mismo patrón que `usuario/application` → `tenant/domain`).

**`RegistrarMensajeSoporteService`** (`soporte/application/registrar-mensaje-soporte.service.ts`; `TransactionRunner`,
`MensajeSoporteRepository`, `reloj`):

- `registrar({ userId, tenantId }, dto)`: en una transacción, `contarCreadosDesde(tenantId, ahora − 24 h)`; si ≥ 5 →
  `TopeMensajesSoporteError`; si no, `MensajeSoporte.crear(…)` → `insertar` → `{ id, creadoEn }`.
- Dos peticiones simultáneas pueden dejar 6: el tope es blando, a propósito (sin bloqueo por organización).
- El controller registra `soporte.mensaje_recibido` (`info`: `mensajeId`, `tenantId`, `usuarioId`, `categoria`), sin
  el texto.

**`EnviarMensajesSoporteService`** (`soporte/application/enviar-mensajes-soporte.service.ts`; `TransactionRunner`,
`MensajeSoporteRepository`, `IUsuarioRepository`, `ITenantRepository`, `CanalMensajeria`, `{ destino: string; tz:
string }`, `reloj`):

```ts
export interface OpcionesEnvioSoporte { lote: number; continuar?: () => boolean; }

export interface ResultadoEnvioSoporte {
  procesados: number;
  enviados: number;
  reintentos: number;
  pospuestos: number;                                   // cuota agotada
  fallidos: { mensajeId: string; tenantId: string; codigo: string }[];
  configuracion: string | null;                         // código si se cortó el lote por configuración
  interrumpido: boolean;
}
```

Por cada mensaje, hasta `lote`, **una transacción**: `reclamarSiguientePendiente(ahora)` → sin fila, termina →
`findById(usuarioId, tenantId)` y `ITenantRepository.findById(tenantId)` → `armarCorreoSoporte(…)` →
`canal.enviar(…)` → aplica el resultado → `guardarEnvio` → commit.

| Resultado del canal | Efecto en la fila | Lote |
|---|---|---|
| `aceptado` | `enviado`, `enviado_en`, `proveedor`, `proveedor_mensaje_id` | sigue |
| `posible_duplicado` | `enviado` sin id | sigue |
| `transitorio` | `registrarFallo(codigo)`: intento + 1 y espera (1, 2, 4, 8, 16, 32, 60 min); al **octavo** fallo, `fallido` | sigue |
| `cuota_agotada` | `posponer(ahora + 1 h)`, **sin** sumar intento | se corta |
| `permanente` | `marcarFallido(codigo)` | sigue |
| `configuracion` | **no se toca** la fila (sigue `pendiente`, igual `proximo_intento_en`) | se corta |
| excepción propia (no del proveedor) | se revierte; en **otra** transacción, `bloquearPorId` → `registrarFallo(error.name)` → `guardarEnvio` | sigue |

- `continuar()` en `false` antes de reclamar → `interrumpido = true` (apagado ordenado).
- Si falla el **reclamo** mismo (infraestructura), el error sube al planificador.
- **Idempotencia:** `claveIdempotencia = 'soporte/' + id`; Resend la recuerda 24 h. Si Resend aceptó y el commit
  falló, el reintento no duplica el correo.
- **Varias réplicas:** `SKIP LOCKED` reparte las filas; cada mensaje se envía una vez.
- El servicio **no registra logs** (no conoce Nest): devuelve el resultado y el planificador lo registra.

**`armarCorreoSoporte`** (`soporte/application/plantilla-mensaje-soporte.ts`, función pura):

```ts
export interface DatosCorreoSoporte {
  mensaje: MensajeSoporte;
  usuario: { nombreCompleto: string; email: string; rol: string } | null;   // null si ya no existe
  organizacion: { nombre: string; slug: string } | null;
}
export function armarCorreoSoporte(datos: DatosCorreoSoporte, tz: string): { asunto: string; html: string; texto: string };
```

- **Asunto:** `Soporte · <Categoría legible> · <nombre de la organización>` (sin saltos de línea; organización
  recortada a 60 caracteres).
- **Cuerpo** (texto y HTML): *De*, nombre, correo y rol · *Organización*, nombre y slug · *Recibido*, fecha y hora de
  `creado_en` en `APP_TZ` · *Categoría* · *Ids*, mensaje, usuario y organización · el texto. En el HTML **todo** dato
  se escapa y el texto conserva sus saltos de línea (`white-space: pre-wrap`).
- **Determinista** para un mismo mensaje (usa `creado_en`, no la hora del envío): un reintento genera el mismo correo.
- El `MensajeSaliente`: `destinatario` = `destino`, `responderA` = correo del profesional (o `null` si ya no existe),
  `claveIdempotencia` = `soporte/<id>`, `etiquetas` = `{ mensaje_soporte_id: <id> }`.

### Corte de sesiones en `auth`

| Archivo | Cambio |
|---|---|
| `auth/firma-jwt.module.ts` (nuevo) | `FirmaJwtModule`: el `JwtModule.registerAsync` que hoy está en `AuthModule` (misma configuración), `ITokenSigner` → `JwtTokenSigner`, `EmisorSesion` → `JwtEmisorSesion` (fábrica). Exporta `JwtModule`, `ITokenSigner` y `EmisorSesion` |
| `auth/infrastructure/jwt-emisor-sesion.ts` (nuevo) | `JwtEmisorSesion extends EmisorSesion`: `emitir(usuario, emitidoEn)` = `signer.sign(crearPayloadJwt(usuario, emitidoEn))` |
| `auth/jwt-payload.interface.ts` | `JwtPayload` suma `iat?: number` y `exp?: number`. Nueva `crearPayloadJwt(usuario: Pick<Usuario, 'id' \| 'email' \| 'tenantId' \| 'rol'>, emitidoEn?: Date): JwtPayload`; con `emitidoEn`, `iat = Math.floor(emitidoEn.getTime() / 1000)` |
| `auth/application/auth.service.ts` | `login` usa `crearPayloadJwt(usuario)` (sin `emitidoEn`: `iat` lo pone `jsonwebtoken`). Sin otro cambio |
| `auth/application/verificar-sesion.service.ts` (nuevo) | `VerificarSesionService(usuarios: IUsuarioRepository)`: `vigente(usuarioId, tenantId, iat?): Promise<boolean>` = `estadoSesion` → `null` → `false`; si no, `tokenEmitidoVigente(iat, estado.sesionesValidasDesde)` |
| `auth/jwt.strategy.ts` | constructor suma `VerificarSesionService`; `async validate(payload)`: si `!vigente(payload.sub, payload.tenantId, payload.iat)` → `throw new UnauthorizedException()`; si no, el mismo `AuthenticatedUser` de hoy. El comentario *"No consulta la base de datos"* se corrige |
| `auth/auth.module.ts` | importa `FirmaJwtModule` (y deja de registrar el `JwtModule` y `ITokenSigner`), provee `VerificarSesionService` con fábrica (`inject: [IUsuarioRepository]`); `exports: [FirmaJwtModule, PassportModule, JwtAuthGuard]` |

- **401 por corte:** el log `auth.sesion_cortada` (`info`, `usuarioId`, `tenantId`, `motivo: 'anterior_al_corte' |
  'usuario_inexistente'`) en la estrategia. Nunca el token.

### Logs (solo ids, conteos, estados y códigos; nunca contraseñas, tokens, correos ni el texto)

| Cuándo | Nivel | Línea |
|---|---|---|
| Contraseña cambiada | info | `{ evento: 'usuarios.contrasena_cambiada', usuarioId, tenantId }` |
| Token anterior al corte o usuario inexistente | info | `{ evento: 'auth.sesion_cortada', usuarioId, tenantId, motivo }` |
| Mensaje a soporte recibido | info | `{ evento: 'soporte.mensaje_recibido', mensajeId, tenantId, usuarioId, categoria }` |
| Tope por organización | info | `{ evento: 'soporte.tope_diario', tenantId }` |
| Arranque con el job | info | `{ evento: 'planificador.activo', jobs: ['soporte.envio'], msg: 'Envío a soporte: cada minuto (<APP_TZ>)' }` |
| Arranque sin destino | warn | `{ evento: 'soporte.sin_destino', msg: 'SOPORTE_CORREO_DESTINO vacía: los mensajes a soporte se guardan y no se envían' }` |
| Tick con trabajo (`procesados > 0`) | info | `{ evento: 'soporte.envio', enviados, reintentos, pospuestos, fallidos: <n>, interrumpido }` |
| Un mensaje pasó a `fallido` | error | `{ evento: 'soporte.envio_fallido', alerta: 'soporte.envio_fallido', mensajeId, tenantId, codigo }` |
| Lote cortado por configuración | error | `{ evento: 'soporte.envio_configuracion', alerta: 'soporte.envio_configuracion', codigo }` |
| Cuota agotada | warn | `{ evento: 'soporte.envio_cuota', codigo }` |
| El tick falló | error | `{ evento: 'soporte.envio.fallido', err, msg: 'El envío a soporte falló (infraestructura)' }` |
| *(agregado al implementar, 2026-11-01)* Error propio en un mensaje (el canal lanzó o pasó de 11 s, o una transición inválida) | warn | `{ evento: 'soporte.envio_error_interno', mensajeId, tenantId, codigo }` |

`CAMPOS_SENSIBLES` suma `contrasenaActual`, `contrasenaNueva` y `mensaje`. *(2026-11-01: la clave `mensaje` se redacta
**entera en cualquier log**; un log que quiera registrar un `MensajeSaliente` tiene que usar otra clave.)*

---

## Variable de entorno

| Variable | Tipo | Defecto | Validación | Quién |
|---|---|---|---|---|
| `SOPORTE_CORREO_DESTINO` | correo | **ninguno**, en todos los entornos | `l.valor(…)`; si viene, debe ser una dirección simple (`algo@dominio.tld`, sin nombre ni `<>`) o el arranque se detiene. **No es obligatoria en producción** | `backend-agent` |

- Se agrega a `Entorno` (`SOPORTE_CORREO_DESTINO?: string`) y a `.env.example` (comentada, con su explicación).
  *(2026-11-01: la validación rechaza también listas —`,` o `;`—, un nombre visible y `<>`.)*
- **Sin ella** (T10): `PlanificadorSoporte` no registra el job y deja `soporte.sin_destino` (`warn`) al arrancar; los
  mensajes se guardan y esperan en `pendiente`. Al cargarla (Railway redespliega), el primer tick los envía.
- **Opcional a propósito:** una variable obligatoria nueva tumbó production ~9 minutos en la Fase 3
  ([incidente](../Fases/fase-3-us04-respuesta-paciente.md#incidente-production-caído-9-minutos)).
- **El valor** lo da el usuario ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)). Staging puede quedar sin
  ella o con la misma casilla: con `MENSAJERIA_ADAPTADOR=registro` no sale nada igual.
- Se reutilizan `MENSAJERIA_ADAPTADOR`, `RESEND_API_KEY`, `CORREO_REMITENTE` y `APP_TZ`. **No hay variable nueva** para
  el tope, la cadencia ni los reintentos (constantes de dominio).

---

## Límite de tasa

En `LIMITES_TASA` (`src/shared/presentation/limitar-tasa.decorator.ts`), con su prueba en
`opciones-limite-tasa.spec.ts`:

```ts
/** `PUT /api/usuarios/me/contrasena` (US-10). */
cambioContrasena: { limite: 5, ventanaMs: HORA_MS, clave: 'ip' },
/** `POST /api/soporte/mensajes` (US-10). Además, 5 por organización en 24 h en el caso de uso. */
soporte: { limite: 5, ventanaMs: HORA_MS, clave: 'ip' },
```

- Al pasarse, bloqueado una ventana completa (una hora), como los demás cubos.
- Por IP: ver [ADR-15 §8](../Decisions/ADR-15.md#8-límite-de-tasa). Las personas de una clínica detrás de una misma IP
  comparten el cupo ([DT-04](../Deudas/DT-04.md)).
- `GET` y `PATCH /usuarios/me` y la suscripción no llevan cubo: son baratos y exigen sesión.

---

## Módulos y dependencias

| Módulo | Qué suma | Importa |
|---|---|---|
| `auth` | `FirmaJwtModule`, `JwtEmisorSesion`, `VerificarSesionService`, `JwtStrategy` asíncrona, `crearPayloadJwt` | `PassportModule`, `FirmaJwtModule`, `TenantModule`, `UsuariosModule` |
| `usuario` | `PerfilController`, `PerfilService`, `CambiarContrasenaService`, dominio de perfil, sesiones y contraseña, `EmisorSesion` (puerto), métodos nuevos del repositorio | `TypeOrmModule.forFeature([UsuarioOrmEntity])`, `TenantModule`, `SharedModule`, **`FirmaJwtModule`** |
| `tenant` | `SuscripcionController`, `ConsultarSuscripcionService`, `plan.ts`, `SoloAdministradorError` | `TypeOrmModule.forFeature([TenantOrmEntity])` |
| `soporte` (nuevo) | dominio, `RegistrarMensajeSoporteService`, `EnviarMensajesSoporteService` (exportado), plantilla, `SoporteController`, ORM y adaptador; provee `CanalMensajeria` con `crearCanalMensajeria` y la configuración del entorno | `TypeOrmModule.forFeature([MensajeSoporteOrmEntity])`, `SharedModule`, `UsuariosModule`, `TenantModule` |
| `soporte-planificacion` (nuevo, `soporte/soporte-planificacion.module.ts`) | `PlanificadorSoporte` | `SoporteModule`. **Solo lo importa `AppModule`** |
| `shared` | dos cubos, `SOPORTE_CORREO_DESTINO`, tres campos sensibles | — |
| `app.module.ts` | importa `SoporteModule` y `SoportePlanificacionModule` | — |

- **Sin ciclos:** `AuthModule → UsuariosModule → FirmaJwtModule`; `FirmaJwtModule` no importa nada del negocio.
  `SoporteModule` no importa `RecordatorioModule` (lo usa por archivo, [DT-59](../Deudas/DT-59.md)).
- **Cableado** con `useFactory` + `inject` y los puertos como token (ADR-02):

```ts
// usuarios.module.ts (además de lo que ya tiene)
{ provide: PerfilService,
  useFactory: (ur: IUsuarioRepository, tr: ITenantRepository, tx: TransactionRunner) => new PerfilService(ur, tr, tx),
  inject: [IUsuarioRepository, ITenantRepository, TransactionRunner] },
{ provide: CambiarContrasenaService,
  useFactory: (ur: IUsuarioRepository, tx: TransactionRunner, emisor: EmisorSesion) => new CambiarContrasenaService(ur, tx, emisor),
  inject: [IUsuarioRepository, TransactionRunner, EmisorSesion] },

// soporte.module.ts
{ provide: CanalMensajeria,
  useFactory: (config: ConfigService<Entorno, true>) => crearCanalMensajeria({ /* adaptador, apiKey, remitente, produccion */ }),
  inject: [ConfigService] },
{ provide: EnviarMensajesSoporteService,
  useFactory: (tx, repo, ur, tr, canal, config) => new EnviarMensajesSoporteService(tx, repo, ur, tr, canal,
    { destino: config.get('SOPORTE_CORREO_DESTINO') ?? '', tz: config.get('APP_TZ') }),
  inject: [TransactionRunner, MensajeSoporteRepository, IUsuarioRepository, ITenantRepository, CanalMensajeria, ConfigService] },
```

- **`arquitectura.spec.ts`:** sigue en verde (`domain/` y `application/` de los cuatro módulos sin Nest, TypeORM,
  `class-validator`, `class-transformer` ni `infrastructure/`). **Se amplía** la lista esperada con
  `modules/soporte/domain` y `modules/soporte/application`, para que el check no pase en falso si cambia una ruta.
  `soporte/application` importa `recordatorio/domain/canal-mensajeria` (dominio a dominio, permitido); la fábrica de
  `recordatorio/infrastructure` solo la importa `soporte.module.ts`.
- **`CLAUDE.md`:** se actualiza `src/modules/usuario/CLAUDE.md` (estructura, endpoints, columnas, puertos) y se crea
  **`src/modules/soporte/CLAUDE.md`** (job, privacidad, tope, dependencia del canal de `recordatorio`). En
  `src/modules/recordatorio/CLAUDE.md`, una línea: `soporte` usa su puerto y su fábrica de canal (DT-59). La línea de
  estado del `CLAUDE.md` raíz (módulos y migraciones) la actualiza el orquestador al cerrar, no un sub-agente.

---

## Frontend (`citia-frontend`, en Vue)

En paralelo al `backend-agent` y al `api-agent`, contra este contrato. Se despliega **después** del backend (el
backend nuevo funciona con el frontend viejo; al revés, las rutas nuevas darían 404).

1. **Menú "Mi Perfil"** en `src/app/layouts/PanelSidebar.vue` (avatar con iniciales y nombre, o una entrada del menú)
   → ruta hija del panel `/perfil` (`name: 'perfil'`) en `src/app/router/index.ts`, página en `src/pages/perfil/`.
2. **Vista con pestañas:** *Información personal*, *Suscripción* (**solo** con `role === 'admin'`) y *Seguridad*.
3. **Información personal** (p. ej. `src/features/editar-perfil/`):
   - Al entrar, `GET /usuarios/me`, y con la respuesta **refresca la sesión** (`name`, `tenantSlug`, `tenantNombre`) en
     el store y en `citia.user`, en el mismo almacenamiento de hoy (una acción nueva en `src/entities/session/`).
   - `BaseAvatar` con el nombre (P1, sin foto).
   - **Correo en lectura**, con una nota del estilo *"Es tu usuario para iniciar sesión; por ahora no se puede
     cambiar."* · **Organización** en lectura · **Enlace de agenda** en lectura con su botón de copiar (reutilizar
     `features/compartir-enlace-agenda`, con la advertencia de `ENLACE_PUBLICO_LISTO`).
   - Formulario: nombre (obligatorio, ≤ 120) y especialidad (opcional, ≤ 100, con un texto de ayuda: *"Solo se ve en
     tu perfil"*). `PATCH /usuarios/me`; con el 200, refrescar la sesión (el sidebar cambia en el acto). 400 → errores
     junto al campo.
4. **Suscripción** (lectura): `GET /organizacion/suscripcion` → *Plan* (`planNombre`), la `descripcion`, *Desde*
   (`altaEn`, fecha en la zona de Chile), *Renovación* "—" y *Método de pago* "—". Un 403 → *"Solo el administrador de
   la organización ve la suscripción."* (no debería verse: la pestaña se oculta).
5. **Seguridad** (p. ej. `src/features/cambiar-contrasena/`): contraseña actual, nueva y su confirmación (la igualdad
   se comprueba solo en el frontend), mínimo 8. `PUT /usuarios/me/contrasena`:
   - 200 → **reemplazar el token** guardado (en el mismo almacenamiento, persistente o no) y avisar *"Listo. Cerramos
     las demás sesiones abiertas."*
   - **400 → mensaje del backend junto al campo, y la sesión sigue abierta** (el backend nunca responde 401 aquí).
   - 409 → *"Tu contraseña cambió mientras tanto; vuelve a intentarlo."* · 429 → el mensaje de siempre.
   - Otras pestañas del mismo navegador: con `localStorage` leen el token nuevo en su siguiente petición; con
     `sessionStorage` (sesión no persistente) reciben 401 y vuelven al login. Es lo esperado.
6. **Contactar soporte** (p. ej. `src/features/contactar-soporte/`): botón en *Mi Perfil* (y donde el usuario quiera
   del panel) que abre un modal con categoría (si la [pregunta 4](#preguntas-abiertas) queda en **a**), el texto (≤
   2000, con contador) y un **aviso fijo**: *"No incluyas datos de tus pacientes (nombres, RUT, diagnósticos). Te
   responderemos a <correo>."* `POST /soporte/mensajes` → 201 *"Recibimos tu mensaje."* · 429 → el mensaje del backend
   · 400 → junto al campo.
7. **Tipos:** `Perfil`, `Suscripcion`, `MensajeSoporteCreado` y los cuerpos, en el `model/types.ts` de cada feature.
8. **Docs del front:** un plan en `citia-frontend/context/us/10-perfil-cuenta.md` y, al cerrar, una feature.
9. **Verificación:** el frontend no tiene tests automáticos; `npm run build` (`vue-tsc`) en verde y la
   [verificación manual](#verificación-manual-mínima).

---

## Orden de construcción

Un PR por repo hacia `develop`. Se despliega primero el backend y después el frontend. *(2026-11-01: el backend llegó
a `develop` por fast-forward desde `feature/fase7-perfil-cuenta`, sin PR, junto con los commits de docs de
`docs/fase5-decisiones-us0702`, y el release fue el PR #15 `develop` → `main`, `cd659c1`.)*

| # | Agente | Tarea | Depende de | Estado |
|---|---|---|---|---|
| 0 | `architecture-agent` | este plan, [ADR-15](../Decisions/ADR-15.md) propuesto, DT-57 a DT-59, notas en DT-01, DT-02, DT-03, DT-26, DT-36, DT-52, DT-53 y DT-56, Q18 y Q19, ROADMAP, Fases y Cumplimiento | — | ✅ 2026-10-31 (ADR-15 aceptado ese mismo día) |
| 1 | `database-agent` | migraciones, ORM, campos de dominio, puertos y adaptadores | 0 (y la aprobación del usuario) | ✅ 2026-11-01 |
| 2 | `backend-agent` | corte de sesiones en `auth`, `FirmaJwtModule`, cubos, `SOPORTE_CORREO_DESTINO`, campos sensibles y los dobles de la estrategia en los cuatro e2e | 1 | ✅ 2026-11-01 |
| 3 | `api-agent` | perfil y cambio de contraseña (`usuario`), suscripción (`tenant`) | 1, 2 | ✅ 2026-11-01 |
| 4 | `api-agent` | módulo `soporte`: registro, envío, plantilla, controller, planificador | 1, 2 | ✅ 2026-11-01 |
| 5 | `testing-agent` | la [Definición de Terminado](#definición-de-terminado) | 1–4 | ✅ (2026-11-01) unitarios, integración y e2e en verde, con la autorización del usuario |
| 6 | `architecture-agent` | cierre de docs: feature nueva, notas de implementación de ADR-15 (y aceptado), DT-01 y DT-59 al día, ROADMAP, Fases, Cumplimiento y TRAZABILIDAD con los commits | 5 | ✅ 2026-11-01: notas de ADR-15, deudas (DT-01, DT-02, DT-46, DT-59; nuevas DT-60 y DT-61), ROADMAP, Fases y Cumplimiento; después del release, la feature [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md) y las filas 118–124 de la [TRAZABILIDAD](../TRAZABILIDAD.md) · *antes: 🔶, faltaban la feature y TRAZABILIDAD* |
| F | frontend | la sección [Frontend](#frontend-citia-frontend-en-vue) | 0 (en paralelo a 2–4) | sin registrar en este repo |

> **E2e solo con autorización del usuario.** Ningún agente corre `npm run test:e2e` sin su OK explícito; lint, unit e
> integración sí.

### 1 · `database-agent`

- `src/database/migrations/1750000019000-AddPerfilYSesionesAUsuarios.ts`,
  `src/database/migrations/1750000020000-CreateMensajesSoporte.ts`.
- `usuario`: `domain/usuario.entity.ts` (los dos campos, **solo datos**), `domain/usuario.repository.ts` (cuatro
  métodos y sus tipos), `infrastructure/persistence/usuario.orm-entity.ts` (columnas y CHECK),
  `infrastructure/persistence/typeorm-usuario.repository.ts` (mapeo de los campos nuevos y los cuatro métodos) y sus
  `*.spec.ts`.
- `soporte` (carpeta nueva): `domain/mensaje-soporte.entity.ts` (enums, `crear`, `reconstituir`; las transiciones de
  envío las completa el paso 4), `domain/mensaje-soporte.repository.ts`,
  `infrastructure/persistence/mensaje-soporte.orm-entity.ts` (CHECK e índices iguales a la migración, fechas
  `timestamptz`), `infrastructure/persistence/typeorm-mensaje-soporte.repository.ts` y sus `*.spec.ts`.
- `CLAUDE.md` de `usuario` (columnas y contratos del repositorio).

### 2 · `backend-agent`

- `auth/firma-jwt.module.ts` (nuevo), `auth/infrastructure/jwt-emisor-sesion.ts` (nuevo),
  `auth/application/verificar-sesion.service.ts` (nuevo), `auth/jwt-payload.interface.ts`, `auth/jwt.strategy.ts`,
  `auth/auth.module.ts`, `auth/application/auth.service.ts` (`crearPayloadJwt`).
- `usuario/domain/sesiones.ts` y `usuario/domain/emisor-sesion.ts` (nuevos; los usa este paso y los reutiliza el 3).
- `shared/presentation/limitar-tasa.decorator.ts` (dos cubos) y `shared/infrastructure/limite-tasa/opciones-limite-tasa.spec.ts`.
- `shared/infrastructure/config/entorno.ts`, `entorno.spec.ts`, `.env.example` (`SOPORTE_CORREO_DESTINO`).
- `shared/infrastructure/observabilidad/opciones-logger.ts` (+ spec): `contrasenaActual`, `contrasenaNueva`, `mensaje`.
- Los cuatro e2e que declaran `JwtStrategy` (`test/citas-detalle`, `test/citas-rango`, `test/recordatorios-http`,
  `test/solicitudes-bandeja`): proveer un doble de `VerificarSesionService` que siempre diga vigente (p. ej.
  `test/support/sesion-vigente-falsa.ts`). Sin correrlos sin autorización.
- `src/modules/auth/` no tiene `CLAUDE.md`; el comentario de cabecera de `auth.module.ts` se actualiza (`FirmaJwtModule`
  y el corte).

### 3 · `api-agent` — perfil, contraseña y suscripción

- `usuario/domain/usuario.entity.ts` (`normalizarCambiosPerfil`, constantes), `usuario/domain/contrasena.ts`,
  `usuario/domain/exceptions/*` (seis nuevos).
- `usuario/application/perfil.service.ts`, `usuario/application/cambiar-contrasena.service.ts` (nuevos).
- `usuario/presentation/perfil.controller.ts` (nuevo) y `dto/perfil.dto.ts`, `dto/actualizar-perfil.dto.ts`,
  `dto/cambiar-contrasena.dto.ts`, `dto/contrasena-cambiada.dto.ts`.
- `usuario/usuarios.module.ts` (importa `FirmaJwtModule`, dos fábricas, el controller).
- `tenant/domain/plan.ts`, `tenant/domain/exceptions/solo-administrador.error.ts`,
  `tenant/application/consultar-suscripcion.service.ts`, `tenant/presentation/suscripcion.controller.ts`,
  `tenant/presentation/dto/suscripcion.dto.ts`, `tenant/tenant.module.ts`.
- `CLAUDE.md` de `usuario` (endpoints, errores y su código, la regla del 400 de la contraseña actual).

### 4 · `api-agent` — soporte

- `soporte/domain/` (transiciones de envío, `limites-soporte.ts`, excepciones),
  `soporte/application/registrar-mensaje-soporte.service.ts`, `enviar-mensajes-soporte.service.ts`,
  `plantilla-mensaje-soporte.ts`.
- `soporte/presentation/soporte.controller.ts` y sus dos DTO.
- `soporte/infrastructure/planificacion/planificador-soporte.ts`: `CRON_SOPORTE_ENVIO = 'soporte.envio'`,
  `HORARIO_SOPORTE_ENVIO = '20 * * * * *'` (cada minuto, segundo 20, en `APP_TZ`; no choca con los demás jobs),
  `LOTE_SOPORTE_ENVIO = 20`; nada con `PLANIFICADOR_ACTIVO=false`; sin destino, `warn` y nada; `ejecutarEnvio()`
  público para las pruebas; apagado ordenado como `PlanificadorCierreCitas`. **Sin latido** de Better Stack.
- `soporte/soporte.module.ts`, `soporte/soporte-planificacion.module.ts`, `src/app.module.ts`.
- `src/modules/soporte/CLAUDE.md` (nuevo) y una línea en `src/modules/recordatorio/CLAUDE.md`.

### Desvíos de la implementación (2026-11-01)

Lo que el código hizo distinto de este contrato, por paso. **Ninguno rediseña**; los que tocan una decisión de ADR-15
tienen su porqué en [ADR-15 § Notas de implementación](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01).

| Paso | Contrato | Cómo quedó |
|---|---|---|
| 1 | migraciones y ORM | Las dos migraciones como aquí, con **`down` destructivo**. La entidad ORM de `mensajes_soporte` nombra PK y FK. El CHECK `btrim` solo quita espacios: un texto de solo `\n` lo pasaría (el dominio recorta antes) |
| 1 | repositorios | **Guardas de UUID**: un id con otra forma devuelve `null`/`false`, nunca un `22P02` |
| 1 | `guardarEnvio(…): Promise<void>` | **Lanza** si no escribe |
| 1 | `seed.ts`, `data-source.ts` | `seed.ts` borra los `mensajes_soporte` del tenant demo antes de sus usuarios (FK `RESTRICT`). `data-source.ts` no lista la entidad nueva (solo pesa en `migration:generate`; las migraciones van por glob) |
| 1 | [DT-46](../Deudas/DT-46.md) | sigue abierta en `usuarios.creado_en` y `actualizado_en`; las columnas nuevas declaran `timestamptz` |
| 2 | `VerificarSesionService.vigente` | además, `verificar()` con el motivo (`anterior_al_corte` \| `usuario_inexistente`), que usa la estrategia para el log `auth.sesion_cortada` |
| 2 | `EmisorSesion.emitir(usuario: Usuario, …)` | recibe `UsuarioSesion = Pick<Usuario, 'id' \| 'email' \| 'tenantId' \| 'rol'>` |
| 2 | corte de sesiones | si la base falla en la consulta del corte → **500, no 401** |
| 2 | `SOPORTE_CORREO_DESTINO` | rechaza también listas, nombre visible y `<>` |
| 2 | `CAMPOS_SENSIBLES` | la clave `mensaje` se redacta **entera en cualquier log** |
| 3 | `SuscripcionDto` | igual al contrato; error nuevo `OrganizacionNoEncontradaError` (→ 401) |
| 3 | `normalizarCambiosPerfil` | más el helper `sinCambiosPerfil` (`PATCH` vacío → sin escribir) |
| 3 | `validarContrasenaNueva` | el mínimo de 8 cuenta **caracteres reales**; el `MinLength` del DTO cuenta UTF-16 (4 emojis pasan el DTO y el dominio da 400). El registro no tiene el tope de 72 bytes ([DT-61](../Deudas/DT-61.md)) |
| 3 | errores 400 | los de dominio traen `message: string` (español); los del `ValidationPipe`, `message: string[]` (inglés). **El frontend debe aceptar ambos** |
| 3 | `recortar` en `presentation` | quedó como `Recortar` local en `actualizar-perfil.dto.ts` (y en `crear-mensaje-soporte.dto.ts`), además del de `portal-paciente`: [DT-60](../Deudas/DT-60.md) |
| 3 | dependencias | `UsuarioDeSesion` vive en `perfil.service.ts` (para no importar `auth`); `TenantModule` usa `JwtAuthGuard` sin importar `AuthModule`. El log `usuarios.contrasena_cambiada`, en el controller tras el 200 (como aquí) |
| 4 | `registrar(…) → { id, creadoEn }` | devuelve la **entidad**; el controller arma el DTO y el log. El texto se valida antes de abrir la transacción |
| 4 | envío | pausa de **500 ms** entre llamadas y tope de **11 s** por llamada (como los recordatorios). Un canal que lanza o pasa de 11 s es **error propio** (los recordatorios lo tratan como `transitorio`). Sin destino, `ejecutar` no reclama y devuelve `configuracion = 'sin_destino'` |
| 4 | `intentos` | suma en `marcarEnviado`, `registrarFallo` y `marcarFallido`; no en `posponer` ni en `configuracion`. `marcarEnviado` conserva `ultimo_error` |
| 4 | dominio y plantilla | constantes `VENTANA_TOPE_SOPORTE_MS` y `CODIGO_SIN_DESTINO`; error `TransicionEnvioSoporteInvalidaError`; `escaparHtml` propio en la plantilla; la instancia del canal registra con el contexto `CanalMensajeriaSoporte` |
| 4 | logs | los de la tabla más `soporte.envio_error_interno` (`warn`) |

---

## Definición de Terminado

Cada punto con su test (rutas relativas a `src/` salvo las de `test/`). Unitarios con `npm test`, integración con
`npm run test:integration` y e2e con `npm run test:e2e` (con autorización del usuario; los marcados *con BD* necesitan
Postgres).

> **Estado (2026-11-01):** todo en verde. Unitarios: `tsc`, ESLint, Prettier y `npm test` (**131 suites, 2385
> tests**), con más specs de los que pide esta lista (`firma-jwt.module`, `jwt-payload.interface`, `usuarios.module`,
> los repositorios y entidades ORM, `crear-mensaje-soporte.dto`, `limitar-tasa.decorator`, y `app.module.spec.ts`, que
> arma el contenedor completo para cazar ciclos de módulos). Contra Postgres 16 local (autorizadas por el usuario):
> **integración 13 suites / 253 tests** y **e2e 18 suites / 379 tests**.

**Dominio (unitarios)**

- [x] `modules/usuario/domain/sesiones.spec.ts`: `inicioSesionesValidas` trunca al segundo (`…:00.999` → `…:00.000`);
      `tokenEmitidoVigente`: corte nulo → vale (también sin `iat`); sin `iat` y con corte → no vale; `iat × 1000` igual
      al corte → vale; un segundo antes → no vale; un token del **mismo segundo** del cambio → vale (documenta la
      ventana).
- [x] `modules/usuario/domain/contrasena.spec.ts`: 7 caracteres → error; 8 → bien; 72 bytes → bien; 73 → error; con
      multibyte (36 `ñ` = 72 bytes → bien; 37 → error).
- [x] `modules/usuario/domain/usuario.entity.spec.ts`: `normalizarCambiosPerfil` recorta, vacía la especialidad con
      `''`, rechaza un nombre en blanco o de 121, y deja fuera lo ausente.
- [x] `modules/tenant/domain/plan.spec.ts`: `free` → nombre y descripción; desconocido → el código y `null`.
- [x] `modules/soporte/domain/mensaje-soporte.entity.spec.ts`: `crear` recorta y valida 1 a 2000; `registrarFallo`
      suma intentos con la espera de la política y pasa a `fallido` al octavo; `posponer` no suma; nada sale de
      `enviado` ni de `fallido`.

**Aplicación y rutas (unitarios)**

- [x] `modules/usuario/application/perfil.service.spec.ts`: `obtener` arma el DTO con la organización; `actualizar`
      escribe solo lo presente, sin cambios no escribe, y usuario inexistente → `UsuarioNoEncontradoError`.
- [x] `modules/usuario/application/cambiar-contrasena.service.spec.ts`: el orden de las comprobaciones (cada error, sin
      escribir); `UPDATE` condicional en `false` → `ContrasenaCambiadaEnParaleloError`; el corte guardado es el reloj
      truncado; `emitir` recibe **ese** corte; devuelve el token.
- [x] `modules/usuario/presentation/perfil.controller.spec.ts`: cada error a su código (**400** para la contraseña
      actual, **nunca 401**; 409; 401 para el usuario inexistente); el `userId` y el `tenantId` salen del token.
- [x] `modules/usuario/presentation/dto/*.spec.ts`: `ActualizarPerfilDto` (nombre `null` → 400, 121 → 400; especialidad
      `null` y `''` válidas, 101 → 400) y `CambiarContrasenaDto` (nueva de 7 → 400).
- [x] `modules/auth/application/verificar-sesion.service.spec.ts`: estado `null` → `false`; corte nulo → `true`; las
      comparaciones de `iat`.
- [x] `modules/auth/jwt.strategy.spec.ts` (nuevo): no vigente → `UnauthorizedException`; vigente → el mismo
      `AuthenticatedUser` de antes.
- [x] `modules/auth/infrastructure/jwt-emisor-sesion.spec.ts` (nuevo): el token decodificado trae `iat =
      ⌊emitidoEn / 1000⌋` y los claims del login.
- [x] `modules/auth/application/auth.service.spec.ts`: sin cambios de comportamiento con `crearPayloadJwt`.
- [x] `modules/tenant/application/consultar-suscripcion.service.spec.ts`: `PROFESIONAL` → `SoloAdministradorError` sin
      leer el repositorio; `ADMINISTRADOR` → el DTO con `renovacionEn` y `metodoPago` en `null`.
- [x] `modules/tenant/presentation/suscripcion.controller.spec.ts`: 403 y 200.
- [x] `modules/soporte/application/registrar-mensaje-soporte.service.spec.ts`: 4 en 24 h → inserta; 5 → `TopeMensajesSoporteError`
      sin insertar; cuenta desde `ahora − 24 h` con el reloj inyectado; categoría ausente → `otro`.
- [x] `modules/soporte/application/enviar-mensajes-soporte.service.spec.ts`: los seis resultados del canal (tabla de
      arriba); `configuracion` y `cuota_agotada` cortan el lote; una excepción propia se registra como fallo en otra
      transacción; `continuar()` en `false` → `interrumpido`; el `MensajeSaliente` lleva `destinatario` = destino,
      `responderA` = correo del profesional, `claveIdempotencia = 'soporte/<id>'` y la etiqueta; usuario inexistente →
      se envía sin `responderA`.
- [x] `modules/soporte/application/plantilla-mensaje-soporte.spec.ts`: todo escapado (`<script>` en el texto y en el
      nombre de la organización), saltos de línea conservados, asunto sin saltos, mismo resultado en dos llamadas.
- [x] `modules/soporte/presentation/soporte.controller.spec.ts`: 201 con `{ id, creadoEn }`; `TopeMensajesSoporteError`
      → 429 con su mensaje.
- [x] `modules/soporte/infrastructure/planificacion/planificador-soporte.spec.ts`: con `PLANIFICADOR_ACTIVO=false` no
      registra nada; sin destino, `warn` y no registra; con destino, el cron `soporte.envio` a `20 * * * * *` en
      `APP_TZ`; el apagado espera el tick en curso.
- [x] `shared/infrastructure/config/entorno.spec.ts`: `SOPORTE_CORREO_DESTINO` ausente → `undefined`, **también en
      producción** con todo lo demás obligatorio; una dirección válida → su valor; `Soporte <a@b.cl>` o `a@b` → error.
- [x] `shared/infrastructure/limite-tasa/opciones-limite-tasa.spec.ts`: los dos cubos con sus números.
- [x] `shared/infrastructure/observabilidad/opciones-logger.spec.ts`: `contrasenaActual`, `contrasenaNueva` y
      `mensaje` se redactan.
- [x] `arquitectura.spec.ts` en verde, con `modules/soporte/domain` y `modules/soporte/application` en la lista esperada.

**Integración (Postgres)** — *✅ 2026-11-01, dentro de las 13 suites / 253 tests.*

- [x] `database/integration/migraciones-us10.integration.spec.ts` (nuevo, mismo patrón que `migraciones-fase3`): todo
      el historial sube en **un** lote; esquema (columnas, nulabilidad, los CHECK, los dos índices, el parcial con su
      predicado); un usuario creado antes de la migración queda con las dos columnas en `NULL`; el `down` de cada una
      revierte y vuelven a subir.
- [x] `modules/usuario/integration/sesiones-usuario.integration.spec.ts` (nuevo): `estadoSesion` (con y sin corte, otro
      tenant → `null`); `cambiarContrasena` condicional: **dos a la vez con el mismo hash anterior → una `true` y otra
      `false`**; `actualizarPerfil` cambia `actualizado_en` y no toca lo ausente; el CHECK rechaza una especialidad en
      blanco.
- [x] `modules/soporte/integration/envio-soporte.integration.spec.ts` (nuevo): **dos `reclamarSiguientePendiente` en dos
      transacciones a la vez → filas distintas** (`SKIP LOCKED`); **dos `ejecutar` en paralelo** con un canal falso →
      cada mensaje enviado una vez; `contarCreadosDesde` cuenta solo su organización; los CHECK rechazan 2001
      caracteres, un texto en blanco y `enviado` sin `enviado_en`.

**E2e (`test/`)** — *✅ 2026-11-01, dentro de las 18 suites / 379 tests; los tres archivos nuevos y los dos cubos de
`limite-tasa` están.*

- [x] `test/perfil-usuario.e2e-spec.ts` (nuevo, con BD): registro y login → `GET /api/usuarios/me` 200 con
      `tenantSlug`, `tenantNombre` y `especialidad: null`; `PATCH` con nombre y especialidad → 200 y el `GET` siguiente
      los trae; `email` en el cuerpo → ignorado; nombre `'   '` → 400; especialidad de 101 → 400; especialidad `''` →
      `null`; sin token → 401. `GET /api/organizacion/suscripcion` → 200 (`plan: 'free'`, `renovacionEn` y `metodoPago`
      `null`); con un usuario pasado a `PROFESIONAL` por SQL y un login nuevo → 403.
- [x] `test/cambio-contrasena.e2e-spec.ts` (nuevo, con BD): dos logins (A y B) **al menos un segundo antes** del cambio;
      `PUT` con A → 200 y token nuevo; **B → 401** en `GET /api/usuarios/me`; A (viejo) → 401; el nuevo → 200; login con
      la contraseña vieja → 401 y con la nueva → 200; actual incorrecta → **400 y el token sigue sirviendo**; nueva =
      actual → 400; nueva de 7 → 400; un usuario borrado por SQL → su token da 401.
- [x] `test/soporte.e2e-spec.ts` (nuevo, con BD): `POST` → 201 y fila `pendiente`; el sexto en 24 h → 429 con su
      mensaje; 2001 caracteres → 400; en blanco → 400; categoría inválida → 400; `ejecutarEnvio()` con
      `test/support/mensajeria-falsa.ts` → `enviado`, con destinatario = la variable, `responderA` = correo del
      profesional y la clave `soporte/<id>`; los logs capturados no contienen el texto del mensaje.
- [x] Los cuatro e2e con `JwtStrategy` directa, en verde con el doble; `test/auth-login.e2e-spec.ts` y las e2e con
      `AuthModule` sin cambios en sus aserciones.
- [x] `test/planificador.e2e-spec.ts` (con BD): con `PLANIFICADOR_ACTIVO=false`, `soporte.envio` no está registrado.
- [x] `test/limite-tasa.e2e-spec.ts`: el sexto `PUT /api/usuarios/me/contrasena` y el sexto `POST /api/soporte/mensajes`
      desde la misma IP en una hora → 429 (si la suite prueba cubo por cubo).

**Calidad**

- [x] `npm run lint`, `npm test` y `npm run test:integration` en verde; `npm run test:e2e` en verde **con la
      autorización del usuario**. *(2026-11-01: los cuatro ✅.)*
- [ ] Frontend: `npm run build` en verde. *(Sin registrar en este repo.)*

### Verificación manual mínima

*En staging* (después del merge a `develop`):

1. Los Deploy Logs arrancan sin error y muestran `soporte.sin_destino` (sin la variable) o `planificador.activo` con
   `soporte.envio` (con ella).
2. *Mi Perfil*: se ven los datos; cambiar el nombre lo cambia en el sidebar sin recargar; la especialidad se guarda y se
   borra; el correo y la organización no se pueden editar; el enlace se copia.
3. Iniciar sesión en dos navegadores (A y B). En A, cambiar la contraseña: A sigue funcionando; **B vuelve al login en
   su siguiente acción**; la contraseña vieja ya no entra.
4. Con la contraseña actual mal escrita: error en el formulario y **la sesión sigue abierta**.
5. *Contactar soporte*: el mensaje queda en `mensajes_soporte`; con `MENSAJERIA_ADAPTADOR=registro` pasa a `enviado` con
   `proveedor = 'registro'` sin salir (esperado en staging).
6. *Suscripción*: visible para el administrador, con el nombre del plan y la fecha de alta.

*En production* (después del release a `main`):

7. Si [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) ya tiene respuesta, cargar `SOPORTE_CORREO_DESTINO`
   **antes** del despliegue y confirmar en los Deploy Logs `planificador.activo` con `soporte.envio`.
8. Un mensaje de prueba llega a la casilla, con el remitente de Citia y *Responder a* = el correo del profesional;
   responderlo le llega a él. Los logs muestran `recordatorios.webhook_desconocido` por sus eventos de entrega
   (esperado).
9. Solo lectura, para ver que nada quedó atascado:

```sql
SELECT estado_envio, count(*), min(creado_en) FROM mensajes_soporte GROUP BY estado_envio;
SELECT count(*) FILTER (WHERE sesiones_validas_desde IS NOT NULL) AS con_corte, count(*) AS usuarios FROM usuarios;
```

---

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Una consulta más en cada petición autenticada** (una página del panel hace unas cinco a ocho) | clave primaria y una sola columna; sin caché a propósito (T1); si pesa, caché de ≤ 30 s aceptando ese retraso en el corte ([ADR-15](../Decisions/ADR-15.md#c-caché-de-la-consulta)) |
| 2 | **Los cuatro e2e que declaran `JwtStrategy`** no arrancan sin un proveedor de `VerificarSesionService` | el paso 2 les agrega el doble; están listados |
| 3 | **Los tests que arman `UsuariosModule`** ahora necesitan `JWT_SECRET` (por `FirmaJwtModule`), p. ej. `registro-usuario.integration.spec.ts` | lo carga `test/setup-env.ts` desde `.env`; en un CI sin `.env` hay que definirla |
| 4 | **Ventana de menos de 1 segundo**: un token emitido en el mismo segundo del cambio, pero antes, sigue valiendo | aceptada (T2); explotarla exige iniciar sesión con la contraseña vieja en ese mismo segundo |
| 5 | **Relojes de dos procesos** en el solapamiento de un despliegue: un login atendido por un proceso con el reloj unos milisegundos atrasado, justo después del cambio, podría dar 401 | raro y sin daño: se vuelve a iniciar sesión |
| 6 | **Un 401 cierra la sesión en el frontend**: si la contraseña actual incorrecta respondiera 401, un error de tipeo sacaría al usuario | contrato: **400** (T4), con su test en el controller y en el e2e |
| 7 | **El texto de soporte puede traer datos de pacientes** hacia la base, Resend y la casilla de soporte, fuera del encargo | aviso fijo en el modal; logs sin el texto; [DT-52](../Deudas/DT-52.md), [DT-26](../Deudas/DT-26.md) y [Cumplimiento](../Cumplimiento/README.md). El backend no filtra (detectar un RUT en texto libre daría falsos positivos y una falsa seguridad) |
| 8 | **Los correos a soporte gastan la cuota de Resend y el contador local no los ve** ([DT-36](../Deudas/DT-36.md)) | tope de 5 por organización en 24 h; `cuota_agotada` pospone sin gastar intentos; el 429 del proveedor manda |
| 9 | **Sin `SOPORTE_CORREO_DESTINO`, el mensaje no sale** y el profesional cree que sí | se guarda igual (no se pierde) y sale al cargar la variable; `warn` al arrancar; paso 7 de la verificación. El texto del frontend dice *"Recibimos tu mensaje"*, que es cierto |
| 10 | **Un `fallido` de soporte solo se ve en los logs**, que hoy no le llegan a nadie ([DT-19](../Deudas/DT-19.md)) | alerta `soporte.envio_fallido`; la consulta del paso 9; se reenvía volviendo la fila a `pendiente` con SQL |
| 11 | **`Reply-To` sin verificar** ([DT-03](../Deudas/DT-03.md)): si el correo de la cuenta está mal escrito, soporte responde a otra persona | se responde solo sobre lo que el profesional preguntó; sin datos de pacientes en la respuesta |
| 12 | **Sin DMARC** ([DT-41](../Deudas/DT-41.md)): el correo puede caer en el spam de la casilla de soporte | marcar el remitente como seguro en la casilla al configurarla |
| 13 | **`soporte` depende del código de correo de `recordatorio`** ([DT-59](../Deudas/DT-59.md)) | escrito en los dos `CLAUDE.md`; los e2e de soporte fallan si el puerto cambia |
| 14 | **El rol sale del token**: si algún día cambia el rol de alguien, el 403 de la suscripción lo ve con su próximo token | no hay cambio de rol ([DT-07](../Deudas/DT-07.md)); el guard general llega con DT-02 |
| 15 | **El registro no limita el largo del nombre** y el perfil sí (120): un nombre registrado más largo no se puede volver a guardar igual | solo si el usuario lo envía; el registro no se toca en esta fase |
| 16 | **El `down` de `1750000019000`** devuelve la validez a los tokens anteriores a un cambio de contraseña | como mucho 1 día (`JWT_EXPIRES_IN`); revertir solo si hace falta |
| 17 | **El log de arranque del canal de soporte dice "Recordatorios: se envían por Resend"** (lo escribe `crearCanalMensajeria`) | cosmético; anotado en [DT-59](../Deudas/DT-59.md) |

---

## Preguntas abiertas

Para el usuario. **Ninguna bloquea la construcción.** La 1 y la 2 conviene contestarlas antes del release (son
[Q18](../PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) y
[Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)).

1. **Nombre legible del plan `free`** (Q18). (a) *Plan piloto*; (b) *Gratis*; (c) *Plan inicial*. *Inclinación:* (a):
   va con *"Sin cobro durante el piloto"* y no promete un plan gratis para siempre, que chocaría con el modelo de
   precios. El código usa (a) mientras tanto; cambiarlo es una línea.
2. **Casilla de soporte y su proveedor** (Q19). (a) `soporte@citiahealth.cl` con el reenvío de correo de Cloudflare
   (gratis; el DNS ya está ahí) hacia una casilla del usuario; (b) una casilla de Google Workspace u otro proveedor
   pagado; (c) directamente el correo personal del usuario. *Inclinación:* (a) por ahora. Cualquiera de las tres es un
   **proveedor nuevo que recibe el texto** y entra en [DT-52](../Deudas/DT-52.md).
3. **¿Mostrar la casilla de soporte en el login** (*"¿Olvidaste tu contraseña? Escríbenos a…"*) mientras no exista la
   recuperación? (a) No; (b) sí, con un procedimiento manual para verificar la identidad. *Inclinación:* (a): una salida
   manual es una recuperación de hecho, y esa decisión es de [DT-03](../Deudas/DT-03.md) con el P1 de cumplimiento
   (P6). Hoy quien olvida la contraseña no puede escribirle a soporte desde la app: la ruta exige sesión.
4. **Categoría del mensaje.** (a) Cerrada, de cuatro valores (*problema, consulta, sugerencia, otro*), opcional en la
   API y obligatoria en la pantalla; (b) sin categoría; (c) un asunto libre. *Inclinación:* (a): ordena la casilla sin
   abrir otro campo de texto libre donde puedan caer datos de pacientes. Con (b), la columna queda siempre en `otro`.
5. **Conservación de `mensajes_soporte`.** (a) Sin plazo, en [DT-26](../Deudas/DT-26.md), hasta la revisión legal;
   (b) purgar a los 12 meses ya en esta fase; (c) vaciar el texto en cuanto queda `enviado` (la casilla guarda la
   copia). *Inclinación:* (a), coherente con el resto de los datos; (c) es la más protectora si el usuario prefiere no
   esperar al abogado.
6. **¿La especialidad se muestra fuera del perfil** (página pública de agenda, voucher)? (a) Solo en el perfil; (b)
   también en la página pública. *Inclinación:* (a). En el recordatorio, en ningún caso: puede delatar la condición del
   paciente ([ADR-13 §12](../Decisions/ADR-13.md)).
7. **¿"Cerrar todas mis sesiones" en esta fase?** Con la misma columna es casi gratis (`POST /api/usuarios/me/sesiones/cerrar`
   que corta y devuelve un token nuevo). (a) Fuera, anotado en [DT-01](../Deudas/DT-01.md) como siguiente paso; (b)
   dentro. *Inclinación:* (a): no está en el ROADMAP y no hay usuarios reales que lo pidan.
8. **Tope de soporte por organización.** (a) 5 en 24 horas; (b) 10; (c) sin tope propio (solo el cubo por IP).
   *Inclinación:* (a): con 100 correos al día para toda la plataforma, un solo abuso no puede comerse más de un 5 % de la
   cuota.

---

## Fuera de alcance

- La foto de perfil ([DT-57](../Deudas/DT-57.md)).
- Cambiar el correo: depende de verificarlo ([DT-03](../Deudas/DT-03.md)).
- Corregir el nombre de la organización ([DT-58](../Deudas/DT-58.md)) o su slug (nunca).
- Recuperar la contraseña olvidada ([DT-03](../Deudas/DT-03.md), P6) y cualquier correo de aviso de cambio de
  contraseña (P5).
- Cobrar, planes de pago, renovación y método de pago reales ([Q2](../PREGUNTAS-ABIERTAS.md#q2--el-prepago-entra-alguna-vez)).
- Alta de un segundo usuario y el guard de rol general ([DT-07](../Deudas/DT-07.md), [DT-02](../Deudas/DT-02.md)).
- Renovación de sesión, cierre de sesión real de un dispositivo y "cerrar todas mis sesiones"
  ([DT-01](../Deudas/DT-01.md), pregunta 7).
- Seguir la entrega de los correos a soporte (webhook), una bandeja de soporte dentro de la app, adjuntos y respuestas
  desde la app.
- El contador común de la cuota de Resend y mover el canal de correo a `shared/` ([DT-36](../Deudas/DT-36.md),
  [DT-59](../Deudas/DT-59.md)).

---

## Deudas que toca

**Cierra en parte:** [DT-01](../Deudas/DT-01.md) (corte de sesiones al cambiar la contraseña y usuario borrado; en
diseño el 2026-10-31, **implementado el 2026-11-01**; la renovación sigue abierta).
**Al implementar (2026-11-01):** [DT-59](../Deudas/DT-59.md) se contrae (pasa a abierta) · [DT-46](../Deudas/DT-46.md)
sigue abierta en `usuarios` y `tenants`, cuyas fechas ahora se muestran · nuevas [DT-60](../Deudas/DT-60.md) (`Recortar`
en tres copias) y [DT-61](../Deudas/DT-61.md) (el registro no aplica la política de contraseña del cambio), las dos 🟡
baja.
**Toca:** [DT-02](../Deudas/DT-02.md) (primer 403 por rol, sin guard general) · [DT-03](../Deudas/DT-03.md) (la
recuperación y el cambio de correo siguen fuera) · [DT-04](../Deudas/DT-04.md) (cubo por IP, sin política por cuenta) ·
[DT-26](../Deudas/DT-26.md) (`mensajes_soporte` sin plazo) · [DT-36](../Deudas/DT-36.md) (otro tipo de correo por la
misma cuenta) · [DT-52](../Deudas/DT-52.md) (la casilla de soporte y Resend reciben el texto) ·
[DT-53](../Deudas/DT-53.md) y [DT-56](../Deudas/DT-56.md) (el flujo de soporte en la política y en los incidentes) ·
[DT-40](../Deudas/DT-40.md) (con `registro`, un mensaje queda `enviado` sin salir).
**Nuevas** (fichadas el 2026-10-31): [DT-57](../Deudas/DT-57.md) (foto, 🔵 aplazada), [DT-58](../Deudas/DT-58.md)
(nombre de la organización, 🔵 aplazada) y [DT-59](../Deudas/DT-59.md) (canal de correo de `recordatorio` usado por
`soporte`, ⚪ prevista).
