# Plan US-11 — Términos de uso y aviso de privacidad del paciente (RNF-02, Cumplimiento P1)

> **Fase:** — (transversal: [Cumplimiento](../Cumplimiento/README.md); [ROADMAP § Cumplimiento](../ROADMAP.md#cumplimiento-ley-21719--transversal)) · **Feature:** [us11-terminos-paciente](../Features/us11-terminos-paciente.md) · **Plan:** este documento · **Relacionado:** [ADR-16](../Decisions/ADR-16.md), [borrador v0.2 de los términos](../Cumplimiento/borrador-terminos-paciente.md), [ADR-02](../Decisions/ADR-02.md), [ADR-06](../Decisions/ADR-06.md), [ADR-09](../Decisions/ADR-09.md), [ADR-10](../Decisions/ADR-10.md), [ADR-13](../Decisions/ADR-13.md), [DT-16](../Deudas/DT-16.md), [DT-26](../Deudas/DT-26.md), [DT-52](../Deudas/DT-52.md), [DT-53](../Deudas/DT-53.md), [DT-54](../Deudas/DT-54.md), [DT-62](../Deudas/DT-62.md), [DT-63](../Deudas/DT-63.md), [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)

> **Estado (2026-11-20):** ✅ **en producción desde el 2026-11-16 y verificado en production.** Frontend
> citia-frontend#21 (2026-11-16, 21:01) y backend citia-backend#23 (`8738b98`, 21:22); la fecha de `/terminos`,
> corregida al 16 el 2026-11-17. La [verificación manual mínima](#verificación-manual-mínima) y las consultas de la
> [Definición de Terminado](#definición-de-terminado) se hicieron en production entre el 2026-11-17 y el 2026-11-20, con
> la cuenta de prueba. Detalle en la feature: [release](../Features/us11-terminos-paciente.md#release-2026-11-16) y
> [verificación](../Features/us11-terminos-paciente.md#verificación-en-production-2026-11-17--2026-11-20).
>
> *Antes (2026-11-14 → 2026-11-16):* 🔶 implementado en la rama `feature/terminos-paciente`, sin release. Backend
> `92a1f36`, `bdeb1aa` y `894b96c`; frontend `eb3fbcc` a `e276343`. Verificado en local
> ([abajo](#verificación-en-local-2026-11-14)); unitarios e integración en `1d00f9e`, `fc3a83f` y `305dea5`, y las e2e
> en `66e54bc`.
>
> *Antes (2026-11-14):* 🔶 en implementación. [ADR-16](../Decisions/ADR-16.md) **aceptado**: el usuario decidió D1,
> D2, D4, D6 y D8 y la línea del job G1 en el §2 del texto, y aprobó el resto del diseño tal como se propuso. La rama
> del backend sale de `develop`.

> Solo decisiones y orden. Sin código de negocio. Brief para los agentes. El porqué está en
> [ADR-16](../Decisions/ADR-16.md); aquí va el qué, en qué orden y cuándo está terminado. **Este plan es el contrato:**
> si algo choca con el código, se implementa lo más cercano posible y se reporta; no se rediseña.

**Número de la historia.** Ninguna US ni RF del [ROADMAP](../ROADMAP.md) ni de [rf.md](../rf.md) la cubre: el
cumplimiento es transversal y no tenía historia. La más cercana es **RNF-02** (*«consentimiento del paciente para
recibir mensajes»*, [rnf.md](../rnf.md)). Se propone **US-11** (US-09 sigue reservada sin definir y US-10 es la
última). La alternativa sería una subtarea de US-02 (`02.10`), pero la historia toca también US-04 (`/cita`).

---

## Descripción

- Como **paciente** quiero leer qué hace Citia con mis datos antes de pedir hora, y que quede registrado que acepté y
  qué versión acepté.
- Como **paciente agendado por mi profesional** quiero aceptar los términos yo mismo desde la página de mi hora, sin
  que eso me impida confirmarla o cancelarla.
- Como **profesional** quiero tener un texto concreto que leerle o enviarle al paciente antes de registrarlo a mano.

**Criterios de aceptación**

- `/terminos` muestra el texto completo, con *Versión 1.0* y la fecha de publicación. Es pública.
- La casilla del formulario público enlaza a `/terminos` (en otra pestaña) con el texto corto. Sin marcarla no se
  envía; el backend rechaza `consentimiento: false`.
- Al aceptar una solicitud en la bandeja, el paciente (nuevo **o ya existente por RUT**) queda con una aceptación
  `formulario_publico` con la versión y la hora en que envió el formulario, y con `consentimiento = true`.
- El modal *Nueva cita* muestra el texto del alta manual con la dirección de `/terminos` antes de la casilla. Crear la
  cita deja una aceptación `profesional` con el usuario que la marcó. El backend rechaza `consentimiento: false`.
- En `/cita`, un paciente sin aceptación propia ve una tarjeta con «Acepto» **sobre** las acciones; las acciones
  funcionan igual sin aceptar. Al aceptar, la tarjeta desaparece y queda una aceptación `enlace_cita`. Un paciente que
  ya aceptó en el formulario no la ve.
- La bandeja muestra *«· aceptó los términos v1.0»* en las solicitudes que la traen.
- La prueba se ve en la base con las consultas de la [Definición de Terminado](#definición-de-terminado).

---

## Punto de partida

Verificado en el código el 2026-11-14; detalle en [ADR-16 § Lo que hay hoy](../Decisions/ADR-16.md#lo-que-hay-hoy-verificado-en-el-código-2026-11-14).
Lo que más pesa en este plan:

- `SolicitudesService.recibir` hace **un `INSERT` sin transacción** y la regla del módulo prohíbe darle
  `TransactionRunner` (`src/modules/solicitud/CLAUDE.md`).
- `PacientesService` solo tiene el repositorio; **`crearPaciente` no abre transacción**. `PacienteModule` no importa
  `SharedModule`.
- `CitasService.crearCita` abre la transacción y llama a `agendar(…, MANUAL)`; la bandeja llama a `agendar(…,
  SOLICITUD_PUBLICA)` dentro de la suya. `CitaResponseDto` trae `pacienteId` y, al crear, `paciente`.
- `PortalPacienteService.enTransaccion`: `resolver` (cita bloqueada) → validez → petición abierta → acciones. La vista
  la arma `vista()`. `EnlaceCita` tiene `id`.
- `ValidationPipe({ whitelist: true, transform: true })` **sin** `forbidNonWhitelisted`.
- `portalPorEnlace` = 5 por hora por enlace, **un cubo** para todos los `POST` del portal.
- Frontend: `BaseCheckbox` solo con `label` (sin slot); en `/cita` el token vive solo en memoria.
- La última migración es `1750000020000`.

---

## Decisiones

| Id | Decisión | Fuente |
|---|---|---|
| D1 | Tabla de historial de solo inserción `aceptaciones_terminos`; `pacientes.consentimiento` sigue como bandera, puesta en `true` por cualquier aceptación | **usuario** (2026-11-14) · ADR-16 §3, §4 |
| D2 | `/terminos` genérica («tu profesional»); el nombre de la organización solo donde ya se conoce (`/cita`, el panel). `[contacto]` = «por el medio que usas para comunicarte con tu profesional» + `soporte@citiahealth.cl`. Sin campo nuevo ni endpoint por slug | **usuario** (2026-11-14) · ADR-16 §1 |
| D4 | Tarjeta no bloqueante en `/cita` con «Acepto»; las acciones siguen disponibles; desaparece cuando el propio paciente acepta (formulario o enlace) | **usuario** (2026-11-14) · ADR-16 §8 |
| D8 | §6 sin «con un máximo de [plazo]»; el máximo entra en una versión nueva con [DT-26](../Deudas/DT-26.md) | **usuario** (2026-11-14) |
| D3 | El frontend envía `terminosVersion`; el backend acepta solo versiones del catálogo con `recibeAceptaciones`; si no, 400 con mensaje fijo | por defecto · ADR-16 §2 |
| D5 | El formulario público exige `consentimiento: true` y la versión (400 antes de buscar la organización) | por defecto · ADR-16 §5 |
| D6 | Alta manual: canal `profesional` con usuario y versión; `consentimiento: false` → 400 | por defecto · ADR-16 §7 |
| D7 | Sin relleno: los pacientes existentes no tienen fila; se les pide en `/cita` | por defecto |
| D9 | Se publica como **1.0**, con la fecha del release del frontend | por defecto |
| D10 | La versión del formulario vive en `solicitudes_cita.terminos_version`; la fila de `aceptaciones_terminos` nace al aceptar la solicitud, con `aceptada_en = recibida_en` | inclinación · ADR-16 §5, §6 |
| D11 | Una fila por paciente, versión y canal (`UNIQUE` + `ON CONFLICT DO NOTHING`) | inclinación · ADR-16 §3 |
| D12 | Sin IP ni navegador en la prueba | inclinación · ADR-16 §3 |
| D13 | La bandeja muestra «· aceptó los términos v1.0» (`terminosVersion` aditivo en `SolicitudBandejaDto`) | inclinación · ADR-16 §9 |
| D14 | El voucher no muestra la aceptación en esta historia | inclinación · ADR-16 §9 |
| T1 | Despliegue: **frontend primero**, backend al menos 30 minutos después | ADR-16 §10 |
| T2 | La aceptación en `/cita` va por `POST /publico/cita/aceptar-terminos`, sin `exigir`, idempotente, en el cubo `portalPorEnlace` | ADR-16 §8 |
| T3 | Todo el registro pasa por `PacientesService.registrarAceptacion`; `agendar` y `resolverOCrear` no registran nada | ADR-16 §7 |

---

## Modelo de datos

Dos migraciones TypeORM, **aditivas**, una por tabla ([ADR-00](../Decisions/ADR-00.md)). Las entidades ORM declaran
las mismas columnas, CHECK e índices para que el esquema de `synchronize` de los tests sea el de la migración.
Valores cerrados como `VARCHAR` + `CHECK`, no como tipo enum.

> **Las expresiones regulares en una plantilla de TypeScript** llevan la barra doblada (`'^[0-9]+\\.[0-9]+$'` en el
> archivo) para que a Postgres le llegue `'^[0-9]+\.[0-9]+$'`. El integration test del CHECK lo comprueba.

### `1750000021000-CreateAceptacionesTerminos.ts` (`aceptaciones_terminos`, módulo `paciente`)

```sql
CREATE TABLE "aceptaciones_terminos" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     UUID         NOT NULL,
  "paciente_id"   UUID         NOT NULL,
  "version"       VARCHAR(10)  NOT NULL,
  "canal"         VARCHAR(20)  NOT NULL,
  "aceptada_en"   TIMESTAMPTZ  NOT NULL,
  "usuario_id"    UUID,
  "solicitud_id"  UUID,
  "enlace_id"     UUID,
  "registrada_en" TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "PK_aceptaciones_terminos_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_aceptaciones_terminos_tenant_id" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FK_aceptaciones_terminos_paciente_id" FOREIGN KEY ("paciente_id")
    REFERENCES "pacientes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FK_aceptaciones_terminos_usuario_id" FOREIGN KEY ("usuario_id")
    REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CHK_aceptaciones_terminos_version"
    CHECK ("version" ~ '^[0-9]+\.[0-9]+$'),
  CONSTRAINT "CHK_aceptaciones_terminos_canal"
    CHECK ("canal" IN ('formulario_publico', 'enlace_cita', 'profesional')),
  -- Exactamente la referencia de su canal.
  CONSTRAINT "CHK_aceptaciones_terminos_referencia" CHECK (
       ("canal" = 'formulario_publico' AND "solicitud_id" IS NOT NULL
          AND "enlace_id" IS NULL AND "usuario_id" IS NULL)
    OR ("canal" = 'enlace_cita' AND "enlace_id" IS NOT NULL
          AND "solicitud_id" IS NULL AND "usuario_id" IS NULL)
    OR ("canal" = 'profesional' AND "usuario_id" IS NOT NULL
          AND "solicitud_id" IS NULL AND "enlace_id" IS NULL)
  )
);

-- D11: una fila por paciente, versión y canal. Es el blanco del ON CONFLICT y,
-- por su prefijo, el índice de "¿el titular ya aceptó?".
CREATE UNIQUE INDEX "uq_aceptaciones_terminos_paciente_version_canal"
  ON "aceptaciones_terminos" ("paciente_id", "version", "canal");
```

- **Solo inserción:** el puerto no tiene `UPDATE` ni `DELETE`; sin trigger (convención de `cambios_cita`).
- **Sin FK** a `solicitudes_cita` ni a `enlaces_cita`, a propósito ([ADR-16 §3](../Decisions/ADR-16.md)). Sin índice
  por `tenant_id`: nada consulta por organización todavía (lo agregará la exportación de [DT-53](../Deudas/DT-53.md)).
- **Sin relleno** (D7). Sin plazo de conservación ([DT-26](../Deudas/DT-26.md)).
- ORM `paciente/infrastructure/persistence/aceptacion-terminos.orm-entity.ts`: columnas con `type: 'timestamptz'`
  ([DT-46](../Deudas/DT-46.md)), PK y FK con los nombres de la migración, los tres `@Check` y el `@Index` único.
  Registrada en `PacienteModule` (`TypeOrmModule.forFeature`).
- `down`: `DROP TABLE "aceptaciones_terminos"`. ⚠️ **Borra toda la prueba.** En production no se revierte después de
  la primera aceptación real: se corrige hacia adelante.

### `1750000022000-AddTerminosVersionASolicitudesCita.ts` (`solicitudes_cita`, módulo `solicitud`)

```sql
ALTER TABLE "solicitudes_cita" ADD COLUMN "terminos_version" VARCHAR(10);

-- Solo una `nueva` con consentimiento la trae; las de reagendamiento, nunca.
ALTER TABLE "solicitudes_cita"
  ADD CONSTRAINT "CHK_solicitudes_cita_terminos_version"
  CHECK ("terminos_version" IS NULL
         OR ("terminos_version" ~ '^[0-9]+\.[0-9]+$'
             AND "tipo" = 'nueva'
             AND "consentimiento" = true));
```

- Las filas existentes quedan en `NULL` (cumplen el CHECK).
- `tipo` es un enum en la migración y otro nombre de tipo en `synchronize`: el CHECK compara con un literal **sin
  cast**, que vale en los dos.
- ORM: `@Column({ name: 'terminos_version', type: 'varchar', length: 10, nullable: true })` y el `@Check`.
- `down`: `DROP CONSTRAINT` → `DROP COLUMN`. ⚠️ Pierde la versión de las solicitudes que no se aceptaron.

### `seed.ts` y limpiezas de los tests

`seed.ts` borra `aceptaciones_terminos` del tenant demo **antes** de `pacientes` y de `usuarios` (FK `RESTRICT`). Las
integraciones y e2e que truncan `pacientes` o `usuarios` incluyen `aceptaciones_terminos`; las que listan entidades a
mano suman `AceptacionTerminosOrmEntity`.

---

## Dominio

### `paciente`

| Dónde | Qué |
|---|---|
| `domain/terminos-paciente.ts` (nuevo) | `VersionTerminosPaciente { version; recibeAceptaciones; sigueCubriendo }`; `CATALOGO_TERMINOS_PACIENTE = [{ version: '1.0', recibeAceptaciones: true, sigueCubriendo: true }]`; funciones puras `esVersionConocida(v)`, `recibeAceptaciones(v)`, `versionesQueRecibenAceptaciones()`, `versionesQueCubren()`. Comentario con las tres reglas del catálogo y los tres pasos para cambiar de versión ([ADR-16 §2](../Decisions/ADR-16.md)) |
| `domain/aceptacion-terminos.entity.ts` (nuevo) | `enum CanalAceptacion { FORMULARIO_PUBLICO = 'formulario_publico', ENLACE_CITA = 'enlace_cita', PROFESIONAL = 'profesional' }`; `CANALES_DEL_TITULAR = [FORMULARIO_PUBLICO, ENLACE_CITA]`; `RegistrarAceptacionProps`, unión discriminada por `canal` (base `{ tenantId, pacienteId, version, aceptadaEn }` + `solicitudId` / `enlaceId` / `usuarioId` según el canal); clase `AceptacionTerminos` (campos de la tabla, las referencias que no son de su canal en `null`) con `static registrar(props)` |
| `AceptacionTerminos.registrar` | Versión: `formulario_publico` exige `esVersionConocida` (la solicitud pudo llegar antes de un cambio); `enlace_cita` y `profesional` exigen `recibeAceptaciones`. Si no → `VersionTerminosNoVigenteError`. Referencia del canal no vacía (si no, `RangeError`: invariante del llamador) |
| `domain/exceptions/version-terminos-no-vigente.error.ts` (nuevo) | `VersionTerminosNoVigenteError` (→ 400). El mensaje no repite la versión recibida |
| `domain/aceptacion-terminos.repository.ts` (nuevo) | Puerto `AceptacionTerminosRepository`: `insertarSiNoExiste(aceptacion, tx): Promise<boolean>` (`true` si insertó) y `existeDelTitular(pacienteId, tenantId, versiones: readonly string[], tx?): Promise<boolean>` |
| `domain/paciente.repository.ts` | Suma `marcarConsentimiento(id, tenantId, tx): Promise<boolean>`: `UPDATE … SET consentimiento = true, actualizado_en = now() WHERE id AND tenant_id AND consentimiento = false` (`true` si escribió) |

**Adaptador** `infrastructure/persistence/typeorm-aceptacion-terminos.repository.ts`, SQL sobre el `EntityManager` del
`tx`:

- `insertarSiNoExiste`: `INSERT … SELECT … FROM "pacientes" p WHERE p."id" = $paciente AND p."tenant_id" = $tenant
  ON CONFLICT ("paciente_id", "version", "canal") DO NOTHING RETURNING "id"`. El `SELECT` impide escribir una
  aceptación para un paciente de otra organización.
- `existeDelTitular`: `SELECT 1 … WHERE paciente_id AND tenant_id AND canal IN ('formulario_publico','enlace_cita')
  AND version = ANY($versiones) LIMIT 1`, sin bloqueo.
- **Guardas de UUID** (como en ADR-15, nota 2): un id que no es UUID → `false` sin consultar.

### `solicitud`

| Dónde | Qué |
|---|---|
| `domain/solicitud-cita.entity.ts` | Campo `terminosVersion: string \| null`. `RecibirSolicitudProps.terminosVersion: string` (obligatorio); `pedirOtraHora` lo deja en `null`; `ReconstituirSolicitudProps.terminosVersion?: string \| null` (ausente = `null`) |
| ORM y adaptador | mapeo de `terminos_version` en los dos sentidos |

### Errores y su código HTTP

| Error | Dónde se traduce | HTTP |
|---|---|---|
| Validación de `consentimiento` o `terminosVersion` (DTO) | `ValidationPipe` | 400, `message: string[]` |
| `VersionTerminosNoVigenteError` (defensa: no debería llegar con el DTO validado) | `CitasController`, `PacientesController`, `PortalPacienteController` | 400, `message` = `MENSAJE_VERSION_TERMINOS_NO_VIGENTE` |

El mensaje fijo es el mismo en los dos casos: el frontend busca ese texto en `message`, sea un texto o una lista.

---

## Aplicación y API

### Rutas (prefijo global `/api`)

| Método | Ruta | Cambio | Éxito | Errores |
|---|---|---|---|---|
| POST | `/publico/:tenantSlug/solicitudes` | cuerpo: `consentimiento` debe ser `true`; suma `terminosVersion` | 202 (sin cambio, uniforme) | **400** (también con `consentimiento: false` o versión ausente o que no recibe) · 429 |
| POST | `/citas` (con `paciente`) | `paciente.consentimiento` debe ser `true`; suma `paciente.terminosVersion`; registra canal `profesional` | 201 (sin cambio) | **400** nuevos por esos dos campos |
| POST | `/citas` (con `pacienteId`) | **sin cambio**; no registra nada | 201 | — |
| POST | `/pacientes` | igual que `paciente` de `/citas`; pasa a ser transaccional | 201 (sin cambio) | **400** nuevos |
| POST | `/solicitudes/:id/aceptar` | sin cambio de contrato; registra canal `formulario_publico` si la solicitud trae versión | 201 | sin cambio |
| GET | `/solicitudes` | `SolicitudBandejaDto` suma `terminosVersion` | 200 | sin cambio |
| GET | `/publico/cita` | `VistaCitaPacienteDto` suma `terminosPendientes` | 200 | sin cambio |
| POST | `/publico/cita/confirmar` · `/cancelar` · `/otra-hora` | la vista suma `terminosPendientes` | sin cambio | sin cambio |
| POST | **`/publico/cita/aceptar-terminos`** (nueva) | cuerpo `{ terminosVersion }` | **200** `VistaCitaPacienteDto` | 400 · 404 uniforme · 429 |

### DTO

```ts
// paciente/presentation/dto/version-terminos.decorator.ts (nuevo)
export const MENSAJE_VERSION_TERMINOS_NO_VIGENTE =
  'La versión de los términos ya no está vigente. Recarga la página.';
/** @IsString + @IsIn(versionesQueRecibenAceptaciones()), los dos con el mensaje fijo. Sin @IsOptional. */
export function VersionTerminosVigente(): PropertyDecorator;

// solicitud/presentation/dto/crear-solicitud.dto.ts
@Equals(true, { message: 'Debes aceptar los términos de uso y el aviso de privacidad' })
consentimiento: boolean;
@VersionTerminosVigente()
terminosVersion: string;

// paciente/presentation/dto/crear-paciente.dto.ts (POST /pacientes y `paciente` de POST /citas)
@Equals(true, { message: 'Se necesita la autorización del paciente' })
consentimiento: boolean;
@VersionTerminosVigente()
// Opcional SOLO en el tipo: la bandeja arma un CrearPacienteDto sin pasar por el pipe
// y no lo usa. En HTTP es obligatoria (sin @IsOptional).
terminosVersion?: string;

// portal-paciente/presentation/dto/aceptar-terminos.dto.ts (nuevo)
export class AceptarTerminosDto {
  @VersionTerminosVigente()
  terminosVersion: string;
}

// solicitud/presentation/dto/solicitud-bandeja.dto.ts — aditivo
terminosVersion: string | null; // null en las de reagendamiento y en las anteriores al despliegue

// portal-paciente/presentation/dto/vista-cita-paciente.dto.ts — aditivo
/** true si el paciente no tiene una aceptación PROPIA (formulario o enlace) de una versión que cubre. */
terminosPendientes: boolean;
```

- Los `@MaxLength` del formulario no cambian; `LIMITES` del frontend tampoco.
- `src/modules/portal-paciente/CLAUDE.md`: la regla «la vista nunca lleva…» suma una línea: *`terminosPendientes` es
  un booleano sobre la autorización, no un dato del paciente.*

### Casos de uso

**`PacientesService`** (`paciente/application/pacientes.service.ts`)

- Constructor: `(pacienteRepository, aceptaciones: AceptacionTerminosRepository, tx: TransactionRunner, reloj = () =>
  new Date())`. `PacienteModule` importa `SharedModule` y arma la fábrica.
- **`registrarAceptacion(props: RegistrarAceptacionProps, tx): Promise<boolean>`**: `AceptacionTerminos.registrar` →
  `aceptaciones.insertarSiNoExiste` → `pacienteRepository.marcarConsentimiento` (siempre; es condicional). Devuelve si
  insertó. `tx` obligatorio: siempre corre en la transacción de quien llama.
- **`titularAceptoVigente(pacienteId, tenantId, tx?)`**: `existeDelTitular(…, versionesQueCubren(), tx)`.
- **`crearPaciente(dto, usuario: { userId: string; tenantId: string })`**: abre una transacción: `resolverOCrear(dto,
  tenantId, tx)` → `registrarAceptacion({ canal: PROFESIONAL, usuarioId: usuario.userId, version: dto.terminosVersion,
  aceptadaEn: reloj(), … }, tx)`. La respuesta sale con `consentimiento: true`. El controller pasa el usuario del
  token.
- `resolverOCrear` **no cambia**.

**`CitasService.crearCita`** (`cita/application/citas.service.ts`): dentro de su transacción, después de `agendar(…,
MANUAL)`, **solo si `dto.paciente` existe**: `pacientesService.registrarAceptacion({ canal: PROFESIONAL, usuarioId:
usuario.userId, pacienteId: creada.pacienteId, version: dto.paciente.terminosVersion, aceptadaEn: this.reloj(), … },
tx)` y `creada.paciente.consentimiento = true` en la respuesta. `agendar` **no cambia**. Sin parámetro nuevo en el
constructor (ya tiene `PacientesService`).

**`BandejaSolicitudesService.aceptar`** (`solicitud/application/bandeja-solicitudes.service.ts`): el constructor suma
`PacientesService`. En la rama `nueva`, después de `crearCita` y en el mismo `tx`, si `solicitud.terminosVersion !==
null`: `registrarAceptacion({ canal: FORMULARIO_PUBLICO, solicitudId: solicitud.id, pacienteId: cita.pacienteId,
version: solicitud.terminosVersion, aceptadaEn: solicitud.recibidaEn, … }, tx)` y `cita.paciente.consentimiento =
true`. La rama `reagendamiento` y `rechazar` no registran nada. `aBandeja` proyecta `terminosVersion`.

**`SolicitudesService.recibir`**: pasa `dto.terminosVersion` a `SolicitudCita.recibir`. **Sigue sin transacción.**

**`PortalPacienteService`** (`portal-paciente/application/portal-paciente.service.ts`): el constructor suma
`PacientesService` (antes del `zonaHoraria`; la fábrica del módulo y los specs se ajustan). `PortalPacienteModule`
importa `PacienteModule`.

- **`aceptarTerminos(token, version)`**: `enTransaccion` (el esqueleto de siempre) → **sin `exigir`** → si
  `titularAceptoVigente(cita.pacienteId, cita.tenantId, tx)` es `false`, `registrarAceptacion({ canal: ENLACE_CITA,
  enlaceId: ctx.enlace.id, aceptadaEn: ctx.ahora, … }, tx)` → `vista(…)`.
- **`vista()`** suma `terminosPendientes = !(await pacientes.titularAceptoVigente(cita.pacienteId, cita.tenantId,
  tx))`. Vale para el GET y para los cuatro `POST`.
- `ver()` **no cambia** (anota la primera apertura y arma la vista).

**`PortalPacienteController`**: `@Post('aceptar-terminos')`, `@HttpCode(HttpStatus.OK)`,
`@LimitarTasa('portalPorEnlace')`, `@Body() dto: AceptarTerminosDto`, por `ejecutar` (404 y 409 de siempre; suma
`VersionTerminosNoVigenteError` → 400 con el mensaje fijo).

### Orden de bloqueo (sin cambios de regla)

| Flujo | Orden |
|---|---|
| Portal (los cinco) | cita (`FOR NO KEY UPDATE`) → enlace (solo el GET, primera apertura) → paciente (`UPDATE` de la bandera, solo `aceptar-terminos`) |
| Bandeja, `nueva` | solicitud (`FOR UPDATE`) → paciente (correo vacío en `agendar`; la bandera al registrar) → cita **nueva** |
| Alta manual | paciente (correo; la bandera) → cita nueva |
| `PATCH /pacientes/:id` | paciente |

Nadie bloquea una cita existente después de un paciente: sin ciclos.

### Logs

Ninguno nuevo. La prueba es la fila; los logs no llevan la versión ni el canal.

---

## El texto que se publica

> Fuente: el [borrador v0.2](../Cumplimiento/borrador-terminos-paciente.md), con los marcadores resueltos según D2, D8 y
> D9. Al publicarse se congela en `context/Cumplimiento/terminos-paciente-v1.0.md` (no se edita) y el frontend lo copia
> **igual**. `[fecha de publicación]` es la única marca que queda: se llena con la fecha del release del frontend a
> production, en el mismo PR.
>
> **(2026-11-15)** Congelado en [`terminos-paciente-v1.0.md`](../Cumplimiento/terminos-paciente-v1.0.md). Se publicó
> el **2026-11-16**; la fecha prevista era el 15, y se corrigió el 2026-11-17 (ver la copia). El texto de `/terminos` del frontend (`b6f5d5f`) y el de abajo dieron idénticos palabra por palabra.

### Términos de uso y aviso de privacidad de Citia para pacientes

*Versión 1.0 · publicada el [fecha de publicación]*

**1. Quién es quién**

- **Tu profesional** es la persona o la clínica que agenda tus horas con Citia: la que te compartió el enlace para
  pedir hora o la que te envía los recordatorios. Su nombre aparece en la página de tu hora y en los recordatorios. Tu
  profesional decide para qué se usan tus datos.
- **Citia** es el sistema de agenda que usa tu profesional. Trata tus datos **por encargo de tu profesional** y solo
  para lo que se describe aquí. Citia no usa tus datos para fines propios, no los vende y no los comparte con otros
  profesionales o clínicas que usen Citia.

**2. Qué datos se usan**

- **Para identificarte y contactarte:** tu nombre, tu RUT, tu teléfono y tu correo.
- **De tus horas:** la fecha y la duración, el tipo o motivo de la consulta, su estado (pendiente, confirmada,
  cancelada, si asististe o no) y los cambios que tuvo, incluido quién pidió reagendar o cancelar. Si no confirmas una
  hora y no se registra tu asistencia, al terminar el día el sistema la marca sola como inasistencia.
- **Si pides hora por el enlace público:** además, tu preferencia de horario y el motivo que escribas.
- **Del enlace de tu hora:** cuándo lo abriste por primera vez y lo que hiciste ahí (confirmar, cancelar o pedir otra
  hora).
- **De los correos:** si los recordatorios se entregaron o rebotaron.
- **De tu autorización:** qué versión de estos términos aceptaste, cuándo y por dónde (el formulario para pedir hora,
  el enlace de tu hora o tu profesional).

**El motivo de la consulta y tu asistencia pueden revelar información sobre tu salud.** Se usan solo para gestionar
tus horas.

**3. Para qué se usan**

- Agendar, reagendar y cancelar tus horas.
- Enviarte recordatorios por correo, con un enlace para confirmar, cancelar o pedir otra hora.
- Que tu profesional lleve el registro de asistencia de su agenda.

**No se usan** para publicidad, ni para calificarte o hacer un perfil tuyo. Si algún día tu historial de asistencia
se quisiera usar para otra cosa, se te pedirá una autorización nueva.

**4. Tu autorización**

Al marcar la casilla o presionar «Acepto» autorizas a tu profesional, y a Citia como su proveedor, a usar tus datos
(incluido el motivo de tu consulta) para lo que dice el punto 3. Puedes retirar tu autorización cuando quieras
escribiéndole a tu profesional. Retirarla no deshace lo anterior, y sin tus datos de contacto no se te pueden enviar
recordatorios.

**5. Con quién se comparten**

- Con tu profesional.
- Con los proveedores que Citia necesita para funcionar: alojamiento del sistema y de la base de datos (Railway), envío
  de correos (Resend) y publicación del sitio web (Netlify). Algunos procesan datos **fuera de Chile**, principalmente
  en Estados Unidos. Son proveedores: no usan tus datos para sí mismos.
- **No** se comparten con otros profesionales o clínicas que usen Citia.

**6. Cuánto tiempo se guardan**

Mientras tu profesional use Citia y los necesite para atenderte. Si tu profesional deja de usar Citia, tus datos se le
devuelven o se eliminan.

**7. Tus derechos**

Puedes pedir:

- saber qué datos tuyos hay;
- corregirlos;
- que se eliminen;
- oponerte a un uso;
- una copia para llevarlos a otro lugar.

Escríbele a tu profesional, por el medio que usas para comunicarte con él o ella, o a soporte@citiahealth.cl, indicando
tu nombre y RUT. Te responderemos dentro de 30 días.

**8. Si el paciente es menor de edad**

Si tienes menos de 16 años, la autorización la da tu madre, tu padre o quien te represente legalmente.

**9. Seguridad**

Las conexiones van cifradas. Solo tu profesional accede a tus datos, con su cuenta, y cada consulta que usa Citia
tiene sus datos separados de las demás. El enlace de tu hora es personal: no lo compartas.

**10. Cambios a estos términos**

Si cambian, publicaremos la nueva versión con su fecha en esta página. Si el cambio es para un uso nuevo de tus datos,
te pediremos una autorización nueva.

**11. Contacto**

Tu profesional, por el medio que usas para comunicarte con él o ella · Citia: soporte@citiahealth.cl

### Casilla del formulario público

> ☐ He leído los [Términos de uso y el aviso de privacidad] y autorizo a mi profesional, y a Citia como su proveedor, a
> usar mis datos, incluido el motivo de mi consulta, para gestionar mis horas y enviarme recordatorios por correo.

El enlace abre `/terminos` **en otra pestaña** (en la misma, el paciente perdería lo que lleva escrito). Sin marcarla:
*«Para enviar la solicitud tienes que aceptar los términos.»*

### Tarjeta de `/cita`

> **Tus datos y Citia**
>
> {profesional}, de {organizacion}, usa Citia para agendar tus horas y enviarte recordatorios por correo. Lee los
> [Términos de uso y el aviso de privacidad]. Al presionar «Acepto» autorizas a {profesional}, y a Citia como su
> proveedor, a usar tus datos, incluido el motivo de tu consulta, para gestionar tus horas y enviarte recordatorios por
> correo.
>
> Puedes confirmar, cancelar o pedir otra hora aunque no aceptes ahora. Si no estás de acuerdo, escríbele a tu
> profesional.
>
> [ Acepto ]

- `{profesional}` y `{organizacion}` salen de la vista. Si son iguales (una profesional independiente cuyo nombre es
  el de su organización), se muestra uno solo: *«{profesional} usa Citia…»*.
- El enlace abre `/terminos` **en otra pestaña**: el token vive solo en memoria y la página no se puede recargar.
- Al aceptar: *«Gracias. Quedó registrada tu autorización.»* y la tarjeta desaparece.

### Texto del alta manual (modal *Nueva cita*)

> Antes de marcar la casilla, léele o envíale esto al paciente:
>
> «Para agendar tus horas y enviarte recordatorios por correo uso Citia, un sistema de agenda. Ahí quedan tu nombre,
> RUT, teléfono, correo y los datos de tus horas, incluido el motivo de la consulta. No se usan para otra cosa ni se
> comparten con otras clínicas. Los términos completos están en https://app.citiahealth.cl/terminos. ¿Me
> autorizas?»
>
> ☐ El paciente me autorizó después de leerle o enviarle este texto.
>
> *Si no te autoriza, no lo registres en Citia. El paciente también podrá aceptar los términos él mismo desde el
> enlace de su recordatorio.*

- La dirección se arma con el origen del sitio (`window.location.origin` + `/terminos`): en staging muestra la de
  staging.
- Un botón *«Copiar texto»* es opcional (el modal no lo exige).
- Sin marcar: *«Marca la casilla cuando el paciente te haya autorizado.»*

### Bandeja

*«· aceptó los términos v{terminosVersion}»* en lugar de *«· acepta recordatorios»*; nada si `terminosVersion` es
`null`.

### Cambios respecto del borrador v0.2

| # | Dónde | v0.2 | v1.0 | Por qué |
|---|---|---|---|---|
| 1 | Encabezado | *Versión 0.2 · [fecha de publicación]* | *Versión 1.0 · publicada el [fecha de publicación]* | D9 |
| 2 | Encabezado | nota *«Lo que va entre corchetes se llena…»* | sin la nota | no quedan marcadores, salvo la fecha |
| 3 | §1 | *«**[Nombre del profesional o de la clínica]** («tu profesional») agenda tus horas y decide…»* | definición genérica de **tu profesional** y dónde ve su nombre | D2 |
| 4 | §2 | — | viñeta nueva **«De tu autorización»** | la tabla de D1 es un dato nuevo del paciente: el texto tiene que contarlo |
| 5 | §4 | *«Al marcar la casilla…»* | *«Al marcar la casilla o presionar «Acepto»…»* | D4 |
| 6 | §6 | *«…para atenderte, con un máximo de [plazo].»* | *«…para atenderte.»* | D8 |
| 7 | §6 | *«sus datos se le devuelven»* | *«tus datos se le devuelven»* | editorial: «sus» se podía leer como los datos del profesional. **Se puede rechazar** sin tocar nada más |
| 8 | §7 | *«Escríbele a tu profesional ([contacto]) o a…»* | *«Escríbele a tu profesional, por el medio que usas para comunicarte con él o ella, o a…»* | D2 |
| 9 | §10 | *«publicaremos la nueva versión con su fecha»* | *«…con su fecha en esta página»* | editorial |
| 10 | §11 | *«[Nombre del profesional o de la clínica] · [contacto] · soporte@citiahealth.cl»* | *«Tu profesional, por el medio que usas para comunicarte con él o ella · Citia: soporte@citiahealth.cl»* | D2 |
| 11 | Casilla | *«[Términos de uso y el aviso de privacidad]»*, *«[nombre del profesional o de la clínica]»* | enlace a `/terminos`; *«mi profesional»* | D2 |
| 12 | Alta manual | *«[enlace]»* | `https://app.citiahealth.cl/terminos` y la casilla nueva | D2, D6 |
| 13 | `/cita` | — | la tarjeta (texto nuevo) | D4 |
| 14 | §2 | — | *«Si no confirmas una hora y no se registra tu asistencia, al terminar el día el sistema la marca sola como inasistencia.»* | el cierre automático del job G1, que [DT-53](../Deudas/DT-53.md) pide informar; lo pidió el usuario el 2026-11-14 |

---

## Frontend (`citia-frontend`, en Vue)

> El estado del frontend no se registra en este repo. Su plan va en `citia-frontend/context/us/11-terminos-paciente.md`.
> **Se despliega primero** ([ADR-16 §10](../Decisions/ADR-16.md)) y tiene que funcionar **con el backend de hoy**:
> `terminosVersion` se envía igual (el backend viejo la descarta) y la tarjeta solo aparece con
> `terminosPendientes === true`.

| # | Archivo | Dueño | Cambio |
|---|---|---|---|
| 1 | `src/shared/config/terminosPaciente.ts` (nuevo) | `shared-agent` | `VERSION_TERMINOS_PACIENTE = '1.0'`, `FECHA_TERMINOS_PACIENTE` (la del release), `RUTA_TERMINOS = '/terminos'`, `MENSAJE_VERSION_TERMINOS_NO_VIGENTE` (espejo exacto del backend). Si cambia uno, cambia el otro en el mismo cambio |
| 2 | `src/shared/ui/BaseCheckbox.vue` | `ui-agent` | slot por defecto para la etiqueta (el `label` sigue funcionando), para poner un enlace dentro. Un clic en el enlace no marca la casilla |
| 3 | `src/pages/terminos/ui/TerminosPage.vue` + `index.ts` (nuevos) | `ui-agent` | el texto de la 1.0, **igual** al de [este plan](#términos-de-uso-y-aviso-de-privacidad-de-citia-para-pacientes); versión y fecha de (1). Pública, sin layout del panel, sin API y sin recursos de terceros |
| 4 | `src/app/router/index.ts` | `shared-agent` | ruta pública `/terminos` (`name: 'terminos'`) |
| 5 | `src/features/crear-cita/ui/steps/MotivoStep.vue` | `ui-agent` | casilla nueva con enlace (`target="_blank"`, `rel="noopener noreferrer"`) |
| 6 | `src/features/crear-cita/model/flujoCitaModel.ts` | `ui-agent` | mensaje de la casilla sin marcar |
| 7 | `src/features/crear-cita/model/toSolicitudRequest.ts` | `ui-agent` | `SolicitudRequest.terminosVersion = VERSION_TERMINOS_PACIENTE` |
| 8 | `src/features/crear-cita/model/useAgendarCita.ts` | `ui-agent` | un 400 cuyo `message` (texto o lista) contiene el mensaje fijo → *«Los términos se actualizaron. Recarga la página para ver la versión vigente.»* |
| 9 | `src/features/crear-cita/ui/ModalNuevaCita.vue` | `ui-agent` | bloque del texto del alta manual con la dirección de `/terminos`, casilla y ayuda nuevas |
| 10 | `src/features/crear-cita/model/types.ts`, `toCrearCitaRequest.ts`, `crearCitaSchema.ts`, `useCrearCita.ts` | `ui-agent` | `paciente.terminosVersion`; mensaje de la casilla; el 400 del mensaje fijo → *«Los términos se actualizaron. Recarga la página.»* |
| 11 | `src/features/responder-cita/model/types.ts` | `ui-agent` | `terminosPendientes?: boolean` (opcional: con el backend de hoy no viene); `AceptarTerminosRequest`; el estado de envío admite `'aceptarTerminos'` además de `AccionPaciente` |
| 12 | `src/features/responder-cita/api/respuestaCitaApi.ts` | `ui-agent` | `aceptarTerminos(token, { terminosVersion })` → `POST /publico/cita/aceptar-terminos`, con las mismas opciones (`auth: false`, cabecera, `no-store`, `no-referrer`) |
| 13 | `src/features/responder-cita/model/useRespuestaCita.ts` | `ui-agent` | `aceptarTerminos()` por `ejecutar` (un clic, nunca al cargar). 400 del mensaje fijo → *«Los términos se actualizaron. Abre de nuevo el enlace de tu correo.»* (recargar `/cita` no sirve: el token ya no está en la URL) |
| 14 | `src/features/responder-cita/ui/TarjetaTerminos.vue` (nuevo) y `ResumenHora.vue` | `ui-agent` | la tarjeta, **sobre** las acciones, solo con `cita.terminosPendientes === true`; enlace a `/terminos` en otra pestaña; «Acepto» se deshabilita mientras se envía; las acciones siguen habilitadas |
| 15 | `src/entities/solicitud/` (`api/solicitudApi.ts`, `model/types.ts`) y `src/features/bandeja-solicitudes/ui/BandejaSolicitudes.vue` | `shared-agent`, luego `ui-agent` | `terminosVersion: string \| null`; la línea de la bandeja |
| 16 | Docs: `CLAUDE.md` (tabla de rutas), `src/pages/CLAUDE.md`, `context/Features/agendar-cita-paciente.md`, `crear-cita.md`, `responder-cita-paciente.md`, `bandeja-solicitudes.md` | orquestador del frontend | la ruta, las casillas, la tarjeta y el contrato nuevo |

`public/_headers` no cambia: `/cita` ya va con `no-referrer`, así que abrir `/terminos` desde ahí no manda la URL.
`/terminos` no lleva datos: puede indexarse.

---

## Orden de construcción

| # | Agente | Pieza | Depende de |
|---|---|---|---|
| 0 | usuario | aprobó [ADR-16](../Decisions/ADR-16.md) y este plan el 2026-11-14 | — |
| 1 | `database-agent` | las dos migraciones, `AceptacionTerminosOrmEntity`, la columna en `SolicitudCitaOrmEntity`, los puertos (`AceptacionTerminosRepository`, `marcarConsentimiento`), los adaptadores, los dobles en memoria (`InMemoryAceptacionTerminosRepository`; `marcarConsentimiento` en `InMemoryPacienteRepository`) y `seed.ts` | 0 |
| 2 | `api-agent` | catálogo, entidad y error de dominio; `PacientesService` y `PacienteModule` (`SharedModule`); el decorador y los DTO; `crearCita`; bandeja; `recibir`; portal y su controller; traducción del error en los tres controllers; `portal-paciente/CLAUDE.md`, `solicitud/CLAUDE.md`, `cita/CLAUDE.md` | 1 |
| 3 | `testing-agent` | unitarios e integración; ajustar las e2e (lista abajo) **sin correrlas** hasta que el usuario lo autorice | 2 |
| F | frontend | la tabla de [Frontend](#frontend-citia-frontend-en-vue), en paralelo a 1 y 2 | 0 |
| 4 | release | frontend a `main` → comprobar `/terminos` y el correo de soporte → backend a `main` (≥ 30 min después) → pedir a la profesional del piloto que recargue | 3, F |
| 5 | `architecture-agent` | copia congelada `terminos-paciente-v1.0.md`, el borrador marcado como publicado, notas en DT-16 y DT-53, las deudas a fichar, ROADMAP, la feature y TRAZABILIDAD | 4 |

**Estado (2026-11-20):** todos ✅ · 0 · 1 `92a1f36` · 2 `bdeb1aa` y `894b96c` · 3 `1d00f9e`, `fc3a83f`, `305dea5` y
`66e54bc` (e2e) · F `eb3fbcc` a `e276343` · 4 el 2026-11-16: frontend a las 21:01 y backend a las 21:22 (**21 minutos
después, no 30**); el correo de soporte, **después**: recibe desde el 2026-11-17; que la profesional del piloto recargue,
no consta · 5 la copia congelada (`31b5c3f`, 2026-11-15; fecha corregida al 16 con `7f903b0`, `7fc4a36` y `962b946`) y
el cierre (ROADMAP, la feature y TRAZABILIDAD 137–157, 2026-11-20). *Antes (2026-11-14): «3 🔶, las e2e en curso · 4 ⬜
· 5 🔶 adelantado en parte; la copia congelada y el borrador marcado como publicado esperan al release».*

### 1 · `database-agent`

- Migraciones con el SQL de arriba; los dos `down` con su advertencia en el comentario de cabecera.
- `npm run migration:run` y `migration:revert` contra el Postgres local.
- Adaptador de aceptaciones con SQL a mano sobre el `EntityManager` del `tx`, `INSERT … SELECT … ON CONFLICT DO
  NOTHING RETURNING`, guardas de UUID.

### 2 · `api-agent`

- Todo lo de [Aplicación y API](#aplicación-y-api). Nada en `agendar` ni en `resolverOCrear`.
- `PortalPacienteService`: `aceptarTerminos` sin `exigir`; `vista()` con `terminosPendientes`.
- La respuesta de `crearCita`, `crearPaciente` y `aceptar` (bandeja) sale con `paciente.consentimiento = true` cuando se
  registró una aceptación.

---

## Tests por capa

### Unitarios (`npm test`)

| Archivo | Casos |
|---|---|
| `paciente/domain/terminos-paciente.spec.ts` (nuevo) | la 1.0 recibe y cubre; versiones únicas y con formato; `recibeAceptaciones ⇒ sigueCubriendo` en todas; `esVersionConocida('9.9')` es `false` |
| `paciente/domain/aceptacion-terminos.entity.spec.ts` (nuevo) | cada canal con su referencia y las otras en `null`; `profesional` y `enlace_cita` con una versión que no recibe → `VersionTerminosNoVigenteError`; `formulario_publico` con una versión conocida que ya no recibe → se registra; desconocida → error; versión `''` o ausente → error |
| `paciente/application/pacientes.service.spec.ts` | `registrarAceptacion` inserta y marca la bandera; la segunda vez no inserta y la bandera sigue en `true`; `titularAceptoVigente`: `false` sin filas, `false` con solo `profesional`, `true` con `formulario_publico` o `enlace_cita` 1.0, `false` con otra organización; `crearPaciente` abre una transacción, registra `profesional` con el usuario y responde `consentimiento: true`; paciente existente por RUT con `false` → queda `true` |
| `paciente/presentation/dto/crear-paciente.dto.spec.ts` | `consentimiento: false` → error; `terminosVersion` ausente, `'0.2'` o `'9.9'` → error con el mensaje fijo; `'1.0'` → válido |
| `solicitud/presentation/dto/crear-solicitud.dto.spec.ts` (nuevo si no existe) | lo mismo para el formulario |
| `portal-paciente/presentation/dto/aceptar-terminos.dto.spec.ts` (nuevo) | versión válida, ausente y desconocida |
| `solicitud/domain/solicitud-cita.entity.spec.ts` | `recibir` guarda la versión; `pedirOtraHora` la deja en `null`; `reconstituir` sin el campo → `null` |
| `solicitud/application/solicitudes.service.spec.ts` | pasa la versión; sigue sin transacción |
| `solicitud/application/bandeja-solicitudes.service.spec.ts` | `nueva` con versión → registra `formulario_publico` con `solicitudId`, `aceptadaEn = recibidaEn` y la versión de la solicitud, en el mismo `tx`; paciente existente por RUT → `consentimiento = true`; sin versión → no registra; `reagendamiento` y `rechazar` → no registran; si el registro falla, no queda cita ni solicitud aceptada; `aBandeja` trae `terminosVersion` |
| `cita/application/citas.service.spec.ts` | `crearCita` con `paciente` registra `profesional` con `userId`, la versión y el reloj del servicio, en el mismo `tx`; con `pacienteId` no registra; `agendar` llamado por la bandeja no registra |
| `portal-paciente/application/portal-paciente.service.spec.ts` | `terminosPendientes` en el GET y en los cuatro `POST`; `aceptarTerminos` registra `enlace_cita` con el id del enlace y el `ahora` del portal; idempotente; con una aceptación de formulario no escribe; con solo `profesional` sí; vale con una petición abierta y con la cita confirmada; enlace no válido de las seis formas → el mismo 404 y nada escrito; **no** cambia la cita, la bitácora, el outbox ni la primera apertura; el GET no registra ninguna aceptación |
| `portal-paciente/presentation/portal-paciente.controller.spec.ts` | `POST aceptar-terminos`, 200, `portalPorEnlace` en el método, `portalPorIp` en la clase, `no-store`; `VersionTerminosNoVigenteError` → 400 con el cuerpo fijo |
| `cita/presentation/citas.controller.spec.ts`, `paciente/presentation/pacientes.controller.spec.ts` | traducción del error de versión a 400; `crearPaciente` recibe el usuario del token |
| `src/arquitectura.spec.ts` | sin cambios: ya cubre `paciente/domain` y `paciente/application` |

### Integración contra Postgres (`npm run test:integration`)

| Archivo | Casos |
|---|---|
| `paciente/integration/aceptaciones-terminos.integration.spec.ts` (nuevo) | los tres CHECK (canal desconocido, referencia de otro canal, dos referencias, versión `'1'` o `'v1.0'`); el índice único con `ON CONFLICT DO NOTHING`: **dos transacciones concurrentes** en conexiones distintas → una fila; `INSERT … SELECT` con un paciente de otra organización → no escribe; FK `RESTRICT` (borrar el paciente con una aceptación falla); `marcarConsentimiento` condicional y por organización |
| `solicitud/integration/solicitudes-persistencia.integration.spec.ts` | `terminos_version` persiste y se relee; el CHECK rechaza una versión en una de `reagendamiento` y con `consentimiento = false` |
| `portal-paciente/integration/portal-paciente-concurrencia.integration.spec.ts` | `aceptar-terminos` mientras la bandeja acepta una solicitud **del mismo paciente** (cita → paciente frente a solicitud → paciente), en los dos órdenes, sin interbloqueo; dos `aceptar-terminos` concurrentes con el mismo enlace → una fila |

### e2e (solo listadas: **no se corren** sin la autorización del usuario)

| Archivo | Qué cambia |
|---|---|
| `test/portal-paciente.e2e-spec.ts` | GET con `terminosPendientes`; `aceptar-terminos` 200 y repetido 200; 400 con versión desconocida (antes de mirar el token); 404 con su cuerpo exacto; la fila `enlace_cita` en la base; una solicitud aceptada en la bandeja → `terminosPendientes: false` |
| `test/limite-tasa.e2e-spec.ts` | `aceptar-terminos` suma en `portalPorEnlace` con los otros `POST` y en `portalPorIp`; `no-store` y `no-referrer` en 200, 400 y 404 |
| `test/solicitudes-bandeja.e2e-spec.ts` | el formulario: 400 con `consentimiento: false` y sin versión, 202 con los dos; `terminosVersion` en la bandeja |
| `test/pacientes.e2e-spec.ts` | `POST /pacientes` y `POST /citas` exigen `consentimiento: true` y versión; la fila `profesional` con el usuario; el caso de la línea 287 (`consentimiento: false`) cambia de sentido |
| `test/citas-dashboard`, `citas-detalle`, `citas-rango`, `logs-redaccion`, `recordatorios-flujo`, `recordatorios-politicas` (`*.e2e-spec.ts`) | sumar `terminosVersion: '1.0'` donde crean pacientes o citas por HTTP |

---

## Definición de Terminado

- [x] `tsc`, ESLint, Prettier y `npm test` en verde (137 suites, 2577 tests; 2026-11-14).
- [x] `npm run test:integration` en verde (Postgres local; 14 suites, 316 tests).
- [x] e2e de la lista, ajustadas; en verde **con la autorización del usuario** (18 suites, 418 tests; 2026-11-14).
- [x] `npm run migration:run` y `migration:revert` limpias en local; las dos migraciones son aditivas.
- [x] Frontend: `npm run build` en verde; `/terminos` con el texto **idéntico** al de este plan (comparado bloque por
      bloque, 55 de 55) y la versión de `shared/config/terminosPaciente.ts` igual a la del catálogo del backend (`1.0`).
- [x] `src/modules/portal-paciente/CLAUDE.md`, `solicitud/CLAUDE.md` y `cita/CLAUDE.md` al día; `paciente` ganó su
      `CLAUDE.md`.
- [x] **La prueba se ve en la base** (staging y, después del release, production), con estas consultas (`:tenant` = el
      id de la organización; solo ids, sin nombres ni RUT). ✅ En local, el 2026-11-14 (los tres canales). ✅ En
      production, el 2026-11-20 (los tres canales, con un script de solo lectura que corrió el usuario; ver la
      [feature](../Features/us11-terminos-paciente.md#verificación-en-production-2026-11-17--2026-11-20)). En staging no
      se hizo:

```sql
-- 1. La prueba, la más reciente primero.
SELECT a.aceptada_en AT TIME ZONE 'America/Santiago'   AS aceptada_chile,
       a.canal, a.version, a.paciente_id,
       a.usuario_id, a.solicitud_id, a.enlace_id,
       a.registrada_en AT TIME ZONE 'America/Santiago' AS registrada_chile,
       p.consentimiento
FROM aceptaciones_terminos a
JOIN pacientes p ON p.id = a.paciente_id AND p.tenant_id = a.tenant_id
WHERE a.tenant_id = :tenant
ORDER BY a.aceptada_en DESC;

-- 2. Lo que dejó el formulario público (aceptadas o no).
SELECT id, estado, consentimiento, terminos_version,
       recibida_en AT TIME ZONE 'America/Santiago' AS recibida_chile
FROM solicitudes_cita
WHERE tenant_id = :tenant AND tipo = 'nueva'
ORDER BY recibida_en DESC
LIMIT 20;

-- 3. Pacientes a los que /cita todavía les pide aceptar (sin aceptación propia de una versión que cubre).
SELECT p.id, p.consentimiento,
       EXISTS (SELECT 1 FROM aceptaciones_terminos a
               WHERE a.paciente_id = p.id AND a.canal = 'profesional') AS marcado_por_profesional
FROM pacientes p
WHERE p.tenant_id = :tenant
  AND NOT EXISTS (SELECT 1 FROM aceptaciones_terminos a
                  WHERE a.paciente_id = p.id AND a.tenant_id = p.tenant_id
                    AND a.canal IN ('formulario_publico', 'enlace_cita')
                    AND a.version IN ('1.0'));
```

### Verificación manual mínima

En staging y, después del release, en production:

1. `/terminos` abre sin sesión, con *Versión 1.0* y la fecha; `soporte@citiahealth.cl` recibe un correo de prueba
   (production).
2. **Formulario público:** el enlace de la casilla abre otra pestaña y lo escrito sigue ahí; sin marcarla no se envía;
   al enviar, la consulta 2 muestra `terminos_version = '1.0'`.
3. **Bandeja:** la solicitud muestra *«aceptó los términos v1.0»*; al aceptarla, la consulta 1 muestra
   `formulario_publico` con su `solicitud_id` y `aceptada_en` = la hora del envío; con un RUT que ya era paciente,
   también, y `consentimiento = true`.
4. **Modal Nueva cita:** se ve el texto con la dirección de `/terminos`; al crear, la consulta 1 muestra `profesional`
   con el `usuario_id` de quien la marcó.
5. **`/cita`** de ese paciente (con su recordatorio): la tarjeta aparece sobre las acciones; confirmar funciona **sin**
   aceptar; «Acepto» la quita y la consulta 1 muestra `enlace_cita`; abrir el enlace otra vez ya no la muestra.
6. **`/cita` de un paciente del paso 3:** no aparece la tarjeta.
7. **Production, piloto:** los pacientes del piloto aparecen en la consulta 3 (D7) hasta que acepten en su enlace.

### Verificación en local (2026-11-14)

En la base `citia_dev`, con una cuenta de prueba y el frontend de la rama (antes de staging):

- La consulta 1 mostró **las tres filas**: `profesional` desde el modal, con el usuario que marcó la casilla;
  `formulario_publico` desde un formulario público aceptado en la bandeja, con su `solicitud_id` y `aceptada_en` igual a
  la hora del envío (la `recibida_en` de la solicitud); y `enlace_cita` desde la tarjeta de `/cita`, con su `enlace_id`.
- El GET de `/cita` no escribió nada, la cita siguió `pendiente` y, al reabrir el enlace, la tarjeta no aparece.
- La consulta 3 dio 0 filas.
- **Matiz de la consulta 1:** en el canal `profesional`, `registrada_en` (`DEFAULT now()`, la hora de inicio de la
  transacción) queda unos milisegundos **antes** que `aceptada_en` (el reloj de la app, dentro de la transacción). La
  prueba es `aceptada_en`; `registrada_en` solo dice cuándo se escribió la fila.

### En production (2026-11-17 → 2026-11-20)

Con la cuenta de prueba, no la del piloto. Detalle en la
[feature](../Features/us11-terminos-paciente.md#verificación-en-production-2026-11-17--2026-11-20).

| Paso | Resultado |
|---|---|
| 1 | ✅ `/terminos` con *Versión 1.0* y el 16 de noviembre (2026-11-17); `soporte@citiahealth.cl` recibe desde ese día, con el reenvío de Cloudflare |
| 2 y 3 | ✅ dos solicitudes con `terminos_version = '1.0'`, aceptadas en la bandeja → dos filas `formulario_publico` con su `solicitud_id` y `aceptada_en` = la hora del envío. Una tercera solicitud, del mismo RUT que un paciente con su fila, no dejó otra (D11) |
| 4 | ✅ el texto del alta manual; sin la casilla, *«Marca la casilla cuando el paciente te haya autorizado.»*; al crear, la fila `profesional` con el `usuario_id` |
| 5 | ✅ desde el recordatorio real (2026-11-19): la tarjeta, confirmar sin aceptar, «Acepto» → la fila `enlace_cita`; al reabrir, sin tarjeta |
| 6 | no se probó aparte |
| 7 | la consulta 3 sigue contando a los pacientes de antes de US-11 que no han aceptado (D7) |

En staging no se hizo esta verificación. *Antes: «los pasos 1 a 7 de arriba siguen pendientes en staging y en
production».*

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Una pestaña cargada antes del despliegue del frontend envía después del backend: 400 sin versión | Frontend primero y ≥ 30 min de espera; con un solo piloto, pedirle que recargue |
| El texto del frontend diverge de la copia congelada | Comparación a mano en la Definición de Terminado; cualquier cambio de texto es una versión nueva |
| `soporte@citiahealth.cl` publicado sin reenvío configurado | Paso 4 del orden: probarlo antes del backend ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)). **Pasó:** se configuró el 2026-11-17, unas 14 horas después de publicar `/terminos` |
| El enlace reenviado deja aceptar a otro | Asumido ([ADR-10 §2](../Decisions/ADR-10.md)); la prueba dice «quien tenía el enlace» |
| Pacientes sin recordatorios nunca ven la tarjeta | Asumido (D7); la consulta 3 los muestra |
| Revertir la migración en production borra la prueba | Corregir hacia adelante; advertencia en el `down` |
| El texto no lo revisó un abogado; edad, plazo y región de Resend con ❓ | [Cumplimiento](../Cumplimiento/README.md); no bloquea por decisión del usuario |
| El cubo `portalPorEnlace` compartido (5/h) | Aceptar y confirmar usan 2; el frontend envía «Acepto» una vez |

---

## Preguntas abiertas

**Ninguna.** El 2026-11-14 el usuario aprobó el diseño completo: D3, D5, D7, D9 y D10 a D14 tal como se propusieron,
D6 con el 400, los cambios editoriales del texto, la línea del job G1 en el §2 y el número US-11.

---

## Fuera de alcance

- Encender `PoliticaConsentimiento` ([DT-16](../Deudas/DT-16.md), parte 1).
- Atender derechos: exportar, suprimir, registrar el retiro ([DT-53](../Deudas/DT-53.md)).
- El contrato clínica–Citia ([DT-51](../Deudas/DT-51.md)) y la política de las cuentas de los profesionales.
- La calificación (US-07.02, 🚧).
- Mostrar la aceptación en el voucher o en una ficha (D14).
- Un campo de contacto de la organización (D2) y una página de términos por organización.
- El máximo de conservación de §6 (D8, [DT-26](../Deudas/DT-26.md)).

---

## Deudas que toca

- [DT-16](../Deudas/DT-16.md) — cierra la parte (2) y avanza la (3).
- [DT-53](../Deudas/DT-53.md) — avanza el punto 1 (el texto del paciente).
- [DT-26](../Deudas/DT-26.md) — dos datos más sin plazo (`aceptaciones_terminos`, `solicitudes_cita.terminos_version`).
- [DT-52](../Deudas/DT-52.md) — el texto nombra a los proveedores; la casilla de soporte se publica.
- [DT-54](../Deudas/DT-54.md) — 16 años en el texto, sin control en el sistema.
- [DT-46](../Deudas/DT-46.md) — las fechas nuevas declaran `timestamptz`.
- [DT-62](../Deudas/DT-62.md) — el retiro de la autorización no se registra (⚪ prevista: se contrae con el release).
- [DT-63](../Deudas/DT-63.md) — el profesional no ve si el paciente aceptó (D14 = a; ⚪ prevista).
- En el frontend, `DTF-09` (`citia-frontend/context/Deudas/`): el texto de `/terminos` vive en los dos repos, sin
  comparación automática.

*Antes: «A fichar al aceptar el ADR: el retiro de la autorización no se registra; el profesional no ve si el paciente
aceptó (si D14 = a)».* Ver [ADR-16 § Deudas](../Decisions/ADR-16.md#deudas-técnicas-asociadas).
