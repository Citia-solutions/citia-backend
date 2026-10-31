# ADR-14: Calificación de asistencia del paciente y riesgo de cada cita (RF-08) — puntos fijos sobre los hechos de los últimos 12 meses, cuatro etiquetas, un riesgo por cita que solo informa y ayuda, y nunca datos de quién es la persona

> **Fase:** [Fase 5 — US-07](../Fases/fase-5-us07-scoring.md) · **Feature:** — · **Plan:** [US-07.01](../US/07.01-registro-hechos.md) (registro de hechos); US-07.02 y US-07.03, sin plan (🚧 bloqueadas desde el 2026-10-30, plan incluido) · **Relacionado:** [ADR-04](../Decisions/ADR-04.md), [ADR-10](../Decisions/ADR-10.md), [ADR-11](../Decisions/ADR-11.md), [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [DT-11](../Deudas/DT-11.md), [DT-13](../Deudas/DT-13.md), [DT-16](../Deudas/DT-16.md), [DT-23](../Deudas/DT-23.md), [DT-30](../Deudas/DT-30.md), [DT-44](../Deudas/DT-44.md), [DT-47](../Deudas/DT-47.md), [DT-48](../Deudas/DT-48.md), [DT-49](../Deudas/DT-49.md), [DT-50](../Deudas/DT-50.md), [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1), [Q17](../PREGUNTAS-ABIERTAS.md#q17--manejo-de-datos-de-salud)

**Fecha:** 2026-10-19 · decisiones de producto de US-07.02 aprobadas el 2026-10-30 · US-07.02 y US-07.03
bloqueadas el 2026-10-30
**Estado:** **Aceptado en lo que toca a US-07.01 (2026-10-19)** · US-07.02 y US-07.03: **🚧 bloqueadas desde el
2026-10-30, plan incluido** (decisión del usuario: *"vamos a bloquear esta fase del scoring"*), hasta que un
abogado revise el [Contexto legal](#contexto-legal-a-validar-por-un-abogado) o el usuario decida otra cosa. Al
2026-10-30 el usuario no tiene abogado, y un pre-análisis legal hecho con una IA ese mismo día (**no es un abogado
ni una opinión legal**) recomienda no habilitar el perfilamiento mientras no haya fundamento jurídico (arts. 16 bis,
inciso 1, y 8 bis de la Ley 21.719; detalle en el [Contexto legal](#contexto-legal-a-validar-por-un-abogado)).
Siguen **propuestas**, con sus **decisiones de producto aprobadas por el usuario el 2026-10-30** (decisiones 3,
5.b, 5.d, 8, 9, 11 y la pregunta 2 de Q6; detalle en
[Preguntas abiertas](#preguntas-abiertas-y-lo-que-queda-a-confirmar)): el bloqueo **no las revierte**, siguen
vigentes y quedan listas para cuando se desbloqueen · las decisiones de producto las tomó el usuario (arquitecto
y dueño del producto) el 2026-10-19 y el 2026-10-30 ·
[US-07.01](#10-us-0701-los-datos-que-hoy-se-pierden-va-primero) (registro de hechos: decisiones 9 y 10) está
**en producción desde el 2026-10-20**, con el **job G1 prendido desde el 2026-10-27**
([DT-11](../Deudas/DT-11.md) cerrada) y sus pruebas manuales en curso; su contrato está en el plan
[US-07.01](../US/07.01-registro-hechos.md). **El bloqueo no la toca** · US-07.02 (calificación y riesgo) y US-07.03
(acciones) siguen además fuera del MVP, en la v2
([ROADMAP](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring)) · **el siguiente paso de la Fase 5 es
cerrar US-07.01** (las pruebas manuales que faltan y su documentación de cierre; [Plan de
ejecución](#plan-de-ejecución)) · lo que queda abierto está en
[Preguntas abiertas y lo que queda a confirmar](#preguntas-abiertas-y-lo-que-queda-a-confirmar)
*(Antes, en la mañana del 2026-10-19: **Propuesto**, sin implementar; US-07.01 se llamaba "Etapa 0". Del
2026-10-19 al 2026-10-30: US-07.01 en construcción y luego en producción con el job G1 apagado; las preguntas de
US-07.02 —peso de `nuevo`, recordatorio no entregado, decisión 8, corrección de cierres, Q6 p2— abiertas. El
2026-10-30, hasta el bloqueo: US-07.02 y US-07.03 "siguen en la v2"; la revisión legal "bloquea su
implementación, no su plan", y "el siguiente paso es el plan de US-07.02" (paso 4 del Plan de ejecución).)*
**Commits:** US-07.01: `3e64472` (este ADR y el plan), `1545ad7` (esquema), `f123617` (dominio, API y job G1),
`8a7953b` y `d4aa920` (tests), `bb90815` (DT-47); merge `715c3f3` a `develop` y release `313a506` a `main`
(2026-10-20) · decisiones y bloqueo del 2026-10-30: en la rama `docs/fase5-decisiones-us0702`
**Historia:** US-07, repartida en tres subtareas con la convención de US-02.07 / US-02.08:
**US-07.01** · registro de hechos ([plan](../US/07.01-registro-hechos.md)) · **US-07.02** · calificación y
riesgo (sin plan; 🚧 bloqueada desde el 2026-10-30) · **US-07.03** · acciones (sin plan; 🚧 bloqueada desde el
2026-10-30). La calibración es una tarea posterior, sin US propia.
No confundir US-07.01 con la subtarea US-02.07.
**Relación:** **extiende** [ADR-04](ADR-04.md) §2 con dos transiciones desde `pendiente` y la guarda de la hora de inicio (decisión 9) ·
**usa** el outbox y el planificador de [ADR-12](ADR-12.md) (el job G1 y los dos controles del riesgo son
jobs de su tabla del §5) · **lee** el estado de los recordatorios de [ADR-13](ADR-13.md) y respeta sus
políticas y su cuota · **se apoya en** [ADR-10](ADR-10.md) (enlace por cita, "nada después de `inicio`",
regla G1) y **fija** el peso de la confirmación que su G2 dejó a esta fase · **retoma** [DT-11](../Deudas/DT-11.md)
(el job G1 entra en US-07.01) · **es** el ADR que [DT-30](../Deudas/DT-30.md) pedía para su salida B ·
**reemplaza** el punto 2 del desglose del [ROADMAP § Fase 5](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring)
(tres etiquetas → cuatro) · **responde** (2026-10-30) la pregunta 2 de
[Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1): las `confirmada`
que nadie cerró siguen neutras y van a una lista de citas pasadas sin cerrar *(antes: no la respondía)* ·
**exceptúa** (2026-10-30) la regla "de un terminal no se sale" de [ADR-04](ADR-04.md) §2 con la corrección de un
cierre equivocado dentro de 7 días (decisión 9).

> **Nombres (2026-10-19).** Este ADR llamaba "Etapa 0, 1, 2 y 3" a sus partes; desde el 2026-10-19 son
> US-07.01, US-07.02, US-07.03 y la calibración. "Etapa" queda reservada para las
> [etapas del producto](../Descripcion/README.md): la *etapa 0 del producto* que se cita más abajo es la
> de `Descripcion/`, no una parte de este ADR.

> **Por qué este ADR pesa más que otros.** El ausentismo es el problema que Citia existe para resolver
> ([etapa 0 del producto](../Descripcion/fase-0-problema.md)), y la propuesta de valor lo dice con todas las
> letras: *"control del paciente mediante porcentaje de asistencia, calificación por comportamiento
> histórico"*. Los recordatorios (Fase 2) y la respuesta del paciente (Fase 3) son el canal; **calificar al
> paciente por lo que hace es el diferenciador**. Por eso cada regla de este ADR se escribe pensando en quién
> sale perjudicado si se equivoca: el paciente.

---

## Contexto

RF-08 pide *"calcular el % de asistencia / comportamiento histórico del paciente"*. El ROADMAP lo desglosa en
un porcentaje, tres etiquetas (`nuevo`, `confiable`, `riesgo`), la regla "sin historial = siempre nuevo" y un
recálculo al cerrar cada cita. Salió del MVP el 2026-09-30 y pasó a la v2.

Dos restricciones enmarcan el diseño:

1. **Hay pocos datos.** El piloto tiene pocas citas por profesional. La asistencia solo se registra desde el
   **2026-10-05** ([DT-30](../Deudas/DT-30.md), mitigada) y la confirmación del paciente desde el
   **2026-10-17** (Fase 3). Lo anterior se perdió.
2. **Es un perfil de personas en un contexto de salud.** Lo que se calcule va a aparecer junto al nombre de un
   paciente en la pantalla de su profesional de la salud. Tiene que poder explicarse en una frase, no puede
   castigar a quien avisa y no puede usar nada que diga *quién es* la persona en vez de *lo que hizo*.

### Lo que hay hoy (verificado en el código, 2026-10-19)

| Pieza | Estado |
|---|---|
| Estados de la cita | `pendiente · confirmada · cancelada · asistio · no_asistio · ghosting`; de un terminal no se sale ([ADR-04 §2](ADR-04.md)) |
| Marcar asistencia o inasistencia | **solo desde `confirmada`** (`puedeMarcarAsistencia` / `puedeMarcarInasistencia` en `cita.entity.ts`). El voucher lo ofrece desde el 2026-10-05. Una cita que llega `pendiente` hay que confirmarla primero, así que **quien llega sin haber confirmado aparece "confirmado por el profesional"** |
| `ghosting` | `Cita.marcarGhosting()` existe y **nadie lo llama**: solo lo marcaría el job G1, que está aplazado ([DT-11](../Deudas/DT-11.md)). `AccionCita` lo excluye a propósito (*"nunca una persona"*). Una cita sin enlace a la que el paciente falta **queda `pendiente` para siempre** |
| Bitácora `cambios_cita` | append-only: `tipo`, estado e `inicio` anterior y nuevo, `motivo` (texto libre), `actor_tipo` (`profesional · paciente · sistema`), `actor_id`, `ocurrido_en`. **No registra quién pidió el cambio**: si el paciente llama y el profesional cancela, queda como del profesional |
| Enlace del paciente | `enlaces_cita` guarda emisión y revocación. `GET /api/publico/cita` no escribe nada: **no se sabe si el paciente abrió su enlace** |
| Origen de la cita | `citas` no lo guarda. El de una solicitud pública aceptada se deduce a medias por `solicitudes_cita.cita_id`; el resto no queda |
| Estado de los recordatorios | por cita y antelación, con motivo (`sin_correo`, `correo_suprimido`, `rebote`, `correo_invalido`, …) ([ADR-13 §4](ADR-13.md)) |
| Citas con `inicio` en el pasado | se aceptan al crear ([DT-13](../Deudas/DT-13.md)) |
| Consentimiento | una casilla única; en el alta manual la marca el profesional; nadie la lee ([DT-16](../Deudas/DT-16.md)) |
| Identidad del paciente | nada verifica que el RUT sea de quien lo escribe ([DT-23](../Deudas/DT-23.md)) |

---

## Opciones evaluadas

### A. Cómo se calcula

| Opción | Veredicto |
|--------|-----------|
| **A1. Puntos fijos por hechos (ELEGIDA)** | Se suman y descuentan puntos por lo que el paciente hizo. Funciona desde la primera cita, se explica solo ("faltó dos veces") y es una función pura que se prueba sin base. |
| **A2. Modelo predictivo aprendido ahora** (regresión logística, árboles, ML) | **Descartada por ahora.** Con el volumen del piloto y datos desde el 2026-10-05 no tiene de qué aprender, no se puede calibrar ni validar, y no se explica a un paciente ni a un abogado. **Queda como evolución futura opcional, no comprometida** (decisión 11). |
| **A3. LLM** | **Descartada para predecir.** El problema es de datos tabulares y pide un valor calibrado, estable y barato: un LLM no da ninguna de las tres cosas. Además, usarlo implica enviar datos de salud a un tercero. |

### B. Qué se califica

| Opción | Veredicto |
|--------|-----------|
| **B1. El paciente y la cita, por separado (ELEGIDA)** | La calificación del paciente responde *"¿con quién puedo contar?"*; el riesgo de la cita, *"¿qué hago con esta hora?"*. La primera es una de las entradas del segundo. |
| **B2. RF-08 tal cual: solo el % y tres etiquetas** | **Descartada.** El % no distingue a un paciente con una cita de uno con veinte, no ve las cancelaciones tardías y no dispara ninguna acción. Con tres etiquetas, todo el que no es "confiable" ni "nuevo" queda marcado "riesgo". |
| **B3. Solo el riesgo por cita, sin etiqueta de la persona** | **Descartada.** Perfila menos, pero el profesional quiere ver el historial de cada paciente (criterio de éxito 3 de la etapa 0 del producto, entregable del ROADMAP), y la historia del paciente es la mejor señal del riesgo de su cita. **Es el plan B** si la revisión legal no admite la etiqueta ([Contexto legal](#contexto-legal-a-validar-por-un-abogado)). |

### C. Cómo se guarda el puntaje del paciente

| Opción | Veredicto |
|--------|-----------|
| **C1. Se recalcula siempre con los hechos de los últimos 12 meses (ELEGIDA)** | Función pura sobre la lista de hechos. Los hechos viejos expiran solos y un cambio de pesos se aplica hacia atrás sin migrar datos. |
| **C2. Contador acumulado en una columna** | **Descartada.** No olvida (o exige un job que reste), un cambio de pesos obliga a recalcular todo con una migración y un error de suma queda grabado. |

### D. Cuándo una cancelación es "tarde"

| Opción | Veredicto |
|--------|-----------|
| **D1. Con menos de min(24 h, la mitad del tiempo entre la reserva y la cita) (ELEGIDA)** | Justa con quien reservó a última hora: siempre le queda una ventana para avisar a tiempo. |
| **D2. 24 h fijas** | **Descartada.** Quien reserva con 10 h nunca puede cancelar "a tiempo": cualquier aviso lo castiga, y le conviene no avisar. |
| **D3. Excluir las reservas con menos de 24 h** | **Descartada.** Pierde la señal justo en las horas del mismo día, y D1 ya las trata bien. |

### E. Cuánto pesa cada hecho

| Opción | Veredicto |
|--------|-----------|
| **E1. Cancelar tarde −10, no llegar −25, `ghosting` igual que `no_asistio` (ELEGIDA)** | Avisar tarde siempre sale más barato que no llegar, y confirmar no expone al paciente a nada más. |
| **E2. La cancelación tardía igual que una falta** | **Descartada: incentivo perverso.** Si avisar tarde cuesta lo mismo que no ir, no se avisa, y el profesional pierde la oportunidad de llenar la hora. |
| **E3. `no_asistio` (confirmó y no llegó) más grave que `ghosting`** | **Descartada.** Al paciente le convendría no confirmar nunca. |

### F. Qué se hace con el riesgo

| Opción | Veredicto |
|--------|-----------|
| **F1. Informar, ayudar al paciente a llegar y sugerir al profesional (ELEGIDA)** | La decisión sobre la hora sigue siendo del profesional, que conoce al paciente. |
| **F2. Restricciones automáticas** (liberar la hora sola, bloquear la vía pública, exigir condiciones por el puntaje) | **Descartada.** Un dato equivocado —un cierre mal marcado, un RUT suplantado ([DT-23](../Deudas/DT-23.md))— le quitaría la hora a una persona real sin que nadie lo decida. Es justo la decisión automatizada frente a la que la ley da derecho de oposición, y deteriora la relación con el paciente, que según la etapa 0 del producto el profesional ya paga caro. |

### G. Datos entre clínicas

| Opción | Veredicto |
|--------|-----------|
| **G1. No se comparte nada: cada clínica con sus propios hechos (ELEGIDA)** | Con pesos fijos no hay nada que entrenar en común. |
| **G2. Agregados anonimizados para un modelo futuro** | **No en esta versión.** Solo con las condiciones de la decisión 11, y por un ADR nuevo. |
| **G3. Historial del paciente compartido entre clínicas** | **Descartada.** Ver la decisión 11. |

---

## Decisión

### 1. Puntos fijos, no un modelo predictivo

La calificación del paciente y el riesgo de la cita son **sumas de puntos fijos** sobre hechos con fecha
(opción A1). Los pesos de este ADR son **iniciales** y son **parámetros**, juntos en un solo lugar, no
constantes repartidas por el código: se revisan con datos reales tras el primer mes (decisión 5.f).

Un modelo aprendido queda como evolución **opcional y no comprometida**. Si algún día hay datos para
entrenarlo y validarlo, entra por un ADR nuevo y **sin tocar la regla estricta de la decisión 7**.

### 2. Dos piezas

| | Calificación del paciente | Riesgo de la cita |
|---|---|---|
| Responde | ¿con quién puedo contar? | ¿qué hago con esta hora? |
| Cambia | **solo cuando se cierra una cita** del paciente (y cuando un hecho cumple 12 meses y sale de la ventana) | **con cada señal** de la cita y en dos controles del planificador |
| Resultado | etiqueta (`nuevo · regular · confiable · riesgo`), % de asistencia y conteos | nivel (`bajo · medio · alto`) y sus motivos |
| Lo ve | el profesional; **nunca el paciente** | el profesional |

La calificación es una de las entradas del riesgo (decisión 5.b).

### 3. Calificación del paciente

**Hechos y puntos.**

| Hecho (de una cita del paciente en esa clínica) | Puntos |
|---|---|
| Asistió (`asistio`) | **+10** |
| Canceló o reagendó **a tiempo** | **0** — avisar nunca se castiga |
| Canceló **tarde** o pidió otra hora **tarde** ("tarde": decisión 4) | **−10** |
| No llegó (`ghosting` o `no_asistio`) | **−25** |
| Lo que decidió el profesional (canceló o movió la hora por su cuenta) | **0** |

- **`ghosting` y `no_asistio` pesan igual a propósito.** Si faltar tras confirmar pesara más, al paciente le
  convendría no confirmar (opción E3).
- **Cancelar y reagendar cuentan según quién lo pidió**, no según quién apretó el botón: si el paciente llamó
  y el profesional canceló por él, es una cancelación del paciente. Por eso hace falta el dato (c) de
  [US-07.01](#10-us-0701-los-datos-que-hoy-se-pierden-va-primero).
- **Confirmar no suma puntos al paciente**: entra al riesgo de la cita (decisión 5.b).

**Cálculo.**

- **Base 50, rango 0–100.** Los hechos de los **últimos 12 meses** se aplican en **orden cronológico**, y el
  tope se aplica **paso a paso**: después de cada hecho el puntaje se acota a [0, 100]. Desde 0, una falta más
  no deja deuda; desde 100, una asistencia más no acumula reserva.
- **Función pura, sin estado guardado** (opción C1): `calificar(hechos, ahora, parametros)`. No hay contador
  acumulado. Los hechos viejos expiran solos y un cambio de pesos se aplica hacia atrás sin migrar datos.
- **Un solo hecho por hora comprometida, el peor**, no la suma; y una cita con una petición de otra hora
  rechazada en silencio no cuenta como falta mientras el rechazo no se le avise al paciente (decisión 8,
  **aprobada el 2026-10-30**).
- **Cuenta el último desenlace** de cada cita: si el profesional corrigió un cierre dentro de los 7 días que
  permite la decisión 9 (aprobada el 2026-10-30), vale la corrección, no el cierre original.
- **No cuentan:**
  - las citas **sin cerrar** (`pendiente` o `confirmada` ya pasadas que nadie cerró): son **neutras**
    mientras sigan así (regla [G1](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14) y pregunta 2 de Q6).
    **Confirmado el 2026-10-30** para las `confirmada`: no se adivina la asistencia; aparecen en una **lista de
    citas pasadas sin cerrar** para que el profesional las marque
    ([Preguntas abiertas](#preguntas-abiertas-y-lo-que-queda-a-confirmar));
  - las citas cuyo `inicio` ya había pasado cuando se fijó —las creadas en el pasado de
    [DT-13](../Deudas/DT-13.md)—: nadie le avisó al paciente de una hora que ya ocurrió;
  - lo que no se registró: no hay asistencia antes del 2026-10-05 ni `ghosting` antes del corte de G1
    (2026-10-17, 03:22 UTC).

**Etiquetas.** Son cuatro: RF-08 y el ROADMAP decían tres y se agrega **regular**, por decisión del usuario,
para no marcar "riesgo" a quien simplemente todavía no es confiable. Se evalúan **en este orden** y gana la
primera que se cumple (todo sobre los últimos 12 meses):

| # | Etiqueta | Regla |
|---|---|---|
| 1 | **riesgo** | menos de **40** puntos **y** al menos **2 faltas**. Se aplica **aunque el paciente siga siendo nuevo** |
| 2 | **nuevo** | menos de **3 citas con desenlace** (asistió, faltó o canceló tarde) |
| 3 | **confiable** | **70** puntos o más |
| 4 | **regular** | el resto |

- La regla del ROADMAP *"sin historial = siempre nuevo"* se mantiene, con una excepción deliberada: dos faltas
  bastan para `riesgo` aunque no haya tres desenlaces.
- **Cancelar tarde, por sí solo, nunca lleva a `riesgo`**: la regla exige dos faltas.

**Ejemplos de comportamiento.**

| Historia en los últimos 12 meses | Puntaje | Etiqueta |
|---|---|---|
| 3 asistencias | 80 | **confiable** |
| 2 asistencias y 1 falta | 45 | **regular** |
| Falta a sus 2 primeras citas | 0 | **riesgo** (aunque solo tiene 2 desenlaces) |
| Un confiable de años que falta una vez (en 100, que se alcanza con 5 asistencias en el año) | 75 | sigue **confiable** |
| Desde 0, con 4 asistencias / con 7 asistencias | 40 / 70 | **regular** / **confiable** |
| 2 asistencias | 70 | **nuevo** (todavía no tiene 3 desenlaces) |

> Ojo con el cuarto ejemplo: se cumple porque el puntaje ya estaba en el tope. Con 4 asistencias en el año
> (90), una falta lo deja en 65: **regular**. Ver [Consecuencias](#consecuencias) sobre los pacientes que
> van pocas veces al año.

**Qué ve cada uno.**

- **El profesional** ve la **etiqueta**, el **% de asistencia** —asistencias ÷ (asistencias + faltas) en los
  últimos 12 meses, que es lo que pide RF-08; sin asistencias ni faltas no hay %— y los **conteos**
  (asistencias, faltas, cancelaciones tardías y a tiempo). **No ve el número de puntos**: sugiere una precisión
  que no tiene, mientras que los conteos se explican solos.
- **El paciente nunca ve su etiqueta**: ni en el portal ni en un correo. Lo que la ley le permita pedir es otra
  cuestión (pregunta 6 del [Contexto legal](#contexto-legal-a-validar-por-un-abogado)).

### 4. Qué es "tarde"

Una cancelación o una petición de otra hora **pedida por el paciente** es tarde si ocurre con menos de:

```
umbral      = min(24 h, (inicio − reservadaEn) / 2)
reservadaEn = el último cambio de hora de la cita (su creación o su último reagendamiento)
```

La anticipación se mide **desde el último cambio de hora**, no desde la creación: quien reservó hace un mes y
fue movido ayer a mañana tiene la ventana de lo que queda, no la de un mes.

| Reservó | Cuenta como tarde si cancela con menos de |
|---|---|
| 7 días antes | 24 h |
| 30 h antes | 15 h |
| 10 h antes | 5 h |
| 1 h antes | 30 min |

- **Las 24 h y "la mitad" son parámetros.** Más adelante podrían configurarse por profesional.
- **No llegar cuenta siempre**, sin importar la anticipación.
- **Las reservas con menos de 60 minutos no reciben recordatorio** ([ADR-13 §5.e](ADR-13.md)), así que el
  paciente no recibe el enlace y solo puede avisar por teléfono. La falta cuenta igual; el riesgo de esa cita,
  en cambio, **no sube por eso** (decisión 5.b, aprobada el 2026-10-30: `creada_tarde` no suma el +3).
- **En una petición de otra hora**, el instante que cuenta es el de la petición (cuando se recibe la
  `SolicitudCita` de tipo `reagendamiento`), no el de su aceptación en la bandeja.

### 5. Riesgo de la cita

**a. Los niveles se definen por lo que hace el sistema**, no por una probabilidad:

| Nivel | Qué hace el sistema |
|---|---|
| **bajo** | nada extra |
| **medio** | **insiste con el paciente**: un recordatorio extra o un pedido destacado de confirmar. Ojo con la cuota de Resend ([ADR-13 §11](ADR-13.md)) |
| **alto** | lo de medio **y además avisa al profesional**: *"considera llamar o hacer sobrecupo"* (el solapamiento se avisa y se permite, [ADR-11](ADR-11.md)). Mientras no exista la [Fase 4](../Fases/fase-4-us05-alertas.md) (alertas), es **una marca en la agenda y en el voucher** |

> **Si el recordatorio no se pudo entregar, no se insiste por el mismo canal** (aprobado el 2026-10-30, punto 2
> de 5.b): la acción va **al profesional**, sea el nivel `medio` o `alto`.

**b. Puntos.** *(Aprobados por el usuario el 2026-10-30, con tres cambios sobre la tabla del 2026-10-19: el peso
de `nuevo`, qué cuenta como recordatorio no entregado y qué reagendamientos cuentan.)*

| Señal | Puntos |
|---|---|
| Calificación del paciente: confiable / nuevo / regular / riesgo | **−2 / 0 / +1 / +3** · *antes: `nuevo` +1* |
| Reservó con más de 14 días de anticipación (medida como en la decisión 4) | **+1** |
| La cita se reagendó 2 o más veces **a pedido del paciente** (`pedido_por`; vacío = profesional, como en US-07.01) | **+1** · *antes: todos los reagendamientos, a precisar* |
| **El recordatorio no se pudo entregar**, por una falla del contacto del paciente (sin correo, correo suprimido, rebote, correo inválido) **o del sistema** (cuota de Resend agotada, fusible del tenant). **No suma** si el profesional apagó los recordatorios ni si la cita se creó con menos de 60 min (`creada_tarde`, [ADR-13 §5.e](ADR-13.md)) | **+3** · *antes: "rebotado o no enviado (sin correo, correo suprimido)"* |
| 12 h después de entregado el recordatorio, no abrió el enlace | **+1** |
| A 3 h de la cita, sigue sin confirmar | **+1** |
| Confirmó (el paciente o el profesional) | **−4** |

**Umbrales:** 0 o menos = **bajo** · de 1 a 3 = **medio** · 4 o más = **alto**.

La confirmación del paciente y la del profesional **pesan igual (−4)**: es el peso que [ADR-10](ADR-10.md) G2
dejó para esta fase.

> **Decidido el 2026-10-30** (eran las dos preguntas abiertas de esta tabla, más dos que estaban "a precisar"):
>
> 1. **`nuevo` suma 0.** Con +1, un paciente nuevo con el recordatorio entregado ya quedaba en `medio`, y en el
>    piloto, donde casi todos son nuevos, el sistema habría insistido con casi todos, gastando la cuota de
>    Resend ([ADR-13 §11](ADR-13.md)). Con 0, `nuevo` solo sube por las demás señales. *Antes (2026-10-19):
>    +1, a decidir en US-07.02.*
> 2. **Si el recordatorio no se pudo entregar, la acción va directo al profesional**: insistir por el mismo
>    canal que ya falló no ayuda al paciente a llegar y solo gasta cuota. El nivel se calcula igual; cambia a
>    quién se dirige la acción (US-07.03). *Antes: propuesta.*
> 3. **El +3 suma también las fallas del sistema** (cuota agotada, fusible del tenant), no solo las del contacto
>    del paciente, y no suma ni los recordatorios apagados por el profesional ni las citas creadas con menos de
>    60 min. **Cambia la inclinación anterior** ("solo lo que se debe al contacto del paciente") por el punto 2:
>    un correo que no llegó ahora significa *"avísale al profesional"*, y eso hace falta también cuando falló el
>    sistema. No castiga al paciente: el riesgo no entra en su calificación (decisión 2).
> 4. **Solo cuentan los reagendamientos pedidos por el paciente** para el +1 de "se reagendó 2 o más veces".
>    Lo que movió el profesional por su cuenta no dice nada del paciente (decisión 3). *Antes: a precisar, con
>    esa misma inclinación.*

**c. Cuándo se recalcula.** Con **cada hecho** de la cita o del paciente —por el outbox: el suscriptor relee y
reconcilia contra el estado actual, no aplica deltas ([ADR-12 §4](ADR-12.md))— y en **dos controles del
planificador** ([ADR-12 §5](ADR-12.md)): **12 h después de entregado el recordatorio** y **3 h antes de la
cita**. Una cita terminal ya no tiene riesgo.

**d. Situaciones típicas.** *(Recalculadas el 2026-10-30 con `nuevo` = 0.)*

| Situación | Cálculo | Nivel |
|---|---|---|
| Confiable sin confirmar | −2 | **bajo** |
| Riesgo que confirmó | 3 − 4 = −1 | **bajo** |
| Nuevo con el recordatorio entregado | 0 | **bajo** · *antes: 1, medio* |
| Regular con el recordatorio entregado | 1 | **medio** |
| Nuevo que no abrió el enlace y a 3 h sigue sin confirmar | 0 + 1 + 1 = 2 | **medio** · *antes: 1 + 1 + 1 = 3* |
| Confiable con el correo rebotado | −2 + 3 = 1 | **medio**; la acción va al profesional (punto 2 de 5.b) |
| Riesgo con 12 h sin abrir el enlace | 3 + 1 = 4 | **alto** |
| Nuevo sin correo válido | 0 + 3 = 3 | **medio**; la acción va al profesional · *antes: 1 + 3 = 4, alto* |
| Regular sin correo válido | 1 + 3 = 4 | **alto**; la acción va al profesional |
| Cualquiera, con la cuota de Resend agotada o el fusible del tenant | su base + 3 | según la base; la acción va al profesional (punto 3 de 5.b) |
| Cita creada con menos de 60 min (`creada_tarde`) o con los recordatorios apagados | su base, sin el +3 | según la base |

*Antes (2026-10-19), la fila "Nuevo o regular con el recordatorio entregado" daba 1, **medio**, para los dos.*

**e. "Pidió otra hora" no es riesgo de ausencia.** El paciente avisó. Va como **marca aparte**: la nota
*"El paciente pidió otra hora"* del voucher ya existe ([ADR-10 R4](ADR-10.md)).

**f. Pesos iniciales y calibración.** Los pesos son **iniciales**. Después del **primer mes** con datos reales se
revisan: cuántas citas salieron en `alto` y cuántas de esas terminaron en falta (y, al revés, cuántas faltas no
habían salido en `alto`). **La meta es que `alto` salga en alrededor de 1 de cada 10 citas.** Para poder
medirlo, cada evaluación guarda su nivel, sus señales y cuándo se hizo (decisión 12). Cambiar un peso o un
umbral es cambiar un parámetro; cambiar **qué datos** entran exige un ADR nuevo (decisión 7).

**g. Qué ve cada uno.** El profesional ve el **nivel y sus motivos** (*"no abrió el enlace"*, *"correo
rebotado"*, *"paciente en riesgo"*), no los puntos. Lo que recibe el paciente cuando el sistema insiste **no
menciona el riesgo**: es un recordatorio como cualquier otro o un pedido neutro de confirmar.

### 6. Acciones permitidas: informar, ayudar a llegar, sugerir. Nunca restringir

| Permitido | Prohibido (cambiarlo exige un ADR nuevo) |
|---|---|
| Mostrarle al profesional la etiqueta, el %, los conteos y el nivel de riesgo con sus motivos | Liberar o cancelar la hora automáticamente |
| Ayudar al paciente a llegar: recordatorio extra, pedido de confirmar | Bloquear o frenar la vía pública o el enlace del paciente por su puntaje |
| Sugerirle al profesional que llame o haga sobrecupo | Exigir confirmación, prepago o cualquier condición por el puntaje |
| | Cambiar lo que el paciente ve o puede hacer en el portal según su etiqueta |

### 7. Regla estricta: solo lo que el paciente hizo en esa clínica

> **Cambiar esta regla exige un ADR nuevo.**

El puntaje y el riesgo se calculan **solo** con:

- **lo que el paciente hizo en esa clínica** (el tenant): asistió, faltó, canceló, reagendó o pidió otra
  hora, confirmó, abrió el enlace;
- **señales de la cita**: la anticipación de la reserva, los reagendamientos, el estado del recordatorio.

**Nunca** se usan:

- la edad o la fecha de nacimiento;
- el sexo o el género;
- la comuna o la dirección;
- la previsión;
- la nacionalidad;
- el tipo de consulta (`tipoConsulta`): delata la condición de salud;
- el número de RUT: en Chile aproxima la edad;
- ningún dato que permita deducirlos (por ejemplo, el nombre, que aproxima el sexo).

**Cómo se hace cumplir:**

- **El módulo de calificación no recibe la entidad `Paciente`.** Su dominio trabaja con una **lista de hechos
  con fecha** (`{ tipo, ocurridoEn, citaId, … }`); el paciente es solo un id.
- **Un test de arquitectura le prohíbe importarla**, como `src/arquitectura.spec.ts` vigila hoy la arquitectura
  hexagonal ([ADR-02](ADR-02.md)): ningún archivo del módulo importa del módulo `paciente` (ni su entidad, ni su
  repositorio, ni sus DTO).
- **El lector SQL** del módulo (de solo lectura, como `LectorCitas` en [ADR-13 §1](ADR-13.md)) selecciona
  columnas explícitas: de `pacientes`, como mucho el `id`, y nunca `tipo_consulta`. *Propuesta:* el mismo test
  revisa que el SQL de su infraestructura no nombre esas columnas.

### 8. Principio rector: avisar siempre tiene que convenirle al paciente más que no llegar

Cada regla de este ADR se revisa contra este principio, y cualquier regla nueva también. Revisión del
2026-10-19, actualizada el 2026-10-30 con las decisiones del usuario:

| Regla | ¿Avisar le conviene más que no llegar? |
|---|---|
| A tiempo 0 · tarde −10 · no llegar −25 | **sí** |
| `ghosting` = `no_asistio` | **sí**: confirmar no lo expone a nada más |
| "Tarde" = min(24 h, la mitad) | **sí**: quien reservó con poco margen siempre tiene una ventana para avisar |
| Hora movida tarde por el profesional | **sí**: "tarde" se mide desde el último cambio de hora, así que al paciente le queda la mitad del tiempo restante para avisar a tiempo |
| Una petición de otra hora `recibida` no es `ghosting` (G1, condición 3) | **sí** |
| Lo que decidió el profesional = 0 | **sí** |
| **El paciente pide otra hora tarde, se la rechazan en silencio ([ADR-10 R3](ADR-10.md), [DT-44](../Deudas/DT-44.md)) y no llega** | **Sí, desde el 2026-10-30** (aprobado por el usuario). G1 solo excluye las peticiones `recibida`, así que tras el rechazo la cita puede terminar en `ghosting`; la calificación lo resuelve con dos reglas: (1) cada hora comprometida aporta **un solo hecho, el peor**, no la suma; y (2) **mientras el rechazo no se le avise al paciente** (R3, DT-44), una cita con una petición de otra hora rechazada **no cuenta como falta**. Ejemplo: pidió otra hora tarde, se la rechazaron en silencio y no llegó → queda en **−10**, no en −35. *Antes (2026-10-19): "No, tal como está escrito" —la petición tardía (−10) más la falta (−25) daban −35, peor que no avisar (−25)—, con estas dos reglas como propuesta.* Cuando el rechazo se avise, la regla (2) se revisa |

### 9. Cambio en la máquina de estados (extiende ADR-04)

**Aprobado por el usuario el 2026-10-19** (las dos transiciones y la guarda de la hora): el profesional puede
marcar **asistencia e inasistencia sobre una cita `pendiente`**, sin confirmarla antes. Hasta US-07.01,
`cita.entity.ts` solo lo permitía desde `confirmada`, y `ghosting` solo lo marcaría el job G1. Por eso una cita
sin enlace a la que el paciente falta quedaba `pendiente` para siempre, y quien llegaba sin haber confirmado
aparecía "confirmado" por el profesional.

| Desde | Evento | Hacia | Actor en la bitácora | Estado de la decisión |
|---|---|---|---|---|
| `pendiente` | el profesional marca asistencia | `asistio` | `profesional` | **aprobada** (2026-10-19) |
| `pendiente` | el profesional marca inasistencia | **`ghosting`** | `profesional` | **aprobada** (2026-10-19) · *antes: propuesta* |
| `pendiente` | el job G1 cierra la cita | `ghosting` | `sistema` | sin cambios ([DT-11](../Deudas/DT-11.md)); construido en US-07.01, **prendido en production desde el 2026-10-27** |
| `confirmada` | el profesional marca asistencia / inasistencia | `asistio` / `no_asistio` | `profesional` | sin cambios |
| `asistio` · `no_asistio` · `ghosting` | el profesional **corrige** el desenlace, dentro de 7 días | el otro desenlace (abajo) | `profesional` | **aprobada** (2026-10-30) · se construye en US-07.02 |

- **`pendiente → asistio` es directo.** El paciente llegó; no hace falta inventar una confirmación que no hubo.
- **Por qué `ghosting` para la inasistencia desde `pendiente`.** Conserva la semántica de ADR-04 §2
  —`ghosting` = *"nunca confirmó y no llegó"*, `no_asistio` = *"confirmó y no llegó"*— y se distingue del
  cierre automático por el **actor** (`profesional` frente a `sistema`). La ruta sigue siendo
  `PATCH /api/citas/:id/inasistencia`: el estado de destino lo decide el dominio según el estado de origen.
- **Alternativa descartada: `no_asistio`** para toda inasistencia que marca una persona. Era más fácil de
  explicar en la interfaz ("No asistió"), pero mezclaba en un mismo estado a quien confirmó y a quien no. Para
  el puntaje daba igual: los dos valen −25.
- ~~**De un terminal no se sale**: eso no cambia.~~ **De un terminal no se sale, con una sola excepción desde el
  2026-10-30:** la corrección de un cierre equivocado (abajo). *Antes (2026-10-19): sin excepción.*
- **El dominio exige `ahora ≥ inicio`** para marcar asistencia o inasistencia, desde cualquier estado de origen
  (**aprobado** el 2026-10-19; *antes: recomendación*). Hasta US-07.01 solo lo bloqueaba el frontend
  ([DT-30](../Deudas/DT-30.md)), y con la inasistencia desde `pendiente` el daño de un clic prematuro crecía: se
  le podría marcar `ghosting` a alguien antes de su hora. Antes de la hora, la API responde **409**.
- **Lo que toca en el código** está en el plan [US-07.01](../US/07.01-registro-hechos.md#dominio-módulo-cita):
  las guardas y, con ellas, `accionesPermitidas(ahora)`; los comentarios que decían que `ghosting` nunca lo
  marca una persona; y el hecho que se publica. **Se publica `CitaNoAsistida`** en toda inasistencia, también
  cuando el destino es `ghosting` (del profesional o del job), y `CitaAsistida` en toda asistencia: son los que
  ya escuchan los suscriptores de recordatorios y solicitudes, que anulan los recordatorios pendientes y
  descartan la petición abierta sin cambios ([ADR-13 §6](ADR-13.md), [ADR-10 §4](ADR-10.md)). El `estado` y el
  `actor` del payload dicen cómo se materializó.

**Corrección de un cierre equivocado (extensión aprobada por el usuario el 2026-10-30; se construye en
US-07.02).** Es la **única excepción** a "de un terminal no se sale" de [ADR-04](ADR-04.md) §2, que lleva una
nota que apunta aquí. Responde la deuda [DT-48](../Deudas/DT-48.md) (*"un cierre equivocado no se corrige"*):

| Cierre que se corrige | El profesional elige | Estado al que pasa |
|---|---|---|
| `asistio` | No asistió | lo decide el dominio **como hoy**: `ghosting` si la cita no estaba confirmada al cerrarse, `no_asistio` si lo estaba |
| `ghosting` (del profesional **o del job G1**) | Asistió | `asistio` |
| `no_asistio` | Asistió | `asistio` |
| `cancelada` | — | **no se corrige** |

- **Dentro de 7 días.** Pasado ese plazo, el cierre queda como está.
- **Queda en la bitácora con actor `profesional`.** La bitácora sigue siendo append-only: la corrección es una
  fila nueva, no se reescribe la anterior.
- **La calificación usa el último desenlace** (decisión 3).
- **Vale también para los cierres del job G1.** El usuario **no** eligió darle a G1 un margen extra antes de
  cerrar: la corrección es la salida para quien sí llegó y nadie lo marcó a tiempo.
- **A precisar en el plan de US-07.02** (con la inclinación del `architecture-agent`):
  1. *Desde cuándo corren los 7 días.* Inclinación: **desde el cierre** (el primero, para que corregir no
     alargue el plazo), no desde el `inicio` de la cita. Lee `ocurrido_en` de la bitácora: por eso
     [DT-47](../Deudas/DT-47.md) se corrige antes.
  2. *El tipo exacto en la bitácora.* Inclinación: el `tipo` del desenlace nuevo (`asistio`, `no_asistio` o
     `ghosting`) con el `estado_anterior` terminal, que la distingue de un cierre normal, sin un valor nuevo en
     `enum_cambios_cita_tipo` (agregarlo exige `ALTER TYPE … ADD VALUE`, con su restricción de lote; ver la
     migración `1750000013000`). Alternativa: un tipo `correccion` explícito.
  3. *Qué hecho se publica en el outbox.* Inclinación: **ningún tipo nuevo**, como H8 de US-07.01: el de siempre
     según el desenlace corregido (`CitaAsistida` o `CitaNoAsistida`). Los suscriptores de hoy reconcilian
     contra el estado actual y, con la cita terminal, no tienen nada que hacer; el de la calificación relee.
  4. *Cómo sabe el dominio si la cita estaba confirmada* al corregir un `asistio` (por ejemplo, el estado
     anterior del cierre en la bitácora).

### 10. US-07.01: los datos que hoy se pierden (va primero)

*(Hasta el 2026-10-19 se llamaba "Etapa 0".)* **Aceptada el 2026-10-19 y en construcción desde ese día**, antes
que la calificación y antes que la Fase 4, de la que no depende. **En producción desde el 2026-10-20; el job G1,
prendido desde el 2026-10-27**; pruebas manuales en curso. El contrato (migraciones, DTO, hechos, job)
está en el plan [US-07.01](../US/07.01-registro-hechos.md). Son datos que hasta ahora no se guardaban y **no se
pueden reconstruir**: cada día sin ellos es un día que la calificación no podrá contar.

| | Dato | Cómo (el contrato exacto, en el plan) | Por qué no se reconstruye |
|---|---|---|---|
| **a** | **La primera apertura del portal del paciente**: el primer `GET /api/publico/cita` con un token válido | `enlaces_cita.primera_apertura_en`, escrita solo la primera vez (`… WHERE primera_apertura_en IS NULL`). No cambia la cita, no escribe en la bitácora ni publica hechos | nada guarda las lecturas. El token va en el **fragmento** de la URL ([ADR-10 §1](ADR-10.md), regla 7), así que un escáner que solo descarga la página **no** la dispara: hace falta ejecutar la página para que llame a la API |
| **b** | **El origen de la cita**: `manual` o `solicitud_publica` (decisión del 2026-10-19; *"reagendamiento"* desaparece) | `citas.origen`, fijado al crear (`POST /api/citas` → `manual`; aceptar una solicitud pública de hora nueva → `solicitud_publica`). Las citas existentes se rellenan con lo que se sabe: `solicitud_publica` si una solicitud `nueva` aceptada creó la cita, `manual` el resto | la solicitud pública solo se deduce por `solicitudes_cita.cita_id`; lo demás no queda |
| **c** | **Quién pidió la cancelación o el reagendamiento**: el paciente (por ejemplo, por teléfono) o el profesional | `cambios_cita.pedido_por`. **Opcional en la API** (cuerpo de `PATCH …/cancelar` y `…/reagendar`) y **obligatorio en la pantalla** del voucher; `paciente` sin preguntar cuando actúa por el enlace o cuando se acepta su petición de otra hora en la bandeja | hasta US-07.01, si el paciente llamaba y el profesional cancelaba, la bitácora anotaba al profesional y el motivo era texto libre: **la regla "lo del profesional no cuenta" no se podía aplicar** |
| **d** | **El cierre de todas las citas** | el job G1 ([DT-11](../Deudas/DT-11.md), fecha de corte 2026-10-17 03:22 UTC) como un job más de [ADR-12 §5](ADR-12.md), con actor `sistema`, **detrás del interruptor `CIERRE_GHOSTING_ACTIVO`** (apagado por defecto: solo cuenta y lo deja en el log; **prendido en production desde el 2026-10-27**), más las transiciones de la decisión 9 | sin cierre, la cita a la que el paciente faltó queda `pendiente`: neutra para siempre |

- **Abrir la página sigue sin ejecutar ninguna acción sobre la cita** ([ADR-10](ADR-10.md), S3): la marca de la
  primera apertura no cambia el estado de la cita ni su bitácora, escribirla dos veces no hace nada y el 404
  uniforme no cambia.
- **(c) no rompe el contrato**: el campo es opcional en la API, así que un cliente viejo sigue funcionando. Aun
  así, el frontend debe pedirlo **en el mismo release**: si no, el dato llega vacío.
- **Sin "quién lo pidió" = del profesional** (0 puntos), también para los cambios anteriores a US-07.01
  (**aprobado** el 2026-10-19; *antes: recomendación*). En la duda, nunca en contra del paciente. La bitácora
  no se reescribe: lo que el paciente canceló por su enlace se reconoce por `actor_tipo = 'paciente'`.
- **(b) resuelto el 2026-10-19:** el origen es solo `manual` o `solicitud_publica`. Reagendar mueve la misma cita
  ([ADR-09 §5](ADR-09.md)) y aceptar una petición de otra hora también ([ADR-10 R2](ADR-10.md)): ninguno crea
  una cita, así que "reagendamiento" no era un origen. El origen se guarda para medir y calibrar; **no es una
  entrada de los pesos iniciales**.
- **Las citas creadas con `inicio` en el pasado ([DT-13](../Deudas/DT-13.md)) no cuentan para el puntaje**
  (decisión 3), y el job G1 las deja fuera porque nunca reciben un recordatorio.

### 11. Datos entre clínicas

> **Confirmada por el usuario el 2026-10-30:** nada compartido entre clínicas (la opción G1 de *Opciones evaluadas*, que no es el job G1). Era el "punto 4" que
> seguía en investigación, y queda en su opción A, no compartir.

- **En esta versión no se comparte nada.** Cada clínica calcula con sus propios hechos: el mismo RUT en dos
  clínicas son dos historias sin relación. Con pesos fijos no hay nada que entrenar en común.
- **Si algún día se adopta un modelo aprendido**, solo se podría compartir de forma estrecha, y por un ADR
  nuevo:
  1. **agregados anonimizados con celda mínima**, no filas seudonimizadas;
  2. una **cláusula expresa** en el contrato entre la clínica y Citia;
  3. una **evaluación de impacto** previa;
  4. **exclusión por paciente**.
- **Compartir el historial de un paciente entre clínicas queda descartado.** Es una cesión de datos entre
  responsables que exige consentimiento, con multas de hasta 20.000 UTM; Citia pasaría a ser responsable (hoy
  es encargado); y con [DT-23](../Deudas/DT-23.md) cualquiera puede usar el RUT de otro, así que una sola
  clínica podría ensuciar la reputación de una persona ante todas las demás.

### 12. Forma del módulo (indicativa; los nombres exactos los fija el plan de US-07.02)

```
src/modules/calificacion/
├── domain/
│   ├── hecho-asistencia.ts      ← { tipo, ocurridoEn, citaId, … } — sin Paciente (decisión 7)
│   ├── calificar-paciente.ts    ← función pura: hechos + ahora + parámetros → etiqueta, %, conteos
│   ├── evaluar-riesgo-cita.ts   ← función pura: señales + calificación + parámetros → nivel, motivos
│   ├── anticipacion.ts          ← "tarde" (decisión 4)
│   ├── parametros.ts            ← pesos, umbrales, ventana y tope, en un solo lugar
│   └── lector-hechos.ts         ← puerto de SOLO LECTURA
├── application/                 ← suscriptor del outbox, los dos controles, consultas para el profesional
├── infrastructure/              ← lector SQL con columnas explícitas; jobs del planificador (ADR-12 §5)
└── presentation/                ← rutas propias del profesional
```

- **Dependencias.** `calificacion` **lee** `citas`, `cambios_cita`, `recordatorios`, `enlaces_cita` y
  `solicitudes_cita` con su propio SQL, igual que `recordatorio` lee con `LectorCitas`
  ([ADR-13 §1](ADR-13.md)). **No importa `paciente`** (decisión 7), y ni `cita` ni `paciente` ni `recordatorio`
  la importan.
- **La vista vive en rutas propias** (como `GET /api/citas/:citaId/recordatorios` en ADR-13): así el dashboard
  (`GET /api/citas/hoy`) y el detalle de la cita no cambian, igual que decidió [ADR-10](ADR-10.md) R4.
- **La calificación no se guarda** (opción C1): se calcula al leer. **El riesgo sí se guarda como evaluación**
  (nivel, motivos, cuándo), por dos razones: las acciones deben dispararse **una sola vez** al subir de nivel, y
  la calibración (decisión 5.f) necesita saber qué nivel tenía cada cita antes de su desenlace.
- **Las acciones son efectos externos** y siguen la regla 4 de [ADR-12 §4](ADR-12.md): el suscriptor deja una
  fila de trabajo y otro proceso la ejecuta. El recordatorio extra pasa por las mismas políticas de
  [ADR-13 §7](ADR-13.md) (horas sin envío, supresión, fusible por tenant, cuota). Si el *pedido destacado de
  confirmar* cambia el texto del correo, se fija **en la fila del recordatorio antes del primer intento**, no al
  enviar: la plantilla debe seguir siendo determinista entre reintentos ([ADR-10](ADR-10.md) E5,
  [ADR-13 §9](ADR-13.md)).
- **Los hechos del outbox no llevan la etiqueta ni el nivel**, solo ids: quien los recibe relee
  ([ADR-12 §4](ADR-12.md), regla 2). Así el perfil no queda copiado en `eventos_salida` ni en los logs.

---

## Contexto legal (a validar por un abogado)

> **Esto no es asesoría legal.** Es el resumen de lo que el usuario recogió el 2026-10-19, ordenado para
> llevárselo a un abogado. Ninguna fila de esta tabla se da por cierta hasta esa revisión.

> **Estado de la revisión (2026-10-30): pendiente, y US-07.02 y US-07.03 quedan 🚧 bloqueadas, plan incluido.**
> Al 2026-10-30 el usuario **no tiene abogado** y la revisión sigue sin fecha. Ese día el usuario decidió bloquear
> las dos subtareas, **también su plan**, hasta que un abogado revise este contexto (o hasta que el usuario decida otra
> cosa). No bloquea a US-07.01, que solo registra hechos de la agenda. Las decisiones de producto del 2026-10-30
> no cambian ninguna fila de esta tabla. *Antes (2026-10-30, hasta el bloqueo): la revisión "sigue bloqueando la
> implementación de US-07.02 y US-07.03; no bloquea su plan (el plan de US-07.02 se puede escribir ya)".*

> **Pre-análisis con una IA (2026-10-30). No es un abogado ni una opinión legal.** Ese día el usuario hizo un
> pre-análisis legal con una IA, y es el motivo del bloqueo; no reemplaza la revisión del abogado. Recomienda **no
> habilitar el perfilamiento mientras no haya fundamento jurídico**: el art. 16 bis, inciso 1, limita los datos de
> salud a los fines de las leyes sanitarias, y el art. 8 bis exige que la intervención humana sea real. También
> confirmó lo que este ADR ya decía: nunca restringir (decisión 6), nada compartido entre clínicas (decisión 11) y
> que el consentimiento de [DT-16](../Deudas/DT-16.md) no sirve de base. **Dos hechos verificados ese día:** (1) el
> Senado aprobó el 2026-10-29 (33 votos a 6) postergar la vigencia de la ley al **2027-10-15**, y el proyecto
> (boletín 18.623-07) pasó a la Cámara; mientras no se publique, la fecha vigente sigue siendo el **2026-12-01**.
> La fila *Vigencia* y la pregunta 5 se actualizaron con esa fecha. (2) El **Decreto 662** (Hacienda, publicado el 2026-09-09) regula la certificación voluntaria de los modelos de
> prevención de infracciones.

| Tema | Lo que se entiende hoy |
|---|---|
| **Vigencia** | La **Ley 21.719** rige desde el **2026-12-01** (artículo 1.º transitorio). El proyecto de postergación (boletín 18.623-07) pasó el Senado el 2026-10-29 con la fecha **2027-10-15** y sigue en la Cámara; mientras no se publique, rige el 2026-12-01. *Antes (2026-10-19): "Hay un proyecto de postergación a 2027-12-01 en trámite" (la fecha que proponía el Ejecutivo).* |
| **Perfilamiento** | Calificar la "fiabilidad" del paciente es **perfilamiento** (art. 2, letra w). |
| **Oposición** | El art. 8 bis da derecho de oposición a las decisiones basadas en tratamiento automatizado, y **no dice "únicamente"**: que el sistema solo sugiera y el profesional decida podría no bastar para quedar fuera. |
| **Transparencia** | La clínica debe informar la lógica aplicada (art. 14 ter, letra l). Las reglas explicables de este ADR ayudan: se pueden contar en un párrafo. |
| **Evaluación de impacto** | El art. 15 ter puede aplicar. |
| **Datos de salud** | El art. 16 bis, inciso 1, limita los datos de salud a los fines de las leyes sanitarias. **Es el punto más delicado.** |
| **Responsable y encargado** | La clínica es responsable y Citia, encargado (art. 15 bis). Usar los datos para un fin no convenido convierte a Citia en responsable. |
| **Base de licitud** | El `consentimiento` actual ([DT-16](../Deudas/DT-16.md)) **no sirve de base**: es una casilla única, la marca el profesional y nadie la lee. |

**Preguntas para el abogado:**

1. ¿La asistencia a una hora médica es un dato de salud? ¿Forma parte de la ficha clínica?
2. ¿Cuál es el alcance del art. 16 bis? ¿Calificar la asistencia cabe en los fines que permite?
3. ¿Corresponde hacer la evaluación de impacto (art. 15 ter) antes de activar la calificación?
4. ¿Qué debe decir el contrato de encargo entre la clínica y Citia para cubrir este tratamiento?
5. ¿Qué cambia si se aprueba la postergación al 2027-10-15? *(Antes: "a 2027-12-01", la fecha del Ejecutivo.)*
6. *(Se desprende de la decisión 3.)* El paciente nunca ve su etiqueta en la interfaz. ¿Qué hay que entregarle
   si la pide ejerciendo su derecho de acceso?

---

## Qué NO cambia

- **El grafo de [ADR-04](ADR-04.md)**, salvo las dos transiciones de la decisión 9 y la guarda de la hora y,
  desde el 2026-10-30, la corrección de un cierre equivocado dentro de 7 días (decisión 9), **única excepción**
  a "de un terminal no se sale", que sigue vigente para todo lo demás (las canceladas no se corrigen).
  *Antes (2026-10-19): "De un terminal no se sale" sigue vigente, sin excepción.*
- **Lo que sigue propuesto (US-07.02 y US-07.03) no tiene código ni contrato**, y desde el 2026-10-30 tampoco se
  planifica: está 🚧 bloqueado, plan incluido. El único contrato nuevo es el de US-07.01, en su
  [plan](../US/07.01-registro-hechos.md). *(Antes del 2026-10-19: "mientras este ADR siga Propuesto, nada".)*
- **Las decisiones de producto del 2026-10-30.** El bloqueo de ese mismo día no las revierte: siguen vigentes y
  quedan listas para cuando US-07.02 y US-07.03 se desbloqueen.
- **El dashboard** (`GET /api/citas/hoy`, `CitaDashboardDto`) y el **portal del paciente**
  (`VistaCitaPacienteDto`): el paciente no ve nada nuevo.
- **La vía pública de [ADR-09](ADR-09.md) y el enlace de [ADR-10](ADR-10.md)**: el puntaje no los frena
  (decisión 6).
- **Los recordatorios de [ADR-13](ADR-13.md)**: el riesgo puede pedir uno más, pero sus políticas, su cuota y su
  idempotencia se mantienen.
- **El aislamiento por tenant**: la calificación es por clínica. Los dos controles del planificador barren todos
  los tenants a la vista, como manda [ADR-12 §6](ADR-12.md).
- **US-07.02 y US-07.03 quedan 🚧 bloqueadas desde el 2026-10-30**, plan incluido, y siguen fuera del MVP, en la
  v2. La Fase 5 pasó a 🔶 el 2026-10-19 solo por US-07.01, y sigue así: el bloqueo no toca a US-07.01
  ([ROADMAP](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring)). *Antes (2026-10-19 → 2026-10-30):
  "US-07.02 y US-07.03 siguen ⏸ en la v2".*

---

## Consecuencias

**Positivas**

- El diferenciador tiene forma: el profesional ve **con quién puede contar** y **qué citas mirar**, con razones
  que se explican solas.
- Funciona desde la primera cita, sin datos para entrenar.
- **Avisar nunca se castiga**: el paciente tiene motivos para avisar, que es justo lo que el profesional
  necesita para llenar la hora.
- La regla estricta, el test de arquitectura y el lector con columnas explícitas impiden que la calificación
  dependa de quién es la persona.
- Cambiar un peso no exige migrar datos, y los hechos viejos expiran solos.
- US-07.01 empieza a guardar lo que hoy se pierde, aunque la calificación tarde en llegar.

**Negativas / riesgos**

- **Pesos a ojo con pocos datos.** Los pesos iniciales pueden estar mal: la calibración del primer mes es parte
  del diseño, no un extra.
- **Los pacientes que van pocas veces al año.** Con una ventana de 12 meses, quien va dos veces al año (un
  control semestral) **nunca deja de ser `nuevo`**, y quien va cuatro veces cae a `regular` con una sola falta.
  A revisar en la calibración.
- **`regular` sale `medio` con solo el recordatorio entregado** (+1). Cada recordatorio extra consume la cuota de
  Resend (100 al día en el plan gratis, [ADR-13 §11](ADR-13.md)), y la meta de ~1 de cada 10 acota `alto`, no
  `medio`. Con `nuevo` = 0 (2026-10-30), el piloto, lleno de pacientes nuevos, ya no sale casi entero en `medio`.
  *Antes (2026-10-19): "`nuevo` y `regular` salen `medio`…", con `nuevo` +1.*
- **Un cierre equivocado no se corrige hasta US-07.02** ([DT-48](../Deudas/DT-48.md)). De un terminal no se sale
  ([ADR-04](ADR-04.md)): un "no asistió" marcado por error, o un `ghosting` del job a quien sí llegó pero nadie
  marcó antes de las 00:40, pesaría −25 durante 12 meses. **Salida decidida el 2026-10-30:** la corrección dentro
  de 7 días (decisión 9), que se construye en US-07.02, antes de que la calificación exista; sin margen extra
  para G1. La lista de citas pasadas sin cerrar (pregunta 2 de Q6) ayuda además a que G1 no cierre a quien sí
  llegó. *Antes (2026-10-19): tres salidas posibles a decidir en US-07.02 —el aviso de
  [DT-30](../Deudas/DT-30.md), un margen antes de G1 o una corrección en la bitácora—.* Desde el 2026-10-30 la
  corrección espera con US-07.02 (🚧 bloqueada); la salida decidida no cambia. *Observación, sin decidir:* ni la
  corrección ni la lista perfilan al paciente, así que **podrían separarse de US-07.02** si el usuario lo quiere
  (la lista ya figura como candidata).
- **Suplantación** ([DT-23](../Deudas/DT-23.md)): dentro de una clínica, alguien con el RUT de otra persona puede
  ensuciar su calificación. Que no haya restricciones automáticas (decisión 6) acota el daño, pero no lo evita.
- **"Abrió el enlace" no es infalible** ([DT-49](../Deudas/DT-49.md)). Un escáner que **ejecuta** la página sí
  dispara la primera apertura. El error favorece al paciente (le quita el +1).
- **Registrar la apertura es una forma de seguimiento**, aunque propia y sin terceros (a diferencia del
  seguimiento de Resend que [ADR-13 §12](ADR-13.md) desactivó). Debe entrar en lo que la clínica le informa al
  paciente (art. 14 ter).
- **Riesgo legal abierto** hasta la revisión, con la ley vigente desde el 2026-12-01.
- **Cambio de contrato coordinado**: "quién lo pidió" es opcional en la API, pero el frontend tiene que pedirlo
  en el mismo release para que el dato no llegue vacío; y la guarda de la hora convierte en 409 lo que antes
  respondía 200 (el voucher ya lo bloqueaba).
- **Un módulo más que lee directamente el esquema de otros cinco**, como `recordatorio` y como `cita` con el job
  G1 ([DT-50](../Deudas/DT-50.md)): un cambio en esas tablas tiene que revisar su lector.
- **La calificación lee el orden de la bitácora** (último desenlace, plazo de la corrección, "un solo hecho por
  hora"), y hoy ese orden puede salir invertido con transacciones concurrentes ([DT-47](../Deudas/DT-47.md)): se
  corrige **antes de implementar US-07.02**.

---

## Preguntas abiertas y lo que queda a confirmar

> **2026-10-30:** el usuario respondió todas las preguntas de producto que quedaban para US-07.02, y ese mismo día
> **bloqueó US-07.02 y US-07.03, plan incluido** (🚧), hasta que un abogado revise el
> [Contexto legal](#contexto-legal-a-validar-por-un-abogado) o el usuario decida otra cosa. Las respuestas **siguen
> vigentes** y quedan listas para entonces; las filas "a precisar en el plan de US-07.02" (al final de la tabla)
> quedan igual, **en espera**. Lo que sigue abierto es la revisión legal, la calibración y esos detalles.
> *Antes (2026-10-30, hasta el bloqueo): "Ya no bloquean el plan de US-07.02, que es el siguiente paso (Plan de
> ejecución, paso 4). Lo que sigue abierto es la revisión legal (bloquea la implementación de US-07.02 y US-07.03,
> no el plan), la calibración y los detalles que el plan debe precisar".*

| Tema | Estado | Decide |
|---|---|---|
| **La revisión legal** | **pendiente**; preguntas en el [Contexto legal](#contexto-legal-a-validar-por-un-abogado). Al 2026-10-30 el usuario **no tiene abogado**. Desde el 2026-10-30 **US-07.02 y US-07.03 están 🚧 bloqueadas hasta esta revisión, plan incluido** (decisión del usuario, apoyada en un pre-análisis con IA que no es una opinión legal); no bloquea US-07.01. *Antes (hasta el bloqueo): bloqueaba la implementación de US-07.02 y US-07.03, no su plan* | abogado (o el usuario, si decide otra cosa) |
| **La calibración tras el primer mes** | **pendiente**; meta: ~1 de cada 10 citas en `alto` | usuario, con los datos |
| ~~**Q6, pregunta 2: las `confirmada` que nadie cierra**~~ | ✅ **resuelta (2026-10-30)**: siguen **neutras** para la calificación y aparecen en una **lista de "citas pasadas sin cerrar"** para que el profesional las marque; no se adivina la asistencia. La misma lista ayuda a que G1 no cierre por error a quien sí llegó. Como no perfila a nadie, **no depende de la revisión legal y podría adelantarse**: queda como **candidata**, sin US ni número (lo decide el usuario). *Antes: abierta; neutras mientras tanto* | usuario |
| ~~**El peso de `nuevo` en el riesgo de la cita: +1 o 0**~~ (decisión 5.b) | ✅ **resuelta (2026-10-30): 0**. *Antes: abierta para US-07.02; con +1, casi todas las citas del piloto salían `medio`* | usuario |
| ~~**Si el recordatorio no se pudo entregar, la acción va directo al profesional**~~ (decisión 5.b) | ✅ **aprobada (2026-10-30)**: no se insiste por el mismo canal; el nivel se calcula igual y la acción va al profesional (US-07.03). *Antes: propuesta* | usuario |
| ~~Un solo hecho por hora comprometida, y la petición de otra hora rechazada en silencio~~ (decisión 8) | ✅ **aprobada (2026-10-30)**: un solo hecho, el peor; y mientras el rechazo no se avise (R3, DT-44), la petición rechazada no cuenta como falta (−10, no −35). *Antes: propuesta* | usuario |
| ~~Qué cuenta como "recordatorio no enviado"~~ (decisión 5.b) | ✅ **resuelta (2026-10-30)**: suman +3 las fallas del contacto del paciente (sin correo, correo suprimido, rebote, correo inválido) **y las del sistema** (cuota de Resend agotada, fusible del tenant); no suman los recordatorios apagados por el profesional ni la cita creada con menos de 60 min (`creada_tarde`). *Antes: a precisar, con la inclinación "solo lo que se debe al contacto del paciente", que el usuario cambió por el punto 2* | usuario |
| ~~Si los reagendamientos que pidió el profesional cuentan para "se reagendó 2 o más veces"~~ (decisión 5.b) | ✅ **resuelta (2026-10-30): no**, solo los que pidió el paciente (vacío = profesional). *Antes: a precisar, con esa inclinación* | usuario |
| ~~Cómo se corrige un cierre equivocado~~ (decisión 9) | ✅ **resuelta (2026-10-30)**: el profesional corrige entre Asistió y No asistió **dentro de 7 días**, también los cierres de G1; las canceladas no; queda en la bitácora con actor `profesional` y la calificación usa el último desenlace. Excepción a "de un terminal no se sale" ([ADR-04](ADR-04.md)); sin margen extra para G1. Se construye en US-07.02 ([DT-48](../Deudas/DT-48.md)). *Antes: a decidir en US-07.02; US-07.01 se protegía con el interruptor del job* | usuario |
| ~~Datos entre clínicas~~ (decisión 11) | ✅ **confirmada (2026-10-30)**: nada compartido (la opción G1 de *Opciones evaluadas*, no el job; el "punto 4" de la investigación, en su opción A) | usuario |
| ~~El estado de la inasistencia desde `pendiente`~~ (decisión 9) | ✅ **resuelta (2026-10-19): `ghosting`** con actor `profesional`, por la misma ruta `…/inasistencia`; desde `confirmada` sigue `no_asistio`. *Antes: propuesta, con `no_asistio` como alternativa* | usuario |
| ~~Exigir en el dominio `ahora ≥ inicio` para marcar asistencia o inasistencia~~ (decisión 9) | ✅ **resuelta (2026-10-19): sí**, desde cualquier estado de origen; antes de la hora, 409 | usuario |
| ~~"Quién lo pidió": obligatorio u opcional~~ (decisión 10.c) | ✅ **resuelta (2026-10-19)**: opcional en la API, obligatorio en la pantalla; `paciente` automático por el enlace y al aceptar una petición de otra hora | usuario |
| ~~Los cambios anteriores a US-07.01, sin "quién lo pidió", cuentan como del profesional~~ (decisión 10) | ✅ **resuelta (2026-10-19): sí**; vacío = profesional, a favor del paciente | usuario |
| ~~Qué significa "reagendamiento" como origen de la cita~~ (decisión 10.b) | ✅ **resuelta (2026-10-19)**: desaparece; el origen es solo `manual` o `solicitud_publica` | usuario |
| **Corrección de un cierre: desde cuándo corren los 7 días, el tipo en la bitácora y el hecho del outbox** (decisión 9) | **a precisar en el plan de US-07.02**. Inclinación: desde el (primer) cierre; el `tipo` del desenlace nuevo con `estado_anterior` terminal, sin valor nuevo en el enum; ningún tipo de hecho nuevo, como H8 | `architecture-agent` en el plan; el usuario lo revisa |
| **Los motivos de recordatorio que la decisión del 2026-10-30 no nombra** (`vencido`, `rechazado`, `fusionado`, `sin_consentimiento`) **y si suma el +3 cuando falla uno de varios recordatorios de la cita** (decisión 5.b) | **a precisar en el plan de US-07.02**. Inclinación: `vencido` y `rechazado` suman (son fallas del envío, como las del sistema); `fusionado` no (otro recordatorio de la cita salió); `sin_consentimiento` hoy no ocurre (política apagada, [DT-16](../Deudas/DT-16.md)) y se decide si se prende; el +3 solo si **ningún** recordatorio para la hora vigente llegó al paciente | `architecture-agent` en el plan; el usuario lo revisa |
| **Qué es "una hora comprometida"** (decisión 8) cuando la cita se reagendó a pedido del paciente: si la petición tardía y una falta a la hora nueva son un hecho o dos | **a precisar en el plan de US-07.02**, revisándolo contra el principio rector | usuario |
| **Corregir [DT-47](../Deudas/DT-47.md) antes de implementar US-07.02** (orden de la bitácora) | **pendiente**; la calificación, el último desenlace y el plazo de la corrección leen ese orden. Sigue abierta, pero desde el bloqueo del 2026-10-30 **ya no es un paso inmediato**: se corrige antes de implementar US-07.02, cuando se desbloquee | usuario elige la salida; `database-agent` |

---

## Plan de ejecución

Secuencia. Cada subtarea tiene (o tendrá) su plan con el contrato (tablas, rutas, DTO, hechos) y la Definición
de Terminado. La de US-07.01 está en [`US/07.01-registro-hechos.md`](../US/07.01-registro-hechos.md).

| Parte | # | Agente | Pieza |
|---|---|---|---|
| **US-07.01** · registro de hechos | 0 | `architecture-agent` | ✅ (2026-10-19) [plan US-07.01](../US/07.01-registro-hechos.md) con el contrato |
| **US-07.01** | 1 | `database-agent` | ✅ migraciones: `origen` en `citas` (con su relleno), `pedido_por` en `cambios_cita`, `primera_apertura_en` en `enlaces_cita` y el índice del job G1 |
| **US-07.01** | 2 | `api-agent` | ✅ transiciones desde `pendiente` y guarda de la hora (decisión 9); marca de la primera apertura en el portal; origen al crear (alta manual y bandeja); "quién lo pidió" en cancelar y reagendar; job G1 con actor `sistema` y `CIERRE_GHOSTING_ACTIVO` |
| **US-07.01** | 3 | `testing-agent` | ✅ el grafo nuevo; la apertura no cambia la cita ni se escribe dos veces; G1 con su corte y sus tres condiciones; el contrato de cancelar y reagendar |
| **US-07.01** | — | frontend | ✅ botones del voucher sobre citas `pendiente`; "¿quién lo pidió?" al cancelar y al reagendar |
| **US-07.01** | — | usuario | ✅ release a producción (2026-10-20) · ✅ job G1 prendido (2026-10-27) · 🔶 pruebas manuales, feature y TRAZABILIDAD, en curso · **siguiente paso de la Fase 5** (2026-10-30): cerrarla |
| **US-07.02** · calificación y riesgo | 4 | `architecture-agent` | 🚧 **bloqueado (2026-10-30)** hasta que un abogado revise el [Contexto legal](#contexto-legal-a-validar-por-un-abogado) o el usuario decida otra cosa: plan de US-07.02 con el contrato, incluida la corrección de cierres de la decisión 9. Las preguntas de producto ya están respondidas (2026-10-30) y quedan listas para entonces. *Antes (2026-10-30, hasta el bloqueo): ⬜ **siguiente paso**; "las preguntas de producto ya no lo bloquean; la revisión legal bloquea la implementación (pasos 5 a 8), no el plan". Antes (2026-10-19), inclinación: escribir el plan después de la revisión legal* |
| **US-07.02** | 4.b | `database-agent` | 🚧 **antes de implementar US-07.02, cuando se desbloquee:** corregir [DT-47](../Deudas/DT-47.md) (orden de la bitácora), con la salida que elija el usuario. *Antes (hasta el bloqueo): paso previo de la implementación, sin bloqueo del plan* |
| **US-07.02** | 5 | `database-agent` | 🚧 lector SQL de solo lectura con columnas explícitas; tabla de evaluaciones del riesgo |
| **US-07.02** | 6 | `api-agent` | 🚧 módulo `calificacion`: funciones puras, suscriptor del outbox, los dos controles del planificador y las rutas del profesional; en `cita`, la corrección de un cierre dentro de 7 días (decisión 9) |
| **US-07.02** | 7 | `testing-agent` | 🚧 los ejemplos y las situaciones típicas de este ADR como tests de tabla; el test de arquitectura de la decisión 7 |
| **US-07.03** · acciones | 8 | `api-agent` | 🚧 las acciones: insistir (recordatorio extra por las políticas de ADR-13), la marca de `alto` para el profesional y, si el recordatorio no se pudo entregar, la acción directa al profesional (decisión 5.b) |
| candidata, sin US ni número | — | lo decide el usuario | **lista de "citas pasadas sin cerrar"** (pregunta 2 de Q6, 2026-10-30; punto 3 de *Cómo se cierra* de [DT-30](../Deudas/DT-30.md)). No perfila a nadie: no depende de la revisión legal y **podría adelantarse** a US-07.02 |
| calibración (sin US propia) | — | usuario | calibración con los datos del primer mes |

> **Bloqueo (2026-10-30).** Los pasos 4 a 8 (US-07.02 y US-07.03) quedan 🚧 bloqueados, **plan incluido**, hasta
> que un abogado revise el [Contexto legal](#contexto-legal-a-validar-por-un-abogado) o el usuario decida otra
> cosa. **El siguiente paso de la Fase 5 es cerrar US-07.01**: las pruebas manuales que faltan y su documentación
> de cierre (la feature y la TRAZABILIDAD). *Observación, sin decidir:* dos piezas no perfilan al paciente —la
> corrección de un cierre dentro de 7 días (decisión 9, [DT-48](../Deudas/DT-48.md), hoy dentro del paso 6) y la
> lista de "citas pasadas sin cerrar" (ya candidata)— y **podrían separarse de US-07.02** si el usuario lo quiere.

---

## Referencias

- [Plan US-07.01](../US/07.01-registro-hechos.md) — el contrato de US-07.01 (migraciones, DTO, hechos, job G1).
- [Descripcion/fase-0-problema.md](../Descripcion/fase-0-problema.md) — el problema, la propuesta de valor y
  los criterios de éxito.
- RF-08 ([`../rf.md`](../rf.md)) · [ROADMAP § Fase 5](../ROADMAP.md#fase-5--us-07-calificación-de-asistencia-scoring).
- [ADR-04](ADR-04.md) §2 y §4 — grafo de estados, `ghosting` ≠ `no_asistio`, estado materializado.
- [ADR-09](ADR-09.md) §5 y §6 — reagendar en su sitio y la bitácora `cambios_cita`.
- [ADR-10](ADR-10.md) — §1 (enlace y transporte por el fragmento), §3 (actor del paciente, G2), §4 (R2–R4),
  §5 (nada después de `inicio`, regla G1), §6 (E5).
- [ADR-11](ADR-11.md) — el solapamiento se avisa y se permite (sobrecupo).
- [ADR-12](ADR-12.md) — §4 (reglas de los suscriptores), §5 (planificador), §6 (barrido global), §8 (cierre).
- [ADR-13](ADR-13.md) — §1 (lector de solo lectura), §4 (estados y motivos), §5.e (cita creada tarde), §7
  (políticas), §9 (idempotencia), §11 (cuota), §12 (seguimiento desactivado), §14 (cambio de contrato
  coordinado).
- [DT-11](../Deudas/DT-11.md) (regla G1 y corte) · [DT-13](../Deudas/DT-13.md) · [DT-16](../Deudas/DT-16.md) ·
  [DT-23](../Deudas/DT-23.md) · [DT-30](../Deudas/DT-30.md) · [DT-44](../Deudas/DT-44.md).
- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) ·
  [Q17](../PREGUNTAS-ABIERTAS.md#q17--manejo-de-datos-de-salud).
- Código (2026-10-19): `src/modules/cita/domain/cita.entity.ts` (guardas y `AccionCita`),
  `src/modules/cita/domain/cambio-cita.entity.ts`, `src/modules/cita/domain/actor.ts`,
  `src/modules/cita/domain/enlace-cita.entity.ts`, `src/modules/cita/presentation/citas.controller.ts`,
  `src/modules/portal-paciente/presentation/portal-paciente.controller.ts`, `src/arquitectura.spec.ts`.

---

## Deudas técnicas asociadas

**Cerrada con US-07.01:** [DT-11](../Deudas/DT-11.md) — ✅ **cerrada el 2026-10-27**, al prender el job G1 en
production (`CIERRE_GHOSTING_ACTIVO=true`). Su criterio era ese, no el despliegue (2026-10-20).

**Contraídas o detectadas con US-07.01** (fichadas el 2026-10-30, salvo DT-47):
[DT-47](../Deudas/DT-47.md) — la bitácora puede quedar en orden invertido (detectada el 2026-10-19); **se corrige
antes de implementar US-07.02**, cuando se desbloquee ·
[DT-48](../Deudas/DT-48.md) — un cierre equivocado no se corrige (prevista 1); salida decidida el 2026-10-30, se
construye en US-07.02 (🚧 bloqueada desde el 2026-10-30) ·
[DT-49](../Deudas/DT-49.md) — la primera apertura la puede disparar un escáner que ejecuta la página (prevista 4) ·
[DT-50](../Deudas/DT-50.md) — `cita` lee con SQL el esquema de `recordatorios` y `solicitudes_cita` (nueva,
riesgo 9 del plan de US-07.01).

**Toca:**
[DT-13](../Deudas/DT-13.md) — las citas con `inicio` en el pasado no cuentan para el puntaje; la validación al
crear sigue abierta ·
[DT-16](../Deudas/DT-16.md) — el consentimiento actual no sirve de base para perfilar ·
[DT-23](../Deudas/DT-23.md) — la suplantación puede ensuciar la calificación dentro de una clínica ·
[DT-30](../Deudas/DT-30.md) — la decisión 9 es la salida B que DT-30 dejó para un ADR propio, y cierra la brecha
"una cita `pendiente` no se puede marcar"; la lista de citas pasadas sin cerrar (Q6, 2026-10-30) es su punto 3 ·
[DT-44](../Deudas/DT-44.md) — el rechazo silencioso chocaba con el principio rector; desde el 2026-10-30 la
decisión 8 lo resuelve en la calificación (la petición rechazada no cuenta como falta mientras dure R3).

**Previstas** (se fichan al implementar):

1. ~~Un cierre equivocado no se corrige y pesa 12 meses.~~ → fichada como [DT-48](../Deudas/DT-48.md) (2026-10-30).
2. La insistencia consume la cuota de Resend (amplía [DT-36](../Deudas/DT-36.md)). Sigue prevista: es de US-07.03.
3. Los pacientes de pocas visitas al año no salen de `nuevo` o caen a `regular` con una falta. Sigue prevista: es
   de US-07.02.
4. ~~La primera apertura la puede disparar un escáner que ejecuta la página.~~ → fichada como
   [DT-49](../Deudas/DT-49.md) (2026-10-30).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
