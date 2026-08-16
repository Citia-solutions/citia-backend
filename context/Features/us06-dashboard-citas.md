# Feature: US-06 — Dashboard de citas del día

**Epic:** 06 — Dashboard de citas del día (RF-03)
**Historia:** US-06
**Estado:** ✅ Implementado backend (2026-06-30) · ✅ Fix zona horaria de la clínica (2026-07-06, ADR-07) · 77 unit verdes (dominio 100%) · ⚠️ e2e escrito, pendiente de correr contra Postgres
**Commits:** `9ab2bec` (paciente), `e592d74` (cita + máquina de estados), `b485e1f` (wiring), `76157dc` (tests), `77523c9` (docs US-06 + ADR-04), `08dad63` (fix zona horaria)

---

## Qué hace

Provee el backend real detrás del dashboard del profesional: `GET /api/citas/hoy` devuelve
las citas del día del profesional logueado, filtradas por su tenant y por su `usuarioId`, en
orden cronológico ascendente. **Estrena por primera vez el `JwtAuthGuard`** en un endpoint
protegido real.

Para que el dashboard tenga datos que mostrar, se construyó también la fundación P0 que no
existía: el módulo **Cita** (núcleo de negocio con máquina de estados) y un módulo **Paciente**
mínimo, más el endpoint de creación de citas (US-02).

---

## Arquitectura (hexagonal)

```
src/modules/
├── paciente/
│   ├── domain/
│   │   ├── paciente.entity.ts            ← Clase plana: id, nombre, contacto, consentimiento, tenantId
│   │   └── paciente.repository.ts        ← Abstract class PacienteRepository (guardar, buscarPorId)
│   ├── infrastructure/persistence/
│   │   ├── paciente.orm-entity.ts        ← TypeORM @Entity('pacientes'), FK tenant_id
│   │   └── typeorm-paciente.repository.ts
│   ├── application/pacientes.service.ts
│   ├── presentation/
│   │   ├── pacientes.controller.ts       ← POST /pacientes (JwtAuthGuard)
│   │   └── dto/ (crear-paciente, paciente-response)
│   └── paciente.module.ts                ← exporta PacienteRepository
└── cita/
    ├── domain/
    │   ├── cita.entity.ts                ← Máquina de estados: estado PRIVADO, EstadoCita enum
    │   ├── cita.repository.ts            ← Abstract class CitaRepository
    │   └── exceptions/
    │       └── transicion-estado-invalida.error.ts  ← → 409
    ├── infrastructure/persistence/
    │   ├── cita.orm-entity.ts            ← TypeORM @Entity('citas'), 3 FK
    │   └── typeorm-cita.repository.ts    ← mapper toDomain (reconstituir) / toPersistence
    ├── application/
    │   ├── citas.service.ts              ← crearCita(), citasDeHoy()
    │   └── paciente-no-encontrado.error.ts  ← → 400
    ├── presentation/
    │   ├── citas.controller.ts           ← POST /citas, GET /citas/hoy (JwtAuthGuard)
    │   └── dto/ (crear-cita, cita-response, cita-dashboard)
    └── cita.module.ts                    ← importa PacienteModule

src/modules/auth/current-user.decorator.ts  ← @CurrentUser() extrae AuthenticatedUser de req.user
```

**Regla hexagonal:** la máquina de estados vive 100% en la entidad de dominio `Cita`, NO en el
service (ver ADR-04). `application` y `domain` no importan `typeorm` ni `@nestjs`.

---

## Endpoints

Todos protegidos con `@UseGuards(JwtAuthGuard)`. `tenantId` y `usuarioId` se extraen del token
(`@CurrentUser()`), **nunca del body** (RNF-02, ADR-01).

| Método | Ruta               | Status | Request                                              | Response |
|--------|--------------------|--------|------------------------------------------------------|----------|
| POST   | `/api/pacientes`   | 201    | `{ nombre, contacto, consentimiento }`               | `{ id, nombre, contacto, consentimiento, tenantId }` |
| POST   | `/api/citas`       | 201    | `{ inicio (ISO8601), duracionMin (int+), tipoConsulta, pacienteId (UUID) }` | `{ id, inicio, duracionMin, tipoConsulta, estado, pacienteId }` |
| GET    | `/api/citas/hoy`   | 200    | —                                                    | `CitaDashboardDto[]` |

