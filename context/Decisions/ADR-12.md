# ADR-12: Outbox transaccional para los hechos de dominio y planificador en proceso sobre Postgres

> **Fase:** [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md) (origen), [Fase 4 — US-05](../Fases/fase-4-us05-alertas.md), [Fase 5 — US-07](../Fases/fase-5-us07-scoring.md) · **Feature:** [us03-recordatorios](../Features/us03-recordatorios.md) · **Plan:** [US-03](../US/03-recordatorios.md) · **Relacionado:** [ADR-13](../Decisions/ADR-13.md), [ADR-04](../Decisions/ADR-04.md), [ADR-06](../Decisions/ADR-06.md), [ADR-09](../Decisions/ADR-09.md), [DT-27](../Deudas/DT-27.md), [DT-11](../Deudas/DT-11.md), [DT-19](../Deudas/DT-19.md), [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1)

**Fecha:** 2026-09-30
**Estado:** Aceptado · **implementado** (rama `feature/fase2-recordatorios`,
[PR #1](https://github.com/Citia-solutions/citia-backend/pull/1), mergeado a `develop` el 2026-10-04) ·
**en producción** desde el release del 2026-10-06 (`c057ade`) · los desvíos están en
[Notas de implementación](#notas-de-implementación-2026-10-04)
**Commits:** `ab30bb7` (diseño) · `daf0617` (tabla y repositorio) · `a6c237f` (`publicar(evento, tx)`) ·
`d45de20` (latidos y validación de entorno) · `f95b637` (outbox real, despachador y planificador) ·
`db46e37` (tests con Postgres)
**Relación:** **cierra** [DT-27](../Deudas/DT-27.md) (en diseño el 2026-09-30; en el código con `f95b637`) · **responde** [Q6](../PREGUNTAS-ABIERTAS.md)
en cuanto al mecanismo · **reemplaza** la mención a BullMQ de [ADR-04 §4](ADR-04.md) (la decisión de
materializar el estado con un proceso programado sigue vigente) · **implementa** la "fase 2" del
adaptador que [ADR-09 §7](ADR-09.md) dejó prevista · **reutiliza** `TransactionRunner` de
[ADR-06](ADR-06.md) · **habilita** [ADR-13](ADR-13.md) (recordatorios), que es su primer suscriptor.

> **Sobre el número.** Q6 reservaba "el siguiente número libre" para el ADR del proceso de cierre. Es
> este. Pero el proceso de cierre **no** se construye ahora: el scoring (RF-08) salió del MVP el
> 2026-09-30 y el job queda aplazado ([DT-11](../Deudas/DT-11.md)). Este ADR decide el **mecanismo**
> que ese job usará cuando se retome, y lo estrena con los recordatorios.

---

## Contexto

La Fase 2 (US-03, RF-06) introduce el **primer suscriptor** de los hechos de dominio: un recordatorio
se programa cuando se crea una cita y se reprograma o se anula cuando se reagenda o se cancela. RNF-03
exige entregar al menos el 99 % de los recordatorios con reintento y registro. Eso choca con dos
huecos del sistema actual:

1. **Los hechos pueden perderse o inventarse** ([DT-27](../Deudas/DT-27.md)). DT-27 recomendaba
   resolverlo **antes** del primer suscriptor, porque migrar con consumidores vivos es mucho más caro.
2. **No existe ningún planificador.** Nada en el proceso corre sin una petición HTTP.

### Lo que hay hoy (verificado en el código, 2026-09-30)

| Caso de uso | ¿Corre en una transacción? | Hechos que publica | Dónde se llama a `publicar` |
|---|---|---|---|
| `CitasService.crearCita` → `agendar` | sí (`tx.run`) | `CitaCreada` | dentro del callback, **antes** del commit |
| `BandejaSolicitudesService.aceptar` (llama a `agendar` con su `tx`) | sí | `CitaCreada`, `SolicitudCitaAceptada` | dentro del callback |
| `CitasService.mutar`: confirmar, cancelar, asistencia, inasistencia, reagendar, editar | sí | `CitaConfirmada`, `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida`, `CitaReagendada`, `CitaEditada` | dentro del callback |
| `BandejaSolicitudesService.rechazar` | sí | `SolicitudCitaRechazada` | dentro del callback |
| `SolicitudesService.recibir` (ruta pública) | **no** (un solo `INSERT`) | **ninguno** | — |
| `PacientesService.crearPaciente` (`POST /pacientes`) | no | ninguno | — |
| `UsuariosService.registrar` | sí | ninguno | — |

Dos observaciones que acotan el problema:

- **Todo lo que publica ya corre dentro de una transacción y tiene el `tx` a mano**, pero
  `PublicadorEventos.publicar(evento)` no lo recibe. El outbox no obliga a reestructurar ningún caso
  de uso: solo a pasar un argumento que ya existe.
- **DT-27 describía el fallo al revés.** La publicación no ocurre *después* del commit sino *dentro*
  del callback, antes de que la transacción confirme. Con el adaptador actual (solo escribe en el
  log), si algo falla después —por ejemplo `calcularAvisos`— la transacción se revierte y el log dice
  que pasó algo que no pasó. Con un suscriptor real existirían los dos fallos: hechos fantasma
  (publicado y revertido) y hechos perdidos (confirmado y no publicado, si el adaptador publicara
  fuera). Ambos desaparecen con la misma solución.
- `ADR-09 §7` listaba `SolicitudCitaRecibida`, pero `recibir()` **no lo publica**. No afecta a la
  Fase 2 (nadie lo necesita); queda anotado en [Qué NO cambia](#qué-no-cambia).

Y del lado del despliegue: el backend corre en **Railway** como un contenedor siempre encendido
(ADR-05, una réplica), y Railway **solapa** el contenedor viejo y el nuevo durante unos segundos en
cada despliegue. Es decir: aunque haya una sola réplica, **dos procesos pueden correr el mismo
planificador a la vez**.

---

## Opciones evaluadas

### A. Cómo se entregan los hechos a los suscriptores

| Opción | Veredicto |
|--------|-----------|
| **A1. En proceso, después del commit** (`EventEmitter`, `afterCommit`) | **Descartada.** Si el proceso muere entre el commit y la entrega, el hecho se pierde. Es DT-27 con otro nombre. |
| **A2. Outbox en Postgres (ELEGIDA)** | El hecho se escribe en una tabla **en la misma transacción** que el cambio: o existen los dos o ninguno. Un despachador lo entrega después, con reintentos. Sin infraestructura nueva. |
| **A3. Broker externo** (Redis/BullMQ, SQS) publicando desde el caso de uso | **Descartada.** Vuelve a la doble escritura (base + broker sin transacción común) y suma un servicio que pagar y operar. |
| **A4. Captura de cambios** (replicación lógica, Debezium) | **Descartada.** Desproporcionada para el volumen y el equipo. |

### B. Qué ejecuta el trabajo programado

| Opción | Veredicto |
|--------|-----------|
| **B1. `@nestjs/schedule` dentro del proceso (ELEGIDA)** | Paquete oficial de Nest (versión 6.x para Nest 11), declarativo (`@Interval`, `@Cron`), se detiene con el apagado ordenado de la app y se puede desactivar en los tests. Una dependencia pequeña. |
| **B2. `setInterval` a mano** | Viable y sin dependencias. **Descartada por poco:** habría que reimplementar el registro, el apagado y la desactivación en tests para ahorrar un paquete. |
| **B3. Cola sobre Postgres de terceros** (pg-boss, Graphile Worker) | **Descartada por ahora.** Trae su propio esquema y sus migraciones fuera de TypeORM (choca con [ADR-00](ADR-00.md)) y duplicaría estado: un recordatorio es una entidad con estado que el profesional ve, no un job opaco. Es la evolución intermedia natural si aparecen muchos tipos de trabajo. |
| **B4. BullMQ + Redis** | **Descartada por ahora.** Un servicio más en Railway, y el problema de la doble escritura vuelve si no se alimenta desde el outbox. **Evolución futura:** el despachador de salida puede alimentar BullMQ sin tocar ningún caso de uso. |
| **B5. Disparador externo** (servicio cron de Railway, Cloudflare Cron Triggers, GitHub Actions) | **Descartada como mecanismo principal:** otro despliegue que mantener y, si llama a un endpoint, una superficie pública más. **Es el plan B** si alguna vez la plataforma apaga el contenedor (decisión 7). |

### C. Cómo se evita que dos procesos hagan el mismo trabajo

| Opción | Veredicto |
|--------|-----------|
| **C1. `SELECT … FOR UPDATE SKIP LOCKED` por fila (ELEGIDA para colas)** | Cada proceso toma filas distintas; ninguno espera al otro. Es seguro con N réplicas y con el solapamiento de despliegues de Railway. |
| **C2. Candado consultivo** (`pg_try_advisory_xact_lock`) | **Elegida como complemento** para tareas de un solo ejecutor que no se reparten por filas: purga y reconciliación de respaldo. |
| **C3. Elegir un líder / garantizar una sola instancia** | **Descartada.** Frágil, y el solapamiento de despliegues la rompe sin avisar. |

---

## Decisión

### 1. Tabla `eventos_salida`, escrita en la misma transacción que el cambio

```
eventos_salida
├─ id                  uuid PK            ← id del hecho; lo recibe el suscriptor
├─ nombre              varchar            ← 'CitaCreada', 'CitaReagendada', …
├─ tenant_id           uuid               ← sin FK: la tabla es infraestructura
├─ payload             jsonb              ← solo ids y datos no sensibles (ADR-09 §3 regla 5)
├─ ocurrido_en         timestamptz
├─ estado              varchar            ← pendiente · entregado · fallido
├─ intentos            int  default 0
├─ proximo_intento_en  timestamptz default now()
├─ ultimo_error        varchar null       ← código o mensaje corto, nunca datos personales
├─ entregado_en        timestamptz null
└─ creado_en           timestamptz default now()

índice parcial  idx_salida_pendientes (proximo_intento_en) WHERE estado = 'pendiente'
```

- **`fallido`** es la "carta muerta": un hecho que agotó sus intentos. No se borra; se alerta
  (decisión 3) y se revisa a mano.
- **El payload no cambia de forma**: es el mismo `Record<string, unknown>` de hoy. Se mantiene la
  regla de ADR-09: sin RUT, nombre ni contacto.

### 2. El puerto exige la transacción

```ts
// shared/application/publicador-eventos.ts
export abstract class PublicadorEventos {
  abstract publicar(evento: EventoDominio, tx: TransactionContext): Promise<void>;
}
```

- **`tx` es obligatorio.** Publicar fuera de una transacción pasa a ser un error de compilación, no
  una revisión de código. Todos los puntos de llamada actuales ya tienen el `tx` en su ámbito (tabla
  de contexto): `CitasService.publicar` (usado por `agendar` y `mutar`) y los dos de
  `BandejaSolicitudesService`.
- **Adaptador nuevo `PublicadorEventosEnSalida`** (`shared/infrastructure/salida/`): inserta la fila
  con el `EntityManager` del `tx` opaco, igual que los repositorios de ADR-06 §4. Genera el `id`.
- **`PublicadorEventosEnProceso` desaparece.** Los tests usan dobles en memoria (ya existen en
  `test/support/in-memory-repositories.ts`), que ganan el parámetro.
- Si en el futuro un caso de uso sin transacción necesita publicar (p. ej. `recibir` con
  `SolicitudCitaRecibida`), se envuelve en `tx.run`: un `INSERT` más una fila de salida.

### 3. El despachador de salida

Clase de infraestructura `DespachadorEventosSalida` en `shared/infrastructure/salida/`, invocada por
el planificador cada `EVENTOS_SALIDA_INTERVALO_SEG` (5 s por defecto). En cada tick procesa hasta
`EVENTOS_SALIDA_LOTE` hechos, **uno por transacción**:

```sql
-- dentro de tx.run(...)
SELECT * FROM eventos_salida
 WHERE estado = 'pendiente' AND proximo_intento_en <= now()
 ORDER BY ocurrido_en, id
 LIMIT 1
 FOR UPDATE SKIP LOCKED;
-- → se ejecutan los suscriptores del nombre, con ESTE mismo tx
-- → UPDATE eventos_salida SET estado = 'entregado', entregado_en = now() WHERE id = $1;
-- COMMIT
```

- **Si un suscriptor lanza**, la transacción se revierte entera (su trabajo y la marca) y, en una
  transacción aparte, se registra el fallo: `intentos + 1`, `ultimo_error`, y
  `proximo_intento_en = now() + min(10 s × 2^intentos, 1 h)` con variación aleatoria. Al llegar a
  `EVENTOS_SALIDA_MAX_INTENTOS` (10) → `fallido` y un log de nivel `error` con
  `alerta = "eventos_salida.fallido"` (ver observabilidad en [ADR-13 §16](ADR-13.md)).
- **Entre la reversión y el registro del fallo** otro proceso puede tomar el mismo hecho. Es
  aceptable: solo adelanta un reintento, y los suscriptores son idempotentes (decisión 4).
- **Un hecho por transacción** a propósito: aísla los fallos y el volumen no justifica lotes.
- **Purga:** una tarea diaria borra los `entregado` con más de 14 días (`EVENTOS_SALIDA_RETENCION_DIAS`).
  Los `fallido` no se purgan.

### 4. Suscriptores: cuatro reglas

Puerto en `shared/application/suscriptor-eventos.ts`:

```ts
export abstract class SuscriptorEventos {
  abstract readonly eventos: readonly string[];          // nombres que escucha
  abstract manejar(evento: EventoDominio & { id: string }, tx: TransactionContext): Promise<void>;
}
```

Los módulos registran sus suscriptores en un `RegistroSuscriptores` (infraestructura compartida) al
iniciar. Reglas:

1. **Entrega al menos una vez.** Un hecho puede llegar dos veces; el suscriptor debe ser
   **idempotente**.
2. **Sin orden garantizado.** Un `CitaReagendada` que reintenta puede llegar después del
   `CitaCancelada` siguiente. Por eso **el suscriptor no aplica deltas: reconcilia contra el estado
   actual**. Relee la cita y calcula lo que debería existir. El hecho solo dice *qué* revisar, no
   *qué* hacer.
3. **Los suscriptores solo escriben en la base, dentro del `tx` que reciben.** Así "hacer el trabajo"
   y "marcar el hecho entregado" son atómicos: para efectos dentro de Postgres la entrega es, en la
   práctica, exactamente una vez.
4. **Los efectos externos** (enviar un correo, llamar a un proveedor) **no ocurren en el suscriptor**:
   el suscriptor deja una fila en su propia tabla de trabajo y otro proceso la ejecuta con sus propios
   reintentos. Es lo que hace [ADR-13](ADR-13.md) con `recordatorios`. Una alerta futura (RF-05) debe
   seguir el mismo patrón.

Si con dos suscriptores uno falla, se reintentan los dos (la transacción es una). Es correcto por la
regla 1; si algún día molesta, se pasa a registrar la entrega por suscriptor sin cambiar el puerto.

### 5. Planificador en proceso con `@nestjs/schedule`

- `ScheduleModule.forRoot()` en `AppModule`. Los jobs son clases **de infraestructura** (ADR-02:
  `application` no importa `@nestjs/*`) que solo llaman a un caso de uso.
- **Sin solapamiento dentro del proceso:** cada job lleva una bandera `enCurso`; si el tick anterior
  no terminó, el siguiente se salta.
- **`PLANIFICADOR_ACTIVO`** (`true` por defecto; `false` en los tests e2e y en cualquier proceso que
  no deba trabajar).
- **Apagado ordenado:** `app.enableShutdownHooks()` en `main.ts`; al recibir `SIGTERM` (que `tini`
  ya reenvía, ADR-05) no se toman trabajos nuevos y se deja terminar el que está en curso.
- **Latido:** al terminar un tick sin errores, el job avisa a un heartbeat externo (Better Stack). Si
  el latido deja de llegar, alguien se entera sin mirar logs. Detalle en [ADR-13 §16](ADR-13.md).

| Job | Cadencia | Exclusión | Alcance |
|---|---|---|---|
| Despachador de salida (decisión 3) | 5 s | `SKIP LOCKED` | todos los tenants |
| Envío de recordatorios ([ADR-13 §7](ADR-13.md)) | 60 s | `SKIP LOCKED` | todos los tenants |
| Reconciliación de respaldo de recordatorios ([ADR-13 §6](ADR-13.md)) | 1 h | candado consultivo | todos los tenants |
| Purga de `eventos_salida` entregados | diario, 04:00 hora de la clínica | candado consultivo | todos los tenants |
| **Cierre de citas vencidas ([DT-11](../Deudas/DT-11.md))** | — | — | ⏸ **aplazado** (decisión 8) |

### 6. El barrido sobre todos los tenants rompe un patrón, y a propósito

Toda consulta del sistema está acotada a un tenant ([ADR-01 §2](ADR-01.md)). Los jobs de la tabla
anterior **no**: barren todas las organizaciones. Q6 pedía que eso fuera explícito, no accidental:

- **Métodos con nombre propio** en los puertos (p. ej. `reclamarProximoPendiente(ahora, tx)`), sin
  parámetro `tenantId`, y con el comentario `// BARRIDO GLOBAL (ADR-12 §6)` para que se puedan buscar.
  Ningún método existente pierde su filtro por tenant.
- **Una vez tomada la fila, todo lo que sigue usa su `tenant_id`.** El barrido es global; el
  trabajo sobre cada fila, no.
- **Nunca se exponen por HTTP.** Solo los invoca el planificador.

### 7. Requisito de plataforma: el contenedor tiene que estar siempre encendido

Este diseño supone un proceso que corre aunque nadie haga peticiones. En Railway eso significa
**mantener desactivado "App Sleeping" (el modo serverless)** del servicio del backend.

> **Las plataformas que apagan el contenedor cuando no hay tráfico rompen este diseño**: Railway con
> App Sleeping, Render en su plan gratuito, Fly.io con auto-stop, Cloud Run con escala a cero. Mientras
> el contenedor duerme no se entrega ningún hecho ni se envía ningún recordatorio, y el primero que se
> entera es el paciente que no recibió nada. El latido de la decisión 5 lo detecta, pero no lo evita.
>
> **Plan B** si hubiera que migrar a una de ellas: un disparador externo (B5) que ejecute **los mismos
> casos de uso**. Los puertos y las tablas no cambian; cambia quién llama.

### 8. El proceso de cierre queda aplazado, con el mecanismo listo

El 2026-09-30 el scoring (RF-08) salió del MVP y pasó a la v2, así que el job que marca `ghosting` las
citas vencidas deja de ser prioridad. Cuando se retome, usará este mecanismo tal cual (un job más en
la tabla de la decisión 5). De las preguntas de Q6:

| Pregunta de Q6 | Estado |
|---|---|
| 1. ¿Cuándo está vencida una cita? | **abierta** — se decide al retomar el job |
| 2. ¿Qué pasa con las `confirmada` que nadie cerró? | **abierta** — ver [DT-30](../Deudas/DT-30.md) (los botones de asistencia esperan a la Fase 3) |
| 3. "Ya pasó" según el reloj de la clínica | resuelta en general: `shared/domain/timezone.ts` y `APP_TZ` (ADR-07) |
| 4. Idempotencia | resuelta en general: transición de estado + `SKIP LOCKED` (una cita cerrada no se vuelve a cerrar) |
| 5. Barrido sobre todos los tenants | resuelta: decisión 6 |
| Regla de [ADR-10 §5](ADR-10.md): una petición de reagendamiento sin atender no termina en `ghosting` | **pendiente** — sigue anotada para ese job |

**Ojo al reconstruir hacia atrás** (detalle en [DT-11](../Deudas/DT-11.md)): la regla del `ghosting`
depende de datos guardados, así que se puede aplicar después. Pero hoy nadie puede confirmar una cita
(ni el profesional desde la interfaz ni el paciente, que llega en la Fase 3), así que *"pendiente y ya
pasó"* no significa todavía *"el paciente no avisó"*. Aplicarla retroactivamente sin una fecha de corte
marcaría como `ghosting` a pacientes que sí fueron. Como [DT-30](../Deudas/DT-30.md) eligió esperar a
la Fase 3 (2026-09-30), la fecha de corte será el despliegue de esa fase.

---

## Qué NO cambia

- **El contrato HTTP:** ninguna ruta, cuerpo ni código de estado cambia.
- **El dominio de `cita` y `solicitud`** ni el grafo de [ADR-04](ADR-04.md).
- **`TransactionRunner`** ([ADR-06](ADR-06.md)): se reutiliza tal cual; el despachador lo usa igual
  que cualquier caso de uso.
- **El nombre y el payload de los hechos** que ya se publican.
- **`SolicitudCitaRecibida`** sigue sin publicarse (ADR-09 §7 lo listaba; nadie lo necesita todavía).

---

## Consecuencias

**Positivas**

- DT-27 se cierra antes del primer suscriptor, que es cuando es barato.
- La transacción es la única fuente de verdad: un hecho existe si y solo si el cambio existe.
- Los suscriptores que escriben en la base obtienen efecto exactamente-una-vez sin ningún mecanismo
  extra (regla 3).
- Sin infraestructura nueva que pagar ni operar: Postgres ya está.
- Seguro con varias réplicas y con el solapamiento de despliegues, sin elegir líder.
- La puerta a BullMQ, a un worker separado o a un disparador externo queda abierta **sin tocar los
  casos de uso**.

**Negativas / riesgos**

- **Latencia de segundos** entre el cambio y el suscriptor (el tick de 5 s). Suficiente para
  recordatorios; **no** para las alertas en menos de 3 s de RF-05. Evolución prevista: `LISTEN/NOTIFY`
  en la misma transacción para despertar al despachador al instante.
- **Una fila más por mutación** y una tabla que crece; acotada por la purga.
- **El orden no está garantizado**: correcto solo si los suscriptores reconcilian (regla 2). Es una
  convención que la revisión de código tiene que sostener.
- **El planificador vive en el proceso web:** un bucle que se cuelga o una consulta lenta compiten con
  las peticiones. Aceptable al volumen actual; si molesta, el mismo código corre en un segundo
  servicio de Railway con `PLANIFICADOR_ACTIVO=true` y el web con `false`.
- **Dependencia de plataforma "siempre encendida"** (decisión 7).
- Las migraciones siguen corriendo en el arranque (ADR-05): con más de una réplica, antes hay que
  moverlas a un paso único, como ADR-05 ya exige.

---

## Plan de ejecución

| # | Agente | Pieza |
|---|---|---|
| 1 | `database-agent` | migración `eventos_salida` + índice parcial; entidad ORM; consulta de reclamo con `FOR UPDATE SKIP LOCKED` |
| 2 | `backend-agent` | `ScheduleModule`, `PublicadorEventosEnSalida`, `DespachadorEventosSalida`, `RegistroSuscriptores`, purga, `PLANIFICADOR_ACTIVO`, `enableShutdownHooks`, latido |
| 3 | `api-agent` | cambio de firma `publicar(evento, tx)` en `CitasService` y `BandejaSolicitudesService` |
| 4 | `testing-agent` | atomicidad (si la transacción se revierte no queda fila de salida), dos despachadores concurrentes no entregan el mismo hecho, reintento con espera y paso a `fallido`, suites existentes en verde con el doble en memoria actualizado |

---

## Notas de implementación (2026-10-04)

> Las decisiones de arriba **no cambian**. Esta sección registra cómo quedó el código en la rama
> `feature/fase2-recordatorios` ([PR #1](https://github.com/Citia-solutions/citia-backend/pull/1)) y
> dónde se precisó o se apartó del diseño. Feature: [us03-recordatorios](../Features/us03-recordatorios.md).

### Qué se construyó y dónde

| Pieza | Archivo | Commit |
|---|---|---|
| Tabla `eventos_salida` (migración `1750000008000`, CHECK de `estado`, índice parcial) | `src/database/migrations/1750000008000-CreateEventosSalida.ts` | `daf0617` |
| Puerto `EventosSalidaRepository` (tx obligatorio) y adaptador con reclamo `FOR UPDATE SKIP LOCKED` | `shared/application/eventos-salida.repository.ts` · `shared/infrastructure/salida/typeorm-eventos-salida.repository.ts` | `daf0617` |
| Política de reintento pura | `shared/application/politica-reintento-salida.ts` | `daf0617` |
| `publicar(evento, tx)` en `CitasService` y `BandejaSolicitudesService` | `shared/application/publicador-eventos.ts` | `a6c237f` |
| `PublicadorEventosEnSalida`, `RegistroSuscriptores`, `DespachadorEventosSalida`, `PurgaEventosSalida`; se borra `PublicadorEventosEnProceso` | `shared/infrastructure/salida/` | `f95b637` |
| `PlanificadorSalida` + `TrabajoSinSolapamiento` y `PlanificacionModule` | `shared/infrastructure/planificacion/` · `shared/planificacion.module.ts` | `f95b637` |
| Puerto `Latidos` y adaptador de Better Stack | `shared/application/latidos.ts` · `shared/infrastructure/observabilidad/latidos-better-stack.ts` | `d45de20` |
| Variables validadas al arrancar (`PLANIFICADOR_ACTIVO`, `EVENTOS_SALIDA_*`) | `shared/infrastructure/config/entorno.ts` | `d45de20` |
| Integración con Postgres y e2e del planificador | `shared/infrastructure/salida/integration/` · `cita/integration/citas-outbox.integration.spec.ts` · `test/planificador.e2e-spec.ts` | `db46e37` |

### Desvíos y precisiones

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 1 | §2: el adaptador "genera el `id`" | Lo genera el **adaptador de persistencia** (`randomUUID()` en `TypeOrmEventosSalidaRepository.insertar`), no un `DEFAULT` de la base, aunque la columna lo tiene | el id es parte del hecho que recibe el suscriptor; generarlo antes del `INSERT` evita releer la fila |
| 2 | §2: "publicar fuera de una transacción pasa a ser un error de compilación" | Solo a medias: `TransactionContext` es `unknown`, así que `publicar(evento, undefined)` compila. `PublicadorEventosEnSalida` **lanza en tiempo de ejecución** si no recibe `tx` | el contexto es opaco a propósito ([ADR-06](ADR-06.md)); la guarda cubre el hueco del tipo |
| 3 | §3: el reloj | Llega **por parámetro**: el despachador recibe un `reloj: () => Date` (por defecto `new Date()`) y lo pasa al repositorio; los tests lo fijan | pruebas deterministas de esperas y de la purga |
| 4 | §3: espera `min(10 s × 2^intentos, 1 h)` con variación aleatoria | **10 s → 20 s → 40 s … hasta 1 h**, con variación **solo hacia abajo** (hasta 20 %, nunca alarga ni pasa del tope). Función pura `calcularEsperaReintentoMs` | que varios hechos que fallan juntos no reintenten en el mismo instante, sin que ninguna espera quede más larga que la nominal |
| 5 | §3: `fallido` al llegar a `EVENTOS_SALIDA_MAX_INTENTOS` | Igual: `fallido` **cuando los fallos acumulados llegan a** `maxIntentos` (10), con log `alerta = "eventos_salida.fallido"`. El código guardado en `ultimo_error` es `<Suscriptor>:<error.name>`, truncado, nunca el mensaje | el mensaje de un error puede traer datos personales |
| 6 | §3: el despachador procesa `EVENTOS_SALIDA_LOTE` y lee la configuración | **El despachador no lee configuración.** `PlanificadorSalida` le pasa lote, política de reintento (con `EVENTOS_SALIDA_MAX_INTENTOS`) y retención de la purga en cada tick. `EVENTOS_SALIDA_LOTE` vale 50 por defecto (el ADR no fijaba número) | el despachador queda como clase sin Nest ni entorno, probada con parámetros |
| 7 | §5: `ScheduleModule.forRoot()` en `AppModule` | Va en **`PlanificacionModule`** (`shared/planificacion.module.ts`), que solo importa `AppModule`. Los jobs de recordatorios viven en el módulo hermano `RecordatorioPlanificacionModule` | las e2e que arman módulos parciales no levantan jobs ni necesitan `ScheduleModule` |
| 8 | §5: los jobs con `@Interval`/`@Cron` y bandera `enCurso` | Se registran **a mano** en `SchedulerRegistry` (la cadencia viene del entorno) y la bandera es `TrabajoSinSolapamiento`. Con `PLANIFICADOR_ACTIVO=false` **no se registra nada** (por defecto en `NODE_ENV=test`) | los decoradores necesitan constantes y `ScheduleModule` los registraría sin mirar la bandera |
| 9 | §5: "al terminar un tick sin errores, el job avisa a un heartbeat" | **Los latidos los da el planificador**, no el despachador: `PlanificadorSalida` llama a `Latidos.latir('salida')` tras cada tick sano y a `informarFallo('salida')` si falla la infraestructura. El adaptador nunca lanza y envía **como mucho uno cada 50 s** por job | el despachador corre cada 5 s; Better Stack espera un aviso por minuto |
| 10 | §5, tabla: purga diaria a las 04:00 "hora de la clínica" | Cron `0 0 4 * * *` **en `APP_TZ`**, con candado consultivo (`pg_try_advisory_xact_lock`): si otro proceso lo tiene, no borra nada | — |
| 11 | §5: dependencia `@nestjs/schedule` | `@nestjs/schedule` 6.1.3 y **`cron` fijado en 4.4.0** (sin `^`), la versión que usa `@nestjs/schedule` 6.1.3 | los jobs usan `CronJob.from` directamente; una versión distinta de `cron` duplicaría el paquete con tipos incompatibles |
| 12 | §5: apagado ordenado | `app.enableShutdownHooks()` en `main.ts`; `beforeApplicationShutdown` desprograma, deja de reclamar entre hechos y **espera** al tick en curso antes de que se cierre la conexión | — |

### Lo que no cambió

El esquema de la tabla es el del §1, el puerto el del §2 y las cuatro reglas del §4 se cumplen: el
primer suscriptor (`SuscriptorRecordatorios`, [ADR-13](ADR-13.md)) reconcilia, escribe solo con el `tx`
recibido y no tiene efectos externos. El contrato HTTP no cambió por este ADR.

### Verificación

`citas-outbox.integration.spec.ts` (transacción revertida → sin fila de salida, también tras
cancelar), `despachador-eventos-salida.integration.spec.ts` (dos despachadores concurrentes entregan
cada hecho una vez; reintentos, carta muerta con alerta; reversión de lo que escribieron los
suscriptores; purga con candado) y `test/planificador.e2e-spec.ts` (con `PLANIFICADOR_ACTIVO=false` no
se registra ningún job). Estado de la Definición de Terminado en [US-03](../US/03-recordatorios.md#definición-de-terminado).

---

## Referencias

- [ADR-06](ADR-06.md) — `TransactionRunner` y el contexto opaco que viaja hasta el adaptador.
- [ADR-09 §7](ADR-09.md) — el puerto `PublicadorEventos` y la "fase 2" del adaptador.
- [ADR-04 §4](ADR-04.md) — la materialización del estado vía proceso programado.
- [ADR-05](ADR-05.md) — contenedor, `tini`, migraciones en el arranque.
- [ADR-13](ADR-13.md) — primer suscriptor y primeros jobs.
- `src/shared/application/publicador-eventos.ts`, `src/shared/infrastructure/publicador-eventos-en-proceso.ts`
  (borrado en `f95b637`), `src/modules/cita/application/citas.service.ts` (`publicar`, `mutar`, `agendar`),
  `src/modules/solicitud/application/bandeja-solicitudes.service.ts`.
- Implementación (2026-10-04): `src/shared/infrastructure/salida/`, `src/shared/infrastructure/planificacion/`,
  `src/shared/planificacion.module.ts`, `src/shared/application/politica-reintento-salida.ts`.

---

## Deudas técnicas asociadas

**Cierra:** [DT-27](../Deudas/DT-27.md) — en diseño el 2026-09-30; **cerrada** en el código con
`f95b637` (2026-10-03), con el test de integración que su criterio pedía.

**Avanza:** [DT-19](../Deudas/DT-19.md) (latido del planificador) · [DT-11](../Deudas/DT-11.md) (el
mecanismo del proceso de cierre queda decidido; el job, aplazado).

**Previstas, ya contraídas** (se ficharon al implementar, 2026-10-04):

1. **Sin orden entre hechos de un mismo agregado**: depende de que cada suscriptor reconcilie (regla 2)
   → [DT-32](../Deudas/DT-32.md).
2. **Latencia de segundos** incompatible con RF-05 sin `LISTEN/NOTIFY` → [DT-33](../Deudas/DT-33.md).
3. **Carta muerta sin herramienta**: los `fallido` se revisan con SQL a mano → [DT-34](../Deudas/DT-34.md).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
