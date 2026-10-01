# Roadmap — Citia

Hoja de ruta de las historias de usuario (US-02 a US-10). Sirve para tener el orden, las
dependencias y el estado real de cada pieza en un solo lugar.

**Última revisión:** 2026-09-30 (Q1 → A: recordatorios en el MVP; scoring a la v2; diseño de la Fase 2 en ADR-12 y ADR-13)

**Por fases:** este documento es la fuente del **estado**. Para leer todo lo que toca a una fase
(decisiones, deudas, commits, contraparte del frontend) en orden, entra por [`Fases/`](Fases/README.md).
Aquí "fase" es siempre una fase de construcción; las etapas del producto están en
[`Descripcion/`](Descripcion/README.md).

## Convenciones

- ✅ hecho · 🔶 parcial · ⬜ pendiente · 🚧 bloqueado · ⏸ aplazado.
- Cada fase es entregable y testeable por sí sola.
- Orden por dependencias: US-02 (+ US-06 en paralelo) → US-03 → US-04 → US-05 → US-07 → US-08.
  US-10 no depende de nada y puede entrar en cualquier momento. US-09 sigue sin definir.
- **Alcance del MVP (2026-09-30):** Fase 0 (dashboard) + Fase 1 (gestión de citas) + **Fase 2
  (recordatorios)**. La Fase 5 (scoring) sale del MVP y pasa a la v2. Ver
  [Descripcion/fase-3-mvp.md](Descripcion/fase-3-mvp.md).
- Auth y registro (US-00a/US-00b) quedan fuera: ya están cerrados (ver
  [Features/us00a-registro-inicial.md](Features/us00a-registro-inicial.md) y
  [Features/us00b-login.md](Features/us00b-login.md)). Guía de lectura de esa base:
  [`Fases/fase-base-fundaciones.md`](Fases/fase-base-fundaciones.md).
- La solicitud pública de hora del paciente (`/agendar-cita`) **sí** está implementada, pero se
  sigue en [ADR-09](Decisions/ADR-09.md) y no como fase propia (ver Fase 1 → Vía pública).
- Las deudas técnicas viven en [Deudas/](Deudas/); aquí solo se citan las que bloquean una fase.

---

## Fase 0 — US-06: Dashboard de citas del día (RF-03)

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-0-us06-dashboard.md`](Fases/fase-0-us06-dashboard.md).

**Estado:** ✅ cerrada: conectada al backend real y probada contra Postgres (2026-09-28).

### Hecho
- Layout del dashboard (sidebar, topbar, métricas, lista "Citas de hoy", badges de estado).
- UI de citas del día con paciente, hora, duración, tipo de consulta y estado.
- ✅ Conectado a `GET /citas/hoy` real (las métricas del diseño siguen en el mock de `dashboardApi.ts`).
- ✅ Clic en una cita → voucher con reagendar/cancelar ([US-02.08](US/02.08-voucher-cita.md)).
- ✅ Citas pasadas marcadas visualmente (tachado) en `TodayAppointments.vue`.

- ✅ Los cambios se reflejan tras crear/reagendar/cancelar
  ([US-02.09](../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md)).

### Pendiente
- Las métricas del dashboard (ausentismo, horas e ingresos recuperados) siguen siendo mock.

> Depende de US-02 (la lista real de citas).

---

## Fase 1 — US-02: Gestión de cita

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-1-us02-gestion-citas.md`](Fases/fase-1-us02-gestion-citas.md).

**Estado:** ✅ **cerrada**: mergeada en `develop` en ambos repos el 2026-09-28 y verificada contra
Postgres. US-02.07 (lado paciente) quedó **fuera de la v1**
(Q11 → C). Detalle en [Features/us02-gestion-citas.md](Features/us02-gestion-citas.md) § "Cierre de Fase 1".

### Subtareas

