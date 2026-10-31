# ADR-04: Modelo de Cita — máquina de estados en el dominio y estado materializado

> **Fase:** [Fase 0 — US-06](../Fases/fase-0-us06-dashboard.md) (origen), [Fase 1 — US-02](../Fases/fase-1-us02-gestion-citas.md), [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md), [Fase 3 — US-04](../Fases/fase-3-us04-respuesta-paciente.md) (regla del `ghosting`), [Fase 5 — US-07](../Fases/fase-5-us07-scoring.md) · **Feature:** [us06](../Features/us06-dashboard-citas.md), [us02](../Features/us02-gestion-citas.md) · **Plan:** [US-06](../US/06-epic.md) · **Relacionado:** [ADR-09](../Decisions/ADR-09.md), [ADR-10](../Decisions/ADR-10.md), [ADR-12](../Decisions/ADR-12.md), [ADR-14](../Decisions/ADR-14.md), [DT-10](../Deudas/DT-10.md), [DT-11](../Deudas/DT-11.md), [DT-22](../Deudas/DT-22.md), [DT-30](../Deudas/DT-30.md), [DT-48](../Deudas/DT-48.md), [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1)

**Fecha:** 2026-06-30
**Estado:** Aceptado · ➕ **extendido por [ADR-09](ADR-09.md)** (propuesto) · 🔁 **mecanismo del §4
reemplazado por [ADR-12](ADR-12.md)** (2026-09-30) · ➕ **§2 extendido por [ADR-14](ADR-14.md)** (2026-10-19; con una
excepción a "de un terminal no se sale" aprobada el 2026-10-30)
*(Nota del 2026-09-30: ADR-09 ya no está "propuesto": está aceptado e implementado.)*

