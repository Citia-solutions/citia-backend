# Módulo: cita

Citas del profesional (US-02, US-02.08, US-06), su bitácora append-only y, desde la Fase 3, el **enlace
del paciente** a su cita (US-04). Diseño: [ADR-04](../../../context/Decisions/ADR-04.md) (estados),
[ADR-09](../../../context/Decisions/ADR-09.md) (alta, reagendar, bitácora), [ADR-11](../../../context/Decisions/ADR-11.md)
(solapamientos), [ADR-12](../../../context/Decisions/ADR-12.md) (outbox) y [ADR-10](../../../context/Decisions/ADR-10.md)
(enlace y respuesta del paciente) y [ADR-14](../../../context/Decisions/ADR-14.md) §9–§10 (registro de hechos:
marcas desde `pendiente`, quién lo pidió, origen, primera apertura y job G1). Planes: `context/US/04-respuesta-paciente.md`
(Fase 3) y `context/US/07.01-registro-hechos.md` (US-07.01, el vigente).

## Estructura

```
src/modules/cita/
├── domain/                                  ← puro (ADR-02: ni @nestjs ni typeorm)
│   ├── cita.entity.ts                       ← Cita, 6 estados, OrigenCita, guardas, accionesPermitidas, chocaCon
│   ├── cambio-cita.entity.ts                ← CambioCita (bitácora), TipoCambio, ActorCambio, PedidoPor
│   ├── actor.ts                             ← Actor = profesional | paciente | sistema (+ mapeos)
│   ├── enlace-cita.entity.ts                ← EnlaceCita: emitir / siguienteVersion / invalidar / permiteActuarSobre
│   ├── derivador-token-enlace.ts            ← puerto DerivadorTokenEnlace + esFormatoTokenEnlace (43 base64url)
│   ├── *.repository.ts                      ← puertos (Cita, CambioCita, EnlaceCita)
│   ├── candidatas-ghosting.ts               ← puerto CandidatasGhosting del job G1 (US-07.01): reclamarSiguiente / contar
│   ├── cierre-ghosting.ts                   ← CORTE_GHOSTING (2026-10-17T03:22Z) + limiteCierreGhosting(ahora, tz) (puro)
│   └── exceptions/
│       ├── transicion-estado-invalida.error.ts   ← → 409
│       └── cita-aun-no-comienza.error.ts         ← marca antes de la hora de inicio → 409 (US-07.01)
├── application/
│   ├── citas.service.ts                     ← casos de uso; UN esqueleto de mutación (ver Reglas)
│   ├── enlaces-cita.service.ts              ← asegurarActivo / resolver / invalidar / registrarPrimeraApertura
│   ├── cierre-ghosting.service.ts           ← caso de uso del job G1 (simulado / activo, un tx por cita)
│   ├── cita-no-encontrada.error.ts          ← → 404 (inexistente u otro tenant, sin distinguir)
│   ├── enlace-cita-no-valido.error.ts       ← → 404 del portal ("Enlace no válido o vencido")
│   ├── datos-paciente-requeridos.error.ts / rango-fechas-invalido.error.ts   ← → 400
├── infrastructure/
│   ├── persistence/                         ← ORM (citas, cambios_cita, enlaces_cita) y adaptadores;
│   │                                           sql-candidatas-ghosting.ts (job G1, SQL a mano)
│   ├── planificacion/
│   │   └── planificador-cierre-citas.ts     ← cron `citas.cierre_ghosting` (minuto 40, APP_TZ), lote 200
│   └── seguridad/
│       ├── hmac-derivador-token-enlace.ts   ← HMAC-SHA256 + sha256 con node:crypto
│       └── clave-enlace-cita.ts             ← lee ENLACE_CITA_CLAVE (respaldo solo fuera de producción)
├── integration/                             ← contra Postgres (npm run test:integration)
├── presentation/
│   ├── citas.controller.ts                  ← `citas` (JwtAuthGuard), traducción única de errores
│   └── dto/
├── cita.module.ts                           ← exporta CitasService, EnlacesCitaService, DerivadorTokenEnlace,
│                                               CierreGhostingService
└── cita-planificacion.module.ts             ← SOLO el job G1 (PlanificadorCierreCitas); lo importa solo AppModule
```

