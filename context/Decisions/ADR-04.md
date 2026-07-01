# ADR-04: Modelo de Cita — máquina de estados en el dominio y estado materializado

**Fecha:** 2026-06-30
**Estado:** Aceptado

---

## Contexto

- **RF-03** requiere un dashboard con las citas del día del profesional.
- **RF-07** (futuro) permite que el paciente confirme/cancele/reagende; **RF-08** (futuro) calcula
  el % de asistencia / comportamiento histórico del paciente — el diferenciador del producto.
- Una cita atraviesa varios estados a lo largo de su vida (pendiente → confirmada → asistió, etc.),
  algunos de ellos **terminales**, y ciertas transiciones son ilegales (p. ej. confirmar una cita
  ya cancelada). Estas reglas son **invariantes de negocio**, no detalles de presentación.

Se tomaron cuatro decisiones de modelado al construir US-06.

---

## Decisión

### 1. La lógica de transición vive en la entidad de dominio, no en el service

`Cita` expone un `estado` **privado** y métodos que validan la regla antes de cambiarlo
(`confirmar()`, `cancelar()`, `marcarAsistencia()`, `marcarInasistencia()`, `marcarGhosting()`).
Nadie asigna `estado` a mano desde un controller o service. Una transición ilegal lanza
`TransicionEstadoInvalidaError` (dominio puro), que el controller mapea a HTTP 409.

- Construcción vía factories: `Cita.crear(props)` nace en `pendiente`; `Cita.reconstituir(props)`
  repuebla el estado desde BD y **solo** lo usa el adaptador de persistencia (no el caso de uso).
- Coherente con ADR-02 (dominio sin dependencias de framework; invariantes en el núcleo).

**Alternativa descartada:** poner los `if` de transición en el service. Dispersa la regla, permite
estados inconsistentes si otro caso de uso la olvida, y no protege el invariante.

### 2. Grafo de estados cerrado con distinción `ghosting` vs `no_asistio`

Enum `EstadoCita`: `pendiente · confirmada · cancelada · asistio · no_asistio · ghosting`.
Terminales: `cancelada`, `asistio`, `no_asistio`, `ghosting` — de un terminal no se sale.

| Desde      | Evento                        | Hacia      |
|------------|-------------------------------|------------|
| pendiente  | paciente confirma             | confirmada |
| pendiente  | paciente/prof cancela         | cancelada  |
| pendiente  | llega el día sin confirmar    | ghosting   |
| confirmada | profesional marca asistencia  | asistio    |
| confirmada | profesional marca inasistencia| no_asistio |
| confirmada | se cancela                    | cancelada  |

- **`ghosting` ≠ `no_asistio`** a propósito: ghosting = nunca confirmó y no apareció;
  no_asistio = confirmó y no llegó. Se guardan separados para alimentar el reporte de
  comportamiento (RF-08).
- Una cita cancelada **no se reabre** → se genera una cita nueva (otra fila, otro id).

### 3. `inicio` como datetime único (no fecha + hora separadas)

La cita tiene un único campo `inicio` (`timestamptz`) en vez de columnas separadas de fecha y hora.
Simplifica el orden cronológico, el filtro por rango del día `[00:00, día+1 00:00)` y el índice.
La "hora" que muestra el dashboard (`"HH:mm"`) se deriva de `inicio` en el DTO de respuesta.

### 4. El estado de `ghosting` se materializa vía job, no se calcula al vuelo

Un worker programado (BullMQ, infra a incorporar) revisará las citas `pendiente` cuya fecha ya
pasó y las marcará `ghosting`, dejando el estado **persistido en BD**.

**Alternativa descartada:** cálculo perezoso (derivar "ghosting" al leer). Haría el reporte
histórico (RF-08) poco fiable y dependiente del momento de lectura. Materializar el estado da una
fuente de verdad estable.

> El job es pieza **P1 posterior**: en US-06 se **modela** el estado y el método `marcarGhosting()`;
> el worker se construye después.

---

## Consecuencias

**Positivas:**
- Invariantes de negocio protegidos en un solo lugar; imposible dejar una cita en estado ilegal
  desde la API.
- Base lista para RF-07 (transiciones disparadas por el paciente) y RF-08 (reporte de comportamiento),
  con `ghosting`/`no_asistio` ya diferenciados.
- Query del dashboard simple y eficiente (índice `idx_cita_tenant_usuario_inicio`, rango semiabierto).

**Negativas / riesgos:**
- El adaptador de persistencia necesita `reconstituir()` para repoblar un `estado` privado — un poco
  más de ceremonia en el mapper (aceptado a cambio del encapsulamiento).
- El estado `ghosting` no es correcto hasta que exista el job; mientras tanto esas citas quedan como
  `pendiente` vencidas. Mitigación: construir el job antes de exponer el reporte RF-08.

---

## Referencias

- ADR-02: Código en español + arquitectura hexagonal (invariantes en el dominio).
- `src/modules/cita/domain/cita.entity.ts` — máquina de estados.
- `context/Features/us06-dashboard-citas.md` — feature que introduce este modelo.
- RF-03 (dashboard), RF-07 (respuesta del paciente), RF-08 (calificación de asistencia).
