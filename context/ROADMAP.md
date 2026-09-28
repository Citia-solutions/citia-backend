# Roadmap — Citia

Hoja de ruta de las historias de usuario (US-02 a US-10). Sirve para tener el orden, las
dependencias y el estado real de cada pieza en un solo lugar.

**Última revisión:** 2026-09-25 (cierre de Fase 1)

## Convenciones

- ✅ hecho · 🔶 parcial · ⬜ pendiente · 🚧 bloqueado · ⏸ aplazado.
- Cada fase es entregable y testeable por sí sola.
- Orden por dependencias: US-02 (+ US-06 en paralelo) → US-03 → US-04 → US-05 → US-07 → US-08.
  US-10 no depende de nada y puede entrar en cualquier momento. US-09 sigue sin definir.
- Auth y registro (US-00a/US-00b) quedan fuera: ya están cerrados (ver
  [Features/us00a-registro-inicial.md](Features/us00a-registro-inicial.md) y
  [Features/us00b-login.md](Features/us00b-login.md)).
- La solicitud pública de hora del paciente (`/agendar-cita`) **sí** está implementada, pero se
  sigue en [ADR-09](Decisions/ADR-09.md) y no como fase propia (ver Fase 1 → Vía pública).
- Las deudas técnicas viven en [Deudas/](Deudas/); aquí solo se citan las que bloquean una fase.

---

## Fase 0 — US-06: Dashboard de citas del día (RF-03)

**Estado:** ✅ UI conectada al backend real (solo falta la prueba manual de US-02.09).

### Hecho
- Layout del dashboard (sidebar, topbar, métricas, lista "Citas de hoy", badges de estado).
- UI de citas del día con paciente, hora, duración, tipo de consulta y estado.
- ✅ Conectado a `GET /citas/hoy` real (las métricas del diseño siguen en el mock de `dashboardApi.ts`).
- ✅ Clic en una cita → voucher con reagendar/cancelar ([US-02.08](US/02.08-voucher-cita.md)).
- ✅ Citas pasadas marcadas visualmente (tachado) en `TodayAppointments.vue`.

### Pendiente
- 🔶 Prueba manual contra el backend real de que los cambios se reflejan
  ([US-02.09](../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md)).

> Depende de US-02 (la lista real de citas).

---

## Fase 1 — US-02: Gestión de cita

**Estado:** ✅ implementada en ambos lados (2026-09-25, rama `feature/us02-cierre-fase1`, sin commit).
Solo falta la **prueba manual contra Postgres**. US-02.07 (lado paciente) quedó **fuera de la v1**
(Q11 → C). Detalle en [Features/us02-gestion-citas.md](Features/us02-gestion-citas.md) § "Cierre de Fase 1".

### Subtareas

| Subtarea | Lado | Estado |
|---|---|---|
| [US-02.07](US/02.07-paciente-reagenda-cancela.md) — el paciente cancela o pide reagendar | paciente | ⏸ aplazada fuera de la v1 (Q11 → C); pasa a la Fase 3 con US-04 |
| [US-02.08](US/02.08-voucher-cita.md) — voucher con reagendar y cancelar | profesional | ✅ mergeada en `develop` |
| [US-02.09](../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) — el dashboard refleja los cambios | profesional (solo front) | ✅ mergeada · falta prueba manual |
| Agenda semanal + lista ([agenda-profesional](../../citia-frontend/context/Features/agenda-profesional.md)) | profesional | ✅ implementada, sin commit |
| Bandeja de solicitudes ([bandeja-solicitudes](../../citia-frontend/context/Features/bandeja-solicitudes.md)) | profesional | ✅ implementada, sin commit |
| Aviso de solapamiento ([ADR-11](Decisions/ADR-11.md), cierra DT-12 en diseño) | profesional | ✅ implementado, sin commit |

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
- 🔶 Migración `1750000007000-AddResueltaEnASolicitudesCita` creada, **sin aplicar**.

### Frontend
- ✅ Modal "Nueva cita" (crear).
- ✅ Detalle de cita con acciones (voucher, US-02.08).
- ✅ Reagendar y cancelar (UI).
- ✅ Reflejar cambios en el dashboard tras crear/reagendar/cancelar (US-02.09).
- ✅ Agenda del profesional: vista semanal + lista (`/agenda`).
- ✅ Bandeja de solicitudes con aceptar/rechazar (`/solicitudes`) y contador en el sidebar.
- ✅ Aviso no bloqueante de solapamiento al crear, reagendar y aceptar.
- ✅ Botón "Copiar enlace de agenda", con advertencia mientras siga abierta DT-18.

### Vía pública (solicitud del paciente — [ADR-09](Decisions/ADR-09.md))
- ✅ `POST /publico/:tenantSlug/solicitudes`: el paciente **pide** hora, no reserva.
- ✅ Frontend: flujo multi-paso `/agendar-cita`
  ([agendar-cita-paciente](../../citia-frontend/context/Features/agendar-cita-paciente.md)).
- 🚧 Publicarla fuera del equipo requiere [DT-18](Deudas/DT-18.md) (límite de tasa).
- ⚠️ **Contradicción abierta:** [FD-01](Frontend-Decisions/FD-01.md) (tomada 2026-09-10) dice que el
  enlace **reserva** la hora al instante; ADR-09 y el código de ambos repos implementan que el
  paciente **pide** y el profesional acepta en la bandeja. Hay que decidir cuál rige: si gana FD-01,
  hace falta un modelo de disponibilidad y la bandeja pasa a ser opcional.