| Subtarea | Lado | Estado |
|---|---|---|
| [US-02.07](US/02.07-paciente-reagenda-cancela.md) — el paciente cancela o pide reagendar | paciente | ⏸ aplazada fuera de la v1 (Q11 → C); pasa a la Fase 3 con US-04 |
| [US-02.08](US/02.08-voucher-cita.md) — voucher con reagendar y cancelar | profesional | ✅ mergeada en `develop` |
| [US-02.09](../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) — el dashboard refleja los cambios | profesional (solo front) | ✅ mergeada · probada contra el backend real |
| Agenda semanal + lista ([agenda-profesional](../../citia-frontend/context/Features/agenda-profesional.md)) | profesional | ✅ en `develop` |
| Bandeja de solicitudes ([bandeja-solicitudes](../../citia-frontend/context/Features/bandeja-solicitudes.md)) | profesional | ✅ en `develop` |
| Aviso de solapamiento ([ADR-11](Decisions/ADR-11.md), cierra DT-12 en diseño) | profesional | ✅ en `develop` |

### Backend
- ✅ `POST /citas` (crear) — ahora con `avisos.solapamientos`.
- ✅ `GET /citas/hoy` — ahora con `fecha`.
- ✅ `GET /citas?desde&hasta` (máx. 42 días, agrupable por `fecha` en la zona de la clínica).
- ✅ `GET /citas/:id` (detalle + `accionesPermitidas`, US-02.08).
- ✅ `PATCH /citas/:id` (editar) — con `avisos`.
- ✅ `PATCH :id/confirmar|cancelar|asistencia|inasistencia|reagendar` — reagendar con `avisos`.
- ✅ `GET :id/historial` (bitácora).
- ✅ Validación de transiciones por estado (máquina de estados en dominio).
- ✅ Bandeja: `GET /solicitudes?estado=`, `POST /solicitudes/:id/aceptar` (crea paciente + cita en
  una transacción con `FOR UPDATE`), `POST /solicitudes/:id/rechazar`.
- ✅ `POST /auth/login` devuelve `usuario.tenantSlug` (para el enlace público).
- ✅ Migración `1750000007000-AddResueltaEnASolicitudesCita` aplicada en local (up y down probados).

### Frontend
- ✅ Modal "Nueva cita" (crear).
- ✅ Detalle de cita con acciones (voucher, US-02.08).
- ✅ Reagendar y cancelar (UI).
- ✅ Reflejar cambios en el dashboard tras crear/reagendar/cancelar (US-02.09).
- ✅ Agenda del profesional: vista semanal + lista (`/agenda`).
- ✅ Bandeja de solicitudes con aceptar/rechazar (`/solicitudes`) y contador en el sidebar.
- ✅ Aviso no bloqueante de solapamiento al crear, reagendar y aceptar.
- ✅ Botón "Copiar enlace de agenda", con la advertencia de DT-18 (`ENLACE_PUBLICO_LISTO = false`).

### Vía pública (solicitud del paciente — [ADR-09](Decisions/ADR-09.md))
- ✅ `POST /publico/:tenantSlug/solicitudes`: el paciente **pide** hora, no reserva.
- ✅ Frontend: flujo multi-paso `/agendar-cita`
  ([agendar-cita-paciente](../../citia-frontend/context/Features/agendar-cita-paciente.md)).
- 🟠 Sin límite de tasa **por decisión** (2026-09-29): riesgo asumido, a revisar antes de difundir el
  enlace de forma masiva ([DT-18](Deudas/DT-18.md)).
- ✅ **Decidido (2026-09-29):** el enlace **solo envía una solicitud** y el profesional la acepta en la
  bandeja (ADR-09). [FD-01](Frontend-Decisions/FD-01.md), que proponía reservar al instante, queda
  descartada.

### Integración
- ✅ Modal, voucher, agenda y bandeja conectados según el contrato.
- ✅ Prueba manual contra Postgres (2026-09-28): 29/29 casos en la API, 5 aceptar concurrentes →
  una sola cita, y recorrido en el navegador (agenda, aceptar con aviso, rechazar).
- ✅ Suites con BD: e2e 89/89 y `test:integration` 6/6.
- ⬜ Tests automáticos de lo que recomienda [DT-20](Deudas/DT-20.md) (`FOR UPDATE` concurrente,
  `NULLS LAST`): hoy solo están verificados a mano.

**Entregable:** el profesional ve su agenda, abre el detalle, reagenda y cancela, atiende las
solicitudes de sus pacientes y ve los choques de horario, todo reflejado.

---

