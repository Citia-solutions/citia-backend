# Módulo: cita

Citas del profesional (US-02, US-02.08, US-06), su bitácora append-only y, desde la Fase 3, el **enlace
del paciente** a su cita (US-04). Diseño: [ADR-04](../../../context/Decisions/ADR-04.md) (estados),
[ADR-09](../../../context/Decisions/ADR-09.md) (alta, reagendar, bitácora), [ADR-11](../../../context/Decisions/ADR-11.md)
(solapamientos), [ADR-12](../../../context/Decisions/ADR-12.md) (outbox) y [ADR-10](../../../context/Decisions/ADR-10.md)
(enlace y respuesta del paciente). Plan vigente: `context/US/04-respuesta-paciente.md`.

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
│   └── exceptions/transicion-estado-invalida.error.ts   ← → 409
├── application/
│   ├── citas.service.ts                     ← casos de uso; UN esqueleto de mutación (ver Reglas)
│   ├── enlaces-cita.service.ts              ← asegurarActivo / resolver / invalidar
│   ├── cita-no-encontrada.error.ts          ← → 404 (inexistente u otro tenant, sin distinguir)
│   ├── enlace-cita-no-valido.error.ts       ← → 404 del portal ("Enlace no válido o vencido")
│   ├── datos-paciente-requeridos.error.ts / rango-fechas-invalido.error.ts   ← → 400
├── infrastructure/
│   ├── persistence/                         ← ORM (citas, cambios_cita, enlaces_cita) y adaptadores;
│   │                                           sql-candidatas-ghosting.ts (job G1, SQL a mano)
│   └── seguridad/
│       ├── hmac-derivador-token-enlace.ts   ← HMAC-SHA256 + sha256 con node:crypto
│       └── clave-enlace-cita.ts             ← lee ENLACE_CITA_CLAVE (respaldo solo fuera de producción)
├── integration/                             ← contra Postgres (npm run test:integration)
├── presentation/
│   ├── citas.controller.ts                  ← `citas` (JwtAuthGuard), traducción única de errores
│   └── dto/
└── cita.module.ts                           ← exporta CitasService, EnlacesCitaService, DerivadorTokenEnlace
```

## Endpoints (prefijo global `/api`, todos con JWT)

| Método | Ruta | Status | Respuesta / notas |
|--------|------|--------|-------------------|
| POST | `/citas` | 201 / 400 | `CitaResponseDto` con `avisos` |
| GET | `/citas?desde&hasta` | 200 / 400 | `CitaDashboardDto[]` (máx. 42 días) |
| GET | `/citas/hoy` | 200 | `CitaDashboardDto[]` |
| GET | `/citas/:id` | 200 / 400 / 404 | `CitaDetalleDto` (voucher) + `confirmadaPor` / `canceladaPor` (Fase 3) |
| PATCH | `/citas/:id/confirmar` · `/cancelar` · `/asistencia` · `/inasistencia` | 200 / 404 / 409 | `CitaResponseDto` sin `avisos` |
| PATCH | `/citas/:id/reagendar` · `/citas/:id` (editar) | 200 / 404 / 409 | `CitaResponseDto` con `avisos` |
| GET | `/citas/:id/historial` | 200 / 404 | `CambioCita[]` |
| POST | `/citas/:id/enlace/invalidar` | **204** / 400 / 404 | sin cuerpo; 204 también sin enlace activo |

`GET /citas/:citaId/recordatorios` NO vive aquí: es del módulo `recordatorio`.

`confirmadaPor` / `canceladaPor`: `'paciente' | 'profesional' | 'sistema' | null`, del último cambio
`confirmada` / `cancelada` de la bitácora. `confirmadaPor` solo con estado `confirmada | asistio |
no_asistio` (tras reagendar vuelve a `pendiente` y una confirmación vieja no cuenta); `canceladaPor`
solo con `cancelada`.

## Reglas del módulo

- **Quién puede importar `CitaModule`:** `solicitud` (bandeja: `agendar`, `reagendarEnTx` y
  la lectura por lote `resumenesPorIds` → `{ id, inicio, duracionMin, estado }`, sin
  paciente ni tipo de consulta; repositorio `buscarPorIds`, sin bloqueo),
  `recordatorio` (solo `EnlacesCitaService.asegurarActivo`) y `portal-paciente` (`resolver` + acciones
  del paciente). **`cita` no importa ninguno de ellos** (sin ciclos); se entera de lo demás por el
  outbox, nunca por import. **Única dependencia de esquema (US-07.01):** `SqlCandidatasGhosting` LEE
  con SQL `recordatorios` y `solicitudes_cita` (ver "Esquema de US-07.01"), sin imports de TypeScript.
- **Tenant y usuario del token, nunca del body.** El paciente nunca manda ids: todo es
  `token → enlace → cita → tenant`.
- **Un solo esqueleto de mutación** (`CitasService.aplicar`): operación de dominio → `guardar` →
  `registrarCambio` → `publicar`, todo en el `tx`. Lo usan el profesional (`mutar` = carga con
  bloqueo + `aplicar`), el paciente (`confirmarComoPaciente` / `cancelarComoPaciente`, que reciben
  la cita YA bloqueada) y, en el futuro, el job de cierre (`ACTOR_SISTEMA`). **No copiarlo.**
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
  tipo de consulta, token ni hash.

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
  `contar` sin bloqueo) → `SqlCandidatasGhosting`, barrido **global** (ADR-12 §6). Todavía no está
  registrado en `CitaModule`: lo cablea el paso del job.
- **Un solo mapeo fila → `Cita`:** `citaDesdeFila` + `columnasCita(alias)` en `typeorm-cita.repository.ts`.
  El SQL a mano sobre `citas` los usa; una columna nueva se agrega ahí (el `Record` no compila sin ella).
- **Dependencia de esquema del job G1** (como `LectorCitas` en `recordatorio`): `sql-candidatas-ghosting.ts`
  lee `recordatorios.estado` (`enviado`/`entregado`), `proveedor` (≠ `registro`), `enviado_en` e
  `inicio_cita`, y `solicitudes_cita.tipo` (`reagendamiento`), `estado` (`recibida`) y `cita_origen_id`.
  Cambiar esas columnas o valores obliga a revisar ese archivo.
- En SQL a mano, **nunca castear a un tipo enum por nombre**: difiere entre la migración (`enum_citas_*`) y
  `synchronize` (tests). Comparar con literales sin cast o por `::text`.

## Tests

- Unitarios junto a cada archivo. `application/` no importa `infrastructure/` (ni en los specs:
  `src/arquitectura.spec.ts`): usa `test/support/derivador-token-enlace-de-prueba.ts` y los dobles de
  `test/support/in-memory-repositories.ts` (`InMemoryCitaRepository`, `InMemoryEnlaceCitaRepository`…).
- e2e sin BD: `test/citas-detalle.e2e-spec.ts` (voucher, invalidar), `test/citas-rango.e2e-spec.ts`.
- Con Postgres: `integration/*.integration.spec.ts`, `test/citas-dashboard.e2e-spec.ts`,
  `test/pacientes.e2e-spec.ts`. Las que listan entidades a mano deben incluir `EnlaceCitaOrmEntity`
  (lo registra `CitaModule`) y, si truncan `citas`, también `enlaces_cita` (FK).
