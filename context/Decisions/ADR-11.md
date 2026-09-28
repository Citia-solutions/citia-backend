# ADR-11: Solapamiento de citas — avisar y permitir, con la regla en la entidad `Cita`

**Fecha:** 2026-09-25
**Estado:** Aceptado · sin implementar (contrato en [us02-gestion-citas §Cierre de Fase 1](../Features/us02-gestion-citas.md#cierre-de-fase-1--contrato-2026-09-25))
**Commits:** — (pendiente)
**Relación:** **resuelve** la decisión que [ADR-09](ADR-09.md) dejó abierta a propósito (solapamiento)
· **responde** [Q4](../PREGUNTAS-ABIERTAS.md) · **cierra en diseño** [DT-12](../Deudas/DT-12.md) · se
apoya en [ADR-04](ADR-04.md) (estados vigentes/terminales) sin tocar su grafo.

> **Sobre el número.** [Q6](../PREGUNTAS-ABIERTAS.md) (planificador del proceso de cierre) iba a usar
> "el siguiente número libre" después de ADR-10. Este ADR se escribió antes, así que toma el 11; el de
> Q6 pasa a ser el **ADR-12** (o el siguiente libre cuando se escriba).

---

## Contexto

Hoy nada impide agendar dos citas del mismo profesional cuyos rangos se cruzan. `duracionMin` se
guarda y se muestra, pero el fin de la cita nunca se calcula. Reagendar —la operación donde más fácil
es chocarse— tampoco lo mira.

ADR-09 recomendó *avisar y permitir* y dejó la decisión al producto. El equipo la tomó el
2026-09-25: **avisar y permitir** (respuesta a Q4).

## Opciones evaluadas

| Opción | Veredicto |
|--------|-----------|
| **Ignorar** (hoy) | **Descartada.** Una agenda que acepta imposibles en silencio, en un producto cuyo valor es la agenda. |
| **Rechazar (409)** | **Descartada para Fase 1.** Obliga a decidir reglas de borde (¿citas pegadas?, ¿colchón entre pacientes?, ¿sobrecupo intencional?) que ya son el modelo de disponibilidad, aplazado a Fase 2 (ADR-09 §2). Y quita la decisión a quien sabe si el choque es error o intención. |
| **Avisar y permitir (ELEGIDA)** | Una consulta sobre las citas vigentes del profesional en una ventana. Sin concepto nuevo, sin migración, sin romper el contrato actual: la respuesta **gana** un campo opcional. |

## Decisión

### 1. Qué es un solapamiento

Dos citas `a` y `b` se cruzan si y solo si:

- son **distintas** (`a.id ≠ b.id`), del **mismo tenant** y del **mismo profesional** (`usuarioId`);
- la otra está **vigente** (`pendiente` o `confirmada`). Las terminales (`cancelada`, `asistio`,
  `no_asistio`, `ghosting`) no ocupan la agenda;
- sus intervalos **semiabiertos** se intersectan: `a.inicio < b.fin && b.inicio < a.fin`, con
  `fin = inicio + duracionMin`.

**Citas pegadas no se cruzan** (10:00–10:50 y 10:50–11:40): es la consecuencia natural del intervalo
semiabierto y evita tener que definir un "colchón".

El profesional contra el que se compara es **el dueño de la cita** (`cita.usuarioId`), no quien hace
la petición: hoy un colega del mismo tenant puede reagendar una cita ajena (ver
[Q3](../PREGUNTAS-ABIERTAS.md)), y el choque que importa es en la agenda de quien la atiende.

### 2. Dónde vive la regla

- **En la entidad `Cita`** (ADR-04 §1): `get fin(): Date` y `chocaCon(otra: Cita): boolean`. Es la
  única fuente de la regla; los tests de dominio la fijan.
- **El repositorio solo pre-filtra** con una consulta que usa el índice existente
  `(tenant_id, usuario_id, inicio)`: citas vigentes del profesional con
  `inicio ∈ [cita.inicio − DURACION_MAXIMA_MIN, cita.fin)`. La decisión fina la toma `chocaCon`.
  Así la regla no queda duplicada en SQL.
- Para que esa cota inferior exista, **`duracionMin` pasa a tener un máximo de 1440** (un día),
  `DURACION_MAXIMA_MIN` exportada desde el dominio y aplicada con `@Max` en los DTO de entrada. Hoy
  solo se exige positiva; ninguna cita real dura más de un día.

### 3. Cuándo se calcula y qué se devuelve

Se calcula en las cuatro operaciones que fijan o mueven la ventana de una cita, **dentro de la misma
transacción** y **después** de guardar:

| Operación | Ruta |
|---|---|
| Crear | `POST /api/citas` |
| Reagendar | `PATCH /api/citas/:id/reagendar` |
| Editar (puede cambiar `duracionMin`) | `PATCH /api/citas/:id` |
| Aceptar una solicitud (crea la cita) | `POST /api/solicitudes/:id/aceptar` |

La respuesta (`CitaResponseDto`) gana un campo **opcional**:

```json
"avisos": { "solapamientos": [ /* CitaDashboardDto[] — misma forma que GET /citas/hoy */ ] }
```

- En esas cuatro operaciones `avisos` **siempre viene**, con la lista vacía si no hay choque: el
  cliente no tiene que distinguir "no hay" de "no se calculó".
- En `confirmar`, `cancelar`, `asistencia` e `inasistencia` **no viene**: no mueven la ventana.
- Los elementos usan la forma de `CitaDashboardDto` a propósito: el frontend ya sabe pintarla y
  traducirla (`toAppointment`), y solo lleva el nombre del paciente, no su contacto.
- **Nunca cambia el código de estado** ni lanza error. Es información, no una validación.

### 4. Lo que el aviso NO es

- **No es una garantía.** Dos altas simultáneas pueden no verse entre sí (ninguna ha hecho commit
  cuando la otra consulta). Para un aviso es aceptable; para un rechazo no lo sería, y es otra razón
  por la que rechazar pertenece al modelo de disponibilidad.
- **No se persiste** ni se publica en los hechos de dominio. Se recalcula en cada operación.
- **No mira el pasado de forma especial**: si se agenda en el pasado ([DT-13](../Deudas/DT-13.md)),
  se compara igual.

## Consecuencias

**Positivas**

- Cierra DT-12 sin concepto nuevo, sin migración y sin romper el contrato que ya consume el frontend.
- La decisión sigue en el profesional, que es quien sabe si un choque es sobrecupo intencional.
- La regla queda en el dominio, testeable sin base de datos; el paso a "rechazar" en Fase 2 es cambiar
  qué se hace con el resultado de `chocaCon`, no rehacerla.

**Negativas / riesgos**

- Una consulta extra (y la resolución de nombres) en cada crear/reagendar/editar/aceptar. Acotada por
  índice y por la ventana; despreciable al volumen de una agenda.
- `@Max(1440)` en `duracionMin` es un endurecimiento del contrato: un cliente que envíe más recibe
  400. Ninguno conocido lo hace.
- El aviso es "mejor esfuerzo" bajo concurrencia (§4).

## Referencias

- [ADR-09](ADR-09.md) — "Decisiones que este ADR deja abiertas a propósito", fila *Solapamiento*.
- [ADR-04](ADR-04.md) — estados vigentes y terminales; la regla vive en la entidad.
- [ADR-07](ADR-07.md) — `hora` y `fecha` de los elementos del aviso en la zona de la clínica.
- [DT-12](../Deudas/DT-12.md) · [Q4](../PREGUNTAS-ABIERTAS.md).

## Deudas técnicas asociadas

**Cierra (en diseño):** [DT-12](../Deudas/DT-12.md).

**No toca:** [DT-13](../Deudas/DT-13.md) (citas en el pasado) · [DT-14](../Deudas/DT-14.md) (instante sin
zona; ver la recomendación del contrato de cierre de Fase 1).