## Fase 2 — US-03: Recordatorios al paciente

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-2-us03-recordatorios.md`](Fases/fase-2-us03-recordatorios.md).

**Estado:** 🔶 **diseño cerrado y decisiones confirmadas (2026-09-30)**, implementación sin empezar.
Entra en el MVP (Q1 → A).
Diseño en [ADR-12](Decisions/ADR-12.md) (outbox + planificador) y [ADR-13](Decisions/ADR-13.md)
(recordatorios); plan de construcción en [US/03-recordatorios.md](US/03-recordatorios.md).

### Decisiones (usuario, 2026-09-30)

| Tema | Decisión |
|---|---|
| Canal | correo transaccional vía **Resend**. WhatsApp y SMS fuera del MVP (otro adaptador del mismo puerto, después) |
| Remitente | uno solo para toda la plataforma, nombre visible **"Citia"**. Dominio **aún sin comprar** |
| Contenido | solo informativo: fecha, hora, profesional, cómo contactar. Sin tipo de consulta. El enlace para responder llega en la Fase 3 |
| Momentos | configurables por profesional; predeterminado **24 h y 2 h antes** |
| Correo del paciente | **obligatorio** en el alta manual |
| Consentimiento | **no se revisa** por ahora: riesgo aceptado ([DT-16](Deudas/DT-16.md)), revisión antes de la Ley 21.719 |
| Hechos de dominio | outbox transaccional: **cierra [DT-27](Deudas/DT-27.md)** antes del primer suscriptor |
| Planificador ([Q6](PREGUNTAS-ABIERTAS.md)) | cron dentro del proceso sobre Postgres con `FOR UPDATE SKIP LOCKED`; sin Redis ni BullMQ |
| Hosting | backend + Postgres en **Railway** (siempre encendido); SPA en **Cloudflare** |
| Observabilidad | **Better Stack** gratis: uptime, latido del job, logs, alertas ([DT-19](Deudas/DT-19.md)) |
| Modo prueba | Resend Free: 3.000/mes y 100/día → ~50 citas al día en toda la plataforma; aviso al 80 % |
| Asistencia en el voucher | **no**: se espera a la Fase 3, cuando el paciente confirme desde el enlace; no se toca el grafo de ADR-04 → [DT-30](Deudas/DT-30.md) |
| Detalle (confirmado el mismo día) | `Reply-To` = correo que configure el profesional · sin envíos de 21:00 a 08:00 · activos por defecto a las 24 h y 2 h · un tardío si faltan ≥ 60 min · pacientes sin correo `omitido` + `PATCH /pacientes/:id` · completar el correo vacío al vincular por RUT · nombre de la organización en el cuerpo · subdominio de envío · 40 envíos al día por tenant · alerta sobre 5 % con n ≥ 20 ([ADR-13](Decisions/ADR-13.md#decisiones-confirmadas-2026-09-30)) |

### Backend

| # | Pieza | Agente | Estado |
|---|---|---|---|
| 1 | Outbox `eventos_salida` + `publicar(evento, tx)` + despachador ([ADR-12](Decisions/ADR-12.md)) | database → backend → api | ⬜ |
| 2 | Planificador (`@nestjs/schedule`), apagado ordenado, latidos | backend | ⬜ |
| 3 | Tablas `configuraciones_recordatorio`, `recordatorios`, `supresiones_correo` | database | ⬜ |
| 4 | Dominio: `Recordatorio` (estados), configuración, planificación pura (silencio, tardíos, vencimiento) | api | ⬜ |
| 5 | Suscriptor + reconciliación (crear, reagendar, cancelar, configurar) + respaldo cada hora | api | ⬜ |
| 6 | Envío con revalidación, políticas, reintentos, cuota y límite por tenant | api | ⬜ |
| 7 | Adaptador `ResendCanalMensajeria` + `RegistroCanalMensajeria` + plantilla (con hueco para el enlace de la Fase 3) | api | ⬜ |
| 8 | Webhooks de Resend con firma verificada (entregado, rebote, queja) | backend (cuerpo crudo) + api | ⬜ |
| 9 | API: `GET/PUT /recordatorios/configuracion`, `GET /citas/:id/recordatorios` | api | ⬜ |
| 10 | Correo obligatorio del paciente + `PATCH /pacientes/:id` mínimo | api | ⬜ |
| 11 | CORS con lista de orígenes, logs JSON con `pino`, `GET /health` | backend | ⬜ |
| 12 | Tests: planificación, outbox, concurrencia `SKIP LOCKED`, webhooks, e2e del flujo | testing | ⬜ |

### Frontend (`citia-frontend`)
1. Correo obligatorio en el modal "Nueva cita" (mismo release que el punto 10 del backend).
2. Pantalla de configuración: activar, momentos de envío (1 a 3), teléfono y correo de contacto (el
   correo es el `Reply-To`). Solo canal correo en esta fase.
3. Estado de los recordatorios en el voucher de la cita (programado, enviado, entregado, fallido,
   cancelado, omitido, con su motivo).
4. Despliegue en Cloudflare con *fallback* de SPA a `index.html` (incluye `/agendar-cita`).

### Prerrequisitos operativos (usuario)
- Comprar el dominio `.cl`, delegar el DNS a Cloudflare y verificar el subdominio de envío en Resend
  (SPF, DKIM, DMARC).
  **Sin esto no se puede escribir a pacientes reales.**
- Cuentas de Resend y Better Stack; Railway con "App Sleeping" desactivado.

### Integración
- Crear / reagendar / cancelar una cita → los recordatorios se programan, reprograman o anulan (vía
  outbox).
- Configuración ↔ API; estado por cita ↔ voucher.

**Entregable:** el profesional configura sus recordatorios; el sistema los programa, los envía por
correo, registra su entrega y refleja reagendar y cancelar; si algo falla, el equipo se entera por
una alerta antes que por el cliente.

> **Sin decisiones abiertas** (2026-09-30). Queda solo verificar al implementar algunos datos de
> Resend y Better Stack ([ADR-13](Decisions/ADR-13.md#lo-que-queda-por-verificar-al-implementar)).

---

## Fase 3 — US-04: Respuesta del paciente

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-3-us04-respuesta-paciente.md`](Fases/fase-3-us04-respuesta-paciente.md).