## Endpoints (prefijo global `/api`, todos con JWT)

| Método | Ruta | Status | Respuesta / notas |
|--------|------|--------|-------------------|
| POST | `/citas` | 201 / 400 | `CitaResponseDto` con `avisos` |
| GET | `/citas?desde&hasta` | 200 / 400 | `CitaDashboardDto[]` (máx. 42 días) |
| GET | `/citas/hoy` | 200 | `CitaDashboardDto[]` |
| GET | `/citas/:id` | 200 / 400 / 404 | `CitaDetalleDto` (voucher) + `confirmadaPor` / `canceladaPor` (Fase 3) |
| PATCH | `/citas/:id/confirmar` | 200 / 404 / 409 | `CitaResponseDto` sin `avisos` |
| PATCH | `/citas/:id/cancelar` | 200 / 400 / 404 / 409 | cuerpo `{ motivo?, pedidoPor? }`; `CitaResponseDto` sin `avisos` |
| PATCH | `/citas/:id/asistencia` · `/inasistencia` | 200 / 404 / 409 | `CitaResponseDto` sin `avisos`; 409 también antes de la hora de inicio (US-07.01) |
| PATCH | `/citas/:id/reagendar` | 200 / 400 / 404 / 409 | cuerpo `{ inicio, motivo?, pedidoPor? }`; `CitaResponseDto` con `avisos` |
| PATCH | `/citas/:id` (editar) | 200 / 404 / 409 | `CitaResponseDto` con `avisos` |
| GET | `/citas/:id/historial` | 200 / 404 | `CambioCita[]`; cada cambio trae `pedidoPor: 'paciente' \| 'profesional' \| null` (US-07.01) |
| POST | `/citas/:id/enlace/invalidar` | **204** / 400 / 404 | sin cuerpo; 204 también sin enlace activo |

`GET /citas/:citaId/recordatorios` NO vive aquí: es del módulo `recordatorio`.

### Asistencia, inasistencia y la hora (US-07.01, ADR-14 §9)

| Desde | `…/asistencia` | `…/inasistencia` |
|---|---|---|
| `pendiente` | `asistio` (directo, sin confirmar) | **`ghosting`** (bitácora `ghosting`, actor `profesional`) |
| `confirmada` | `asistio` | `no_asistio` |
| terminal | 409 `TransicionEstadoInvalidaError` | 409 `TransicionEstadoInvalidaError` |

- **Guarda de la hora en el dominio:** `ahora ≥ inicio` (a la hora EXACTA ya se puede). Antes → 409
  con el mensaje fijo de `CitaAunNoComienzaError` (*"La cita todavía no comienza: la asistencia y la
  inasistencia se marcan desde su hora de inicio"*). Orden: primero el estado (una terminal responde lo
  de siempre aunque sea antes de su hora), después la hora. El reloj es el de `CitasService`.
- **`accionesPermitidas(ahora)`** recibe el reloj (obligatorio): `asistencia` e `inasistencia` solo
  desde el inicio. `pendiente` antes: `confirmar, cancelar, reagendar, editar`; desde el inicio: `confirmar,
  cancelar, reagendar, asistencia, inasistencia, editar`. `confirmada` antes: `cancelar, reagendar, editar`
  (ya **no** trae las marcas); desde el inicio: `cancelar, reagendar, asistencia, inasistencia, editar`.
  Terminales: `[]`. El portal la llama con su `ahora` (no cambia su comportamiento).
- No hay ruta `ghosting`: la produce `…/inasistencia` sobre una `pendiente` o el job G1 (`marcarGhosting`).

### Quién lo pidió (`pedidoPor`, US-07.01 H3)

