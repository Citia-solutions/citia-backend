# US-02 — Gestión de citas

**Estado:** ✅ Release 1 (2026-08-23) · ✅ Vía pública del paciente (2026-09-10) · ⚠️ bandeja pendiente
**Commits:** `f2a7dff` (release 1 + RUT + conexión con el frontend), `e1253c3` (vía pública)
**ADRs:** **[09](../Decisions/ADR-09.md)** · extiende [04](../Decisions/ADR-04.md) · adopta la fase 1 de [08](../Decisions/ADR-08.md) en la ruta pública · replica [06](../Decisions/ADR-06.md)

---

## Qué hace

> *Como profesional de la salud quiero crear, editar, reagendar y cancelar citas para mantener mi
> agenda actualizada.*

Dos vías de entrada que producen cosas **distintas**:

| Vía | Quién | Qué produce |
|-----|-------|-------------|
| Botón "nueva cita" | profesional autenticado | una **cita** en la agenda |
| Enlace público | paciente, sin cuenta | una **solicitud**, que no toca la agenda |

Separar *quién teclea* de *quién decide* es la idea que sostiene todo el diseño: el paciente pide, el
profesional decide. Ver [ADR-09](../Decisions/ADR-09.md) para el razonamiento y las alternativas
descartadas.

Y esta US **desbloqueó la máquina de estados** de [ADR-04](../Decisions/ADR-04.md), que estaba
construida y era inalcanzable desde la API (era [DT-10](../Deudas/DT-10.md), ahora cerrada).

---

## Endpoints