**Estado:** ⬜ nada. Diseño de producto en [FD-06](Frontend-Decisions/FD-06.md) (propuesta). El mecanismo de enlace por cita se está diseñando en
[ADR-10](Decisions/ADR-10.md) (propuesto) para [US-02.07](US/02.07-paciente-reagenda-cancela.md).

> **Relación con US-02.07.** US-04 **se construye sobre** el enlace por cita de ADR-10: mismo token,
> misma página pública. US-02.07 aporta cancelar y pedir reagendar; US-04 añade "Confirmar", el
> envío del enlace dentro del recordatorio y el registro de la respuesta para el scoring. No hay que
> diseñar un segundo mecanismo de token.

### Backend
1. Enlaces públicos con token único para "Confirmar" y "Cancelar" (reutiliza el enlace de ADR-10).
2. Modelo para registrar la respuesta (fecha/hora) → alimenta US-07.
3. API pública que procesa la respuesta usando el token.
4. Validación: rechazar/caducar tras la hora de la cita.
5. Marcar cita confirmada al confirmar.
6. Cancelar cita y liberar el bloque horario al cancelar (transición existente, ADR-10).
7. Guardar respuesta exacta (para scoring).

### Frontend (página pública responsive, sin cuenta)
1. Página para confirmar/cancelar.
2. Pantallas de éxito y de "enlace expirado".
3. Bloquear interacción si el enlace caducó.

### Integración
- Conectar página pública ↔ API de respuestas.
- Disparar alertas (US-05) al confirmar/cancelar.
- Reflejar cambio en agenda del profesional.

**Entregable:** el paciente confirma/cancela desde el correo; agenda y alertas se actualizan.

> **Fuera del MVP** (2026-09-30): el MVP termina en la Fase 2. Con los recordatorios diseñados, el
> canal que ADR-10 echaba en falta va a existir; al retomar esta fase, ADR-10 se reabre con la salida B
> de Q11 (el enlace viaja en el recordatorio, bloque `accion` de la plantilla de ADR-13 §12).
>
> **Al entrar esta fase se reabre [DT-30](Deudas/DT-30.md)** (decisión del 2026-09-30): la
> confirmación del paciente es lo que lleva las citas a `confirmada`, y recién entonces los botones de
> asistencia e inasistencia del voucher funcionan sin tocar el grafo de ADR-04.
>
> Depende de la Fase 2 (el recordatorio es lo que lleva el enlace) y de que se **acepte ADR-10**
> (bloqueado por [H7 y Q11](PREGUNTAS-ABIERTAS.md)). **No** depende de ADR-08: el enlace no lleva
> `tenantSlug`. Sin límite de tasa por decisión ([DT-18](Deudas/DT-18.md)): revisarlo antes de
> difundir enlaces de forma masiva.