- `cancelar` y `reagendar` aceptan `pedidoPor?: 'paciente' | 'profesional'` (`@IsOptional() @IsEnum`,
  distingue mayúsculas; `'sistema'`, `''`, `'PACIENTE'`, un número o un objeto → 400 *"pedidoPor debe
  ser "paciente" o "profesional""*). Ausente o `null` = sin dato = `null` en la bitácora (cuenta como del
  profesional). La pantalla lo exige; la API no.
- Lo anotan `paciente` solos: `cancelarComoPaciente` (portal) y `reagendarEnTx` (su único llamador, la
  bandeja al aceptar una petición de otra hora; el parámetro es **obligatorio**).
- **Invariante en `CambioCita.registrar`** (espejo de los dos CHECK): `pedidoPor` solo en `cancelada` /
  `reagendada`, y con actor `paciente` solo vacío o `paciente` (`RangeError`). **Solo rechaza, nunca
  completa**: el adaptador reconstruye las filas con `registrar`.
- No viaja en los hechos ni se expone en el detalle o el dashboard (H11); sí en `…/historial`.

### `confirmadaPor` / `canceladaPor`

`'paciente' | 'profesional' | 'sistema' | null`, del último cambio `confirmada` / `cancelada` de la
bitácora. `confirmadaPor` solo con estado `confirmada | asistio | no_asistio` **y** solo si esa
confirmación es POSTERIOR al último `reagendada` (H9, US-07.01: una `pendiente` puede ir directo a
`asistio`, y una confirmación de la hora anterior no cuenta; a igual instante tampoco). Lo calcula
`ultimosCambiosPorTipo(…, [confirmada, reagendada])`. `canceladaPor` solo con `cancelada`.

## Reglas del módulo

- **Quién puede importar `CitaModule`:** `solicitud` (bandeja: `agendar(…, SOLICITUD_PUBLICA)`,
  `reagendarEnTx(…, PedidoPor.PACIENTE)` y la lectura por lote `resumenesPorIds` → `{ id, inicio,
  duracionMin, estado }`, sin paciente ni tipo de consulta; repositorio `buscarPorIds`, sin bloqueo),
  `recordatorio` (solo `EnlacesCitaService.asegurarActivo`), `portal-paciente` (`resolver`,
  `registrarPrimeraApertura` + acciones del paciente) y el módulo hermano `CitaPlanificacionModule`
  (`CierreGhostingService`). **`cita` no importa ninguno de ellos** (sin ciclos); se entera de lo demás por el
  outbox, nunca por import. **Única dependencia de esquema (US-07.01):** `SqlCandidatasGhosting` LEE
  con SQL `recordatorios` y `solicitudes_cita` (ver "Esquema de US-07.01"), sin imports de TypeScript.
- **Tenant y usuario del token, nunca del body.** El paciente nunca manda ids: todo es
  `token → enlace → cita → tenant`.
- **Un solo esqueleto de mutación** (`CitasService.aplicar`): operación de dominio → `guardar` →
  `registrarCambio` → `publicar`, todo en el `tx`. Lo usan el profesional (`mutar` = carga con
  bloqueo + `aplicar`), el paciente (`confirmarComoPaciente` / `cancelarComoPaciente`, que reciben
  la cita YA bloqueada) y el job G1 (`cerrarPorGhostingEnTx`, `ACTOR_SISTEMA`, con la cita YA
  bloqueada por el reclamo). **No copiarlo.**
- **Actor** (`domain/actor.ts`): bitácora `actor_tipo` + `actor_id` (usuario si `profesional`, id del
  `EnlaceCita` si `paciente`, nulo si `sistema`). Los hechos llevan `actor: { tipo, id }` y su
  `usuarioId` es el **dueño** de la cita (`cita.usuarioId`), no quien hizo la petición.
