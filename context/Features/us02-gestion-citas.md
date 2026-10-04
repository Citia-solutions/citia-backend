# US-02 — Gestión de citas

> **Fase:** [Fase 1 — US-02](../Fases/fase-1-us02-gestion-citas.md) (origen), [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md), [Fase 3 — US-04](../Fases/fase-3-us04-respuesta-paciente.md) · **Feature:** este documento · **Plan:** [US-02.07](../US/02.07-paciente-reagenda-cancela.md), [US-02.08](../US/02.08-voucher-cita.md) · **Relacionado:** [ADR-09](../Decisions/ADR-09.md), [ADR-11](../Decisions/ADR-11.md), [ADR-10](../Decisions/ADR-10.md), [ADR-08](../Decisions/ADR-08.md), [DT-27](../Deudas/DT-27.md), [DT-29](../Deudas/DT-29.md)

**Estado:** ✅ Release 1 (2026-08-23) · ✅ Vía pública del paciente (2026-09-10) · 📐 cierre de Fase 1 diseñado (2026-09-25): agenda por rango, solapamiento, bandeja — [contrato](#cierre-de-fase-1--contrato-2026-09-25), sin implementar
**Commits:** `f2a7dff` (release 1 + RUT + conexión con el frontend), `e1253c3` (vía pública)
**ADRs:** **[09](../Decisions/ADR-09.md)** · **[11](../Decisions/ADR-11.md)** (solapamiento) · extiende [04](../Decisions/ADR-04.md) · adopta la fase 1 de [08](../Decisions/ADR-08.md) en la ruta pública · replica [06](../Decisions/ADR-06.md)

> **Nota (2026-09-30).** El cierre de Fase 1 **ya está implementado**: en `develop` desde el
> 2026-09-28 (`717800e` … `06858f2`, merge `abe9045`) y verificado contra Postgres. Donde este
> documento dice "sin implementar" o "falta implementar" (cabecera, § Cierre de Fase 1, § Pendientes)
> es el estado del 2026-09-25. Estado vigente y resumen del cierre en
> [Fases/fase-1-us02-gestion-citas.md](../Fases/fase-1-us02-gestion-citas.md#cierre-de-la-fase-resumen)
> y en el [ROADMAP](../ROADMAP.md#fase-1--us-02-gestión-de-cita). Los tests del cierre (`06858f2`) no
> están listados en § Tests.

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
| **US-02.07** — el paciente cancela o pide reagendar | backend + frontend | [backend](../US/02.07-paciente-reagenda-cancela.md) · [frontend](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md) | 🔵 **Aplazada fuera de la v1 (Q11 → C, 2026-09-25).** [ADR-10](../Decisions/ADR-10.md) queda propuesto y aplazado |
| **US-02.08** — voucher de la cita (profesional) con reagendar y cancelar | backend + frontend | [backend](../US/02.08-voucher-cita.md) · [frontend](../../../citia-frontend/context/us/02.08-voucher-cita.md) | ✅ implementada (2026-09-24): `GET /api/citas/:id` + `accionesPermitidas` (ver [Detalle](#detalle-de-la-cita-us-0208)) y voucher en el front. Historial: segunda entrega |
| **US-02.09** — el dashboard refleja reagendar/cancelar | solo frontend | [frontend](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) | ✅ implementada (2026-09-24): lista del día real, recarga tras crear/reagendar/cancelar y al volver el foco |

> ⚠️ **Sin prueba manual contra el servidor real.** Las dos se verificaron por separado (backend con
> unit + e2e sin BD; frontend compilando y con respuestas simuladas en el navegador). Falta el
> recorrido completo con Postgres: crear hoy/mañana, cancelar, reagendar dentro de hoy y a otro día.

---

## Cierre de Fase 1 — contrato (2026-09-25)

> **Estado:** ✅ diseñado · ⬜ sin implementar. Es el contrato con el que trabajan los sub-agentes de
> implementación **y** el frontend. Si algo de aquí cambia al implementar, se cambia aquí primero.
>
> **Estado (2026-09-30):** ✅ implementado y mergeado en `develop` el 2026-09-28. La recomendación
> separable de cerrar DT-14 **no** se aplicó: solo `AceptarSolicitudDto` usa `@IsInstanteConZona`.

**Decisiones de producto tomadas (no reabrir):**

1. **US-02.07 sale de la v1** (Q11 → C). [ADR-10](../Decisions/ADR-10.md) queda propuesto y aplazado.
2. **Solapamiento: avisar y permitir** (Q4) → [ADR-11](../Decisions/ADR-11.md).
3. **Agenda: vista semanal + lista** → `GET /api/citas?desde&hasta`.
4. **Bandeja de solicitudes**: listar, aceptar, rechazar ([ADR-09](../Decisions/ADR-09.md) §3 "Al
   aceptar", §10, §11).

Convenciones que aplican a todo lo de abajo: prefijo global `/api`; `JwtAuthGuard` en todas las rutas;
`tenantId` y `usuarioId` **siempre** del token (ADR-01 §2); `ValidationPipe` global con
`whitelist: true` (los campos desconocidos se descartan en silencio, no dan 400); cuerpo de error
estándar de Nest (`{ "statusCode", "message", "error" }`, con `message` como arreglo en los 400 de
validación).

### a) `GET /api/citas?desde=&hasta=` — agenda por rango

```
GET /api/citas?desde=2026-09-21&hasta=2026-09-27
Authorization: Bearer <token>
```

| Query | Tipo | Validación (`ListarCitasQueryDto`) |
|---|---|---|
| `desde` | `YYYY-MM-DD` | obligatorio · `@Matches(/^\d{4}-\d{2}-\d{2}$/)` · `@IsISO8601({ strict: true })` (rechaza `2026-02-30`) |
| `hasta` | `YYYY-MM-DD` | ídem |

Reglas (en `CitasService.listarEnRango`, error de aplicación `RangoFechasInvalidoError` → **400**):

- `hasta >= desde` · mensaje: `El parámetro "hasta" debe ser igual o posterior a "desde"`.
- Rango **inclusivo** de como máximo **42 días** (`MAX_DIAS_RANGO = 42`: seis semanas, lo que ocupa
  la grilla de un mes; la vista semanal usa 7) · mensaje: `El rango máximo es de 42 días`.

Semántica:

- **Días calendario de la clínica** (`APP_TZ`, ADR-07), no instantes. El backend convierte
  `[00:00 de desde, 00:00 del día siguiente a hasta)` en la zona de la clínica a instantes UTC. El
  cliente **no** calcula medianoches ni zonas: manda fechas. (Mismo criterio que `/hoy`, que ya
  resuelve el "día" en el servidor.)
- Entra una cita si su **`inicio`** cae en el rango (igual que `/hoy`; una cita que empieza el día
  anterior y termina en el rango no entra).
- **Alcance:** citas del **profesional del token** (`tenantId` + `usuarioId`), igual que `/hoy`. La
  agenda es del profesional hasta que [Q3](../PREGUNTAS-ABIERTAS.md) diga otra cosa.
- **Todos los estados**, sin filtro (igual que `/hoy`). Con el rango acotado, filtrar en el cliente
  es trivial; un filtro `estado` se puede **añadir** después sin romper nada.
- **Orden:** `inicio ASC`, desempate `creadoEn ASC` (con solapamientos permitidos, dos citas pueden
  empezar a la misma hora y el orden debe ser estable).
- Sin paginación: el tope de 42 días acota el volumen.

**200** — arreglo de `CitaDashboardDto`, **la misma forma que `GET /api/citas/hoy`**, con un campo
nuevo `fecha`:

```json
[
  {
    "id": "7c1e…",
    "pacienteNombre": "María González",
    "fecha": "2026-09-22",
    "hora": "10:00",
    "inicio": "2026-09-22T13:00:00.000Z",
    "duracionMin": 50,
    "tipoConsulta": "Terapia individual",
    "estado": "confirmada"
  }
]
```

- **`fecha` (nuevo, `YYYY-MM-DD` en la zona de la clínica)** se añade a `CitaDashboardDto`, así que
  aparece **también en `/hoy`**. Es aditivo: el frontend actual lo ignora. La vista semanal agrupa por
  `fecha` sin convertir zonas en el navegador (ADR-07: el backend proyecta, el cliente muestra).
- **Por qué esta forma y no la del detalle:** el frontend ya tiene el traductor (`toAppointment`) y
  el componente de lista; no expone contacto ni RUT en un listado (minimización); y
  `accionesPermitidas` es una pista por cita que envejece — el voucher la pide al abrir la cita, como
  hoy.

**Errores:** `401` sin token o token inválido · `400` falta `desde`/`hasta`, formato inválido,
fecha inexistente, `hasta < desde`, más de 42 días.

> Ruta `@Get()` sobre el controlador `citas`: no colisiona con `@Get(':id')` ni con `@Get('hoy')`.

### b) Aviso de solapamiento en las respuestas de cita

Política completa en [ADR-11](../Decisions/ADR-11.md). Resumen del contrato:

`CitaResponseDto` gana un campo **opcional** `avisos`:

```json
{
  "id": "a1b2…",
  "inicio": "2026-09-22T13:30:00.000Z",
  "duracionMin": 50,
  "tipoConsulta": "Control",
  "estado": "pendiente",
  "pacienteId": "p-9…",
  "paciente": { "…": "solo en POST /citas y al aceptar una solicitud, como hoy" },
  "avisos": {
    "solapamientos": [
      {
        "id": "7c1e…",
        "pacienteNombre": "María González",
        "fecha": "2026-09-22",
        "hora": "10:00",
        "inicio": "2026-09-22T13:00:00.000Z",
        "duracionMin": 50,
        "tipoConsulta": "Terapia individual",
        "estado": "confirmada"
      }
    ]
  }
}
```

| Ruta | ¿`avisos`? |
|---|---|
| `POST /api/citas` (201) | **siempre** (lista vacía si no hay choque) |
| `PATCH /api/citas/:id/reagendar` | **siempre** |
| `PATCH /api/citas/:id` (editar) | **siempre** (puede cambiar `duracionMin`) |
| `POST /api/solicitudes/:id/aceptar` | **siempre**, dentro de `cita` |
| `PATCH …/confirmar`, `…/cancelar`, `…/asistencia`, `…/inasistencia` | **no viene** |

- Cada elemento de `solapamientos` es un **`CitaDashboardDto`** (forma de `/hoy`, con `fecha`),
  ordenados por `inicio ASC`.
- Se cruzan: otra cita **distinta**, del **mismo tenant** y del **mismo profesional dueño de la
  cita** (`cita.usuarioId`), en estado **`pendiente` o `confirmada`**, con intervalos semiabiertos
  `[inicio, inicio + duracionMin)` que se intersectan. **Citas pegadas no se cruzan.**
- **No bloquea nunca:** mismo código de estado que hoy, nunca un error. Es mejor esfuerzo bajo
  concurrencia (ADR-11 §4).
- **Contrato actual intacto:** ningún campo existente cambia de nombre, tipo ni presencia.
- **Endurecimiento asociado:** `duracionMin` pasa a `@Max(1440)` en `CrearCitaDto`,
  `EditarCitaDto` y `AceptarSolicitudDto` (ADR-11 §2; da la cota inferior de la consulta). Más de
  1440 → 400.

Tipos para el frontend:

```ts
interface AvisosCita { solapamientos: CitaDashboardDto[] }        // CitaDashboardDto + fecha: string
interface CitaCreada      { /* …campos actuales… */ avisos: AvisosCita }   // POST /citas
interface CitaActualizada { /* …campos actuales… */ avisos?: AvisosCita }  // presente en reagendar/editar
```

### c) Bandeja de solicitudes (autenticada)

Controlador nuevo `SolicitudesController` en `solicitud/presentation/`, `@Controller('solicitudes')`
+ `@UseGuards(JwtAuthGuard)`. Convive con `SolicitudesPublicasController`
(`publico/:tenantSlug/solicitudes`) sin colisión.

**La bandeja es de la organización** (ADR-09 §11.a): cualquier profesional del tenant ve y resuelve
sus solicitudes. El que acepta queda como dueño (`usuarioId`) de la solicitud **y** de la cita.

#### `SolicitudBandejaDto` (forma de cada solicitud en las respuestas)

```json
{
  "id": "5f0c…",
  "estado": "recibida",
  "rut": "11.111.111-1",
  "nombrePaciente": "Paciente Público",
  "telefono": "+56 9 5555 5555",
  "correo": "publico@mail.com",
  "motivo": "Dolor de muela desde el lunes",
  "preferenciaHoraria": "viernes, 18 de septiembre a las 10:00",
  "consentimiento": true,
  "recibidaEn": "2026-09-17T14:02:11.000Z",
  "resueltaEn": null,
  "citaId": null
}
```

- `rut` **formateado** para mostrar (`formatearRut`); en BD sigue canónico. Nunca en la URL.
- **No** incluye `tenantId` ni `usuarioId`.
- `resueltaEn` (nuevo, requiere migración) y `citaId` son `null` mientras está `recibida`.

#### `GET /api/solicitudes?estado=`

| Query | Validación (`ListarSolicitudesQueryDto`) |
|---|---|
| `estado` | opcional · `@IsEnum(EstadoSolicitud)` · `recibida` \| `aceptada` \| `rechazada` · **por defecto `recibida`** |

- Filtra por `tenantId` del token.
- **Orden:** `recibida` → `recibidaEn ASC` (la que más espera, primero). `aceptada`/`rechazada` →
  `resueltaEn DESC` (la resuelta más reciente, primero).
- **Tope fijo de 100** elementos, sin paginación en la v1 (se añadirá si hace falta, de forma
  aditiva).
- **Las solicitudes viejas no se ocultan:** la ventana de `SOLICITUD_VENTANA_HORAS` solo gobierna la
  regla anti-spam, no la bandeja (ADR-09 §11.c).

**200** → `SolicitudBandejaDto[]` · **400** `estado` inválido · **401**.

#### `POST /api/solicitudes/:id/aceptar`

```json
{
  "inicio": "2026-09-18T10:00:00-03:00",
  "duracionMin": 50,
  "tipoConsulta": "Dolor de muela desde el lunes"
}
```

| Campo | Validación (`AceptarSolicitudDto`) |
|---|---|
| `inicio` | `@IsISO8601()` + **zona explícita obligatoria**: `@Matches(/(Z\|[+-]\d{2}:?\d{2})$/)` (ruta nueva: se nace sin [DT-14](../Deudas/DT-14.md)) |
| `duracionMin` | `@IsInt()` `@IsPositive()` `@Max(1440)` |
| `tipoConsulta` | `@IsString()` `@IsNotEmpty()` — el front lo **precarga con `motivo`** (ADR-09 §10) y el profesional lo ajusta |

`:id` con `ParseUUIDPipe` (no UUID → 400).

Qué hace, **en una sola transacción** (`TransactionRunner`, ADR-06):

1. Carga la solicitud por `(id, tenantId del token)` **con bloqueo de fila** (`SELECT … FOR UPDATE`).
   No existe o es de otro tenant → **404** `Solicitud "<id>" no encontrada` (no se distinguen).
2. Si ya no está `recibida` → **409**, **antes** de crear nada (ni paciente, ni cita, ni evento).
3. Crea la cita **con el mismo flujo que `POST /citas`** (`CitasService.agendar`, sin reescribirlo):
   resolver-o-crear `Paciente` por el RUT de la solicitud (vincula si existe; si no, lo crea con
   `nombre`, `telefono`, `correo` y **el `consentimiento` que marcó el paciente**), `Cita` en
   `pendiente` con la hora del profesional, `CambioCita` `creada` (actor: profesional), hecho
   `CitaCreada`, y cálculo de `avisos`.
4. `solicitud.aceptar(usuarioId, cita.id)` → `aceptada`, `usuarioId` y `resueltaEn` fijados.
5. Publica `SolicitudCitaAceptada` `{ solicitudId, citaId, usuarioId }` — **sin RUT ni nombre**: el
   adaptador actual escribe el payload en el log (ADR-09 §3 regla 5).

**201**:

```json
{
  "solicitud": { "id": "5f0c…", "estado": "aceptada", "resueltaEn": "2026-09-25T15:40:00.000Z", "citaId": "a1b2…", "…": "resto de SolicitudBandejaDto" },
  "cita": {
    "id": "a1b2…",
    "inicio": "2026-09-18T13:00:00.000Z",
    "duracionMin": 50,
    "tipoConsulta": "Dolor de muela desde el lunes",
    "estado": "pendiente",
    "pacienteId": "p-9…",
    "paciente": { "id": "p-9…", "rut": "11.111.111-1", "nombre": "Paciente Público", "telefono": "…", "correo": "…", "consentimiento": true, "tenantId": "…" },
    "avisos": { "solapamientos": [] }
  }
}
```

(`cita` es exactamente la respuesta de `POST /api/citas`.)

**Errores:** `400` cuerpo inválido / `inicio` sin zona / id no UUID · `401` · `404` inexistente u
otro tenant · `409` ya `aceptada` o `rechazada` — mensaje del dominio:
`Transición inválida: no se puede aplicar "aceptar" a una solicitud "aceptada"`.

- **Aceptar dos veces → 409**, no es idempotente ni devuelve la cita anterior. Dos profesionales
  aceptando a la vez: el bloqueo serializa; el segundo recibe 409 y **no** se crea una segunda cita.
- Ante 409 el cliente recarga la bandeja.

#### `POST /api/solicitudes/:id/rechazar`

Sin cuerpo (si llega uno, se descarta). **No** se guarda motivo de rechazo: sería más dato sensible
retenido sobre una petición que no llegó a nada ([DT-26](../Deudas/DT-26.md)).

- Misma transacción con bloqueo de fila que aceptar: sin él, un rechazo concurrente podría pisar una
  aceptación y dejar una cita huérfana de su solicitud.
- `recibida` → `rechazada`, fija `usuarioId` y `resueltaEn`. **No** crea cita ni paciente ni toca el
  historial del paciente (ADR-09 §1).
- Publica `SolicitudCitaRechazada` `{ solicitudId, usuarioId }`.

**200** → `SolicitudBandejaDto` · **400** id no UUID · **401** · **404** · **409** ya resuelta.

> **Por qué `POST` y no `PATCH` como las transiciones de cita:** aceptar **crea otro recurso** (la
> cita) y no es idempotente; rechazar va con el mismo verbo para que la pareja de la bandeja sea
> simétrica.

#### Fronteras entre módulos

- **`solicitud` → `cita`** (nunca al revés): la bandeja es la bandeja de entrada que *produce* citas;
  el núcleo (`cita`) no sabe que las solicitudes existen. `CitaModule` exporta `CitasService`;
  `SolicitudModule` importa `CitaModule` y `SharedModule`. Sin ciclo. La columna `cita_id` sigue sin
  clave foránea (ADR-09): la dependencia es de aplicación, no de esquema.
- **Servicio aparte para la bandeja** (`BandejaSolicitudesService`), no más métodos en
  `SolicitudesService`: el servicio de la ruta **anónima** se queda sin acceso a citas ni a
  transacciones. Menos superficie donde un error de cableado importa.
- **Aceptar reutiliza `CitasService.agendar(dto, usuario, tx)`**: el cuerpo actual de `crearCita`
  pasa a ese método público que **recibe** la transacción; `crearCita` queda como
  `tx.run((tx) => this.agendar(dto, usuario, tx))`. Es la única forma de que paciente + cita +
  bitácora + solicitud vayan en **una** transacción: llamar a `crearCita` abriría una segunda.

### d) Enlace para compartir la URL pública

La URL es del **frontend**: `${origen del front}/agendar-cita/${tenantSlug}`. El front conoce su
origen; lo único que le falta es el **slug**, que hoy **no** llega por ningún lado de forma fiable:
el JWT no lo lleva y `POST /api/auth/login` no lo devuelve (el front solo tiene lo que el usuario
tecleó, y no lo guarda en la sesión).

**Decisión:** sin endpoint nuevo. `LoginResponseDto.usuario` gana **`tenantSlug`** (aditivo;
`AuthService.login` ya tiene el tenant cargado):

```json
{ "accessToken": "…", "usuario": { "id": "…", "email": "…", "nombreCompleto": "…", "rol": "PROFESIONAL", "tenantId": "…", "tenantSlug": "consulta-dra-perez" } }
```

- El front lo guarda en la sesión y arma la URL. Sesiones recordadas de antes del cambio no lo
  tienen: el front oculta el botón hasta el siguiente login.
- **No** va dentro del JWT: no se usa para autorizar nada y cambiar los claims obliga a re-emitir
  tokens.
- Si algún día el slug se puede editar, el paso natural es `GET /api/tenants/actual`; hoy no hace
  falta.
- ⚠️ **Mostrar el enlace no es publicarlo, pero lo facilita.** El día que el profesional lo comparta
  fuera del equipo, [DT-18](../Deudas/DT-18.md) (límite de tasa) pasa a bloqueante. El botón debe ir
  con esa advertencia (o detrás de una bandera) hasta que DT-18 esté resuelta.

### Migración

Una sola: **`1750000007000-AddResueltaEnASolicitudesCita`**.

```sql
-- up
ALTER TABLE "solicitudes_cita" ADD COLUMN "resuelta_en" TIMESTAMPTZ NULL;
-- down
ALTER TABLE "solicitudes_cita" DROP COLUMN "resuelta_en";
```

- Sin índices nuevos: `idx_cita_tenant_usuario_inicio` sirve al rango y al pre-filtro del
  solapamiento; `idx_solicitud_tenant_estado` sirve a la bandeja al volumen actual.
- `resuelta_en` además da la base para una retención por antigüedad de las rechazadas
  ([DT-26](../Deudas/DT-26.md)).
- `citas` y `pacientes`: **sin cambios** de esquema.

### Recomendado, separable: cerrar DT-14 en crear y reagendar

El front ya envía siempre `inicio` con zona explícita. Aplicar el mismo validador de zona de
`AceptarSolicitudDto` a `CrearCitaDto` y `ReagendarCitaDto` (un decorador compartido, p. ej.
`@IsInstanteConZona()` en `shared/presentation/`) cierra [DT-14](../Deudas/DT-14.md) con cero costo
para el front actual. Solo rompe a un cliente que mande `inicio` sin zona, y ninguno conocido lo hace.
**Requiere confirmación del orquestador** antes de incluirlo en el lote.

### Fuera de este cierre (anotado, no olvidado)

- **Prellenar la hora al aceptar** con el instante que el paciente eligió en el flujo público: hoy
  viaja como texto (`preferenciaHoraria`). Guardarlo estructurado añade un campo al formulario
  público, y ADR-09 §8 regla 5 dice "ni uno más" → se decide con una enmienda a ADR-09, no aquí.
- **Marcar "paciente ya conocido"** en la bandeja (búsqueda por RUT por solicitud).
- **Actualizar datos de contacto** de un paciente existente al aceptar (hoy se vincula sin tocarlo).
  *Parcialmente decidido (2026-09-30, [ADR-13 §14](../Decisions/ADR-13.md)):* un correo vacío se
  completa; un correo o teléfono ya guardado no se reemplaza al aceptar (se edita con
  `PATCH /api/pacientes/:id`).
- **Citas en el pasado** ([DT-13](../Deudas/DT-13.md)): aceptar, como crear, las sigue admitiendo.

---

## Pendientes

| Qué | Nota |
|-----|------|
| **La bandeja** — listar, aceptar, rechazar solicitudes | 📐 contrato definido ([§c](#c-bandeja-de-solicitudes-autenticada)); falta implementar. **Sin esto una solicitud entra y nadie la ve.** |
| **Agenda por rango** — `GET /api/citas?desde&hasta` | 📐 contrato definido ([§a](#a-get-apicitasdesdehasta--agenda-por-rango)); falta implementar. |
| Campos definitivos del formulario público | Provisionales. El DTO es el único archivo a tocar. |
| Enlace para compartir | 📐 `tenantSlug` en la respuesta del login ([§d](#d-enlace-para-compartir-la-url-pública)); el front arma la URL. |
| Límite de tasa | [DT-18](../Deudas/DT-18.md) — aplazado mientras el entorno sea local; **requisito de despliegue**. |
| Solapamiento y citas en el pasado | [DT-12](../Deudas/DT-12.md): **avisar y permitir** ([ADR-11](../Decisions/ADR-11.md)), falta implementar · [DT-13](../Deudas/DT-13.md) sigue abierta. |
| `inicio` sin zona horaria en la entrada | [DT-14](../Deudas/DT-14.md) — resuelto del lado del cliente, el backend sigue aceptándolo. Cierre propuesto en [§Recomendado](#recomendado-separable-cerrar-dt-14-en-crear-y-reagendar). |

> **Nota (2026-09-30).** Bandeja, agenda por rango, enlace (`tenantSlug`) y solapamiento están
> **implementados** (2026-09-28). El límite de tasa ya no es requisito de despliegue: se aceptó seguir
> sin él (2026-09-29, DT-18). Siguen pendientes los campos definitivos del formulario, DT-13 y DT-14.
> Lista vigente en [Fases/fase-1 § Qué quedó pendiente](../Fases/fase-1-us02-gestion-citas.md#qué-quedó-pendiente).

---

## Deudas técnicas asociadas

**Cerró:** [DT-10](../Deudas/DT-10.md) (máquina de estados inalcanzable) · [DT-22](../Deudas/DT-22.md) (sin vínculo entre citas reagendadas).

**Mitigó:** [DT-28](../Deudas/DT-28.md) (bandeja abandonada bloqueaba al paciente).

**Contrajo:** [DT-23](../Deudas/DT-23.md) · [DT-24](../Deudas/DT-24.md) · [DT-25](../Deudas/DT-25.md) · [DT-26](../Deudas/DT-26.md) · [DT-27](../Deudas/DT-27.md) · [DT-29](../Deudas/DT-29.md).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