---

## Fase 4 — US-05: Alertas al profesional

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-4-us05-alertas.md`](Fases/fase-4-us05-alertas.md).

**Estado:** ⬜ solo existe el puerto `PublicadorEventos`, sin suscriptores. Con la Fase 2 las alertas
se enchufan como otro suscriptor del outbox ([ADR-12 §4](Decisions/ADR-12.md)); para entregar en menos
de 3 s hará falta `LISTEN/NOTIFY` (evolución anotada en ADR-12).

### Backend
1. Modelo/tabla de historial de alertas (tipo, mensaje, fecha, leído).
2. Configuración de preferencias de alertas por email.
3. Infraestructura tiempo real (WebSockets o SSE) para entregar en <3s.
4. API para consultar historial (filtrar leídas/no leídas).
5. API para marcar leídas (una o varias).
6. Servicio de envío de email de alerta (si configurado).
7. Conectar triggers de US-02 (reagendar/cancelar, incluidos los del paciente en US-02.07) y US-04
   (confirmar/cancelar) → generan alerta.
8. Push en tiempo real al front.

### Frontend
1. Toggle para activar/desactivar alertas por email.
2. Badge/campana con contador de no leídas.
3. Panel/historial de alertas.
4. Botón "marcar leídas".

### Integración
- Conectar badge/historial con APIs + actualizar contador en tiempo real.

**Entregable:** el profesional recibe alertas en <3s y las gestiona.

---

## Fase 5 — US-07: Calificación de asistencia (scoring)

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-5-us07-scoring.md`](Fases/fase-5-us07-scoring.md).

**Estado:** ⏸ **fuera del MVP, pasa a la v2** (decisión del usuario, 2026-09-30). Es el segundo valor
agregado del negocio; se retoma después de validar el MVP con recordatorios.

### Backend
1. Cálculo del % de asistencia.
2. Algoritmo de clasificación ("confiable" / "riesgo" / "nuevo").
3. Regla estricta: sin historial = siempre "nuevo".
4. Interceptar cierre de cita → recalcular scoring automáticamente.
5. Incluir % y clasificación en la API de lista de pacientes.
6. Incluir scoring completo en la API de detalle de paciente.

### Frontend
1. Badges/etiquetas con color para "nuevo/confiable/riesgo".
2. Mostrar % y clasificación en la lista de pacientes.
3. Sección de scoring en el detalle del paciente.

### Integración
- Conectar lista/detalle con APIs actualizadas.

**Entregable:** el profesional ve el historial de comportamiento de cada paciente.

> El punto 4 depende del **proceso de cierre**. Su mecanismo ya está decidido ([ADR-12](Decisions/ADR-12.md))
> y el job se aplaza con esta fase ([DT-11](Deudas/DT-11.md)): el `ghosting` se puede reconstruir
> después, con una fecha de corte. **Lo que no se reconstruye es la asistencia real**
> ([DT-30](Deudas/DT-30.md)): los botones del voucher esperan a la Fase 3 (decisión del 2026-09-30),
> así que esta fase arrancará sin el historial de asistencia anterior a esa fecha.

---