> **Nota (2026-10-30) — una excepción a "de un terminal no se sale".** El usuario aprobó en
> [ADR-14 §9](ADR-14.md#9-cambio-en-la-máquina-de-estados-extiende-adr-04) la **corrección de un cierre
> equivocado dentro de 7 días**: el profesional cambia el desenlace entre Asistió y No asistió (también sobre
> los cierres del job G1), y el estado exacto de la inasistencia lo decide el dominio como hoy (`ghosting` si la
> cita no estaba confirmada, `no_asistio` si lo estaba). Queda en la bitácora con actor `profesional`. **Las
> canceladas no se corrigen.** Es la **única excepción** a la regla de la decisión 2; todo lo demás sigue sin
> salida. Se construye en US-07.02; hasta entonces el código no la permite ([DT-48](../Deudas/DT-48.md)). De paso:
> las transiciones de la nota del 2026-10-19 están en producción desde el 2026-10-20, y el job de la decisión 4
> (G1) está prendido en production desde el 2026-10-27 ([DT-11](../Deudas/DT-11.md), cerrada).

> **Nota (2026-10-19).** [ADR-14](ADR-14.md) **extiende** el grafo de la decisión 2 con dos transiciones desde
> `pendiente`, que marca el profesional, **aceptadas por el usuario el 2026-10-19** (ADR-14 aceptado en lo que
> toca a US-07.01): `pendiente → asistio` directo y, para la inasistencia, `pendiente → ghosting` con actor
> `profesional` en la bitácora, que conserva el significado de `ghosting` ("nunca confirmó y no llegó"). Las dos
> van por las rutas de siempre (`…/asistencia`, `…/inasistencia`): el destino lo decide el dominio según el
> estado de origen. **Además, el dominio exige `ahora ≥ inicio`** para marcar asistencia o inasistencia desde
> cualquier estado de origen (hasta ahora solo lo bloqueaba el voucher). "De un terminal no se sale" no cambia.
> Se construyen en [US-07.01](../US/07.01-registro-hechos.md), con el job G1 de la decisión 4; hasta que se
> desplieguen, el código sigue con la tabla de abajo. Detalle en
> [ADR-14 §9](ADR-14.md#9-cambio-en-la-máquina-de-estados-extiende-adr-04).
> *(Antes, en la mañana del mismo día: "propone"; la inasistencia desde `pendiente` estaba a confirmar, con
> `no_asistio` como alternativa.)*

> **Nota (2026-09-30).** La decisión 4 nombraba BullMQ como el worker que materializaría el
> `ghosting`. [ADR-12](ADR-12.md) elige otro mecanismo: planificador dentro del proceso
> (`@nestjs/schedule`) sobre tablas de Postgres con `FOR UPDATE SKIP LOCKED`, sin Redis. **La decisión
> de fondo sigue vigente** (el estado se materializa, no se calcula al vuelo), pero el job queda
> **aplazado**: el scoring (RF-08) salió del MVP. Ver [DT-11](../Deudas/DT-11.md) y
> [DT-30](../Deudas/DT-30.md).

> **Nota.** [ADR-09](ADR-09.md) **añade** la transición `reagendar()` al grafo de la decisión 2 —sin
> redefinir ninguna de las existentes— y salda la deuda que este ADR dejó abierta: al decir que una
> cita cancelada no se reabre sino que se crea otra, una cita movida N veces quedaba como N+1 filas
> **sin vínculo entre sí**, imposibles de interpretar para RF-08. ADR-09 resuelve reagendando **en
> su sitio** con una bitácora inmutable de cambios. Sigue plenamente vigente todo lo demás: el
> estado privado con transiciones validadas en el dominio (1), los estados terminales y la
> distinción `ghosting` / `no_asistio` (2), el `inicio` como datetime único (3) y la materialización
> del estado vía job (4).

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
Terminales: `cancelada`, `asistio`, `no_asistio`, `ghosting` — de un terminal no se sale. *(Excepción desde el
2026-10-30: la corrección de un cierre dentro de 7 días de ADR-14 §9; ver la nota de arriba.)*

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

> **Nota (2026-10-14) — regla del `ghosting` (G1).** Con el diseño de la Fase 3 ([ADR-10 §5](ADR-10.md))
> el arquitecto fijó cuándo una cita es `ghosting`: sigue `pendiente` pasado el **fin del día de la
> clínica** de su `inicio`, **y** al paciente se le envió al menos un recordatorio con enlace (`enviado` o
> `entregado`), **y** no tiene una petición de otra hora `recibida`. Si falta alguna condición, la cita
> queda sin cerrar, neutra para el scoring. La fila *"pendiente → ghosting: llega el día sin confirmar"* de
> la decisión 2 se lee con esa regla. El job **sigue aplazado** (G4) y la fecha de corte es el despliegue de
> la Fase 3: detalle en [DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14). La decisión de fondo
> —materializar el estado, no calcularlo al vuelo— no cambia.

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

---

## Deudas técnicas asociadas

- [DT-10](../Deudas/DT-10.md) — la máquina de estados de la decisión 1 no tiene ningún endpoint que la ejerza. 🟢 resuelta en diseño por ADR-09.
- [DT-11](../Deudas/DT-11.md) — el job de la decisión 4 no existía, así que el historial de RF-08 no se acumulaba. ✅ **cerrada el 2026-10-27**: el job G1 (US-07.01) está prendido en production. *Antes:* 🔵 aplazada (2026-09-30); regla G1 fijada el 2026-10-14; fecha de corte = despliegue de la Fase 3.
- [DT-30](../Deudas/DT-30.md) — la asistencia real de las citas pasadas no se registra y no se puede reconstruir. **⏳ es la deuda que se encarece sola.** Salida elegida (2026-09-30): esperar a la Fase 3; **el grafo de la decisión 2 no se toca**. *(2026-10-05: mitigada con los botones del voucher. 2026-10-19: ADR-14 §9 toma la salida B y extiende el grafo.)*
- [DT-48](../Deudas/DT-48.md) — por "de un terminal no se sale", un cierre equivocado no se corrige. Abierta (2026-10-30), con la salida decidida: la corrección dentro de 7 días de ADR-14 §9, en US-07.02.
- [DT-22](../Deudas/DT-22.md) — la regla "de un terminal no se sale" de la decisión 2 dejaba las citas reagendadas sin vínculo entre sí. 🟢 resuelta en diseño por ADR-09.

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
