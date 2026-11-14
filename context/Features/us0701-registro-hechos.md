# Feature: US-07.01 — Registro de hechos (primera parte de US-07, RF-08)

> **Fase:** [Fase 5 — US-07](../Fases/fase-5-us07-scoring.md) · **Feature:** este documento · **Plan:** [US-07.01](../US/07.01-registro-hechos.md) · **Relacionado:** [ADR-14](../Decisions/ADR-14.md), [ADR-04](../Decisions/ADR-04.md), [ADR-12](../Decisions/ADR-12.md), [ADR-10](../Decisions/ADR-10.md), [ADR-09](../Decisions/ADR-09.md), [ADR-07](../Decisions/ADR-07.md), [ADR-02](../Decisions/ADR-02.md), [DT-11](../Deudas/DT-11.md), [DT-47](../Deudas/DT-47.md)…[DT-50](../Deudas/DT-50.md), [DT-13](../Deudas/DT-13.md), [DT-30](../Deudas/DT-30.md), [DT-37](../Deudas/DT-37.md), [DT-40](../Deudas/DT-40.md), [DT-44](../Deudas/DT-44.md), [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1), [gestionar-cita (front)](../../../citia-frontend/context/Features/gestionar-cita.md)

**Historia:** US-07.01, la primera de las tres subtareas de US-07 (RF-08) · decisiones de producto del usuario
(2026-10-19) y del `architecture-agent` (H1–H12 del plan)
**Estado:** ✅ **cerrada (2026-11-14)**: pruebas manuales completas el 2026-11-01 ([cierre](#cierre-2026-11-01)) · en
producción desde el 2026-10-20 (backend [PR #13](https://github.com/Citia-solutions/citia-backend/pull/13), frontend
[PR #14](https://github.com/Citia-solutions/citia-frontend/pull/14)) · **job G1 prendido desde el 2026-10-27**
([DT-11](../Deudas/DT-11.md) cerrada) · la calificación que usará estos hechos (US-07.02) sigue 🚧 bloqueada
**Pruebas:** 1987 unitarios, 212 de integración y 326 e2e en verde antes del release (2026-10-20)
**Commits:** `3e64472` (ADR-14 y plan), `1545ad7` (esquema), `f123617` (dominio, API y job G1), `8a7953b` y `d4aa920`
(tests), `bb90815` (DT-47) · merge `715c3f3` a `develop` (PR #12) · release `313a506` (PR #13) · filas 105–112 de la
[TRAZABILIDAD](../TRAZABILIDAD.md) · en el frontend: `9e3be69`, `af10f5e`, el merge `ef61077` (PR #13) y el release
`69668ec` (PR #14)
**ADRs:** **[14](../Decisions/ADR-14.md)** §9 y §10 (aceptado en lo que toca a US-07.01, 2026-10-19) · extiende
[04](../Decisions/ADR-04.md) §2 (dos transiciones desde `pendiente` y la guarda de la hora) · usa
[12](../Decisions/ADR-12.md) §5 y §8 (planificador y job de cierre) · respeta [10](../Decisions/ADR-10.md) §5 (una
petición de otra hora sin atender no es `ghosting`) y S1–S3 · [07](../Decisions/ADR-07.md) (el fin del día en la zona
de la clínica) · [09](../Decisions/ADR-09.md) §5–§6 (reagendar y bitácora) · [02](../Decisions/ADR-02.md) (capas)

> El porqué de cada pieza está en ADR-14 (§9 y §10); el contrato completo (decisiones H1–H12, SQL, DTO, orden por
> agente y Definición de Terminado), en el plan US-07.01. Este documento resume **lo que existe en el código**
> (revisado en `src/` el 2026-11-14). No hay desviaciones del contrato registradas, y lo revisado coincide con él
> (rutas, DTO, migraciones, cron y lote). Las reglas locales para los agentes viven en los `CLAUDE.md` de `cita`,
> `portal-paciente`, `recordatorio` y `solicitud`.

---

## Qué hace

> *Como profesional de la salud quiero marcar si el paciente asistió o no aunque nunca haya confirmado, y decir quién
> pidió cada cancelación o cambio de hora, para que el historial cuente lo que de verdad pasó.*
> *Como producto quiero empezar a guardar hoy los hechos que no se pueden reconstruir después, aunque la calificación
> (US-07.02) llegue más tarde.*

- **Asistencia sobre una cita `pendiente`:** desde la hora de inicio, el voucher ofrece *Asistió* y *No asistió*
  también en una cita que nunca se confirmó. *Asistió* la deja en `asistio`; *No asistió*, en `ghosting` (el frontend
  lo muestra como *"Sin respuesta"*). Sobre una `confirmada`, todo sigue igual (`asistio` / `no_asistio`). **Antes de
  la hora de inicio nadie puede marcar**, tampoco llamando a la API (409).
- **Quién lo pidió:** al cancelar y al reagendar desde el voucher, el profesional contesta *"¿Quién lo pidió?"*
  (*Paciente* / *Decisión mía*). La API lo acepta como opcional; sin el dato, cuenta como del profesional. Lo que
  cancela el paciente por su enlace y lo que se mueve al aceptar su petición de otra hora queda anotado como pedido
  por el paciente, sin preguntar.
- **Origen de la cita:** `manual` o `solicitud_publica`. Las citas que ya existían se rellenaron al migrar.
- **Primera apertura del enlace:** la primera vez que el paciente abre su enlace con un token válido, queda la fecha.
  La página se ve igual, la cita no cambia y los enlaces no válidos siguen respondiendo el mismo 404.
- **Job G1:** cada hora, al minuto 40, cierra como `ghosting` (actor `sistema`) las citas `pendiente` a las que nadie
  llegó, con la regla G1 de [DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14). Lo controla
  `CIERRE_GHOSTING_ACTIVO`: apagado, solo cuenta. **Está prendido en production desde el 2026-10-27.**

Nada de esto tiene pantalla propia: `origen`, `pedidoPor` y la primera apertura **solo se guardan**, para US-07.02
(H11). La única excepción es `GET /api/citas/:id/historial`, que devuelve la bitácora tal cual y por eso trae
`pedidoPor`.

---

## Arquitectura (hexagonal)

### Lo que cambia por módulo

| Módulo | Qué se agrega o cambia |
|---|---|
| `cita` · dominio | `OrigenCita` en `Cita`, obligatorio en `CrearCitaProps` · `marcarAsistencia(ahora)` y `marcarInasistencia(ahora)` desde `pendiente` o `confirmada` (la inasistencia devuelve su destino) · `marcarGhosting(ahora)`, que solo usa el job · `accionesPermitidas(ahora)`, con el reloj **obligatorio** · `CitaAunNoComienzaError` · `PedidoPor` y su invariante en `CambioCita.registrar` · `cierre-ghosting.ts` (`CORTE_GHOSTING` y `limiteCierreGhosting(ahora, tz)`, puros) · puerto `CandidatasGhosting` (`reclamarSiguiente` / `contar`) · `EnlaceCita.primeraAperturaEn` y `EnlaceCitaRepository.registrarPrimeraApertura` |
| `cita` · aplicación | `CitasService`: las marcas con el reloj inyectado, `pedidoPor` en `cancelar` y `reagendar`, `PACIENTE` en `cancelarComoPaciente`, `reagendarEnTx(…, pedidoPor)` con el dato obligatorio, `agendar(…, origen)`, `cerrarPorGhostingEnTx` (actor `sistema`) y `confirmadaPor` según H9 · `EnlacesCitaService.registrarPrimeraApertura` · `CierreGhostingService`, el caso de uso del job (clase plana) |
| `cita` · infraestructura | columnas, enums, CHECK e índice declarados también en las entidades ORM (así el esquema de `synchronize` de los tests queda igual al de la migración) · `SqlCandidatasGhosting` (SQL a mano) · `PlanificadorCierreCitas`, en el módulo hermano `CitaPlanificacionModule`, que solo importa `AppModule` |
| `cita` · presentación | `pedidoPor` opcional en `MotivoCitaDto` y `ReagendarCitaDto` · `CitaAunNoComienzaError` → 409 |
| `portal-paciente` | `ver` (el `GET`) llama a `registrarPrimeraApertura` con un enlace válido, en su misma transacción · `accionesPermitidasPaciente` le pasa a `accionesPermitidas` el mismo `ahora` |
| `solicitud` | la bandeja crea la cita con `OrigenCita.SOLICITUD_PUBLICA` al aceptar una `nueva`, y llama a `reagendarEnTx` con `PedidoPor.PACIENTE` al aceptar un `reagendamiento` |
| `shared` | `CIERRE_GHOSTING_ACTIVO` en la validación del entorno (`l.booleano(…, false)`) |

### Reglas de dependencia

- **Ningún módulo nuevo de negocio.** El job vive en `cita` (`CitaPlanificacionModule`, como
  `RecordatorioPlanificacionModule`): las e2e que cargan `CitaModule` no levantan el job.
- **Dependencia de esquema ([DT-50](../Deudas/DT-50.md)):** `SqlCandidatasGhosting` lee con SQL `recordatorios`
  (`estado`, `proveedor`, `enviado_en`, `inicio_cita`) y `solicitudes_cita` (`tipo`, `estado`, `cita_origen_id`), sin
  importar código de esos módulos. Está escrita en los tres `CLAUDE.md`, y la integración del job falla si cambia una
  columna que usa.
- **Orden de bloqueo:** la cita con `FOR NO KEY UPDATE` (nunca `FOR UPDATE`) y siempre **antes** que su enlace. La
  primera apertura escribe el enlace después de bloquear la cita.
- `src/arquitectura.spec.ts` sigue vigilando que `domain/` y `application/` no importen NestJS, TypeORM ni
  `infrastructure/`.

---

## Endpoints

Prefijo global `/api`. Ninguna ruta nueva: todas ya existían y cambian de forma aditiva, salvo el **409** antes de la
hora de inicio (antes era 200, aunque el voucher no ofrecía esos botones antes de la hora).

| Método | Ruta | Qué cambió en US-07.01 | Errores nuevos |
|---|---|---|---|
| `PATCH` | `/api/citas/:id/asistencia` | también sobre una `pendiente` (`pendiente → asistio`, directo) | **409** antes de la hora de inicio |
| `PATCH` | `/api/citas/:id/inasistencia` | también sobre una `pendiente`: el dominio decide el destino (`confirmada → no_asistio`, `pendiente → ghosting`) y la respuesta trae el estado real | **409** antes de la hora de inicio |
| `PATCH` | `/api/citas/:id/cancelar` | cuerpo `{ motivo?, pedidoPor? }` | 400 si `pedidoPor` no es válido |
| `PATCH` | `/api/citas/:id/reagendar` | cuerpo `{ inicio, motivo?, pedidoPor? }` | 400 si `pedidoPor` no es válido |
| `GET` | `/api/citas/:id` | `accionesPermitidas` mira el reloj: `asistencia` e `inasistencia` solo desde la hora de inicio, también en una `pendiente`; `confirmadaPor` según H9 | — |
| `GET` | `/api/citas/:id/historial` | cada cambio trae `pedidoPor: 'paciente' \| 'profesional' \| null` | — |
| `GET` | `/api/publico/cita` | con un token válido, registra la primera apertura (una sola vez) | — (el 404 uniforme no cambia) |
| `POST` | `/api/publico/cita/cancelar` | la bitácora queda con `pedido_por = 'paciente'` | — |
| `POST` | `/api/solicitudes/:id/aceptar` | una `nueva` crea la cita con `origen = 'solicitud_publica'`; un `reagendamiento` deja `pedido_por = 'paciente'` | — |

No hay ruta `ghosting`: lo produce `…/inasistencia` sobre una `pendiente` (el profesional) o el job G1 (el sistema).

### Asistencia, inasistencia y la hora

| Estado de origen | *Asistió* (`…/asistencia`) | *No asistió* (`…/inasistencia`) |
|---|---|---|
| `pendiente` | `asistio` (directo: no se inventa una confirmación que no hubo) | `ghosting`, con actor `profesional` en la bitácora |
| `confirmada` | `asistio` | `no_asistio` |
| terminal | 409 (`TransicionEstadoInvalidaError`), aunque sea antes de su hora | 409 (ídem) |

- La guarda mira primero el **estado** y después la **hora**. A la hora exacta de inicio ya se puede marcar; un
  milisegundo antes, **409** *"La cita todavía no comienza: la asistencia y la inasistencia se marcan desde su hora de
  inicio"* (`CitaAunNoComienzaError`). Es el complemento exacto de la validez del enlace del paciente (`ahora <
  inicio`): no hay un instante en que se puedan las dos cosas, ni uno en que no se pueda ninguna.
- **`confirmadaPor` (H9):** solo cuenta una confirmación **posterior al último reagendamiento**. Sin eso, una cita
  confirmada, después reagendada y por último marcada `asistio` desde `pendiente` diría *"Confirmada por ti"* con la
  confirmación de otra hora.

### Quién lo pidió (`pedidoPor`)

| Camino | `actor_tipo` | `pedido_por` |
|---|---|---|
| el voucher, al cancelar o reagendar (la pantalla exige la respuesta) | `profesional` | `paciente` o `profesional` |
| la API sin el campo, o con `null` | `profesional` | `null` (= del profesional, a favor del paciente) |
| el paciente cancela por su enlace | `paciente` | `paciente` |
| la bandeja acepta una petición de otra hora | `profesional` | `paciente` |

- **Validación:** `@IsOptional() @IsEnum(PedidoPor)`, distingue mayúsculas: `'sistema'`, `''`, `'PACIENTE'`, un número
  o un objeto → 400 *"pedidoPor debe ser "paciente" o "profesional""*.
- **Invariante** (en `CambioCita.registrar` y en dos CHECK): `pedido_por` solo en `cancelada` y `reagendada`; con actor
  `paciente`, solo vacío o `paciente`.
- **Sin relleno hacia atrás (H12):** la bitácora es append-only. Las filas anteriores quedan en `null`; US-07.02 leerá
  como pedido por el paciente lo que tenga `actor_tipo = 'paciente'`.

---

## Origen de la cita

- `citas.origen`, `NOT NULL DEFAULT 'manual'`. El código lo fija al crear: `POST /api/citas` → `manual`; aceptar una
  solicitud `nueva` en la bandeja → `solicitud_publica`. Reagendar, o aceptar una petición de otra hora, mueve **la
  misma** cita: el origen no cambia, y "reagendamiento" no es un origen.
- **Relleno** al migrar: `solicitud_publica` solo para las citas que creó una solicitud `nueva` aceptada del mismo
  tenant. Una de `reagendamiento` aceptada apunta a su cita de origen, que queda `manual`. El `UPDATE` es idempotente:
  si en la ventana del despliegue se aceptó una solicitud y su cita quedó `manual`, se corrige volviéndolo a correr.
- El `DEFAULT` se queda a propósito: cubre la ventana del despliegue, el seed y los `INSERT` a mano de los tests.

---

## Primera apertura del portal

- `enlaces_cita.primera_apertura_en` (`TIMESTAMPTZ NULL`), **por versión del enlace**: tras invalidarlo, el enlace
  nuevo empieza sin apertura.
- La escribe `GET /api/publico/cita`, **solo con un enlace válido**, en la misma transacción que ya bloquea la cita y
  después de ella: `UPDATE … WHERE primera_apertura_en IS NULL`. La segunda vez no cambia nada y dos aperturas a la
  vez dejan una sola. Un enlace no válido lanza el 404 uniforme **antes** de escribir. Las acciones `POST` no la
  llaman.
- No cambia la cita, no escribe en la bitácora ni publica hechos, y no altera ADR-10 S1–S3. Si el `UPDATE` falla, la
  petición responde un 500 genérico: no se esconde un fallo de la base.
- **Escáneres de enlaces ([DT-49](../Deudas/DT-49.md)):** un escáner que ejecuta la página puede registrar una
  apertura que no hizo el paciente; el error favorece al paciente. *(2026-11-01: tres recordatorios entregados a Gmail
  no registraron aperturas falsas. Outlook, sin probar.)*

---

## Job G1

### La regla

`SqlCandidatasGhosting` aplica la regla G1 de DT-11 con la precisión H10. Una cita es candidata si cumple **las tres**
condiciones:

1. Está `pendiente`, su `inicio` es anterior a las 00:00 de hoy en `APP_TZ` (`limiteCierreGhosting`, ADR-07) y
   posterior al corte del **2026-10-17 a las 03:22 UTC** (`CORTE_GHOSTING`).
2. Tiene un recordatorio `enviado` o `entregado`, por un **proveedor real** (`proveedor <> 'registro'`,
   [DT-40](../Deudas/DT-40.md)), enviado desde el corte y **para su hora vigente** (`inicio_cita = inicio`). Un
   `enviado` sin webhook cuenta ([DT-37](../Deudas/DT-37.md)).
3. No tiene una petición de otra hora `recibida` (ADR-10 §5). Una petición `rechazada` no la protege
   ([DT-44](../Deudas/DT-44.md)).

Una cita creada en el pasado nunca recibe recordatorio, así que G1 la deja fuera ([DT-13](../Deudas/DT-13.md)). En
staging el correo usa `registro`, así que el job nunca encuentra candidatas.

### Los dos modos

| Modo | Qué hace | Log |
|---|---|---|
| **Apagado** (`CIERRE_GHOSTING_ACTIVO=false`, el valor por defecto) | una sola llamada a `contar`, sin transacción ni bloqueo; **no escribe nada** | `citas.cierre_ghosting.simulado` con `candidatas`, `masAntigua`, `limite` y `corte`, siempre (también con 0) |
| **Prendido** (`true`; en production desde el 2026-10-27) | hasta **200** citas por tick (`LOTE_CIERRE_GHOSTING`), **una transacción por cita**: `reclamarSiguiente` (`FOR NO KEY UPDATE OF c SKIP LOCKED`) → `cerrarPorGhostingEnTx` (bitácora `ghosting` con actor `sistema` y `actor_id` nulo, y el hecho `CitaNoAsistida`, en el mismo `tx`) | `citas.cierre_ghosting` con `cerradas`, `fallidas`, `interrumpido` y `limite`; por cita fallida, `citas.cierre_ghosting.cita_fallida`; si falla el tick, `citas.cierre_ghosting.fallido` |

- Una cita que falla revierte solo su transacción, va a `fallidas`, queda excluida del resto del tick y el tick sigue.
  Si falla el reclamo mismo (infraestructura), el error sube.
- **Idempotente y seguro con varias réplicas:** una cita cerrada deja de ser `pendiente` y no vuelve a salir;
  `SKIP LOCKED` reparte las citas entre procesos, y si una lectura vieja reclamara una ya cerrada, el dominio la rechaza
  (de un terminal no se sale).
- Los logs llevan solo ids, conteos y fechas; nunca datos del paciente. La línea `citas.cierre_ghosting` del modo
  prendido **no lleva `msg`** (pendiente menor de código, no es deuda).

### El planificador

- `PlanificadorCierreCitas` registra a mano en `SchedulerRegistry` el cron `citas.cierre_ghosting` con
  `HORARIO_CIERRE_GHOSTING = '0 40 * * * *'` en `APP_TZ`: cada hora, al minuto 40. **`HORARIO_CIERRE_GHOSTING` es una
  constante del código, no una variable de entorno**; el lote de 200 tampoco se configura.
- El primer tick después de medianoche (00:40) cierra el día anterior; los demás recogen lo que quedó (un despliegue,
  una cita bloqueada). El minuto 40 no choca con los otros jobs.
- Con `PLANIFICADOR_ACTIVO=false` no registra nada. Sin solapamiento dentro del proceso (`TrabajoSinSolapamiento`),
  con apagado ordenado y sin latido de Better Stack.
- Al arrancar deja `planificador.activo` con `jobs: ['citas.cierre_ghosting']` y `modo: 'activo'` o `'simulado'`.

---

## Hechos que se publican

**Ningún hecho nuevo (H8).** La inasistencia publica siempre `CitaNoAsistida`, también cuando el destino es `ghosting`
(sea del profesional o del job), y la asistencia, `CitaAsistida`. El `estado` y el `actor` del payload dicen cómo se
materializó; el del job es `actor: { tipo: 'sistema', id: null }`. Por eso `SuscriptorRecordatorios` y
`SuscriptorSolicitudes` siguen igual: anulan los recordatorios pendientes y descartan la petición abierta.

---

## Esquema de BD

Cuatro migraciones aditivas y reversibles, en un solo lote con las demás (`migrationsTransactionMode = 'all'`). **Los
`down` de las tres primeras son destructivos.**

| Migración | Qué hace | `down` |
|---|---|---|
| `1750000015000-AddOrigenACitas` | tipo `enum_citas_origen` (`manual`, `solicitud_publica`) y `citas.origen` `NOT NULL DEFAULT 'manual'`, con el relleno | borra la columna y el tipo: se pierde el origen de las citas creadas desde el despliegue (el de las anteriores se vuelve a derivar con el relleno) |
| `1750000016000-AddPedidoPorACambiosCita` | tipo `enum_cambios_cita_pedido_por` (`paciente`, `profesional`), `cambios_cita.pedido_por` `NULL` y los CHECK `CHK_cambios_cita_pedido_por` (solo `cancelada` / `reagendada`) y `CHK_cambios_cita_pedido_por_paciente` (actor `paciente` ⇒ vacío o `paciente`); sin relleno | borra los CHECK, la columna y el tipo: se pierde quién pidió cada cambio, y no se puede reconstruir |
| `1750000017000-AddPrimeraAperturaAEnlacesCita` | `enlaces_cita.primera_apertura_en` `TIMESTAMPTZ NULL`; sin índice | borra la columna: se pierden las aperturas registradas |
| `1750000018000-AddIndiceCierreGhostingACitas` | índice parcial `idx_cita_pendiente_inicio` sobre `citas(inicio)` `WHERE estado = 'pendiente'`, el del job G1 (su consulta escribe el predicado sin cast para usarlo) | borra el índice, sin pérdida de datos |

En SQL a mano, nunca castear a un tipo enum por nombre: el nombre del tipo difiere entre la migración y el
`synchronize` de los tests.

---

## Configuración

| Variable | Default | Para qué |
|---|---|---|
| `CIERRE_GHOSTING_ACTIVO` | `false`, **en todos los entornos** | prende el job G1. **No es obligatoria**: si falta, la app arranca y el job solo cuenta. Acepta `true`/`false`/`1`/`0`; un valor inválido (por ejemplo `si`) **detiene el arranque**, como cualquier booleano del entorno. En production vale `true` desde el 2026-10-27 |

- Al prenderla se confirma en los Deploy Logs que el arranque dice `modo: 'activo'`.
- Se reutilizan `PLANIFICADOR_ACTIVO` y `APP_TZ`. `.env.example` documenta la variable, comentada. Sin dependencias
  nuevas.

---

## Tests y verificación

| Archivo | Tipo | Cubre |
|---|---|---|
| `cita/domain/cita.entity.spec.ts` | unit | `pendiente → asistio` y `pendiente → ghosting`; la hora exacta sí, un milisegundo antes no; terminal antes de su hora; `marcarGhosting`; la tabla de `accionesPermitidas(ahora)`; `origen` |
| `cita/domain/cambio-cita.entity.spec.ts`, `cierre-ghosting.spec.ts` | unit | la invariante de `pedidoPor`; el límite de G1 en `America/Santiago`, también en los cambios de horario |
| `cita/application/citas.service.spec.ts`, `cierre-ghosting.service.spec.ts`, `enlaces-cita.service.spec.ts` | unit | las marcas con el reloj, `pedidoPor`, `origen`, `cerrarPorGhostingEnTx`, `confirmadaPor` (H9); el job apagado no escribe, el prendido cierra hasta el lote y sigue si una cita falla |
| `cita/presentation/citas.controller.spec.ts`, `dto/motivo-cita.dto.spec.ts`, `dto/reagendar-cita.dto.spec.ts` | unit | el 409 con su mensaje; los valores válidos e inválidos de `pedidoPor` |
| `cita/infrastructure/planificacion/planificador-cierre-citas.spec.ts`, `persistence/sql-candidatas-ghosting.spec.ts` | unit | el cron y la bandera; la consulta de G1 |
| `portal-paciente/…/portal-paciente.service.spec.ts`, `solicitud/…/bandeja-solicitudes.service.spec.ts`, los dos suscriptores, `entorno.spec.ts` | unit | la primera apertura solo con enlace válido; `origen` y `pedidoPor` al aceptar; `CitaNoAsistida` con `ghosting` tiene el efecto de siempre; `CIERRE_GHOSTING_ACTIVO` |
| `database/integration/migraciones-us0701.integration.spec.ts` | integración | las cuatro migraciones en un lote, el esquema, el relleno, los `down` |
| `cita/integration/cierre-ghosting.integration.spec.ts` | integración | la regla caso por caso, **`SKIP LOCKED` con dos transacciones y dos `ejecutar` en paralelo**, el modo apagado sin escrituras, el bloqueo `FOR NO KEY UPDATE` |
| `cita/integration/enlaces-cita-persistencia.integration.spec.ts`, `citas-outbox.integration.spec.ts`, `portal-paciente/integration/portal-paciente-concurrencia.integration.spec.ts` | integración | la primera apertura una sola vez, también en paralelo; el payload del hecho sin datos del paciente; el `GET` del paciente mientras el profesional reagenda, sin interbloqueo |
| `test/citas-detalle.e2e-spec.ts`, `test/portal-paciente.e2e-spec.ts`, `test/solicitudes-bandeja.e2e-spec.ts`, `test/planificador.e2e-spec.ts` | e2e | las rutas del profesional, el portal, la bandeja y el job apagado con `PLANIFICADOR_ACTIVO=false` |

**Resultado (antes del release del 2026-10-20):** **1987** unitarios, **212** de integración y **326** e2e en verde
([Fase 5 § Release](../Fases/fase-5-us07-scoring.md#release-a-producción-2026-10-20); nota de la fila 108 de la
[TRAZABILIDAD](../TRAZABILIDAD.md)). Estado punto por punto en la
[Definición de Terminado](../US/07.01-registro-hechos.md#definición-de-terminado).

**Verificación manual:** ✅ completa el 2026-11-01 ([plan § Verificación manual mínima](../US/07.01-registro-hechos.md#verificación-manual-mínima)),
con los puntos comprobados en production.

---

## En producción

| | Backend | Frontend |
|---|---|---|
| A `develop` (staging), 2026-10-20 | [PR #12](https://github.com/Citia-solutions/citia-backend/pull/12), `715c3f3` | [PR #13](https://github.com/Citia-solutions/citia-frontend/pull/13), `ef61077` |
| A `main` (production), 2026-10-20 a las 04:43 UTC | [PR #13](https://github.com/Citia-solutions/citia-backend/pull/13), `313a506` | [PR #14](https://github.com/Citia-solutions/citia-frontend/pull/14), `69668ec` |

- **Del 2026-10-20 al 2026-10-27, el job G1 estuvo apagado:** cada hora dejaba en el log cuántas citas cerraría. La
  revisión de solo lectura del 2026-10-23 encontró aplicadas las migraciones 15000–18000 y 1 cita que cerraría.
- **Prendido el 2026-10-27:** `CIERRE_GHOSTING_ACTIVO=true`, despliegue de las 18:39 UTC con `modo: 'activo'`. El
  primer tick, a las 18:40 UTC, cerró 1 cita (`fallidas: 0`). **Con eso se cerró [DT-11](../Deudas/DT-11.md).**
- Production no tiene clínicas reales (al 2026-11-01): todas las citas cerradas son pruebas del usuario.

Cómo salió, en la [guía de la fase](../Fases/fase-5-us07-scoring.md#release-a-producción-2026-10-20).

---

## Cierre (2026-11-01)

Las pruebas manuales quedaron completas el 2026-11-01 y el cierre se documentó el 2026-11-14. La evidencia sale del
script de revisión de solo lectura que el usuario corrió en production el 2026-11-01:

- ***No asistió* sobre una `pendiente`:** la cita `27532792` quedó `pendiente → ghosting` con actor `profesional`, y
  el voucher muestra *"Sin respuesta"*.
- ***"¿Quién lo pidió?"* desde la app:** la cita `5e6642a4` se reagendó con *Paciente* (`pedido_por paciente`) y se
  canceló con *Decisión mía* (`pedido_por profesional`), las dos veces con actor `profesional`.
- **Job G1:** 0 candidatas; en la bitácora, 3 cierres como `ghosting` del sistema y 1 del profesional.

El detalle, punto por punto, está en el [plan](../US/07.01-registro-hechos.md#verificación-manual-mínima) y en la
[Fase 5 § Cierre](../Fases/fase-5-us07-scoring.md#cierre-de-us-0701-2026-11-01).

---

## Lo que no hace

- **No califica al paciente ni calcula el riesgo de la cita:** eso es US-07.02, y las acciones son US-07.03. Las dos
  están 🚧 **bloqueadas desde el 2026-10-30, plan incluido**, hasta que un abogado revise el
  [contexto legal de ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) (o el usuario decida otra
  cosa). Hasta entonces, estos hechos solo se guardan.
- No muestra `origen`, `pedidoPor` (salvo en el historial) ni la primera apertura en una pantalla.
- **No corrige un cierre equivocado** ([DT-48](../Deudas/DT-48.md)): la salida decidida (dentro de 7 días) se
  construye en US-07.02.
- No toca las citas `confirmada` que nadie cierra: siguen neutras (pregunta 2 de
  [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1)), y la lista de citas
  pasadas sin cerrar es una candidata sin US.
- No avisa al profesional de las citas sin cerrar al final del día ([DT-30](../Deudas/DT-30.md), punto 3).
- No impide en el dominio confirmar una `pendiente` que ya empezó (pregunta abierta 1 del plan): el voucher no lo
  ofrece, pero la API lo acepta.
- No valida que una cita no se cree en el pasado ([DT-13](../Deudas/DT-13.md)), ni avisa al paciente de un rechazo
  ([DT-44](../Deudas/DT-44.md)).

---

## Pendientes

| Qué | Nota |
|---|---|
| El `msg` del log de G1 | la línea `citas.cierre_ghosting` del modo prendido no lo lleva y en Railway se ve sin mensaje (`planificador-cierre-citas.ts`). Pendiente menor de código, no es deuda |
| [DT-47](../Deudas/DT-47.md) | se corrige **antes de implementar US-07.02**, que leerá el orden de la bitácora; espera con ella |
| El escáner de Outlook | sin probar ([Fase 3](../Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción), [DT-49](../Deudas/DT-49.md)) |
| Preguntas abiertas 1, 3 y 4 del plan | ninguna bloquea: confirmar una `pendiente` que ya empezó, la precisión H10 y el valor inválido del interruptor |

---

## Deudas técnicas asociadas

**Cerró:** [DT-11](../Deudas/DT-11.md), el 2026-10-27, al prender el job G1 en production.

**Contrajo** (fichadas el 2026-10-30): [DT-48](../Deudas/DT-48.md) (un cierre equivocado no se corrige) ·
[DT-49](../Deudas/DT-49.md) (la primera apertura la puede disparar un escáner) · [DT-50](../Deudas/DT-50.md) (`cita`
lee el esquema de `recordatorios` y `solicitudes_cita`).

**Detectó:** [DT-47](../Deudas/DT-47.md) (la bitácora puede quedar en orden invertido con transacciones concurrentes).

**Toca:** [DT-30](../Deudas/DT-30.md) (cierra la brecha de las citas `pendiente` y lleva al dominio el bloqueo por
hora) · [DT-13](../Deudas/DT-13.md) (G1 deja fuera las citas creadas en el pasado) · [DT-40](../Deudas/DT-40.md) (H10
impide que un `registro` fabrique faltas) · [DT-37](../Deudas/DT-37.md) (un `enviado` sin webhook cuenta) ·
[DT-44](../Deudas/DT-44.md) (una petición rechazada no protege del job).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
