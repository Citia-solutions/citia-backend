# ADR-07: Día y hora del dashboard calculados en la zona de la clínica (DST-safe con `Intl`)

**Fecha:** 2026-07-06
**Estado:** Aceptado · Implementado (2026-07-06)
**Commit:** `08dad63` (fix: calcular día y hora del dashboard en la zona de la clínica)

---

## Contexto

El dashboard `GET /api/citas/hoy` (US-06) debe mostrar **las citas de hoy** del profesional y la
**hora** de cada una. "Hoy" y "la hora" dependen de una zona horaria concreta: la de la clínica.

La base guarda instantes en UTC (columnas `timestamptz`), lo cual es correcto. El problema estaba
en el cálculo: el repositorio derivaba el rango del día y el `CitasService` formateaba la hora
usando la **zona del servidor**. En el contenedor de producción el servidor corre en **UTC**, así
que:

- Las **fronteras del día** se calculaban en UTC. En Chile (UTC-3/UTC-4) esto corría el corte de
  medianoche varias horas: citas de la noche caían en el "día" equivocado o desaparecían del
  dashboard.
- La **hora mostrada** salía con **3–4 h de desfase** respecto de la hora local de la clínica.

Era un bug real para cualquier cliente fuera de UTC.

---

## Decisión

### 1. Utilidad pura `shared/domain/timezone.ts`, DST-safe, con `Intl`

Funciones puras (sin dependencias de framework ni librerías externas), usando `Intl.DateTimeFormat`
para resolver la zona **incluyendo horario de verano (DST)**:

- **`rangoDelDiaEnZona(instante, tz)`** → `{ desde, hasta }`: el rango **semiabierto**
  `[00:00, día+1 00:00)` del día de `instante` en la zona `tz`, expresado como instantes **UTC**
  para consultar la columna `timestamptz`. Corrige el offset con una segunda pasada por si se cruza
  un salto de DST (días de 23 h o 25 h); el "+26 h" para aterrizar en el día siguiente es
  deliberado para ser robusto ante esos días irregulares.
- **`formatearHoraEnZona(instante, tz)`** → `"HH:mm"` (24 h) del instante en la zona `tz`.

Vive en `shared/domain/` porque es lógica de dominio pura y reutilizable, sin acoplarse a NestJS.

### 2. La zona es configuración: `APP_TZ` (default `America/Santiago`)

- El repositorio calcula el rango del día en `APP_TZ` (leída vía `ConfigService`).
- `CitasService` recibe la zona **por constructor** (un `string`), inyectada con `useFactory` en
  `CitaModule` (`config.get('APP_TZ', 'America/Santiago')`). Así `application` no depende de Nest.
- `APP_TZ` documentada en `.env.example`.

**Por qué no una librería (Luxon / date-fns-tz):** `Intl` ya está en el runtime de Node 22 y
resuelve DST correctamente para el caso puntual (rango del día + formato de hora). Se evita una
dependencia extra. Si el manejo de fechas crece (recurrencias, calendarios RF-02), reconsiderar.

**Por qué zona única de app y no por-tenant (todavía):** hoy `APP_TZ` es global. Cuando el producto
tenga clínicas en múltiples zonas, la zona debería pasar a ser un atributo del **Tenant** y
resolverse por request. Queda anotado como evolución; la utilidad ya recibe la `tz` como parámetro,
así que el cambio será localizado.

---

## Consecuencias

**Positivas:**
- El dashboard muestra el día y la hora correctos para la clínica, independientemente de la zona
  del servidor/contenedor.
- Correcto ante DST sin librerías externas (`Intl` nativo).
- La utilidad es pura y testeada (`timezone.spec.ts`), reutilizable por futuros reportes (RF-08).

**Negativas / riesgos:**
- `APP_TZ` es global: un despliegue multi-zona necesitará mover la zona al Tenant (anotado arriba).
- El cálculo con `Intl.formatToParts` es algo verboso; encapsulado en la utilidad para no repetirlo.

---

## Referencias

- ADR-02: dominio puro (la utilidad vive en `shared/domain/`, sin framework).
- ADR-04: `inicio` como `timestamptz` único (base del cálculo del rango).
- `src/shared/domain/timezone.ts` + `timezone.spec.ts`.
- `src/modules/cita/infrastructure/persistence/typeorm-cita.repository.ts` (rango en `APP_TZ`),
  `src/modules/cita/application/citas.service.ts` (formato de hora), `src/modules/cita/cita.module.ts` (inyección).
- `context/Features/us06-dashboard-citas.md` — feature que introduce el fix.