### Integración
- ✅ Modal, voucher, agenda y bandeja conectados según el contrato.
- ⬜ **Prueba manual completa contra Postgres**: aplicar la migración; crear hoy y mañana; cancelar;
  reagendar dentro de hoy y a otro día; aceptar y rechazar una solicitud; comprobar el solapamiento.
- ⬜ Suites que requieren BD: `auth-login`, `citas-dashboard`, `app`, integración de registro, más
  las que recomienda [DT-20](Deudas/DT-20.md) (`FOR UPDATE` concurrente, `NULLS LAST`, migración).

**Entregable:** el profesional ve su agenda, abre el detalle, reagenda y cancela, atiende las
solicitudes de sus pacientes y ve los choques de horario, todo reflejado.

---

## Fase 2 — US-03: Recordatorios al paciente

**Estado:** ⬜ nada.

### Backend
1. Modelo de configuración de recordatorios por profesional (tiempos + canal).
2. Modelo de recordatorios por cita con estado de envío.
3. API para guardar/actualizar configuración.
4. Lógica para programar recordatorios según fecha/hora de la cita.
5. Generación del contenido (fecha, hora, profesional, medio de respuesta).
6. Envío por canal (email como base; WhatsApp/SMS después).
7. Registro de estado: enviado / entregado / fallido.
8. Reintento automático ante fallo.
9. Actualizar/cancelar recordatorios pendientes al reagendar/cancelar (vínculo con US-02).

### Frontend
1. Interfaz para configurar tiempos de envío.
2. Interfaz para elegir canal (WhatsApp/SMS/email).
3. Vista de estado de recordatorios por cita.

### Integración
- Conectar configuración con API.
- Conectar cambios de cita → actualización de recordatorios.

**Entregable:** el profesional configura recordatorios; el sistema los programa y envía; refleja reagendar/cancelar.

> Requiere decidir canal (email primero recomendado), proveedor de envío (Resend/SendGrid) y el
> **planificador/cola de jobs** (puntos 4 y 8; ver [Q6](PREGUNTAS-ABIERTAS.md) y RNF-03).

---

## Fase 3 — US-04: Respuesta del paciente

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

> Depende de la Fase 2 (el recordatorio es lo que lleva el enlace) y de que se **acepte ADR-10**
> (bloqueado por [H7 y Q11](PREGUNTAS-ABIERTAS.md)). **No** depende de ADR-08: el enlace no lleva
> `tenantSlug`. Para publicarlo hace falta [DT-18](Deudas/DT-18.md).

---

## Fase 4 — US-05: Alertas al profesional

**Estado:** ⬜ solo existe el puerto `PublicadorEventos`, sin suscriptores.

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

**Estado:** ⬜ nada.

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

> El punto 4 depende del **proceso de cierre** y su planificador ([Q6](PREGUNTAS-ABIERTAS.md)).
> Mientras no exista, el historial no se acumula ([DT-11](Deudas/DT-11.md)) y no se puede
> reconstruir hacia atrás: es la dependencia más urgente del roadmap aunque la fase vaya quinta.

---

## Fase 6 — US-08: Monitoreo y seguimiento del paciente

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

**Estado:** ⬜ pendiente.

> Título y subtareas técnicas aún sin definir. Se completa cuando exista el detalle.

---

## Resumen

| Fase | US | Depende de | Estado |
|---|---|---|---|
| 0 | US-06 Dashboard | US-02 | ✅ conectado · falta prueba manual US-02.09 |
| 1 | US-02 Gestión de citas | — | ✅ falta prueba manual con Postgres · US-02.07 ⏸ aplazada |
| 2 | US-03 Recordatorios | US-02, planificador (Q6) | ⬜ |
| 3 | US-04 Respuesta paciente (+ US-02.07) | US-03, ADR-10 | ⬜ |
| 4 | US-05 Alertas | US-02/03/04 | ⬜ (solo puerto) |
| 5 | US-07 Scoring | US-02/04, proceso de cierre (Q6) | ⬜ |
| 6 | US-08 Monitoreo | US-02/07 | 🔶 solo alta |
| 7 | US-10 Perfil/soporte | — | ⬜ |
| — | US-09 | — | ⬜ pendiente |

## Decisiones previas

1. Canal de recordatorios (Fase 2): email primero vs WhatsApp/SMS.
2. Proveedor de email (Fase 2 y 4): Resend/SendGrid.
3. Tiempo real (Fase 4): WebSockets vs SSE.
4. **Planificador/cola de jobs** (Fases 2 y 5): temporizador en proceso vs cola con reintentos
   ([Q6](PREGUNTAS-ABIERTAS.md)). Lo necesitan el proceso de cierre y los recordatorios; decidir si
   se paga la cola ahora o después.
5. Enlace por cita (Fases 1 y 3): aceptar [ADR-10](Decisions/ADR-10.md) tras
   [H7 y Q11](PREGUNTAS-ABIERTAS.md), incluido si el correo ofrece "cambiar hora" además de
   confirmar/cancelar ([FD-06](Frontend-Decisions/FD-06.md)).
6. **FD-01 vs ADR-09** (Fase 1, vía pública): ¿el enlace reserva o solo pide? Ver arriba.
7. [ADR-08](Decisions/ADR-08.md) (tenant en URL): la fase 1 ya se aplica en la ruta pública
   (ADR-09 §11.b); falta el login. Ya no bloquea la Fase 3.
