# Roadmap — Citia

Hoja de ruta de las historias de usuario (US-02 a US-10). Sirve para tener el orden, las
dependencias y el estado real de cada pieza en un solo lugar.

**Última revisión:** 2026-11-01 (**Fase 7 🔶 implementada** —backend—, **en `develop`** (staging) con el **release a `main` abierto**; cierre pendiente de las pruebas manuales y de [Q18](PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) y [Q19](PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte), sin respuesta (el código usa los provisionales); unitarios, integración y e2e en verde; [ADR-15](Decisions/ADR-15.md) aceptado (2026-10-31) con sus [notas de implementación](Decisions/ADR-15.md#notas-de-implementación-2026-11-01); [DT-01](Deudas/DT-01.md) cierra su parte de revocación al cambiar la contraseña, [DT-59](Deudas/DT-59.md) pasa a abierta y se fichan [DT-60](Deudas/DT-60.md) y [DT-61](Deudas/DT-61.md)) · antes: 2026-10-31 (**Fase 7 🔶 en diseño**: decisiones de producto P1 a P8 del usuario, [ADR-15](Decisions/ADR-15.md) propuesto y plan [US-10](US/10-perfil-cuenta.md); se fichan [DT-57](Deudas/DT-57.md) a [DT-59](Deudas/DT-59.md) y la guía de la fase se separa en [`Fases/fase-7-us10-perfil.md`](Fases/fase-7-us10-perfil.md)) · antes: 2026-10-31 (nueva sección transversal **[Cumplimiento (Ley 21.719)](#cumplimiento-ley-21719--transversal)**: el estado legal de Citia documentado en [`Cumplimiento/`](Cumplimiento/README.md) a partir de un pre-análisis hecho con una IA el 2026-10-30, que no es un abogado ni una opinión legal; prioridades P1, P2 y P3 con sus deudas, [DT-51](Deudas/DT-51.md) a [DT-56](Deudas/DT-56.md), y [DT-26](Deudas/DT-26.md) ampliada; el límite es la primera clínica con pacientes reales, y si P1 es condición para recibirla, el usuario no lo ha decidido) · antes: 2026-10-30 (**US-07.02 y US-07.03 🚧 bloqueadas, plan incluido**, por decisión del usuario: no tiene abogado, y un pre-análisis legal hecho con una IA, que no es una opinión legal, recomienda no habilitar el perfilamiento mientras no haya fundamento jurídico; se desbloquean cuando un abogado revise el [contexto legal de ADR-14](Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) · sus **decisiones de producto**, aprobadas ese mismo día, siguen vigentes · **siguiente paso de la Fase 5: cerrar US-07.01** · **job G1 prendido** en production desde el 2026-10-27 y [DT-11](Deudas/DT-11.md) cerrada; US-07.01 en producción con sus pruebas manuales en curso) · antes: 2026-10-30, hasta el bloqueo (**decisiones de producto de US-07.02 aprobadas** por el usuario —peso de `nuevo` = 0, recordatorio no entregado → acción al profesional, un solo hecho por hora comprometida, corrección de un cierre dentro de 7 días, `confirmada` sin cerrar neutras y en una lista—, registradas en [ADR-14](Decisions/ADR-14.md); **siguiente paso: el plan de US-07.02**; la revisión legal sigue pendiente y bloquea su implementación, no su plan) · antes: 2026-10-26 (**US-07.01 en producción** desde el release del 2026-10-20 —backend PR #13 y frontend PR #14—, con el **job G1 apagado** (`CIERRE_GHOSTING_ACTIVO=false`): solo cuenta en el log las citas que cerraría; [DT-11](Deudas/DT-11.md) se cierra al prenderlo) · antes: 2026-10-19 (**se reabre la Fase 5 por US-07.01**, registro de hechos: en construcción, adelantada a la Fase 4, de la que no depende; diseño en [ADR-14](Decisions/ADR-14.md), aceptado en lo que toca a US-07.01; plan en [US-07.01](US/07.01-registro-hechos.md); US-07.02 y US-07.03 siguen en la v2) · antes: 2026-10-18 (**Fase 3 en producción** desde el release del 2026-10-17, con un corte de ~9 minutos; cierre pendiente de las pruebas manuales; feature en [us04-respuesta-paciente](Features/us04-respuesta-paciente.md)) · antes: 2026-10-15 (Fase 3 mergeada a `develop`: backend PR #6 y frontend PR #7) · 2026-10-15, en la mañana (Fase 3 implementada y verificada en local, sin commits) · 2026-10-14 (Fase 3 en construcción: el arquitecto aprobó el diseño, ADR-10 aceptado con Q11 = B, plan en [US-04](US/04-respuesta-paciente.md)) · 2026-10-07 (**Fase 2 cerrada en producción**: release del 2026-10-06 en los dos repos y prueba de punta a punta con un correo real; el MVP completo está en producción) · 2026-10-04 (Fase 2 implementada en rama, pendiente de merge) · 2026-09-30 (Q1 → A: recordatorios en el MVP; scoring a la v2; diseño de la Fase 2 en ADR-12 y ADR-13)

**Por fases:** este documento es la fuente del **estado**. Para leer todo lo que toca a una fase
(decisiones, deudas, commits, contraparte del frontend) en orden, entra por [`Fases/`](Fases/README.md).
Aquí "fase" es siempre una fase de construcción; las etapas del producto están en
[`Descripcion/`](Descripcion/README.md).

## Convenciones

- ✅ hecho · 🔶 parcial · ⬜ pendiente · 🚧 bloqueado · ⏸ aplazado.
- Cada fase es entregable y testeable por sí sola.
- Orden por dependencias: US-02 (+ US-06 en paralelo) → US-03 → US-04 → US-05 → US-07 → US-08.
  US-10 no depende de nada y puede entrar en cualquier momento. US-09 sigue sin definir.
  *(2026-10-19: **US-07.01**, la primera subtarea de US-07, se adelanta a US-05: no depende de ella, solo de
  US-02, US-04 y el planificador de ADR-12.)*
- **Alcance del MVP (2026-09-30):** Fase 0 (dashboard) + Fase 1 (gestión de citas) + **Fase 2
  (recordatorios)**. La Fase 5 (scoring) sale del MVP y pasa a la v2. Ver
  [Descripcion/fase-3-mvp.md](Descripcion/fase-3-mvp.md). **El MVP completo está en producción**
  (`app.citiahealth.cl`) desde el release del 2026-10-06; la Fase 2 se cerró el 2026-10-07.
- **Entornos (Git Flow):** `develop` se despliega en **staging** y `main` en **production**, en Railway
  (backend) y en Netlify (frontend). Una fase está "en producción" cuando llegó a `main`. Mapa en
  [stack § Mapa de entornos](stack-tecnologico.md#mapa-de-entornos).
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
- ✅ Conectado a `GET /citas/hoy` real.
- ✅ **Sin mock** (2026-10-05, frontend [PR #4](https://github.com/Citia-solutions/citia-frontend/pull/4)):
  cuatro tarjetas con datos reales (citas de hoy, próxima cita, próximos 7 días, solicitudes por responder),
  "Citas por semana" y estado de los recordatorios, todo desde endpoints existentes
  ([dashboard-citas-del-dia](../../citia-frontend/context/Features/dashboard-citas-del-dia.md)). En producción desde el
  2026-10-06.
- ✅ Clic en una cita → voucher con reagendar/cancelar ([US-02.08](US/02.08-voucher-cita.md)).
- ✅ Citas pasadas marcadas visualmente (tachado) en `TodayAppointments.vue`.

- ✅ Los cambios se reflejan tras crear/reagendar/cancelar
  ([US-02.09](../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md)).

### Pendiente
- ~~Las métricas del dashboard (ausentismo, horas e ingresos recuperados) siguen siendo mock.~~ Se quitaron
  el 2026-10-05: el ausentismo necesita RF-08 (v2) y volverá como tarjeta nueva, no sobre datos fijos.

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
| [US-02.07](US/02.07-paciente-reagenda-cancela.md) — el paciente cancela o pide reagendar | paciente | ⏸ aplazada fuera de la v1 (Q11 → C) · 🔀 **absorbida por [US-04](US/04-respuesta-paciente.md)** (Fase 3: en producción desde el 2026-10-17) |
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
  enlace de forma masiva ([DT-18](Deudas/DT-18.md)). *(2026-10-14: la Fase 3 le pone 5 solicitudes por hora
  por IP. 2026-10-17: en production con el release de la Fase 3.)*
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

**Estado:** ✅ **cerrada en producción (2026-10-07).** Mergeada en `develop` el 2026-10-04
([PR #1](https://github.com/Citia-solutions/citia-backend/pull/1) del backend y
[PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2) del frontend) y llevada a `main` el
2026-10-06 en un solo release ([PR #4](https://github.com/Citia-solutions/citia-backend/pull/4), `c057ade`, y
[PR #6](https://github.com/Citia-solutions/citia-frontend/pull/6)). El 2026-10-07, con production configurada,
la **prueba de punta a punta** envió tres recordatorios reales: llegaron a la bandeja de entrada, uno por
cita, y el voucher los mostró *Entregado*. Entra en el MVP (Q1 → A). 1274 unitarios, 212 e2e y 80 de
integración en verde; Definición de Terminado completa, con dos salvedades anotadas. Cierre, incidentes y
lecciones en la [guía de la fase](Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07).
Diseño en [ADR-12](Decisions/ADR-12.md) (outbox + planificador) y [ADR-13](Decisions/ADR-13.md)
(recordatorios); plan en [US/03-recordatorios.md](US/03-recordatorios.md); lo construido en
[Features/us03-recordatorios.md](Features/us03-recordatorios.md). Cronología commit → documento en la
[guía de la fase](Fases/fase-2-us03-recordatorios.md#cronología-commit--documento).

### Decisiones (usuario, 2026-09-30)

| Tema | Decisión |
|---|---|
| Canal | correo transaccional vía **Resend**. WhatsApp y SMS fuera del MVP (otro adaptador del mismo puerto, después) |
| Remitente | uno solo para toda la plataforma, nombre visible **"citiahealth"** (era "Citia" hasta el 2026-10-18): `citiahealth <recordatorios@notificaciones.citiahealth.cl>`. Dominio **`citiahealth.cl`** delegado a Cloudflare; subdominio de envío **verificado en Resend** (2026-10-07). Falta DMARC ([DT-41](Deudas/DT-41.md)) |
| Contenido | solo informativo: fecha, hora, profesional, cómo contactar. Sin tipo de consulta. El enlace para responder llega en la Fase 3 |
| Momentos | configurables por profesional; predeterminado **24 h y 2 h antes** |
| Correo del paciente | **obligatorio** en el alta manual |
| Consentimiento | **no se revisa** por ahora: riesgo aceptado ([DT-16](Deudas/DT-16.md)), revisión antes de la Ley 21.719 |
| Hechos de dominio | outbox transaccional: **cierra [DT-27](Deudas/DT-27.md)** antes del primer suscriptor |
| Planificador ([Q6](PREGUNTAS-ABIERTAS.md)) | cron dentro del proceso sobre Postgres con `FOR UPDATE SKIP LOCKED`; sin Redis ni BullMQ |
| Hosting | backend + Postgres en **Railway** (siempre encendido); SPA en **Netlify** (revertido desde Cloudflare el 2026-10-04). Un entorno por rama en ambos: staging ← `develop`, production ← `main` |
| Observabilidad | **Better Stack** gratis: uptime, latido del job, logs, alertas ([DT-19](Deudas/DT-19.md)). En producción: monitor y heartbeats en Up; la fuente de logs, pendiente |
| Modo prueba | Resend Free: 3.000/mes y 100/día → ~50 citas al día en toda la plataforma; aviso al 80 % |
| Asistencia en el voucher | ~~**no**: se espera a la Fase 3, cuando el paciente confirme desde el enlace~~ → **revertida el 2026-10-05:** el voucher ofrece Confirmar, Asistió y No asistió, sin tocar el grafo de ADR-04 → [DT-30](Deudas/DT-30.md) mitigada |
| Detalle (confirmado el mismo día) | `Reply-To` = correo que configure el profesional · sin envíos de 21:00 a 08:00 · activos por defecto a las 24 h y 2 h · un tardío si faltan ≥ 60 min · pacientes sin correo `omitido` + `PATCH /pacientes/:id` · completar el correo vacío al vincular por RUT · nombre de la organización en el cuerpo · subdominio de envío · 40 envíos al día por tenant · alerta sobre 5 % con n ≥ 20 ([ADR-13](Decisions/ADR-13.md#decisiones-confirmadas-2026-09-30)) |

### Backend

| # | Pieza | Agente | Estado |
|---|---|---|---|
| 1 | Outbox `eventos_salida` + `publicar(evento, tx)` + despachador ([ADR-12](Decisions/ADR-12.md)) | database → backend → api | ✅ `daf0617`, `a6c237f`, `f95b637` |
| 2 | Planificador (`@nestjs/schedule`), apagado ordenado, latidos | backend | ✅ `f95b637`, `d45de20` |
| 3 | Tablas `configuraciones_recordatorio`, `recordatorios`, `supresiones_correo` | database | ✅ `f2d80aa` |
| 4 | Dominio: `Recordatorio` (estados), configuración, planificación pura (silencio, tardíos, vencimiento) | api | ✅ `a13d80a` |
| 5 | Suscriptor + reconciliación (crear, reagendar, cancelar, configurar) + respaldo cada hora | api | ✅ `a13d80a` |
| 6 | Envío con revalidación, políticas, reintentos, cuota y límite por tenant | api | ✅ `f719c66` |
| 7 | Adaptador `ResendCanalMensajeria` + `RegistroCanalMensajeria` + plantilla (con hueco para el enlace de la Fase 3) | api | ✅ `f719c66` |
| 8 | Webhooks de Resend con firma verificada (entregado, rebote, queja) | backend (cuerpo crudo) + api | ✅ `f719c66` |
| 9 | API: `GET/PUT /recordatorios/configuracion`, `GET /citas/:id/recordatorios` | api | ✅ `f719c66` |
| 10 | Correo obligatorio del paciente + `PATCH /pacientes/:id` mínimo | api | ✅ `a37f175` |
| 11 | CORS con lista de orígenes, logs JSON con `pino`, `GET /health` | backend | ✅ `d45de20` |
| 12 | Tests: planificación, outbox, concurrencia `SKIP LOCKED`, webhooks, e2e del flujo | testing | ✅ `db46e37`, `a938f9d` |

### Frontend (`citia-frontend`)
*(Todo ✅: mergeado en `develop` con [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2) y
[PR #3](https://github.com/Citia-solutions/citia-frontend/pull/3) el 2026-10-04, en producción con
[PR #6](https://github.com/Citia-solutions/citia-frontend/pull/6) el 2026-10-06 y probado contra el backend
real el 2026-10-07.)*

1. ✅ Correo obligatorio en el modal "Nueva cita" (mismo release que el punto 10 del backend).
2. ✅ Pantalla de configuración `/recordatorios`: activar, momentos de envío (1 a 3), teléfono y correo de
   contacto (el correo es el `Reply-To`). Solo canal correo en esta fase.
3. ✅ Estado de los recordatorios en el voucher de la cita (programado, enviado, entregado, fallido,
   cancelado, omitido, con su motivo), más la vista **Contacto** para completar el correo con
   `PATCH /pacientes/:id`.
4. ✅ Despliegue en **Netlify** con *fallback* de SPA a `index.html` (`public/_redirects`, incluye
   `/agendar-cita`); `VITE_API_URL` como variable del sitio. *(El `wrangler.jsonc` de Cloudflare se
   quitó el 2026-10-04 al decidir quedarse en Netlify.)* Sitios: `app.citiahealth.cl` ← `main` y
   `citia-staging.netlify.app` ← `develop`.
5. ✅ Limpieza previa al release ([PR #4](https://github.com/Citia-solutions/citia-frontend/pull/4) y
   [PR #5](https://github.com/Citia-solutions/citia-frontend/pull/5)): sin mock, sesión persistente,
   asistencia en el voucher, 404, fechas pasadas, zona horaria fija de Chile, calendario público. El
   backend agregó `tenantNombre` al login para el sidebar
   ([PR #3](https://github.com/Citia-solutions/citia-backend/pull/3)).

### Prerrequisitos operativos (usuario)
*(Estado al 2026-10-07; detalle punto por punto en el
[checklist de salida a producción](Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción).)*
- ✅ Dominio **`citiahealth.cl`** comprado (Hostinger, vence el 2027-10-01) y su DNS delegado a Cloudflare.
- ✅ Subdominio de envío `notificaciones.citiahealth.cl` verificado en Resend y webhook creado en
  production. ⬜ Falta el registro DMARC ([DT-41](Deudas/DT-41.md)).
- ✅ Better Stack: monitor de `/api/health` y los dos heartbeats en Up. ⬜ Fuente de logs
  ([DT-19](Deudas/DT-19.md)).
- ✅ Railway: staging ← `develop` y production ← `main`, cada uno con su Postgres y sus variables;
  migraciones aplicadas. 🔶 "App Sleeping" apagado, sin confirmar en el panel.
- ✅ Frontend publicado en Netlify, un sitio por entorno.

### Integración
- ✅ Crear / reagendar / cancelar una cita → los recordatorios se programan, reprograman o anulan (vía
  outbox): probado en los e2e con Postgres.
- ✅ Configuración ↔ API; estado por cita ↔ voucher: **probado en producción** el 2026-10-07 (recordatorio a
  30 min antes de tres citas, tres correos reales, *Entregado* en el voucher).

**Entregable:** el profesional configura sus recordatorios; el sistema los programa, los envía por
correo, registra su entrega y refleja reagendar y cancelar; si algo falla, el equipo se entera por
una alerta antes que por el cliente.

### Pendientes posteriores al cierre

Ninguno bloquea el cierre; detalle en la
[guía de la fase](Fases/fase-2-us03-recordatorios.md#pendientes-posteriores).

- ⬜ Que `MENSAJERIA_ADAPTADOR=registro` no deje recordatorios "Enviado" en producción sin enviarse, o que la
  app no arranque con él sin confirmarlo ([DT-40](Deudas/DT-40.md)).
- ⬜ Registro **DMARC** del subdominio de envío y revisión de las cabeceras ([DT-41](Deudas/DT-41.md)).
- ⬜ **Fuente de logs** en Better Stack, alertas por log y prueba de alerta forzada ([DT-19](Deudas/DT-19.md)).
- ⬜ **Resend en staging** (hoy corre con `registro`).
- ⬜ Redirigir el dominio raíz `citiahealth.cl` y `www` a `app.citiahealth.cl` (hoy, página estacionada de
  Hostinger). Opcional.
- ⬜ Confirmar "App Sleeping" apagado en production y el `FRONTEND_URL` del backend de staging; contar los
  pacientes sin correo en production.

> **Decisiones pendientes del usuario (2026-10-04),** ninguna bloquea el merge: ¿ocultar `/recordatorios`
> al rol `recepcion`? (Q12) · textos y colores de los estados en el frontend (Q13) · ¿mantener la vista
> Contacto del voucher? (Q14) · ¿cuándo reinicia Resend la cuota mensual del plan gratis? (Q15). Detalle
> en la [Fase 2](Fases/fase-2-us03-recordatorios.md#decisiones-pendientes-del-usuario-2026-10-04). Los datos
> de proveedores que el diseño suponía quedaron verificados salvo dos
> ([ADR-13](Decisions/ADR-13.md#datos-de-proveedores-lo-que-queda-por-verificar-resuelto)).

---

## Fase 3 — US-04: Respuesta del paciente

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-3-us04-respuesta-paciente.md`](Fases/fase-3-us04-respuesta-paciente.md).

**Estado:** ✅ **en producción (2026-10-17)** · cierre pendiente de las pruebas manuales (correo real y
escáneres) y de la de `trust proxy`. Backend y frontend construidos contra el plan
[US-04](US/04-respuesta-paciente.md), verificados en local y mergeados a `develop` el 2026-10-15 (backend
[PR #6](https://github.com/Citia-solutions/citia-backend/pull/6), merge `ce0c533`; commits `c757e0e` →
`b93f2c0`; frontend [PR #7](https://github.com/Citia-solutions/citia-frontend/pull/7), merge `e8ce193`), y
llevados a `main` el 2026-10-17 (backend [PR #7](https://github.com/Citia-solutions/citia-backend/pull/7),
`05bae58`; frontend [PR #8](https://github.com/Citia-solutions/citia-frontend/pull/8), `1a7f324`); filas
85–92, 94 y 95 de la [TRAZABILIDAD](TRAZABILIDAD.md). [ADR-10](Decisions/ADR-10.md) aceptado el 2026-10-14 con
[Q11](PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) = **B** (el enlace va en el
recordatorio) y los requisitos de seguridad S1–S3 más el límite de tasa. 1709 unitarios, 287 e2e y 139 de
integración en verde; recorrido real en local de punta a punta. Lo que existe, en
[Features/us04-respuesta-paciente.md](Features/us04-respuesta-paciente.md); cómo salió, el incidente y lo que
queda, en la [guía de la fase](Fases/fase-3-us04-respuesta-paciente.md#release-a-producción-2026-10-17).

> **Corte en el release (2026-10-17).** Production respondió 502 unos 9 minutos (00:13 a 00:22, hora de
> Chile): `ENLACE_CITA_CLAVE` no le llegaba al contenedor y la validación del entorno detuvo el arranque. Se
> resolvió aplicando la variable en Railway; sin pérdida de datos. El frontend salió después, con el backend
> ya verificado.

> *Antes (2026-10-15):* ✅ mergeada a `develop`, pendiente de release.
>
> *Antes (2026-10-15, en la mañana):* implementada y verificada en local, en la rama
> `feature/fase3-respuesta-paciente` de cada repo, todavía sin commits.
>
> *Antes (2026-10-14):* 🔶 en construcción: el arquitecto aprobó el diseño ese día.

> **Relación con US-02.07.** US-04 **absorbe** la subtarea [US-02.07](US/02.07-paciente-reagenda-cancela.md):
> mismo enlace, misma página pública. El paciente **confirma**, **cancela** o **pide otra hora**; el enlace
> viaja en cada recordatorio. El análisis de US-02.07 se conserva, con la tabla de lo que cambió.

> *Antes (2026-10-07):* ⬜ nada · siguiente fase; para arrancar había que aceptar ADR-10.

### Backend
*(Todo ✅; en `develop` desde el 2026-10-15 (PR #6) y en producción desde el 2026-10-17 (release `05bae58`). Detalle por agente en
[US-04 § Orden de construcción](US/04-respuesta-paciente.md#orden-de-construcción); lo que el código hizo
distinto del contrato, en [us04 § Desviaciones](Features/us04-respuesta-paciente.md#desviaciones-del-contrato-y-decisiones-tomadas-al-implementar).)*

| # | Pieza | Agente | Estado |
|---|---|---|---|
| 1 | `ENLACE_CITA_CLAVE`, `trust proxy`, CORS con `X-Enlace-Cita`, redacción en logs, cabeceras `no-store` / `no-referrer` | backend | ✅ |
| 2 | Límite de tasa (`@nestjs/throttler`): enlace, login, registro y solicitud pública ([DT-18](Deudas/DT-18.md)) | backend | ✅ guard global opt-in (`@LimitarTasa`), apagable con `LIMITE_TASA_ACTIVO=false` |
| 3 | Tabla `enlaces_cita`; `solicitudes_cita` con `tipo`, `cita_origen_id`, `enlace_id` y estado `descartada` | database | ✅ migraciones `1750000012000` a `1750000014000` |
| 4 | Enlace por cita (HMAC recalculable, uno por cita, validez hasta `inicio`) e invalidación desde el voucher | api | ✅ + autocorrección si cambia la clave ([DT-45](Deudas/DT-45.md)) |
| 5 | Refactor del actor en el esqueleto de mutación, con bloqueo de la cita; `confirmadaPor` / `canceladaPor` en el detalle | api | ✅ con `FOR NO KEY UPDATE` en vez de `FOR UPDATE` |
| 6 | El recordatorio lleva el enlace (botón fijo *Ver o responder mi hora*) | api | ✅ |
| 7 | Pedir otra hora como `SolicitudCita` de tipo `reagendamiento`; aceptar mueve la misma cita; suscriptor que la descarta | api | ✅ el suscriptor además la deja atendida si el profesional reagenda ([DT-44](Deudas/DT-44.md), parte 2) |
| 8 | Módulo `portal-paciente`: `GET /api/publico/cita` y `POST …/confirmar`, `…/cancelar`, `…/otra-hora` | api | ✅ |
| 9 | Tests: la Definición de Terminado de US-04 | testing | ✅ lo automático (1709 unitarios, 287 e2e, 139 de integración); ⬜ los dos manuales |

### Frontend (`citia-frontend`)
*(✅ en `develop` desde el 2026-10-15 ([PR #7](https://github.com/Citia-solutions/citia-frontend/pull/7), `e8ce193`) y en producción desde el 2026-10-17 ([PR #8](https://github.com/Citia-solutions/citia-frontend/pull/8), `1a7f324`): [responder-cita-paciente](../../citia-frontend/context/Features/responder-cita-paciente.md).)*

1. ✅ Ruta pública `/cita` (sin cuenta, responsive): ver la cita, confirmar, cancelar, pedir otra hora;
   pantallas de éxito, de *"Enlace no válido o vencido"*, de 409 y de 429; sin scripts de terceros. Relee el
   token si cambia solo el fragmento en la misma pestaña (bug encontrado y corregido en la verificación).
2. ✅ Voucher: quién confirmó o canceló, nota *"El paciente pidió otra hora"*, botón *"Invalidar enlace del
   paciente"*.
3. ✅ Bandeja: *"Pide otra hora"* con la hora original; aceptar pide solo fecha y hora; estado `descartada`.
4. ✅ Netlify: `_headers` con `Referrer-Policy: no-referrer` (y `X-Robots-Tag: noindex, nofollow`) para `/cita`.

### Integración
- ✅ Página pública ↔ API del enlace; voucher y bandeja ↔ rutas autenticadas (verificado en local,
  2026-10-15).
- ✅ Cambio reflejado en el voucher, la bandeja y los recordatorios (aceptar mueve la misma cita y los
  reprograma; la petición de otra hora va a la bandeja, **no** al dashboard).
- ⬜ Correo real con el botón y escáneres de enlaces de Gmail y Outlook (en production, ya desplegada).
- ✅ Merge a `develop` en los dos repos (2026-10-15: backend PR #6, frontend PR #7).
- ✅ Release a `main` (2026-10-17: backend PR #7, frontend PR #8), con el
  [checklist de salida](Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción); corte de
  ~9 minutos en el backend.
- Las alertas al profesional son de la Fase 4 ([DT-43](Deudas/DT-43.md)): los hechos ya salen con actor.

**Entregable:** el paciente confirma, cancela o pide otra hora desde el correo; el profesional lo ve en la
agenda, en el voucher y en la bandeja.

> **Fuera del MVP** (2026-09-30): el MVP termina en la Fase 2.
>
> **DT-30:** mitigada desde el 2026-10-05 (los botones de asistencia ya están en el voucher). La
> confirmación del paciente desde el enlace se suma y reduce las citas que llegan `pendiente` a su hora.
>
> **Ghosting:** la regla G1 queda escrita en [DT-11](Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14); el
> job no se construye en esta fase y la **fecha de corte es el despliegue de esta fase en producción**:
> **2026-10-17** (escrita en DT-11).
>
> **"Cambiar la hora" ([FD-06](Frontend-Decisions/FD-06.md)):** la v1 lo resuelve como una petición manual
> que el profesional atiende en la bandeja. Que el paciente elija entre horarios disponibles queda para
> después (necesita el modelo de disponibilidad, Q9).
>
> **Límite de tasa:** entra en esta fase ([DT-18](Deudas/DT-18.md): en producción desde el 2026-10-17; se
> cierra con la prueba de `trust proxy`).
> **No** depende de ADR-08: el enlace no lleva `tenantSlug`. El consentimiento sigue como deuda
> ([DT-16](Deudas/DT-16.md)).
>
> **Prerrequisito operativo:** cargar `ENLACE_CITA_CLAVE` en staging y en production **antes** del
> despliegue (sin ella el servicio no arranca; distinta en cada entorno; no copiarla entre ellos,
> [DT-45](Deudas/DT-45.md)). El resto, en el
> [checklist de salida](Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción).
> *(2026-10-17: en production no llegó al contenedor en el primer despliegue y el servicio cayó ~9 minutos;
> confirmar siempre en los Deploy Logs.)*

---

## Fase 4 — US-05: Alertas al profesional

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-4-us05-alertas.md`](Fases/fase-4-us05-alertas.md).

**Estado:** ⬜ nada propio. Desde la Fase 2 (en producción desde el 2026-10-06) existe el **outbox** con su despachador
y un primer suscriptor (recordatorios): las alertas se enchufan como otro suscriptor
([ADR-12 §4](Decisions/ADR-12.md)); para entregar en menos de 3 s hará falta `LISTEN/NOTIFY`
([DT-33](Deudas/DT-33.md)), y conviene resolver el orden entre hechos ([DT-32](Deudas/DT-32.md)).

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

**Estado:** 🔶 **US-07.01 (registro de hechos) en producción desde el 2026-10-20, con el job G1 prendido desde el
2026-10-27 y las pruebas manuales en curso; US-07.02 y US-07.03 quedan 🚧 bloqueadas desde el 2026-10-30, plan
incluido.** US-07.01 se adelantó a la [Fase 4](#fase-4--us-05-alertas-al-profesional) porque no depende de ella. El
2026-10-30 el usuario decidió bloquear US-07.02 (calificación y riesgo) y US-07.03 (acciones) hasta que un abogado
revise el [contexto legal de ADR-14](Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) (o hasta que el usuario
decida otra cosa): no tiene abogado, y un pre-análisis legal hecho con una IA ese día (no es un abogado ni una
opinión legal) recomienda no habilitar el perfilamiento mientras no haya fundamento jurídico. **Las decisiones de
producto de US-07.02, aprobadas ese mismo día, siguen vigentes**
([ADR-14](Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar)) y quedan listas para entonces.
**El siguiente paso de la fase es cerrar US-07.01** (abajo, *Para cerrar US-07.01*).

> *Antes (2026-10-30, hasta el bloqueo):* US-07.02 y US-07.03 "siguen en la v2"; "las decisiones de producto de
> US-07.02 quedaron aprobadas el 2026-10-30 y el siguiente paso es el plan de US-07.02: las preguntas de producto
> ya no lo bloquean. La implementación de US-07.02 y US-07.03 sigue esperando la revisión legal".
>
> *Antes (2026-10-20 → 2026-10-27):* US-07.01 en producción con el **job G1 apagado**.
>
> *Antes (2026-10-19 → 2026-10-20):* 🔶 **en construcción**: US-07.01 desde el 2026-10-19.
>
> *Antes (2026-09-30 → 2026-10-19):* ⏸ **fuera del MVP, pasa a la v2** (decisión del usuario, 2026-09-30). Es el
> segundo valor agregado del negocio; se retomaba después de validar el MVP con recordatorios.

**Diseño:** [ADR-14](Decisions/ADR-14.md) (2026-10-19; **aceptado en lo que toca a US-07.01**, el resto
propuesto): puntos fijos sobre los hechos de los últimos 12 meses, **cuatro** etiquetas (agrega "regular" a las
tres del punto 2), riesgo por cita, y el **registro de hechos** de US-07.01, que va primero. La fase se reparte
en tres subtareas, con la convención de US-02.07 / US-02.08: **US-07.01** · registro de hechos, **US-07.02** ·
calificación y riesgo, **US-07.03** · acciones. La calibración es una tarea posterior, sin US propia.

### US-07.01 — Registro de hechos (✅ en producción desde el 2026-10-20 · job G1 prendido desde el 2026-10-27 · pruebas manuales en curso)

Plan y contrato: [`US/07.01-registro-hechos.md`](US/07.01-registro-hechos.md). Guarda lo que antes se perdía y
no se reconstruye, aunque la calificación tarde en llegar.

**Release.** Mergeada a `develop` el 2026-10-20 (backend
[PR #12](https://github.com/Citia-solutions/citia-backend/pull/12), `715c3f3`; frontend
[PR #13](https://github.com/Citia-solutions/citia-frontend/pull/13), `ef61077`) y llevada a `main` ese mismo día,
a las 04:43 UTC (backend [PR #13](https://github.com/Citia-solutions/citia-backend/pull/13), `313a506`; frontend
[PR #14](https://github.com/Citia-solutions/citia-frontend/pull/14), `69668ec`). Antes del release: 1987
unitarios, 212 de integración y 326 e2e en verde. Una revisión de solo lectura en production (2026-10-23) encontró
las migraciones 15000–18000 aplicadas, la primera apertura del enlace registrada y **1 cita** que el job G1
cerraría. **El 2026-10-27 se prendió el job G1** (`CIERRE_GHOSTING_ACTIVO=true`, despliegue de las 18:39 UTC):
el primer tick, a las 18:40 UTC, cerró esa cita (`cerradas: 1, fallidas: 0`), y el 2026-10-28 a las 00:40 de
Chile, otra de prueba. Una segunda revisión de solo lectura (2026-10-28) encontró 3 `ghosting` con actor
`sistema`, 0 candidatas pendientes y la condición 2 de G1 respetada, y comprobó el portal, `pedido_por`,
`origen`, el voucher (`pendiente → asistio`) y el webhook nuevo de Resend
([detalle](Fases/fase-5-us07-scoring.md#release-a-producción-2026-10-20)).

1. ✅ Asistió / No asistió **también sobre una cita `pendiente`** (`pendiente → asistio`; `pendiente → ghosting`
   con actor profesional), y el dominio exige que ya haya llegado la hora de inicio.
2. ✅ **Quién pidió** cada cancelación o reagendamiento (`cambios_cita.pedido_por`): opcional en la API,
   obligatorio en el voucher; `paciente` automático por el enlace y al aceptar una petición de otra hora.
3. ✅ **Origen** de cada cita (`manual` | `solicitud_publica`), con relleno de las existentes.
4. ✅ **Primera apertura** del enlace del paciente (`enlaces_cita.primera_apertura_en`), sin tocar la cita ni el
   404 uniforme.
5. ✅ **Job G1** ([DT-11](Deudas/DT-11.md)) detrás de `CIERRE_GHOSTING_ACTIVO`: desplegado apagado el
   2026-10-20 y **prendido en production el 2026-10-27**. DT-11 queda cerrada. *(Antes: 🔶 apagado, solo contaba
   en el log `citas.cierre_ghosting.simulado`.)*
6. ✅ Frontend: los dos botones sobre citas `pendiente` y *"¿Quién lo pidió?"* en cancelar y reagendar.

**Para cerrar US-07.01** (al 2026-10-30, todavía abierta; desde el bloqueo de US-07.02 y US-07.03, **es el
siguiente paso de la fase**):
- 🔶 Pruebas manuales de la [verificación mínima](US/07.01-registro-hechos.md#verificación-manual-mínima):
  **en curso**. Faltan *No asistió* marcado por el profesional sobre una `pendiente` (`ghosting` con actor
  `profesional`) y *"¿Quién lo pidió?" = El paciente* elegido desde la app.
- ✅ Prender el job G1 en production (2026-10-27).
- ⬜ La feature de US-07.01 (se crea al cerrar) y sus filas en [`TRAZABILIDAD.md`](TRAZABILIDAD.md).
- Pendiente menor de código (no es deuda): la línea de log `citas.cierre_ghosting` del modo activo no lleva `msg`
  y en Railway se ve sin mensaje (`planificador-cierre-citas.ts`).
- Detectada durante la construcción: [DT-47](Deudas/DT-47.md) (orden de la bitácora con transacciones
  concurrentes); no bloquea el cierre, pero **se corrige antes de implementar US-07.02**, que leerá ese orden
  (cuando se desbloquee; desde el 2026-10-30 ya no es un paso inmediato).
- Fichadas el 2026-10-30: [DT-48](Deudas/DT-48.md) (un cierre equivocado no se corrige; salida decidida para
  US-07.02, hoy 🚧 bloqueada), [DT-49](Deudas/DT-49.md) (escáneres y primera apertura) y
  [DT-50](Deudas/DT-50.md) (`cita` lee el esquema de otros módulos).

### US-07.02 — Calificación y riesgo (🚧 bloqueada desde el 2026-10-30, plan incluido · decisiones de producto aprobadas el 2026-10-30 · sin plan)

**🚧 Bloqueada desde el 2026-10-30, plan incluido, junto con US-07.03** (decisión del usuario): no se escribe su
plan hasta que un abogado revise el
[contexto legal de ADR-14](Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) o el usuario decida otra
cosa ([detalle](Fases/fase-5-us07-scoring.md#bloqueo-de-us-0702-y-us-0703-2026-10-30)). Las preguntas de producto
quedaron respondidas el 2026-10-30
([resumen](Fases/fase-5-us07-scoring.md#decisiones-de-producto-de-us-0702-2026-10-30)), incluida la
**corrección de un cierre dentro de 7 días**, que se construye aquí, y siguen vigentes. Cuando se desbloquee: el
plan (paso 4 del [Plan de ejecución de ADR-14](Decisions/ADR-14.md#plan-de-ejecución)) y, antes de
**implementar**, corregir [DT-47](Deudas/DT-47.md).

> *Antes (2026-10-30, hasta el bloqueo; el título decía "⏸ v2"):* "**Siguiente paso de la fase:** el plan de
> US-07.02 (paso 4 del Plan de ejecución de ADR-14). Las preguntas de producto ya no lo bloquean […]. Antes de
> implementar US-07.02 hacen falta la revisión legal (sin abogado al 2026-10-30) y corregir DT-47."

**Observación, sin decidir:** la corrección de un cierre ([DT-48](Deudas/DT-48.md)) y la lista de citas pasadas
sin cerrar no perfilan al paciente; **podrían separarse de US-07.02** si el usuario lo quiere.

**Candidata, sin US ni número** (lo decide el usuario): la **lista de citas pasadas sin cerrar** (pregunta 2 de
[Q6](PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1)). No perfila a nadie,
no depende de la revisión legal y podría adelantarse.

### Backend
*(Lo que sigue es US-07.02 y US-07.03, sin plan y 🚧 bloqueadas desde el 2026-10-30. El punto 2 lo reemplaza
[ADR-14](Decisions/ADR-14.md): cuatro etiquetas.)*
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
> después, con una fecha de corte. *(2026-10-19: el job G1 se construye en US-07.01, arriba. 2026-10-20: en
> producción, apagado. 2026-10-27: prendido; DT-11 cerrada.)* **Lo que no se reconstruye es la asistencia real**
> ([DT-30](Deudas/DT-30.md)): desde el 2026-10-05 el voucher la registra (mitigada), así que esta fase
> arrancará sin el historial de asistencia anterior a esa fecha.

---

## Fase 6 — US-08: Monitoreo y seguimiento del paciente

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fases-6-us09-sin-diseno.md`](Fases/fases-6-us09-sin-diseno.md#fase-6--us-08-monitoreo-y-seguimiento-del-paciente).

**Estado:** 🔶 solo `POST /pacientes` y, desde la Fase 2 (en producción), `PATCH /pacientes/:id` (teléfono y correo).

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

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fase-7-us10-perfil.md`](Fases/fase-7-us10-perfil.md).

**Estado:** 🔶 **implementada el 2026-11-01, en `develop` (staging) con el release a `main` abierto; cierre pendiente
de las pruebas manuales y de [Q18](PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free) y
[Q19](PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte).** El diseño técnico está en [ADR-15](Decisions/ADR-15.md)
(**aceptado** el 2026-10-31; [notas de implementación](Decisions/ADR-15.md#notas-de-implementación-2026-11-01)) y el
contrato, en el plan [US-10](US/10-perfil-cuenta.md). `npm test` (131 suites, 2385 tests), integración (13
suites, 253 tests) y e2e (18 suites, 379 tests) en verde, con la autorización del usuario. Las preguntas abiertas del plan **siguen sin respuesta**: el código usa los
valores provisionales y, sin `SOPORTE_CORREO_DESTINO`, los mensajes a soporte se guardan y esperan en `pendiente`
(staging y production). Rama del backend: `feature/fase7-perfil-cuenta` (sale de `docs/fase5-decisiones-us0702`, cuyo
PR #14 se mergeó directo a `main`); llega a `develop` por fast-forward. No depende de ninguna otra fase.

> *Antes:* 🔶 en diseño (2026-10-31), ADR-15 propuesto, sin implementar · *antes (hasta el 2026-10-31):* ⬜ nada.

### Decisiones (usuario, 2026-10-31)

| # | Tema | Decisión |
|---|---|---|
| P1 | Datos del perfil | `especialidad` texto libre opcional (≤ 100). **Sin foto**: avatar con iniciales ([DT-57](Deudas/DT-57.md)) |
| P2 | Correo | **solo lectura** (es la credencial del login y no está verificado, [DT-03](Deudas/DT-03.md)); se editan el nombre y la especialidad |
| P3 | Organización | nombre y enlace público **en lectura**; el slug nunca se edita; el nombre editable, después ([DT-58](Deudas/DT-58.md)) |
| P4 | Suscripción | lectura de lo que hay, **solo el administrador** (un profesional, 403): plan legible, alta, renovación y método de pago vacíos, *"Sin cobro durante el piloto"*. Sin tabla nueva |
| P5 | Contraseña | exige la actual; nueva ≥ 8 y distinta; **corta las demás sesiones** (`usuarios.sesiones_validas_desde`) y la actual recibe un token nuevo; límite de tasa; sin correo de aviso |
| P6 | Contraseña olvidada | **fuera** de la fase ([DT-03](Deudas/DT-03.md)), a decidir con el P1 de [Cumplimiento](#cumplimiento-ley-21719--transversal) |
| P7 | Soporte | se guarda en `mensajes_soporte` y se envía por correo a una casilla configurable; ≤ 2000 caracteres; límite de tasa; aviso de no incluir datos de pacientes |
| P8 | Módulos | `usuario` (`/usuarios/me`), `tenant` (suscripción) y un módulo nuevo `soporte` |

### Backend
*(Diseño en [ADR-15](Decisions/ADR-15.md); contrato, orden por agente y Definición de Terminado en
[US-10](US/10-perfil-cuenta.md#orden-de-construcción). 2026-11-01: piezas 1 a 6 implementadas; desvíos en el
[plan](US/10-perfil-cuenta.md#desvíos-de-la-implementación-2026-11-01). Antes, todo ⬜.)*

| # | Pieza | Decisión | Agente | Estado |
|---|---|---|---|---|
| 1 | Obtener perfil: `GET /api/usuarios/me` | nombre, correo, especialidad, rol y la organización (nombre y slug: el frontend arma el enlace); los mismos campos que el login. *Sin foto* (P1) | api | ✅ 2026-11-01 |
| 2 | Actualizar perfil: `PATCH /api/usuarios/me` | solo nombre (1 a 120) y especialidad (≤ 100) (P2); migración `1750000019000` | database → api | ✅ 2026-11-01 |
| 3 | Consultar suscripción: `GET /api/organizacion/suscripcion` | plan legible ([Q18](PREGUNTAS-ABIERTAS.md#q18--nombre-legible-del-plan-free); provisional *Plan piloto*), alta, *renovación y método de pago en `null`*; 403 si no es administrador (P4) | api | ✅ 2026-11-01 |
| 4 | Cambio de contraseña: `PUT /api/usuarios/me/contrasena` | valida la actual (400 si no coincide, nunca 401); corta las demás sesiones con la estrategia JWT consultando la base en cada petición y devuelve un token nuevo (P5, cierra la parte de revocación de [DT-01](Deudas/DT-01.md)) | database → backend → api | ✅ 2026-11-01 |
| 5 | Soporte: `POST /api/soporte/mensajes` | tabla `mensajes_soporte` (migración `1750000020000`) y un job que envía cada minuto a `SOPORTE_CORREO_DESTINO` ([Q19](PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte); sin ella, los mensajes esperan en `pendiente`), *Responder a* = el profesional; tope de 5 por organización en 24 h (P7) | database → backend → api | ✅ 2026-11-01 |
| 6 | Límite de tasa | cubos `cambioContrasena` y `soporte`, 5 por hora por IP | backend | ✅ 2026-11-01 |
| 7 | Tests | la [Definición de Terminado](US/10-perfil-cuenta.md#definición-de-terminado) | testing | ✅ unitarios (131 suites, 2385 tests), integración (13 / 253) y e2e (18 / 379) |

### Frontend
*(Detalle en el [plan § Frontend](US/10-perfil-cuenta.md#frontend-citia-frontend-en-vue). Su estado no se registra en
este repo; al 2026-10-31, todo ⬜.)*

1. Menú "Mi Perfil" (ruta `/perfil`).
2. Vista central con pestañas (info personal / suscripción, **solo el administrador** / seguridad).
3. Formulario info personal: nombre y especialidad; correo, organización y enlace en lectura; avatar con iniciales.
4. Sección suscripción (lectura).
5. Formulario cambio de contraseña: reemplaza el token y avisa que se cerraron las demás sesiones.
6. Botón "Contactar soporte" + modal, con el aviso de no incluir datos de pacientes.

### Integración
- Conectar todo con sus APIs; el perfil refresca la sesión guardada (`citia.user`).
- Se despliega **primero el backend** y después el frontend.
- Antes del release a `main`: responder [Q19](PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) y cargar
  `SOPORTE_CORREO_DESTINO` (es opcional: sin ella los mensajes esperan guardados). *(2026-11-01: el release se abrió
  **sin** respuesta a Q19; en production los mensajes esperarán en `pendiente` y el arranque dejará el `warn`
  `soporte.sin_destino` hasta cargar la variable.)*
- *(2026-11-01)* El frontend debe aceptar el `message` de un 400 como texto (errores de dominio, en español) **o** como
  lista (validación, en inglés) ([ADR-15, nota 6](Decisions/ADR-15.md#lo-que-toca-una-decisión-de-este-adr)).

**Entregable:** el profesional gestiona su cuenta y contacta soporte.

> **Deudas** ([guía de la fase](Fases/fase-7-us10-perfil.md#deudas)): nuevas [DT-57](Deudas/DT-57.md) y
> [DT-58](Deudas/DT-58.md) (aplazadas) y [DT-59](Deudas/DT-59.md) (prevista; **abierta** desde la implementación del
> 2026-11-01); [DT-01](Deudas/DT-01.md) se cierra en parte (implementado); detectadas al implementar:
> [DT-60](Deudas/DT-60.md) y [DT-61](Deudas/DT-61.md), 🟡 bajas; [DT-46](Deudas/DT-46.md) sigue abierta; notas en DT-02,
> DT-03, DT-26, DT-36, DT-52, DT-53 y DT-56. **Contradicciones** con lo pedido, en el
> [plan](US/10-perfil-cuenta.md#contradicciones-con-lo-pedido) (el envío "vía outbox" sale por un job; dos migraciones).

---

## US-09 — (pendiente de definir)

> Guía de lectura de la fase (ADRs, deudas, FDs, commits): [`Fases/fases-6-us09-sin-diseno.md`](Fases/fases-6-us09-sin-diseno.md#us-09--sin-definir).

**Estado:** ⬜ pendiente.

> Título y subtareas técnicas aún sin definir. Se completa cuando exista el detalle.

---

## Cumplimiento (Ley 21.719) — transversal

> **No es una fase**: toca a todo el sistema y no tiene US. El estado vivo, los roles, la vigencia y las preguntas
> para el abogado están en [`Cumplimiento/`](Cumplimiento/README.md). **Nada de esto es una opinión legal**: sale de
> un pre-análisis hecho con una IA el 2026-10-30, y al 2026-10-31 el usuario no tiene abogado.

**Estado:** ⬜ documentado el 2026-10-31; nada redactado ni implementado. **Límite:** la **primera clínica con
pacientes reales**, no "producción": Citia ya está en producción sin clínicas reales. **Fecha legal:** la Ley 21.719
rige el **2026-12-01** mientras no se publique la postergación (el Senado la aprobó el 2026-10-29 con la fecha
2027-10-15 y sigue en la Cámara); la Ley 19.628 y la Ley 20.584 ya rigen.

- **P1 — antes de la primera clínica con pacientes reales:** el contrato de encargo ([DT-51](Deudas/DT-51.md)), el
  inventario de proveedores con sus DPA y transferencias ([DT-52](Deudas/DT-52.md)), la política de privacidad y el
  procedimiento de derechos ([DT-53](Deudas/DT-53.md)), el alcance del art. 10 bis de la Ley 20.584
  ([DT-55](Deudas/DT-55.md)) y revisar el consentimiento de los recordatorios ([DT-16](Deudas/DT-16.md)). El
  aislamiento por clínica ✅ ya existe.
- **P2 — durante la preparación:** la conservación por finalidad ([DT-26](Deudas/DT-26.md)), la seguridad
  documentada, los incidentes y el programa interno ([DT-56](Deudas/DT-56.md)), los menores de edad
  ([DT-54](Deudas/DT-54.md)) y el registro de proveedores al día ([DT-52](Deudas/DT-52.md)).
- **P3 — antes de desbloquear US-07.02 y US-07.03:** lo del
  [contexto legal de ADR-14](Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado): finalidad sanitaria y base
  jurídica, evaluación de impacto, información al paciente e intervención humana real
  ([Fase 5](#fase-5--us-07-calificación-de-asistencia-scoring)).

**Decisión pendiente del usuario:** si **P1 es condición** para recibir la primera clínica con pacientes reales.
Tampoco están decididos quién es el responsable de cumplimiento ni cuándo redactar la política de privacidad y el
contrato ([detalle](Cumplimiento/README.md#lo-que-el-usuario-no-ha-decidido)).

---

## Resumen

| Fase | US | Depende de | Estado |
|---|---|---|---|
| 0 | US-06 Dashboard | US-02 | ✅ cerrada · sin mock (2026-10-05) · en producción |
| 1 | US-02 Gestión de citas | — | ✅ cerrada (develop 2026-09-28) · en producción (2026-10-04) · US-02.07 ⏸ aplazada |
| 2 | US-03 Recordatorios | US-02, ADR-12 (outbox + planificador), subdominio verificado en Resend | ✅ **cerrada en producción (2026-10-07)** · release 2026-10-06 · **en el MVP** · [pendientes posteriores](#pendientes-posteriores-al-cierre) |
| 3 | US-04 Respuesta paciente (+ US-02.07) | US-03 ✅, ADR-10 ✅ (aceptado 2026-10-14) | ✅ **en producción (2026-10-17)** · cierre pendiente de las pruebas manuales · fuera del MVP · [us04](Features/us04-respuesta-paciente.md) · [checklist](Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción) |
| 4 | US-05 Alertas | US-02/03/04 | ⬜ (el outbox ya existe) |
| 5 | US-07 Scoring (US-07.01 · 07.02 · 07.03) | US-02/04, proceso de cierre (ADR-12), asistencia registrada (DT-30) · **US-07.01 adelanta a la Fase 4 sin depender de ella** | 🔶 **US-07.01 en producción (2026-10-20)**, job G1 prendido (2026-10-27), pruebas manuales en curso · [plan](US/07.01-registro-hechos.md) · US-07.02 y US-07.03 🚧 **bloqueadas, plan incluido** (2026-10-30), hasta la revisión de un abogado; fuera del MVP desde el 2026-09-30; decisiones de producto de US-07.02 aprobadas (2026-10-30) y vigentes · siguiente paso: cerrar US-07.01 · *antes: ⏸ v2; siguiente paso: el plan de US-07.02* |
| 6 | US-08 Monitoreo | US-02/07 | 🔶 solo alta y `PATCH` de contacto |
| 7 | US-10 Perfil/soporte | — | 🔶 **implementada (2026-11-01)**, en `develop` (staging) con el release a `main` abierto · cierre pendiente de las pruebas manuales y de Q18/Q19 · tests en verde · [ADR-15](Decisions/ADR-15.md) aceptado · [plan](US/10-perfil-cuenta.md) · *antes: 🔶 en diseño (2026-10-31); antes: ⬜* |
| — | US-09 | — | ⬜ pendiente |

> **Transversal (2026-10-31):** [Cumplimiento (Ley 21.719)](#cumplimiento-ley-21719--transversal) — ⬜ documentado,
> nada redactado ni implementado; P1 antes de la primera clínica con pacientes reales (si es condición para
> recibirla, sin decidir); P3 es la condición del 🚧 de US-07.02 y US-07.03.

## Decisiones previas

1. ~~Canal de recordatorios (Fase 2)~~ → **resuelta 2026-09-30**: correo; WhatsApp/SMS después ([ADR-13](Decisions/ADR-13.md)).
2. ~~Proveedor de email (Fase 2 y 4)~~ → **resuelta 2026-09-30**: Resend (Brevo y SendGrid descartados).
3. Tiempo real (Fase 4): WebSockets vs SSE.
4. ~~Planificador/cola de jobs (Fases 2 y 5)~~ → **resuelta 2026-09-30**: planificador en proceso sobre
   Postgres con `SKIP LOCKED`, sin Redis ([ADR-12](Decisions/ADR-12.md)).
5. ~~Enlace por cita (Fases 1 y 3): aceptar [ADR-10](Decisions/ADR-10.md) tras
   [Q11](PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) y la seguridad del enlace, incluido si el correo ofrece "cambiar hora" además de
   confirmar/cancelar ([FD-06](Frontend-Decisions/FD-06.md)). **Es lo que bloquea arrancar la Fase 3**
   (2026-10-07).~~ → **resuelta 2026-10-14**: ADR-10 aceptado con Q11 = B y los requisitos S1–S3 y de
   límite de tasa. El correo lleva un solo botón (*Ver o responder mi hora*); la página permite confirmar,
   cancelar y **pedir otra hora** como petición manual; elegir entre horarios disponibles queda para después.
   Plan en [US-04](US/04-respuesta-paciente.md).
6. ~~FD-01 vs ADR-09~~ → **resuelta 2026-09-29**: el enlace solo envía una solicitud (ADR-09).
7. ~~Límite de tasa antes de desplegar~~ → **resuelta 2026-09-29**: se sigue sin límite por ahora (DT-18).
   *(2026-10-14: la Fase 3 lo construye para el enlace, el login, el registro y la solicitud pública.
   2026-10-17: en production con el release de la Fase 3.)*
8. [ADR-08](Decisions/ADR-08.md) (tenant en URL): la fase 1 ya se aplica en la ruta pública
   (ADR-09 §11.b); falta el login. Ya no bloquea la Fase 3.
9. ~~Hosting y entornos (Fase 2)~~ → **resuelta 2026-10-04**: backend + Postgres en Railway, SPA en Netlify,
   DNS en Cloudflare; un entorno por rama (staging ← `develop`, production ← `main`). Aplicada y verificada
   el 2026-10-07 ([stack § Mapa de entornos](stack-tecnologico.md#mapa-de-entornos)).
10. ~~Asistencia en el voucher~~ → **resuelta 2026-10-05**: se agrega ya, sin esperar a la Fase 3
    ([DT-30](Deudas/DT-30.md) mitigada).
11. Pendientes del usuario que dejó la Fase 2, ninguna bloqueante:
    [Q12–Q15](PREGUNTAS-ABIERTAS.md#fase-2--decisiones-pendientes-tras-implementar-2026-10-04)
    (`/recordatorios` para `recepcion`, textos y colores de los estados, vista *Contacto*, reinicio de la
    cuota mensual de Resend).
