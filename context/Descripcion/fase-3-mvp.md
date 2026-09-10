# Fase 3 — MVP

**Objetivo:** decidir la **versión más pequeña** que entrega valor real y permite aprender.
**Estado:** ⚠️ alcance elegido · dos preguntas abiertas

---

## Preguntas clave

1. Si solo pudieran construir 3 cosas, ¿cuáles son?
2. ¿Qué queda explícitamente FUERA de la v1?
3. ¿El MVP entrega valor por sí solo, o depende de features futuras?

---

## 1. Las tres cosas

| # | Pieza | Requisito | Estado |
|---|-------|-----------|--------|
| 1 | **Dashboard de citas del día** — paciente, hora y fecha | RF-03 · US-06 | ✅ implementado |
| 2 | **Gestión de cita** | US-02 | ✅ ambas vías entregadas · ⚠️ falta la bandeja de solicitudes |
| 3 | **Calificación de asistencia** | RF-08 | ❌ **bloqueada** |

> **Sobre el número de la tercera.** En la nota original figura como "US-07". El requisito de
> calificación de asistencia es **RF-08**; US-07 no existe en este repo. Conviene fijar un número de
> historia y usarlo siempre, porque RF-07 (respuesta del paciente) y RF-08 (calificación) son cosas
> distintas y se confunden con facilidad.

### Por qué la tercera está bloqueada

La calificación se alimenta del historial de quién cumple y quién no. **Ese historial todavía no se
acumula**: falta el proceso que cierra las citas vencidas ([DT-11](../Deudas/DT-11.md)).

El release 1 despejó la mitad del camino —ahora una cita puede llegar a `confirmada`, así que ya hay
algo que distinguir— pero mientras el proceso de cierre no exista, **no hay datos que calificar**. Y
es historial que no se reconstruye hacia atrás: es la única deuda del proyecto cuyo coste crece solo
con el tiempo.

**Traducción para la planificación: el tercer pilar del MVP depende de una pieza pequeña que aún no
está hecha, y cada semana que pasa sin ella reduce la cantidad de historial que el MVP podrá mostrar
el día que se lance.**

---

## 2. Qué queda fuera de la v1

Heredado de [Fase 0](fase-0-problema.md):

- ❌ Todo lo relativo a **dinero** (cobros, prepagos, retenciones, facturación)
- ❌ **Inventarios**

Y por no estar entre las tres piezas, quedan fuera también:

- RF-01 monitoreo · RF-02 calendarios externos · RF-04 perfil y suscripción
- RF-05 alertas al profesional
- **RF-06 recordatorios al paciente** y **RF-07 respuesta del paciente**

Los dos últimos son los que abren la pregunta siguiente.

---

## 3. ¿El MVP entrega valor por sí solo?

**Esta pregunta está sin responder, y es la más importante de la fase.**

Los criterios de éxito de [Fase 0](fase-0-problema.md) son:

1. el usuario deja de mandar mensajes por WhatsApp;
2. se desliga de presionar al paciente;
3. tiene dónde monitorear el estado de sus consultas.

El MVP tal como está definido **cumple el 3 y no cumple ni el 1 ni el 2**. Las tres piezas elegidas
—dashboard, gestión de citas, calificación— son todas del lado del profesional. **Ninguna le habla al
paciente.** Y dejar de escribir por WhatsApp solo es posible si algo más escribe en tu lugar: eso es
RF-06, que está fuera.

Dicho de otro modo: el MVP entrega **visibilidad y orden**, que es valor real —hoy esa persona
trabaja con una planilla— pero **no entrega el desligue del no-show, que es la promesa central del
producto**.

### Las tres salidas posibles

| Salida | Qué implica |
|---|---|
| **A. Meter RF-06 en el MVP** | Cuatro piezas en vez de tres. Es lo único que cumple los criterios 1 y 2 tal como están escritos. |
| **B. Reescribir los criterios de éxito para la v1** | Aceptar que la v1 es "orden y visibilidad" y que el desligue llega en la v2. Honesto, y deja el MVP como está. |
| **C. Dejarlo como está sin decidir** | La peor: se lanza creyendo que se cumplió la promesa y el usuario descubre que sigue mandando WhatsApps. |

No hay una respuesta obviamente correcta entre A y B — depende de cuánto se pueda esperar y de qué
se vaya a prometer al primer cliente. Lo que no puede quedar es sin elegir.

---

## Estado real del MVP hoy

```
Pieza 1 · Dashboard              ██████████ implementado
Pieza 2 · Gestión de cita        ████████░░ las dos vías listas · falta la bandeja
Pieza 3 · Calificación           ░░░░░░░░░░ bloqueada por el proceso de cierre
```

*(Actualizado el 2026-09-10: la vía pública del paciente se entregó sin necesitar
[ADR-08](../Decisions/ADR-08.md) completo — le bastó su mecanismo de transporte aplicado a la ruta
nueva, sin tocar el login.)*

**El camino más corto al MVP completo:** bandeja de solicitudes (cierra la pieza 2) → proceso de
cierre (desbloquea la pieza 3 y detiene el reloj) → decidir A o B sobre RF-06.

---

**Anterior:** [Fase 2 — Requisitos](fase-2-requisitos.md) · **Índice:** [README](README.md)