**`CitaDashboardDto`** (lo que RF-03 exige): `{ id, pacienteNombre, hora ("HH:mm"), inicio, duracionMin, tipoConsulta, estado }`.

> El marcado visual de citas pasadas (gris/tachado) es responsabilidad del frontend; el backend
> entrega `inicio` y `estado` para que el front decida. **Sin campos de dinero** (ingresos/prepago
> quedan fuera del alcance de US-06 por decisión — ver epic punto 6).

**Errores:**
- `400` — validación del DTO **o** paciente inexistente / de otro tenant (`PacienteNoEncontradoError`).
- `401` — token ausente/inválido/vencido (`JwtAuthGuard`).
- `409` — transición de estado ilegal (`TransicionEstadoInvalidaError`).

---

## Modelo de Cita y estados

**Atributos:** `id`, `inicio` (**datetime único**, no fecha+hora separadas), `duracionMin`,
`tipoConsulta`, `estado`, `tenantId`, `pacienteId`, `usuarioId`, `creadoEn`, `actualizadoEn`.
Tres FK ("pertenece a"): Tenant, Paciente, Usuario.

**Enum `EstadoCita`:** `pendiente · confirmada · cancelada · asistio · no_asistio · ghosting`.

| Desde      | Método                | Hacia (terminal\*) |
|------------|-----------------------|--------------------|
| pendiente  | `confirmar()`         | confirmada         |
| pendiente  | `cancelar()`          | cancelada \*       |
| pendiente  | `marcarGhosting()`    | ghosting \* (job futuro) |
| confirmada | `marcarAsistencia()`  | asistio \*         |
| confirmada | `marcarInasistencia()`| no_asistio \*      |
| confirmada | `cancelar()`          | cancelada \*       |

- `estado` es **privado**; nadie lo asigna a mano. Se mueve solo por métodos que validan la regla.
- Transición ilegal → `TransicionEstadoInvalidaError`. De un estado terminal no se sale.
- Construcción: `Cita.crear(props)` (nace PENDIENTE) desde el caso de uso; `Cita.reconstituir(props)`
  solo lo usa el adaptador de persistencia para repoblar el estado desde BD.
- `ghosting` ≠ `no_asistio`: ghosting = nunca confirmó y no apareció; no_asistio = confirmó y no llegó.

Detalle y justificación en **ADR-04**.

---

## Esquema de BD

### Tabla `pacientes` (`1750000002000-CreatePacientes`)
| Columna        | Tipo        | Notas                     |
|----------------|-------------|---------------------------|
| id             | uuid PK     | auto-generado             |
| nombre         | varchar     | not null                  |
| contacto       | varchar     | teléfono/correo           |
| consentimiento | boolean     | default false             |
| tenant_id      | uuid        | FK → tenants.id           |
| creado_en / actualizado_en | timestamptz |               |

Índice: `idx_paciente_tenant`.

### Tabla `citas` (`1750000003000-CreateCitas`)
| Columna        | Tipo        | Notas                     |
|----------------|-------------|---------------------------|
| id             | uuid PK     | auto-generado             |
| inicio         | timestamptz | not null                  |
| duracion_min   | int         | not null                  |
| tipo_consulta  | varchar     | not null                  |
| estado         | enum `enum_citas_estado` | default 'pendiente' |
| tenant_id      | uuid        | FK → tenants.id           |
| paciente_id    | uuid        | FK → pacientes.id         |
| usuario_id     | uuid        | FK → usuarios.id          |
| creado_en / actualizado_en | timestamptz |               |

Índice compuesto `idx_cita_tenant_usuario_inicio` → sirve directo a la query del dashboard
(filtro tenant + profesional + orden por `inicio`). La query usa rango semiabierto
`[00:00, día+1 00:00)`.

> **Migraciones generadas, NO aplicadas.** Correr `npm run migration:run` antes de usar en un entorno real.

---

## Decisiones de seguridad

- `tenantId` y `usuarioId` salen **siempre del JWT** (`@CurrentUser()`), nunca del body. El
  `ValidationPipe` (whitelist) descarta cualquier intento de inyectarlos por el body.