- **Bloqueo de la cita = `FOR NO KEY UPDATE`** (no `FOR UPDATE`): toda mutación carga la cita con
  `buscarPorIdParaActualizar` (exige `tx`). Serializa igual las mutaciones de una cita, pero no choca con
  el `FOR KEY SHARE` que toma el `INSERT` en `enlaces_cita` (FK a `citas`) mientras el envío del
  recordatorio mantiene su transacción abierta durante la llamada al proveedor. No cambiarlo a
  `FOR UPDATE`: lo vigila `portal-paciente/integration/portal-paciente-concurrencia.integration.spec.ts`.
  Las lecturas (`detalle`, `historial`, listados, `resumenesPorIds`) no bloquean.
- **Orden de bloqueo: siempre la CITA primero** y después su enlace (`resolver`, `invalidar` y la
  autocorrección de `asegurarActivo`). Evita interbloqueos entre profesional, paciente e invalidación.
- **La regla de qué transición es legal vive en la entidad** (ADR-04 §1); el servicio solo orquesta.
- **Hechos** (outbox, misma transacción): `CitaCreada`, `CitaConfirmada`, `CitaCancelada`,
  `CitaAsistida`, `CitaNoAsistida`, `CitaReagendada`, `CitaEditada`. Payload: `citaId`, `pacienteId`,
  `usuarioId` (dueño), `estado`, `inicio`, `inicioAnterior`, `actor`. Nunca datos del paciente, motivo,
  tipo de consulta, `pedidoPor`, token ni hash.
- **Ningún hecho nuevo en US-07.01 (H8):** toda inasistencia publica `CitaNoAsistida`, también cuando el
  destino es `ghosting` (del profesional o del job G1, actor `sistema` con `id: null`); toda asistencia,
  `CitaAsistida`. El `estado` y el `actor` del payload dicen cómo se materializó. Los suscriptores de
  `recordatorio` y `solicitud` no cambian.

### Enlace del paciente (Fase 3)

- **Uno activo por cita** (índice único parcial), el mismo en todos sus recordatorios (E1). Nace
  perezosamente con el primer recordatorio enviado (`asegurarActivo`, en el tx del envío; E3).
- **Token recalculable** (E2): `base64url(HMAC-SHA256(ENLACE_CITA_CLAVE, "enlace-cita:<cita>:<versión>"))`,
  43 caracteres. En la base solo `token_hash = sha256(token)` hex. El token **nunca** se guarda, se
  registra en logs ni viaja en hechos.
- **Validez** (`EnlaceCita.permiteActuarSobre`, dentro del tx): no revocado ∧ misma cita y tenant ∧
  cita `pendiente|confirmada` ∧ `ahora < inicio` vigente. Sin revocación al pasar a terminal.
- **`resolver(token, tx)`**: formato inválido → `null` sin tocar la base; si no, enlace por hash → cita
  bloqueada (id y tenant del enlace) → **relee** el enlace → validez. Cualquier fallo → `null` (el
  portal responde el mismo 404). `confirmarComoPaciente` / `cancelarComoPaciente` repiten la validez
  (`EnlaceCitaNoValidoError` → mismo 404).
- **Invalidar** (S1): revoca el activo (`motivo_revocacion = invalidado`, `revocado_por` = usuario);
  el siguiente recordatorio emite `max(version) + 1`.
- **Cambio de `ENLACE_CITA_CLAVE` (DT-45):** `asegurarActivo` detecta que el activo no corresponde a
  la clave vigente, bloquea la cita, relee, lo revoca como sistema (`revocado_por` nulo), emite la
  versión siguiente y deja un `warn` (`enlace_cita.reemitido_por_cambio_de_clave`) con ids y versión. El
  correo anterior deja de servir. Si aun así el activo no corresponde (dos claves vivas a la vez),
  **lanza**: el envío lo trata como error interno y reintenta.
- **Primera apertura (US-07.01, H5):** `registrarPrimeraApertura(enlace, ahora, tx)` → puerto
  `UPDATE … SET primera_apertura_en = $2 WHERE id = $1 AND primera_apertura_en IS NULL`. La llama SOLO el
  `GET` del portal, con el enlace que devolvió `resolver` (válido y con la cita YA bloqueada: el
  `UPDATE` toma el enlace después de la cita). No toca la cita, la bitácora ni el outbox; no registra
  nada en el log. Un enlace sin `id` lanza. Si el `UPDATE` falla, falla la transacción (500). Se guarda
  por versión: tras invalidar, el enlace nuevo empieza sin apertura. Lo mutable del enlace es la
  revocación (`guardar`) y la apertura (su propio método); ninguno pisa la columna del otro.

