# Roadmap — Citia

Hoja de ruta de las historias de usuario (US-02 a US-10). Sirve para tener el orden, las
dependencias y el estado real de cada pieza en un solo lugar.
## Convenciones

- ✅ hecho · 🔶 parcial · ⬜ pendiente.
- Cada fase es entregable y testeable por sí sola.
- Orden por dependencias: US-02 → US-03 → US-04 → US-05 → US-07 → US-08 → US-10.
- El enlace público `/agendar-cita` y la reserva pública quedan **fuera** de este roadmap
  (ver [Frontend-Decisions/FD-01](../context/Frontend-Decisions/FD-01.md)).

---

## Fase 0 — US-06: Dashboard de citas del día (RF-03)

**Estado:** 🔶 UI implementada; integración con backend pendiente.

### Hecho
- Layout del dashboard (sidebar, topbar, métricas, lista "Citas de hoy", badges de estado).
- UI de citas del día con paciente, hora, duración, tipo de consulta y estado.

### Pendiente
- Conectar a `GET /citas/hoy` real (hoy usa mock en `dashboardApi.ts`).
- Clic en una cita → detalle con opciones de reagendar/cancelar.
- Marcar visualmente las citas pasadas (gris/tachado).

> Depende de US-02 (la lista real de citas).a
---

## Fase 1 — US-02: Gestión de cita

**Estado:** backend casi completo; front con modal crear + dashboard del día.

### Backend
- ✅ `POST /citas` (crear).
- ✅ `GET /citas/hoy`.
- ✅ `PATCH :id/confirmar|cancelar|asistencia|inasistencia|reagendar`.
- ✅ `GET :id/historial` (bitácora).
- ✅ Validación de transiciones por estado (máquina de estados en dominio).
- ⬜ `GET /citas` por rango/lista (para calendario; hoy solo existe `/hoy`).

### Frontend
- 🔶 Modal "Nueva cita" (crear) — hecho.
- ⬜ Lista/calendario de citas del profesional.
- ⬜ Detalle de cita con acciones.
- ⬜ Reagendar (UI).
- ⬜ Cancelar (UI).
- ⬜ Reflejar cambios en agenda tras crear/reagendar/cancelar.

### Integración
- 🔶 Modal conectado a `POST /citas` — hecho.
- ⬜ Conectar lista/calendario + acciones (reagendar/cancelar).
- ⬜ Validación del flujo completo.

**Entregable:** el profesional ve sus citas, abre detalle, reagenda y cancela, todo reflejado.

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

> Requiere decidir canal (email primero recomendado) y proveedor de envío (Resend/SendGrid).

---

## Fase 3 — US-04: Respuesta del paciente

**Estado:** ⬜ nada (diseño en [FD-06](../context/Frontend-Decisions/FD-06.md)).

### Backend
1. Enlaces públicos con token único para "Confirmar" y "Cancelar".
2. Modelo para registrar la respuesta (fecha/hora) → alimenta US-07.
3. API pública que procesa la respuesta usando el token.
4. Validación: rechazar/caducar tras la hora de la cita.
5. Marcar cita confirmada al confirmar.
6. Cancelar cita y liberar el bloque horario al cancelar.
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

> Depende de Fase 2 (recordatorios) y de ADR-08 (tenant/profesional en URL, sin implementar).

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
7. Conectar triggers de US-02 (reagendar/cancelar) y US-04 (confirmar/cancelar) → generan alerta.
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
| 0 | US-06 Dashboard | US-02 | 🔶 UI hecha, integración pendiente |
| 1 | US-02 Gestión de citas | — | 🔶 cerrar front + `GET /citas` |
| 2 | US-03 Recordatorios | US-02 | ⬜ |
| 3 | US-04 Respuesta paciente | US-03, ADR-08 | ⬜ |
| 4 | US-05 Alertas | US-02/03/04 | ⬜ (solo puerto) |
| 5 | US-07 Scoring | US-02/04 | ⬜ |
| 6 | US-08 Monitoreo | US-02/07 | 🔶 solo alta |
| 7 | US-10 Perfil/soporte | — | ⬜ |
| — | US-09 | — | ⬜ pendiente |

## Decisiones previas

1. Canal de recordatorios (Fase 2): email primero vs WhatsApp/SMS.
2. Proveedor de email (Fase 2 y 4): Resend/SendGrid.
3. Tiempo real (Fase 4): WebSockets vs SSE.
4. Reagendar desde el correo (Fase 3): ver FD-06 (decidir si se incluye "cambiar hora", no solo confirmar/cancelar).
5. ADR-08 (tenant en URL): prerrequisito para Fase 3.
