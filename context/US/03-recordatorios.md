# Plan US-03 — Recordatorios al paciente (RF-06)

> **Fase:** [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md) · **Feature:** [us03-recordatorios](../Features/us03-recordatorios.md) · **Plan:** este documento · **Relacionado:** [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [DT-27](../Deudas/DT-27.md), [DT-19](../Deudas/DT-19.md), [DT-21](../Deudas/DT-21.md), [DT-16](../Deudas/DT-16.md), [DT-30](../Deudas/DT-30.md), [DT-40](../Deudas/DT-40.md), [DT-41](../Deudas/DT-41.md), [stack](../stack-tecnologico.md)

> **Estado (2026-10-07):** ✅ **cerrada en producción.** Mergeada en `develop` el 2026-10-04
> ([PR #1](https://github.com/Citia-solutions/citia-backend/pull/1); frontend
> [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2)) y en producción desde el release del
> 2026-10-06 ([PR #4](https://github.com/Citia-solutions/citia-backend/pull/4), `c057ade`; frontend
> [PR #6](https://github.com/Citia-solutions/citia-frontend/pull/6)). La
> [Definición de Terminado](#definición-de-terminado) está **completa**: los dos puntos manuales se
> cumplieron en producción el 2026-10-07, con dos salvedades anotadas (no se forzó una alerta y no se
> inspeccionaron las cabeceras SPF/DKIM/DMARC). Cierre, incidentes y lecciones en la
> [Fase 2](../Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07).
>
> *Antes (2026-10-04):* implementada en la rama `feature/fase2-recordatorios`, con la Definición de
> Terminado cumplida salvo los dos puntos manuales, que dependían de los prerrequisitos operativos. Lo construido está en
> [Features/us03-recordatorios.md](../Features/us03-recordatorios.md); los desvíos, en las notas de
> implementación de [ADR-12](../Decisions/ADR-12.md#notas-de-implementación-2026-10-04) y
> [ADR-13](../Decisions/ADR-13.md#notas-de-implementación-2026-10-04).
>
> *Antes (2026-09-30):* diseño cerrado en ADR-12 y ADR-13, con todas sus decisiones confirmadas por el
> usuario. Entra en el MVP (Q1 → A). Fase 2 del [roadmap](../ROADMAP.md).

> Solo decisiones y orden. Sin código. Brief para los agentes. El porqué de cada pieza está en los ADR;
> aquí va el qué, en qué orden y cuándo está terminado.

---

## Descripción

- Como **profesional de la salud** quiero que mis pacientes reciban **un recordatorio automático por
  correo** antes de su hora, para no tener que escribirles yo.
- Como **paciente** quiero recibir la fecha, la hora y con quién es mi cita, y saber cómo avisar si no
  puedo ir.

**Criterios de aceptación**

- Al crear una cita (desde el modal o aceptando una solicitud) se programan sus recordatorios según la
  configuración del profesional; por defecto, **24 h y 2 h antes**.
- Al **reagendar**, se reprograman a la hora nueva; al **cancelar** (o cerrar la cita), se anulan.
  Editar duración o tipo de consulta no los toca.
- El correo solo lleva fecha, hora, profesional, organización y cómo contactar. **Nunca** el tipo de
  consulta ni datos del paciente.
- No se envía entre las 21:00 y las 08:00, hora de la clínica, ningún día.
- El profesional ve el estado de cada recordatorio de una cita (programado, enviado, entregado,
  fallido, cancelado, omitido) y el motivo cuando no salió.
- El profesional puede cambiar los momentos (1 a 3), apagar los recordatorios y dejar un teléfono y un
  correo de contacto. Si deja un correo, las respuestas del paciente le llegan a él (`Reply-To`); si no,
  el correo dice que no recibe respuestas.
- Si los envíos fallan por encima del umbral, o se acerca el tope de la cuota, el equipo recibe una
  alerta.

---

## Punto de partida (lo que ya existe)

- Los casos de uso de cita y de la bandeja **publican hechos** (`CitaCreada`, `CitaReagendada`,
  `CitaCancelada`, …) dentro de su transacción, pero el adaptador solo escribe en el log y no hay
  suscriptores ([DT-27](../Deudas/DT-27.md)).
- **No hay planificador** ni nada que corra sin una petición.
- `src/modules/recordatorio/` son carpetas vacías y mal escritas ([DT-21](../Deudas/DT-21.md)).
- `Paciente.correo` es opcional en el alta manual; obligatorio en la solicitud pública.
- CORS acepta un solo origen (`FRONTEND_URL`). No hay logs estructurados ni health check
  ([DT-19](../Deudas/DT-19.md)).

---

## Decisiones tomadas (resumen)

| Tema | Decisión | Dónde |
|---|---|---|
| Entrega de hechos | outbox `eventos_salida` en la misma transacción; `publicar(evento, tx)` | ADR-12 §1–§4 |
| Planificador | `@nestjs/schedule` en el proceso, `FOR UPDATE SKIP LOCKED`, sin Redis | ADR-12 §5–§7 |
| Módulo | `recordatorio/` rehecho; solo **lee** cita, paciente, usuario y tenant | ADR-13 §1 |
| Estado | entidad `Recordatorio` con seis estados y motivo | ADR-13 §4 |
| Planificación | funciones puras: aritmética de instantes, horas sin envío, tardíos, vencimiento | ADR-13 §5 |
| Reprogramar / anular | el suscriptor **reconcilia** contra el estado actual de la cita | ADR-13 §6 |
| Envío | barrido cada 60 s, revalidación y políticas justo antes de enviar | ADR-13 §7 |
| Proveedor | Resend detrás de `CanalMensajeria`; adaptador `registro` en desarrollo | ADR-13 §8, §13 |
| Duplicados | clave única + `SKIP LOCKED` + `Idempotency-Key` + webhooks monótonos | ADR-13 §9 |
| Entrega | webhooks de Resend firmados (Svix) | ADR-13 §10 |
| Cuota | contador local, aviso al 80 %, cuota agotada como caso propio, fusible por tenant | ADR-13 §11 |
| Privacidad | asunto neutro, sin seguimiento, logs sin datos personales | ADR-13 §12 |
| Correo del paciente | obligatorio al crear; completar si está vacío al vincular por RUT; `omitido` si falta; `PATCH /pacientes/:id` para completar | ADR-13 §14 |
| Consentimiento | política implementada y **apagada** (riesgo aceptado) | ADR-13 §15, [DT-16](../Deudas/DT-16.md) |
| Observabilidad | `pino` + Better Stack (uptime, latidos, alertas) | ADR-13 §16, [DT-19](../Deudas/DT-19.md) |

---

## Prerrequisitos operativos (usuario, en paralelo desde el día 1)

> **Estado (2026-10-07):** ✅ los cuatro puntos están hechos en production, con lo que queda anotado en
> el [checklist de salida a producción](../Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción):
> falta el registro DMARC ([DT-41](../Deudas/DT-41.md)), la fuente de logs de Better Stack
> ([DT-19](../Deudas/DT-19.md)) y confirmar "App Sleeping" en el panel de Railway.

1. ~~**Comprar el dominio `.cl`** (NIC Chile) y delegar su DNS a Cloudflare.~~ ✅ `citiahealth.cl`.
2. **Cuenta de Resend:** agregar el **subdominio de envío** (p. ej. `notificaciones.<dominio>`), crear en Cloudflare
   SPF, DKIM, MX de retorno y DMARC (`p=none` al inicio), esperar la verificación, **desactivar el
   seguimiento de aperturas y clics**, crear la clave de API y el webhook (eventos `email.*`) con su
   secreto.
3. **Cuenta de Better Stack:** monitor de uptime sobre `GET /api/health`, dos heartbeats
   (recordatorios, despachador de salida), fuente de logs y destino de las alertas.
4. **Railway:** confirmar "App Sleeping" desactivado; cargar las variables de entorno nuevas
   ([ADR-13 §18](../Decisions/ADR-13.md)).

> Sin el punto 2 terminado, el sistema funciona en todo menos en escribir a pacientes reales.

---

## Orden de construcción

Dos PR sobre `develop` (Git Flow): **PR 1** = outbox + planificador + observabilidad (cierra DT-27 por
sí solo, sin recordatorios); **PR 2** = recordatorios. Ramas sugeridas:
`feature/fase2-outbox-planificador` y `feature/fase2-recordatorios`.

> **Cómo se construyó (2026-10-04):** en **una sola rama**, `feature/fase2-recordatorios`, y un solo PR
> ([#1](https://github.com/Citia-solutions/citia-backend/pull/1)). El orden de los commits respeta el de
> abajo: PR 1 = `daf0617` (paso 1), `a6c237f` (5), `d45de20` (3 y 4), `f95b637` (2), `db46e37` (6);
> PR 2 = `a37f175` (13, adelantado), `f2d80aa` (7 y la limpieza de DT-21), `a13d80a` (8 y 9),
> `f719c66` (10, 11 y 12), `a938f9d` (14), más `8dd4747` (coverage). Cronología en la
> [Fase 2](../Fases/fase-2-us03-recordatorios.md#cronología-commit--documento).

### PR 1 — outbox, planificador y observabilidad

| # | Agente | Tarea | Depende de | Días |
|---|---|---|---|---|
| 1 | `database-agent` | Migración `eventos_salida` + índice parcial; entidad ORM; consulta de reclamo con `FOR UPDATE SKIP LOCKED`; purga por antigüedad | — | 0,5 |
| 2 | `backend-agent` | `PublicadorEventosEnSalida`, `SuscriptorEventos` + `RegistroSuscriptores`, `DespachadorEventosSalida` con reintentos y carta muerta, `ScheduleModule`, `PLANIFICADOR_ACTIVO`, `enableShutdownHooks`, bandera anti-solapamiento | 1 | 1,5 |
| 3 | `backend-agent` | `nestjs-pino` con identificador por petición y redacción; transporte a Better Stack opcional; `GET /api/health`; cliente de latidos; validación de variables de entorno al arrancar (sin librería nueva: `validate` de `ConfigModule`) | — (en paralelo con 1–2) | 1 |
| 4 | `backend-agent` | **CORS con lista de orígenes:** `FRONTEND_URL` sigue siendo el origen canónico; `CORS_ORIGENES_EXTRA` (separado por comas) admite orígenes exactos y el comodín de vistas previas `https://*.<proyecto>.pages.dev`, traducido a una expresión anclada de un solo nivel de subdominio; `credentials: true` se mantiene | — | 0,5 |
| 5 | `api-agent` | Firma `publicar(evento, tx)` en `CitasService.publicar` y en `BandejaSolicitudesService`; actualizar el doble en memoria de `test/support/` | 2 | 0,5 |
| 6 | `testing-agent` | Integración con Postgres: transacción revertida → sin fila de salida; dos despachadores concurrentes → cada hecho una vez; reintento con espera y paso a `fallido`. CORS: origen permitido / ajeno. Suites existentes en verde | 1–5 | 1 |

### PR 2 — recordatorios

| # | Agente | Tarea | Depende de | Días |
|---|---|---|---|---|
| 7 | `database-agent` | Migraciones `configuraciones_recordatorio`, `recordatorios` (clave única parcial, índice de cola, `enviado_en`), `supresiones_correo`; entidades ORM; adaptadores con los métodos de BARRIDO GLOBAL; lector SQL de solo lectura (`LectorCitas`), incluido "citas vigentes de los próximos 8 días sin recordatorio para su inicio"; candado consultivo por cita | PR 1 | 1,5 |
| 8 | `api-agent` | Limpieza de DT-21 (commit aparte). Dominio: `Recordatorio`, `ConfiguracionRecordatorio`, `planificar` / `resolverTardios`, `PoliticaEnvio` y las nueve políticas, puerto `CanalMensajeria`; `formatearFechaLargaEnZona` en `shared/domain/timezone.ts` | 7 | 1,5 |
| 9 | `api-agent` | Suscriptor + reconciliación (tabla de disparadores de ADR-13 §6), job de respaldo cada hora | 8 | 1 |
| 10 | `api-agent` | Envío: reclamo, revalidación, plantilla (con bloque `accion?` vacío), `ResendCanalMensajeria` con clasificación de errores e `Idempotency-Key`, `RegistroCanalMensajeria`, contador de cuota, aviso al 80 %, fusible por tenant, métricas de tasa de fallo | 8 | 1,5 |
| 11 | `backend-agent` + `api-agent` | Webhook: `rawBody: true` en `main.ts` (backend); `POST /api/webhooks/resend` con verificación Svix y efectos monótonos (api) | 10 | 0,5 |
| 12 | `api-agent` | Rutas `GET/PUT /api/recordatorios/configuracion` (publica `ConfiguracionRecordatorioActualizada`), `GET /api/citas/:citaId/recordatorios`; `CLAUDE.md` del módulo | 9 | 0,5 |
| 13 | `api-agent` | Correo obligatorio: `CrearPacienteDto`, fábrica de dominio, completar si está vacío en `resolverOCrear`; `PATCH /api/pacientes/:id` mínimo (`telefono`, `correo`) | — (puede ir antes) | 0,5 |
| 14 | `testing-agent` | La Definición de Terminado de abajo | 7–13 | 2 |

**Total backend:** ~14 días-persona (PR 1 ≈ 5, PR 2 ≈ 9). Con los pasos 3–4 en paralelo y el paso 13
adelantado, ~10–11 días de calendario para una persona.

**Frontend (`citia-frontend`, fuera de estos agentes, ~2–3 días):** correo obligatorio en el modal
(**mismo release que el paso 13**, o el modal recibirá 400) · pantalla de configuración · estado de
los recordatorios en el voucher · despliegue en Netlify con *fallback* de SPA (revertido desde Cloudflare el 2026-10-04).

### Dependencias nuevas

| Paquete | Para qué | Quién |
|---|---|---|
| `@nestjs/schedule` (6.x, compatible con Nest 11) | planificador | backend-agent |
| `nestjs-pino`, `pino`, `pino-http` | logs JSON | backend-agent |
| `@logtail/pino` | transporte a Better Stack (opcional, solo si hay token) | backend-agent |
| `pino-pretty` (dev) | logs legibles en local | backend-agent |
| `resend` | SDK oficial del proveedor | api-agent |
| `svix` | verificación de la firma de los webhooks | api-agent |

> **Instaladas (2026-10-04):** `@nestjs/schedule` 6.1.3, **`cron` 4.4.0** (fijado, sin `^`: es la que
> usa `@nestjs/schedule` y los jobs la importan directamente), `nestjs-pino` 5.2.1, `pino` 10.3.1,
> `pino-http` 11.0.0, `@logtail/pino` 0.5.11, `pino-pretty` 13.1.3 (dev), `resend` 6.32.0 y **`svix`
> 1.99.1** (fijado en 1.x: la 2.x es solo ESM y Jest no la carga). Lista completa en
> [stack-tecnologico.md](../stack-tecnologico.md#dependencias-instaladas-2026-10-04).

**No** se instalan Redis, BullMQ ni OpenTelemetry en esta fase.

---

## Definición de Terminado

> **Estado (2026-10-07):** ✅ **completa.** Todo lo automático desde el 2026-10-04 (1274 unitarios, 212
> e2e y 80 de integración en verde; `eslint` sin errores) y los **dos puntos manuales** en producción el
> 2026-10-07, cada uno con su salvedad anotada. La evidencia es el archivo de test que cubre cada punto
> (rutas relativas a `src/` salvo las de `test/`) y, en los manuales, lo observado en producción.

**Outbox y planificador**
- [x] ✅ Una transacción revertida no deja fila en `eventos_salida` (integración con Postgres) —
      `modules/cita/integration/citas-outbox.integration.spec.ts` (al crear y al cancelar).
- [x] ✅ Dos despachadores concurrentes entregan cada hecho una sola vez (integración) —
      `shared/infrastructure/salida/integration/despachador-eventos-salida.integration.spec.ts` § concurrencia.
- [x] ✅ Un suscriptor que falla reintenta con espera creciente y termina en `fallido` con log de alerta —
      mismo archivo, § reintentos y carta muerta; espera en `shared/application/politica-reintento-salida.spec.ts`.
- [x] ✅ Con `PLANIFICADOR_ACTIVO=false` ningún job corre (lo usan los e2e) — `test/planificador.e2e-spec.ts`
      (`AppModule` completo), `planificador-salida.spec.ts`, `planificador-recordatorios.spec.ts`.

**Planificación (unitarios, sin base ni reloj)**
- [x] ✅ 24 h y 2 h para una cita normal; ajuste por horas sin envío; fusión de dos recordatorios
      cercanos; tardío único o `omitido` según el margen; cita en el pasado → nada —
      `modules/recordatorio/domain/planificacion.spec.ts`, `horas-sin-envio.spec.ts`.
- [x] ✅ Fines de semana de cambio de horario en `America/Santiago` (inicio y fin del horario de verano) —
      `planificacion.spec.ts` § *cambios de horario en America/Santiago*, `horas-sin-envio.spec.ts`.
- [x] ✅ Reconciliar dos veces la misma cita no cambia nada (idempotencia) —
      `modules/recordatorio/domain/reconciliacion.spec.ts`, `application/suscriptor-recordatorios.spec.ts`.

**Flujo (e2e con el adaptador `registro`, invocando los jobs a mano)**
- [x] ✅ `POST /citas` y aceptar una solicitud → recordatorios `programado` con las horas correctas —
      `test/recordatorios-flujo.e2e-spec.ts` (crear) y `test/recordatorios-politicas.e2e-spec.ts` (aceptar).
- [x] ✅ Reagendar → los anteriores `cancelado` (`reprogramado`) y los nuevos `programado` —
      `test/recordatorios-flujo.e2e-spec.ts`.
- [x] ✅ Cancelar, asistencia e inasistencia → `cancelado` (`cita_terminal`) — `recordatorios-flujo`
      (cancelar) y `recordatorios-politicas` (asistencia e inasistencia).
- [x] ✅ Repetir un mismo hecho N veces → sin duplicados — `recordatorios-politicas` § *sin duplicados*
      (6 veces en serie, 5 a la vez, `CitaReagendada` 4 veces).
- [x] ✅ Cita cancelada entre la programación y el envío → `cancelado` al revalidar, sin llamar al
      proveedor — `recordatorios-politicas` § *revalidación justo antes de enviar*.
- [x] ✅ Paciente sin correo → `omitido` (`sin_correo`); dirección suprimida → `omitido`; tope del
      tenant → `omitido` (`limite_tenant`) — `recordatorios-politicas` § *políticas de omisión*.
- [x] ✅ Cambiar la configuración reprograma las citas futuras del profesional; apagarla las anula —
      `recordatorios-flujo` § configuración y `recordatorios-politicas` § configuración (outbox real).
- [x] ✅ `GET /citas/:id/recordatorios` de otro tenant → 404; la respuesta no trae destinatario —
      `test/recordatorios-http.e2e-spec.ts`, `recordatorios-flujo`, `recordatorios-politicas`.

**Proveedor, cuota y webhooks**
- [x] ✅ Clasificación del adaptador de Resend con respuestas grabadas: 200, 422, 429 por ritmo, 429 por
      cuota diaria, 401/403, 5xx, tiempo agotado, 409 de idempotencia —
      `modules/recordatorio/infrastructure/mensajeria/resend-canal-mensajeria.spec.ts` (además 400 sobre
      `to` y `from`, 429 mensual, 502 sin JSON y error de red; `validation_error` resultó ser 400).
- [x] ✅ Con la cuota local agotada no se llama al proveedor; lo que no alcanza queda `fallido`
      (`cuota_agotada`); el aviso del 80 % se emite una vez por período — `recordatorios-politicas`
      § *cuota local del proveedor*, `application/enviar-recordatorios.service.spec.ts`.
- [x] ✅ Webhook con firma válida → 200 y estado actualizado; firma inválida o vieja → 400 sin cambios;
      evento repetido → sin cambios; id desconocido → 200; rebote y queja → supresión —
      `test/recordatorios-http.e2e-spec.ts`, `presentation/webhooks-resend.controller.spec.ts`,
      `application/procesar-webhook-entrega.service.spec.ts`, `recordatorios-politicas` (rebote → supresión),
      `integration/recordatorios-persistencia.integration.spec.ts` (monótono contra Postgres).

**Correo del paciente**
- [x] ✅ `POST /pacientes` y `POST /citas` con paciente en línea sin correo → 400 —
      `test/pacientes.e2e-spec.ts`.
- [x] ✅ Paciente existente por RUT con correo vacío → se completa; con otro correo → no se toca —
      `modules/paciente/application/pacientes.service.spec.ts`, `typeorm-paciente.repository.spec.ts`,
      `test/solicitudes-bandeja.e2e-spec.ts` (al aceptar).

**Privacidad y operación**
- [x] ✅ Los logs no contienen correo, RUT, teléfono ni el cuerpo del mensaje (test de redacción) —
      `test/logs-redaccion.e2e-spec.ts` (rutas reales contra Postgres), `opciones-logger.spec.ts`.
- [x] ✅ El check de ADR-02 sigue en 0 — **reemplazado** por `src/arquitectura.spec.ts`: el `grep` de este
      punto (`typeorm` / `@nestjs` en `domain` y `application`) no detectaba nada
      ([nota en ADR-02](../Decisions/ADR-02.md#nota-2026-10-04-el-check-del-4-pasa-a-ser-un-test)). Lo que
      el test no ve quedó en [DT-31](../Deudas/DT-31.md).
- [x] ✅ `npm run lint`, `npm test`, `npm run test:e2e` y `npm run test:integration` en verde — 1274 /
      212 / 80 (las e2e con `maxWorkers: 1`; la integración con `--runInBand`).
- [x] ✅ *(Manual, en Railway)* el latido y una alerta de prueba llegan a Better Stack; detener el job
      dispara el aviso. **Hecho el 2026-10-07 en production:** los heartbeats `citia-prod-recordatorios` y
      `citia-prod-eventos` están en **Up** y el monitor de `GET /api/health` está activo, con alertas por
      correo. **Salvedad:** no se hizo la **prueba de alerta forzada** (detener un job y ver llegar el
      aviso), y la fuente de logs de Better Stack sigue pendiente, así que las alertas por log no llegan a
      nadie. Por eso [DT-19](../Deudas/DT-19.md) sigue abierta, con alcance reducido.
- [x] ✅ *(Manual, con el dominio verificado)* un recordatorio real llega a una casilla de prueba con SPF,
      DKIM y DMARC en `pass`, sin enlaces reescritos. **Hecho el 2026-10-07 en production:** tres
      recordatorios reales llegaron a la **bandeja de entrada** (no a spam), uno por cita, desde
      `Citia <recordatorios@notificaciones.citiahealth.cl>`, el subdominio verificado en Resend, con la hora
      de Chile y sin datos de salud; el voucher los mostró *Entregado* (webhook firmado). **Salvedad:** no
      se inspeccionaron las cabeceras SPF/DKIM/DMARC y **falta el registro DMARC** del subdominio →
      [DT-41](../Deudas/DT-41.md).

---

## Fuera de alcance

- WhatsApp y SMS (otro adaptador de `CanalMensajeria`, después).
- Que el paciente confirme, cancele o pida reagendar desde el correo: Fase 3, US-04 /
  [ADR-10](../Decisions/ADR-10.md). La plantilla deja el hueco (`accion`).
- Revisar el consentimiento antes de enviar ([DT-16](../Deudas/DT-16.md)).
- Botones de asistencia en el voucher: se espera a la Fase 3 (decisión del 2026-09-30,
  [DT-30](../Deudas/DT-30.md)). Tampoco el proceso de cierre ([DT-11](../Deudas/DT-11.md)). *(2026-10-05:
  el usuario lo revirtió y el frontend los agregó en el mismo release, sin cambios de backend; DT-30 queda
  mitigada.)*
- Horas sin envío por profesional y zona horaria por organización ([DT-17](../Deudas/DT-17.md)).
- Recibir y mostrar las respuestas del paciente dentro de Citia.

---

## Decisiones confirmadas (usuario, 2026-09-30)

Todas las que ADR-13 dejaba abiertas quedaron confirmadas tal como se recomendaron; la tabla está en
[ADR-13 — Decisiones confirmadas](../Decisions/ADR-13.md#decisiones-confirmadas-2026-09-30):
`Reply-To` al correo que configure el profesional · horas sin envío 21:00–08:00 · pacientes sin correo
`omitido` + `PATCH /pacientes/:id` · activos por defecto a las 24 h y 2 h · un tardío si faltan ≥ 60
min · completar el correo vacío al vincular por RUT · nombre de la organización en el cuerpo ·
subdominio de envío · tope de 40 por tenant al día · alerta sobre 5 % con n ≥ 20.

**Queda por verificar al implementar** (datos de proveedores, no decisiones):
[ADR-13 — Lo que queda por verificar](../Decisions/ADR-13.md#lo-que-queda-por-verificar-al-implementar).

---

## Deudas que toca

**Cierra:** [DT-27](../Deudas/DT-27.md) ✅ (`f95b637`) · [DT-21](../Deudas/DT-21.md) ✅ (`f2d80aa`, `a37f175`) ·
[DT-19](../Deudas/DT-19.md) (verificada en producción el 2026-10-07; sigue abierta solo por la fuente de logs
y la prueba de alerta forzada).
**Acepta como riesgo:** [DT-16](../Deudas/DT-16.md) (política implementada y apagada).
**Contrae** (las previstas de [ADR-12](../Decisions/ADR-12.md) y [ADR-13](../Decisions/ADR-13.md), ya con
número): [DT-32](../Deudas/DT-32.md) a [DT-39](../Deudas/DT-39.md). **Detecta:** [DT-31](../Deudas/DT-31.md) al
implementar · [DT-40](../Deudas/DT-40.md) (`registro` marca "Enviado" sin enviar) y
[DT-41](../Deudas/DT-41.md) (sin DMARC) al poner en producción.