### Esquema de US-07.01 (registro de hechos)

Migraciones `1750000015000` a `1750000018000`, aditivas y con `down`. Plan:
`context/US/07.01-registro-hechos.md`; diseño: [ADR-14](../../../context/Decisions/ADR-14.md) §9–§10.

| Tabla | Qué | Notas |
|---|---|---|
| `citas` | `origen` (`enum_citas_origen`: `manual` \| `solicitud_publica`) NOT NULL DEFAULT `'manual'` | obligatorio en `CrearCitaProps` (`agendar(…, origen)`: `crearCita` → `MANUAL`, la bandeja → `SOLICITUD_PUBLICA`). El DEFAULT cubre el despliegue, el seed y los INSERT a mano. Relleno: `solicitud_publica` solo si una solicitud `nueva` aceptada creó la cita. No se expone |
| `cambios_cita` | `pedido_por` (`enum_cambios_cita_pedido_por`: `paciente` \| `profesional`) NULL | vacío = del profesional. `CHK_cambios_cita_pedido_por` (solo `cancelada`/`reagendada`) y `CHK_cambios_cita_pedido_por_paciente` (actor `paciente` ⇒ vacío o `paciente`). Sin relleno (H12) |
| `enlaces_cita` | `primera_apertura_en` TIMESTAMPTZ NULL | por versión del enlace; la escribe `registrarPrimeraApertura` (`UPDATE … WHERE primera_apertura_en IS NULL`, `true` si escribió). `guardar` (revocación) no la toca |
| `citas` | `idx_cita_pendiente_inicio` ON (`inicio`) WHERE `estado = 'pendiente'` | índice del job G1: su consulta escribe `c."estado" = 'pendiente'` **sin cast** para usarlo |

- **Puertos:** `CambioCitaRepository.ultimosCambiosPorTipo` (antes `ultimoActorPorTipo`) devuelve
  `{ actor, ocurridoEn }` por tipo. `EnlaceCitaRepository.registrarPrimeraApertura(enlaceId, ahora, tx)`.
  `CandidatasGhosting` (`reclamarSiguiente` con `FOR NO KEY UPDATE OF c SKIP LOCKED`, `tx` obligatorio;
  `contar` sin bloqueo) → `SqlCandidatasGhosting` (registrado en `CitaModule`), barrido **global**
  (ADR-12 §6).
- **Un solo mapeo fila → `Cita`:** `citaDesdeFila` + `columnasCita(alias)` en `typeorm-cita.repository.ts`.
  El SQL a mano sobre `citas` los usa; una columna nueva se agrega ahí (el `Record` no compila sin ella).
- **Dependencia de esquema del job G1** (como `LectorCitas` en `recordatorio`): `sql-candidatas-ghosting.ts`
  lee `recordatorios.estado` (`enviado`/`entregado`), `proveedor` (≠ `registro`), `enviado_en` e
  `inicio_cita`, y `solicitudes_cita.tipo` (`reagendamiento`), `estado` (`recibida`) y `cita_origen_id`.
  Cambiar esas columnas o valores obliga a revisar ese archivo.
- En SQL a mano, **nunca castear a un tipo enum por nombre**: difiere entre la migración (`enum_citas_*`) y
  `synchronize` (tests). Comparar con literales sin cast o por `::text`.

### Job G1: cierre por `ghosting` (US-07.01, DT-11)