- El dashboard filtra por tenant **y** por profesional: un usuario nunca ve citas de otro tenant
  ni de otro profesional.
- Al crear una cita se valida que el `pacienteId` pertenezca al tenant del token
  (`PacienteRepository.buscarPorId(id, tenantId)`); si no, 400.

---

## Rendimiento

- El dashboard resuelve el nombre del paciente **sin N+1**: recolecta los `pacienteId` únicos y
  resuelve cada uno una sola vez (`Set` + `Promise.all` + `Map`).
- Índice compuesto que cubre filtro + orden. Objetivo RF-03/RNF: dashboard < 2s.
- *(Futuro)* si crece el volumen, añadir un método batch `buscarPorIds` al puerto `PacienteRepository`.

---

## Zona horaria: día y hora en la zona de la clínica

**Decisión completa en [ADR-07](../Decisions/ADR-07.md). Commit `08dad63` (2026-07-06).**

"Hoy" y "la hora" dependen de la zona de la clínica, no de la del servidor. El contenedor corre en
**UTC**; el cálculo original usaba esa zona, así que en Chile el corte de medianoche se desplazaba
y las horas salían **3–4 h desfasadas**. La corrección:

- Utilidad pura DST-safe **`src/shared/domain/timezone.ts`** (con `Intl`, sin librerías externas):
  - `rangoDelDiaEnZona(instante, tz)` → rango semiabierto `[00:00, día+1 00:00)` en UTC para la query.
  - `formatearHoraEnZona(instante, tz)` → `"HH:mm"` en la zona.
- La zona es config: **`APP_TZ`** (default `America/Santiago`). El repositorio calcula el rango en
  `APP_TZ`; `CitasService` recibe la zona **por constructor** (inyectada con `useFactory` en
  `CitaModule`), manteniendo `application` sin dependencia de Nest.
- **Deuda anotada:** `APP_TZ` es global; un despliegue multi-zona moverá la zona al Tenant (ADR-07).

---

## Tests

| Suite                                   | Tipo  | Estado |
|-----------------------------------------|-------|--------|
| `cita.entity.spec.ts`                   | unit (dominio) | ✅ verde — cobertura 100% |
| `citas.service.spec.ts`                 | unit  | ✅ verde |
| `citas.controller.spec.ts`              | unit  | ✅ verde |
| `test/citas-dashboard.e2e-spec.ts`      | e2e   | ⚠️ escrito, **no ejecutado** (falta Postgres en el entorno) |

Total suite del proyecto: **77 unit verdes**. Cobertura: dominio `Cita` 100%, service/controller 100% stmts.

Cobertura de infraestructura (`typeorm-cita.repository.ts`, orm-entity, module) queda en 0% hasta
correr el e2e con BD — los tests ya están escritos y cubren creación real, filtro por día/tenant/profesional.

---

## ADRs relacionados

- **ADR-04:** Modelo de Cita — máquina de estados en el dominio + estado materializado (job de ghosting).
- **ADR-07:** Día y hora del dashboard calculados en la zona de la clínica (DST-safe con `Intl`).
- ADR-01: Passport + JWT — `tenantId` del token, no del body (aquí se estrena el guard).
- ADR-02: Código en español + regla de dependencias hexagonal.

---

## Pendientes

1. **Aplicar migraciones** (`npm run migration:run`) y **correr el e2e con Postgres** para cerrar
   en vivo los criterios de la DoD (rechazo de token, aislamiento por tenant) y medir el < 2s.
2. **Job de ghosting** (BullMQ): worker programado que marca `ghosting` las citas `pendiente`
   cuya fecha ya pasó. Estado ya modelado; construcción es pieza P1 posterior (ADR-04).
3. **Frontend:** consumir `GET /api/citas/hoy` real y eliminar los mocks; implementar el marcado
   visual de citas pasadas y el detalle con reagendar/cancelar.
4. **Endpoints de transición** (confirmar/cancelar/asistencia): la entidad ya los soporta; falta
   exponerlos vía HTTP.
5. Scoring y reporte de comportamiento del paciente (RF-08).