## Fase 6 — US-08: Monitoreo y seguimiento del paciente

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fases-6-7-us09-sin-diseno.md`](Fases/fases-6-7-us09-sin-diseno.md#fase-6--us-08-monitoreo-y-seguimiento-del-paciente).

**Estado:** 🔶 solo `POST /pacientes`.

### Backend
1. Modelo de notas de seguimiento (fecha, contenido, vínculo profesional+paciente).
2. API listar pacientes con "última cita", "próxima cita", "estado activo/inactivo".
3. Aislamiento: solo pacientes del profesional logueado (token).
4. API detalle con historial de citas (US-02) + notas.
5. API crear nota.
6. Autorización estricta en detalle/notas (rechazar pacientes ajenos).

### Frontend
1. Lista de pacientes (nombre, última cita, próxima cita, estado).
2. Detalle del paciente (historial de citas + notas).
3. Formulario de nueva nota.

### Integración
- Conectar lista/detalle/nota con APIs.
- Validar aislamiento de datos (seguridad).

**Entregable:** el profesional gestiona y sigue a sus pacientes con notas e historial.

---

## Fase 7 — US-10: Perfil, suscripción y soporte

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fases-6-7-us09-sin-diseno.md`](Fases/fases-6-7-us09-sin-diseno.md#fase-7--us-10-perfil-suscripción-y-soporte).

**Estado:** ⬜ nada.

### Backend
1. API obtener perfil (nombre, correo, especialidad, foto).
2. API actualizar perfil.
3. API consultar suscripción (plan, renovación, método de pago).
4. API cambio de contraseña (valida contraseña actual).
5. Endpoint de soporte (recibir/registrar mensajes).

### Frontend
1. Menú "Mi Perfil".
2. Vista central con pestañas (info personal / suscripción / seguridad).
3. Formulario info personal (editar).
4. Sección suscripción (lectura).
5. Formulario cambio de contraseña.
6. Botón "Contactar soporte" + modal.

### Integración
- Conectar todo con sus APIs.

**Entregable:** el profesional gestiona su cuenta y contacta soporte.

---

## US-09 — (pendiente de definir)

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fases-6-7-us09-sin-diseno.md`](Fases/fases-6-7-us09-sin-diseno.md#us-09--sin-definir).

**Estado:** ⬜ pendiente.

> Título y subtareas técnicas aún sin definir. Se completa cuando exista el detalle.

---

## Resumen

| Fase | US | Depende de | Estado |
|---|---|---|---|
| 0 | US-06 Dashboard | US-02 | ✅ cerrada |
| 1 | US-02 Gestión de citas | — | ✅ cerrada (develop 2026-09-28) · US-02.07 ⏸ aplazada |
| 2 | US-03 Recordatorios | US-02, ADR-12 (outbox + planificador), dominio verificado | 🔶 diseño cerrado (ADR-12, ADR-13) · **en el MVP** |
| 3 | US-04 Respuesta paciente (+ US-02.07) | US-03, ADR-10 | ⬜ · fuera del MVP |
| 4 | US-05 Alertas | US-02/03/04 | ⬜ (solo puerto) |
| 5 | US-07 Scoring | US-02/04, proceso de cierre (ADR-12), asistencia registrada (DT-30) | ⏸ v2 (fuera del MVP, 2026-09-30) |
| 6 | US-08 Monitoreo | US-02/07 | 🔶 solo alta |
| 7 | US-10 Perfil/soporte | — | ⬜ |
| — | US-09 | — | ⬜ pendiente |

## Decisiones previas

1. ~~Canal de recordatorios (Fase 2)~~ → **resuelta 2026-09-30**: correo; WhatsApp/SMS después ([ADR-13](Decisions/ADR-13.md)).
2. ~~Proveedor de email (Fase 2 y 4)~~ → **resuelta 2026-09-30**: Resend (Brevo y SendGrid descartados).
3. Tiempo real (Fase 4): WebSockets vs SSE.
4. ~~Planificador/cola de jobs (Fases 2 y 5)~~ → **resuelta 2026-09-30**: planificador en proceso sobre
   Postgres con `SKIP LOCKED`, sin Redis ([ADR-12](Decisions/ADR-12.md)).
5. Enlace por cita (Fases 1 y 3): aceptar [ADR-10](Decisions/ADR-10.md) tras
   [H7 y Q11](PREGUNTAS-ABIERTAS.md), incluido si el correo ofrece "cambiar hora" además de
   confirmar/cancelar ([FD-06](Frontend-Decisions/FD-06.md)).
6. ~~FD-01 vs ADR-09~~ → **resuelta 2026-09-29**: el enlace solo envía una solicitud (ADR-09).
7. ~~Límite de tasa antes de desplegar~~ → **resuelta 2026-09-29**: se sigue sin límite por ahora (DT-18).
8. [ADR-08](Decisions/ADR-08.md) (tenant en URL): la fase 1 ya se aplica en la ruta pública
   (ADR-09 §11.b); falta el login. Ya no bloquea la Fase 3.