| Pieza | Archivo |
|---|---|
| corte y límite (puros) | `domain/cierre-ghosting.ts` (`CORTE_GHOSTING`, `limiteCierreGhosting(ahora, tz)` = 00:00 de hoy en `APP_TZ`) |
| puerto / adaptador | `domain/candidatas-ghosting.ts` / `infrastructure/persistence/sql-candidatas-ghosting.ts` |
| caso de uso | `application/cierre-ghosting.service.ts` (`CierreGhostingService.ejecutar({ activo, lote, continuar })`) |
| planificador | `infrastructure/planificacion/planificador-cierre-citas.ts` (`PlanificadorCierreCitas`) |
| módulo hermano | `cita-planificacion.module.ts` (`CitaPlanificacionModule`): importa `CitaModule`, **solo lo importa `AppModule`** |

- **Regla:** `pendiente` ∧ `corte < inicio < limite` ∧ un recordatorio `enviado|entregado` por un
  proveedor real (≠ `registro`), desde el corte y con `inicio_cita = citas.inicio` ∧ sin petición de otra
  hora `recibida`. Lo que queda fuera sigue `pendiente` (neutra). Una petición rechazada no protege.
- **Cron** `citas.cierre_ghosting` = `0 40 * * * *` en `APP_TZ` (cada hora, minuto 40), lote **200**
  (constante). Con `PLANIFICADOR_ACTIVO=false` no registra nada. Sin latido de Better Stack.
- **`CIERRE_GHOSTING_ACTIVO`** (`shared/infrastructure/config/entorno.ts`, `l.booleano(…, false)`):
  apagado por defecto en TODOS los entornos; se lee en cada tick y solo un `true` validado lo prende.
  - **Apagado:** UNA llamada a `contar` (sin transacción, sin bloqueo, sin `CitasService`): **no escribe
    nada** y deja siempre `citas.cierre_ghosting.simulado` `{ candidatas, masAntigua, limite, corte }`.
  - **Prendido:** una transacción por cita: `reclamarSiguiente` → `CitasService.cerrarPorGhostingEnTx`
    (bitácora `ghosting` con actor `sistema` y `actor_id` nulo + `CitaNoAsistida`, mismo `tx`). Una
    cita que falla se revierte sola, va a `fallidas` y se excluye del resto del tick; un fallo del
    reclamo (infraestructura) sube. Log `citas.cierre_ghosting` `{ cerradas, fallidas, interrumpido,
    limite }`; por cita fallida, `citas.cierre_ghosting.cita_fallida` `{ citaId, tenantId, codigo }`;
    si el tick falla, `citas.cierre_ghosting.fallido`.
- **Idempotente y seguro con varias réplicas:** `SKIP LOCKED` reparte las citas, `TrabajoSinSolapamiento`
  impide dos ticks en un proceso y una cita cerrada deja de ser candidata (si una lectura vieja la
  reclamara, el dominio la rechaza: de un terminal no se sale). Apagado ordenado como los demás jobs.
- **Logs solo con ids, conteos y fechas**; nunca datos del paciente. `ejecutarCierre()` es público
  (pruebas y prueba manual).

## Tests

- Unitarios junto a cada archivo. `application/` no importa `infrastructure/` (ni en los specs:
  `src/arquitectura.spec.ts`): usa `test/support/derivador-token-enlace-de-prueba.ts` y los dobles de
  `test/support/in-memory-repositories.ts` (`InMemoryCitaRepository`, `InMemoryEnlaceCitaRepository`…).
- Las pruebas de dominio que no miran la hora usan un reloj posterior a todas sus citas; la guarda de
  la hora tiene las suyas (`cita.entity.spec.ts`, "guarda de la hora"). Las e2e con el reloj REAL que
  marcan asistencia sobre una cita futura mueven antes su `inicio` al pasado con SQL.
- e2e sin BD: `test/citas-detalle.e2e-spec.ts` (voucher, invalidar), `test/citas-rango.e2e-spec.ts`.
- Con Postgres: `integration/*.integration.spec.ts`, `test/citas-dashboard.e2e-spec.ts`,
  `test/pacientes.e2e-spec.ts`. Las que listan entidades a mano deben incluir `EnlaceCitaOrmEntity`
  (lo registra `CitaModule`) y, si truncan `citas`, también `enlaces_cita` (FK).
