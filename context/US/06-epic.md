# Plan US-06 — Alimentar el dashboard de citas del día (RF-03)

> **Estado (2026-06-30):** ✅ Backend implementado (pasos 1–5). Ver `context/Features/us06-dashboard-citas.md`
> y `context/Decisions/ADR-04.md`. Pendiente: e2e contra Postgres, frontend (paso 6) y job de ghosting (paso 7).


## Decripcion
- Como profesional de la salud quiero ver un layout con mis citas del día para prepararme para cada atención.

- Al iniciar sesión, el dashboard carga en <2s

- Muestra solo las citas del día actual del profesional logueado

- Cada cita muestra: paciente, hora, duración estimada, tipo de consulta, estado (confirmada/pendiente)

- Orden cronológico ascendente

- Las citas pasadas se marcan visualmente (gris/tachado)

- Clic en una cita → detalle con opciones de reagendar/cancelar

> Solo decisiones y orden. Sin código. Brief para los agentes.
> **Objetivo real:** que el dashboard muestre datos reales del backend, detrás del `JwtAuthGuard`. Esto estrena el guard por primera vez en un endpoint protegido.

---

## Punto de partida (lo que ya existe)
Backend: módulos **Tenant**, **Usuario** (signup) y **Auth** (login). Dos endpoints vivos: `POST /api/usuarios`, `POST /api/auth/login`. Guard JWT construido pero **sin ejercer**.

## El problema de dependencias (leer antes de empezar)
US-06 es P1, pero su backend **no existe** y depende de piezas **P0** que tampoco: no hay módulo `Cita` ni `Paciente`, y no hay forma de crear citas (US-02). No se puede mostrar lo que no existe. Por eso este plan construye primero la fundación P0 y recién encima la vista.

---

## Decisiones tomadas

### 1. Módulo Paciente (mínimo)
- La Cita referencia un paciente → se necesita al menos una versión mínima.
- **Pertenece al Tenant** (compartido entre profesionales de una clínica).
- Atributos mínimos: `id`, `nombre`, `contacto` (teléfono/correo), `consentimiento`, `tenantId`.
- Hexagonal ligero: no es núcleo con comportamiento, un CRUD flaco basta por ahora.

### 2. Módulo Cita (hexagonal completo — es núcleo de negocio real)
- **Atributos:** `id`, `inicio` (**datetime único**, no fecha+hora separadas), `duracionMin`, `tipoConsulta`, `estado` (enum), `tenantId`, `pacienteId`, `usuarioId`, `creadoEn`, `actualizadoEn`.
- **Relaciones (desde Cita, todas "pertenece a" = 3 FK):** Tenant, Paciente, Usuario.
- **Relaciones salientes (modeladas, módulos aún NO construidos):** genera Recordatorios (RF-06), origina Notificaciones (RF-05). No bloquean US-06.
- **La lógica de transición de estado vive en la entidad de dominio**, no en el service. El `estado` es privado y solo se mueve por métodos que validan la regla. Nadie asigna `estado` a mano desde un controller.

### 3. Estados y transiciones (grafo cerrado)
Enum: `pendiente · confirmada · cancelada · asistio · no_asistio · ghosting`

| Desde | Evento | Hacia |
|-------|--------|-------|
| pendiente | paciente confirma | confirmada |
| pendiente | paciente/prof cancela | cancelada (terminal) |
| pendiente | llega el día sin confirmar | **ghosting** (terminal, vía job) |
| confirmada | profesional marca asistencia | asistio (terminal) |
| confirmada | profesional marca inasistencia | no_asistio (terminal) |
| confirmada | se cancela | cancelada (terminal) |

- **Terminales:** cancelada, asistio, no_asistio, ghosting. De un terminal no se sale.
- **Una cita cancelada NO se reabre** → se genera una **cita nueva** (otra fila, otro id).
- **`ghosting` ≠ `no_asistio`:** ghosting = nunca confirmó y no apareció; no_asistio = confirmó y no llegó. Se guardan separados a propósito, para el reporte de comportamiento futuro.

### 4. Job de ghosting (decisión: job, no cálculo perezoso)
- Un **worker programado (BullMQ, infra ya existente)** revisa las citas `pendiente` cuya fecha ya pasó y las marca `ghosting`.
- El estado queda **materializado en la BD** (no calculado al vuelo), para que el reporte histórico sea confiable.
- **Es pieza nueva P1** → se anota, no se construye en este primer corte. Modelar el estado ahora; construir el job después.

### 5. Endpoint del dashboard: `GET /api/citas/hoy`
- **Protegido con `JwtAuthGuard`** ← primer uso real del guard.
- **Filtrado por `tenantId` (del token, nunca del body)** y por el profesional logueado (`usuarioId` del token).
- Devuelve las citas del día con lo que RF-03 exige: nombre del paciente, hora (del datetime), duración, tipo de consulta, estado.
- Orden cronológico ascendente. Objetivo <2s (RNF-01/05).

### 6. Alcance del dashboard vs "qué NO hará" — ✅ DECIDIDO (2026-06-30)
- El dashboard actual muestra tarjetas de **dinero** (ingresos recuperados, prepago). Fase 0 dijo "no hace nada de dinero".
- **Decisión tomada: US-06 se ciñe a RF-03 — solo citas del día.** Las métricas de dinero quedan FUERA; el endpoint `GET /api/citas/hoy` no expone ningún campo de dinero. Se retoma el scope de dinero cuando tú y tu socio lo decidan conscientemente.

---

## Orden de construcción
1. ✅ **Paciente mínimo:** dominio + puerto + orm-entity + migración.
2. ✅ **Cita — dominio:** entidad plana + enum de estado + métodos de transición + puerto. (ADR-04)
3. ✅ **Cita — infraestructura:** orm-entity + repo TypeORM + mapper + migración.
4. ✅ **US-02 (crear cita):** caso de uso + `POST /api/citas` protegido. Sin esto no hay datos que mostrar.
5. ✅ **`GET /api/citas/hoy`** protegido y filtrado por tenant + profesional. ← estrena el guard.
6. ⬜ **Frontend:** el dashboard consume este endpoint real, se eliminan los mocks.
7. ⬜ *(P1, después)* Job de ghosting.
8. ⬜ *(P1/P2, después)* Scoring y reporte de comportamiento del paciente (RF-08).

---

## Definición de Terminado de US-06 (antes de marcarla hecha)
- [~] `GET /api/citas/hoy` rechaza un token inválido/vencido — test e2e **escrito**; falta correrlo en vivo contra Postgres.
- [~] Un usuario no puede ver citas de otro tenant — test de aislamiento **escrito** (e2e); pendiente de correr con BD. Cubierto además en unit (filtro sale del token).
- [x] Una transición de estado ilegal (ej. confirmar una cita cancelada) lanza error — **test de dominio en verde** (`cita.entity.spec.ts`, cobertura 100%).
- [ ] El dashboard consume datos reales, cero mocks. — depende del frontend (paso 6).
- [ ] La vista carga en <2s. — por medir cuando el frontend consuma el endpoint.

## Deudas heredadas (no perder de vista)
- Almacenamiento del JWT en el frontend (localStorage vs httpOnly cookie).
- ~~Decisión de scope de las tarjetas de dinero (punto 6).~~ ✅ Resuelta: dinero fuera de US-06.