### Autenticados (`JwtAuthGuard`)

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/citas` | Agenda una cita. Resuelve-o-crea el paciente por RUT. |
| `PATCH` | `/api/citas/:id/confirmar` | El paciente confirma |
| `PATCH` | `/api/citas/:id/cancelar` | Cancela (acepta `motivo`) |
| `PATCH` | `/api/citas/:id/asistencia` | Asistió |
| `PATCH` | `/api/citas/:id/inasistencia` | Confirmó y no llegó |
| `PATCH` | `/api/citas/:id/reagendar` | Mueve la hora (acepta `motivo`) |
| `PATCH` | `/api/citas/:id` | Edita duración o tipo de consulta |
| `GET` | `/api/citas/:id` | **Detalle para el voucher** (US-02.08): cita + paciente + `accionesPermitidas` |
| `GET` | `/api/citas/:id/historial` | Bitácora de cambios de la cita |

`ghosting` **no se expone**: no lo dispara una persona, lo materializa el proceso de cierre
([DT-11](../Deudas/DT-11.md)), que todavía no existe.

**Códigos:** `409` transición ilegal · `404` cita inexistente **o de otro tenant** (no se distinguen:
revelar "existe pero no es tuya" filtraría información ajena) · `400` datos rechazados.

### Detalle de la cita (US-02.08)

`GET /api/citas/:id` — una sola llamada para pintar el voucher del profesional:

```json
{
  "id": "uuid",
  "estado": "confirmada",
  "inicio": "2026-09-25T13:00:00.000Z",
  "hora": "10:00",
  "duracionMin": 50,
  "tipoConsulta": "Terapia individual",
  "paciente": { "id": "uuid", "nombre": "…", "rut": "12.345.678-5", "telefono": "…", "correo": null },
  "accionesPermitidas": ["cancelar", "reagendar", "asistencia", "inasistencia", "editar"]
}
```

- **Filtra solo por el tenant del token**, igual que las transiciones. Que un profesional pueda ver
  la cita de un colega de su misma organización es la regla actual de todo el recurso; se decide
  para todas las rutas a la vez con [Q3](../PREGUNTAS-ABIERTAS.md).
- `hora` en la zona de la clínica ([ADR-07](../Decisions/ADR-07.md)); `rut` formateado para mostrar
  (reutiliza `PacientesService.aResponse`). **No** incluye `tenantId`, `usuarioId` ni
  `consentimiento`.
- **`accionesPermitidas` lo calcula la entidad `Cita`** con los mismos predicados `puede*` que usan
  las transiciones para lanzar el 409 — no hay tabla paralela ni en el service ni en el frontend. Si
  el grafo cambia, la pregunta y la transición cambian juntas. El vocabulario coincide con las rutas;
  `ghosting` nunca aparece:

| Estado | `accionesPermitidas` |
|---|---|
| `pendiente` | `confirmar, cancelar, reagendar, editar` |
| `confirmada` | `cancelar, reagendar, asistencia, inasistencia, editar` |
| `cancelada` · `asistio` · `no_asistio` · `ghosting` | *(vacío)* |

- **Es una pista para la interfaz, no una autorización.** Si el estado cambió entre la lectura y el
  clic, la transición responde 409 y el cliente recarga el detalle. Por eso las respuestas de las
  transiciones **no** incluyen `accionesPermitidas`: el cliente vuelve a pedir el detalle.
- El `404` incluye el id en el mensaje (`Cita "<id>" no encontrada`): es idéntico para "no existe" y
  "de otro tenant" con la **misma URL**, que es lo que importa.
- Si la cita existe pero su paciente no (invariante rota), responde **500**, no 404: es un fallo de
  integridad, no un error del cliente.
- Crecerá sin romperse: [ADR-10](../Decisions/ADR-10.md) (propuesto, US-02.07) le sumará la marca de
  petición de reagendamiento abierta.

### Pública (sin autenticación)

| Método | Ruta |
|--------|------|
| `POST` | `/api/publico/:tenantSlug/solicitudes` |

Cuerpo — **campos provisionales** ([ADR-09 §10](../Decisions/ADR-09.md)), a confirmar cuando el
formulario del frontend se cierre:

```json
{
  "rut": "11.111.111-1",
  "nombrePaciente": "Paciente Público",
  "telefono": "+56 9 5555 5555",
  "correo": "publico@mail.com",
  "motivo": "Dolor de muela desde el lunes",
  "preferenciaHoraria": "viernes, 18 de septiembre a las 10:00",
  "consentimiento": true
}
```

**Responde `202` con un mensaje fijo, siempre.** Solo devuelve `400` si el RUT no pasa el dígito
verificador o falta un campo.

---

## El RUT como identidad del paciente

`shared/domain/rut.ts` — `normalizarRut`, `esRutValido` (módulo 11), `formatearRut`. Puro, sin
dependencias, mismo molde que `slug.ts` y `timezone.ts`.

Es la única pieza del sistema **verificable sin consultar nada**: el dígito verificador rechaza un
RUT inventado con aritmética. Cumple dos funciones a la vez:

1. **Identidad** — `PacientesService.resolverOCrear()` busca por RUT y vincula al paciente existente
   en vez de duplicarlo. El profesional rellena siempre los mismos campos sin saber si el paciente ya
   está. Eso neutraliza [DT-15](../Deudas/DT-15.md) para este flujo.
2. **Filtro de entrada** de la vía pública.

Se almacena **canónico** (`208929933`) y se devuelve **formateado** (`20.892.993-3`).

> **Límite conocido:** el algoritmo es público, así que valida la *forma*, no la *titularidad*. Ver
> [DT-23](../Deudas/DT-23.md).

---

## Reagendar y la bitácora

`Cita.reagendar(nuevoInicio)` **mueve** la cita conservando su id, y la **devuelve a `pendiente`**:
si el paciente había confirmado, confirmó *otra* hora, así que esa confirmación ya no vale.

Cada mutación escribe una fila en `cambios_cita` **dentro de la misma transacción**: si el cambio no
queda registrado, el cambio no ocurre. La tabla es append-only y guarda el antes/después del estado y
del inicio, el motivo y quién lo hizo.

> Esto salda la deuda que [ADR-04](../Decisions/ADR-04.md) dejó abierta
> ([DT-22](../Deudas/DT-22.md)): con "cancelar y crear otra", una cita movida tres veces serían cuatro
> filas sin vínculo entre sí, imposibles de interpretar para RF-08. Ahora *"¿cuántas veces se movió y
> quién la movió?"* es una consulta directa.

---

## Publicación de hechos

`shared/application/publicador-eventos.ts` — puerto opaco, mismo patrón que `TransactionRunner`.

Se publican `CitaCreada`, `CitaConfirmada`, `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida`,
`CitaReagendada`, `CitaEditada`. **Sin suscriptores todavía**: el adaptador de fase 1 solo deja
constancia en el log.

Es deliberado: US-03 (recordatorios) y US-05 (alertas) se enchufan después **sin volver a operar este
caso de uso**. Deuda asumida: [DT-27](../Deudas/DT-27.md) — el hecho se publica fuera de la
transacción, así que puede perderse. Hoy inofensivo porque nadie escucha.

---

## Esquema de BD

**`pacientes`** — migración `1750000004000`
`contacto` se renombró a `telefono` (rename, conserva datos) y se añadieron `correo` y `rut`, ambos
nullable. Índice único **parcial** `(tenant_id, rut) WHERE rut IS NOT NULL`, para que varios
pacientes sin RUT convivan.

**`cambios_cita`** — migración `1750000005000`
Bitácora append-only, sin `actualizado_en` a propósito. Índice `(cita_id, ocurrido_en)`.

**`solicitudes_cita`** — migración `1750000006000`
`usuario_id` nullable (el enlace es de la organización; el dueño se define al aceptar). `cita_id` sin
clave foránea a propósito: el módulo `solicitud` no depende del módulo `cita`. Índices
`(tenant_id, estado)` y `(tenant_id, rut, estado)`.

---

## Decisiones de seguridad

- **`tenantId` y `usuarioId` salen siempre del token**, nunca del cuerpo ([ADR-01 §2](../Decisions/ADR-01.md)).
- Al agendar con `pacienteId`, se verifica que el paciente **sea del mismo tenant**.
- La ruta pública **solo escribe en `solicitudes_cita`**; no toca `citas`, `pacientes` ni `usuarios`.
- **Respuesta uniforme en la ruta pública.** Si variara según si la organización existe o si ya hay
  una solicitud abierta, se podría sondear qué organizaciones hay y **qué RUT es paciente de qué
  profesional de la salud** — una filtración de otro orden que la enumeración de tenants que
  [ADR-03 §5](../Decisions/ADR-03.md) ya evita.
- **Anti-spam por RUT con ventana de tiempo** (`SOLICITUD_VENTANA_HORAS`, 72 por defecto): una
  solicitud abierta a la vez, pero solo cuentan las recientes. Así una bandeja desatendida deja de
  bloquear al paciente sin que nadie haga nada ([DT-28](../Deudas/DT-28.md)).

---

## Tests

| Archivo | Tipo | Cubre |
|---------|------|-------|
| `shared/domain/rut.spec.ts` | unit | módulo 11, normalización, formato |
| `cita/domain/cita.entity.spec.ts` | unit | grafo de estados + `reagendar` (incluida la vuelta a `pendiente`) y `editar` |
| `cita/application/citas.service.spec.ts` | unit | transiciones, bitácora, atomicidad, aislamiento por tenant |
| `paciente/application/pacientes.service.spec.ts` | unit | resolver-o-crear por RUT, RUT inválido, sin RUT |
| `solicitud/domain/solicitud-cita.entity.spec.ts` | unit | aceptar/rechazar y estados terminales |
| `solicitud/application/solicitudes.service.spec.ts` | unit | descarte silencioso, ventana de tiempo, RUT inválido |
| `cita/domain/cita.entity.spec.ts` (US-02.08) | unit | `accionesPermitidas` en los seis estados; cada acción anunciada no lanza y cada no anunciada lanza 409; tras reagendar desde `confirmada` vuelven las de `pendiente` |
| `cita/application/citas.service.spec.ts` (US-02.08) | unit | `detalle()`: filtra por tenant, 404 idéntico inexistente/otro tenant, sin campos internos ni RUT canónico, solo lectura |
| `test/citas-detalle.e2e-spec.ts` (US-02.08) | e2e **sin BD** | 401 sin token / token ajeno, 400 id no UUID, 200 forma exacta, 404 cuerpo idéntico, `/hoy` no colisiona con `/:id`, detalle → reagendar/cancelar → detalle |

**174 unit verdes, 13 suites.** El e2e de US-02.08 corre sin infraestructura: guard, estrategia JWT,
`ValidationPipe` y `CitasService` **reales**; solo los repositorios son en memoria (filtran por
tenant). Se ejecuta con `npm run test:e2e -- citas-detalle` (10/10). **No sustituye** al e2e contra
Postgres: el filtro por tenant del SQL real sigue sin observarse — ver [DT-20](../Deudas/DT-20.md).

Verificado además a mano contra el servidor: el resolver-o-crear devuelve el **mismo `pacienteId`**
al agendar dos veces con el mismo RUT, y la ruta pública responde idéntico en los tres casos
(válida / RUT repetido / organización inexistente) insertando **una sola fila**.

---

## Frontend

Conectado en `citia-frontend` (rama `feature/agendar-cita-paciente`):

- **Modal "nueva cita"** → `POST /api/citas`. Envía cita y paciente juntos; el backend deduplica por
  RUT.
- **Dashboard (US-02.09)** → `GET /api/citas/hoy`. La lista del día dejó de ser datos de prueba y
  adoptó los seis estados reales; se recarga al crear, al reagendar/cancelar desde el voucher y al
  volver el foco a la pestaña.
- **Voucher (US-02.08)** → `GET /api/citas/:id`, `PATCH …/reagendar`, `PATCH …/cancelar`. Los
  botones los gobierna `accionesPermitidas`; tras cada acción vuelve a pedir el detalle, y ante un
  409 muestra el mensaje y recarga. `motivo` acotado a 300 caracteres en ambos lados
  (`@MaxLength(300)` en `MotivoCitaDto` y `ReagendarCitaDto`; espejo en el front, `DTF-06`).
- **Flujo público del paciente** → `POST /publico/:tenantSlug/solicitudes`, en la ruta
  `/agendar-cita/:tenantSlug`. El paciente elige día y hora, pero viajan como **preferencia legible**
  (`"viernes, 18 de septiembre a las 10:00"`), no como reserva.

> El instante estructurado que el paciente eligió **se pierde** en esa conversión. Cuando exista la
> bandeja habrá que decidir si se agrega una columna nullable para prellenar la fecha al aceptar.

---

## Subtareas planificadas

Son **subtareas de esta historia**, no historias propias (sus archivos usan el prefijo `02.NN-`).

| Subtarea | Lado | Plan | Estado |
|----------|------|------|--------|
| **US-02.07** — el paciente cancela o pide reagendar | backend + frontend | [backend](../US/02.07-paciente-reagenda-cancela.md) · [frontend](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md) | ⛔ [ADR-10](../Decisions/ADR-10.md) **propuesto**; sin código hasta la revisión H7 y la respuesta a [Q11](../PREGUNTAS-ABIERTAS.md). [DT-18](../Deudas/DT-18.md) bloquea el primer enlace real |
| **US-02.08** — voucher de la cita (profesional) con reagendar y cancelar | backend + frontend | [backend](../US/02.08-voucher-cita.md) · [frontend](../../../citia-frontend/context/us/02.08-voucher-cita.md) | ✅ implementada (2026-09-24): `GET /api/citas/:id` + `accionesPermitidas` (ver [Detalle](#detalle-de-la-cita-us-0208)) y voucher en el front. Historial: segunda entrega |
| **US-02.09** — el dashboard refleja reagendar/cancelar | solo frontend | [frontend](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) | ✅ implementada (2026-09-24): lista del día real, recarga tras crear/reagendar/cancelar y al volver el foco |

> ⚠️ **Sin prueba manual contra el servidor real.** Las dos se verificaron por separado (backend con
> unit + e2e sin BD; frontend compilando y con respuestas simuladas en el navegador). Falta el
> recorrido completo con Postgres: crear hoy/mañana, cancelar, reagendar dentro de hoy y a otro día.

---

## Pendientes

| Qué | Nota |
|-----|------|
| **La bandeja** — listar, aceptar, rechazar solicitudes | El dominio ya lo soporta (`aceptar()`, `rechazar()`); faltan los endpoints. **Sin esto una solicitud entra y nadie la ve.** |
| Campos definitivos del formulario público | Provisionales. El DTO es el único archivo a tocar. |
| Enlace para compartir | Ninguna pantalla del dashboard le muestra al profesional su URL pública. |
| Límite de tasa | [DT-18](../Deudas/DT-18.md) — aplazado mientras el entorno sea local; **requisito de despliegue**. |
| Solapamiento y citas en el pasado | [DT-12](../Deudas/DT-12.md), [DT-13](../Deudas/DT-13.md) — decisión de producto pendiente. |
| `inicio` sin zona horaria en la entrada | [DT-14](../Deudas/DT-14.md) — resuelto del lado del cliente, el backend sigue aceptándolo. |

---

## Deudas técnicas asociadas

**Cerró:** [DT-10](../Deudas/DT-10.md) (máquina de estados inalcanzable) · [DT-22](../Deudas/DT-22.md) (sin vínculo entre citas reagendadas).

**Mitigó:** [DT-28](../Deudas/DT-28.md) (bandeja abandonada bloqueaba al paciente).

**Contrajo:** [DT-23](../Deudas/DT-23.md) · [DT-24](../Deudas/DT-24.md) · [DT-25](../Deudas/DT-25.md) · [DT-26](../Deudas/DT-26.md) · [DT-27](../Deudas/DT-27.md) · [DT-29](../Deudas/DT-29.md).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
