# Preguntas abiertas — reparto por rol

Diecisiete preguntas: las **once que bloqueaban el MVP** (Q1–Q11) y seis que aparecieron después —cuatro
de la implementación de la Fase 2 (Q12–Q15) y dos de seguridad para el arquitecto (Q16 y Q17)—. Aquí están
reformuladas **en el lenguaje de quien puede responderlas**, con el entregable que se espera de cada una.

> **Estado (2026-10-18):** respondidas **Q1** (A), **Q4**, **Q11** (**B**, 2026-10-14; antes C) y **Q6** en
> cuanto al mecanismo ([ADR-12](Decisions/ADR-12.md)) y a su pregunta 1 (regla G1). Siguen abiertas Q2, Q3,
> Q5, Q7, **Q8** (solo para el login: la ruta pública ya lleva el slug en la URL), Q9 y Q10, y las seis
> posteriores: **Q12–Q15** (no bloquean) y **Q16–Q17** (arquitecto). La Fase 3, que dependía de Q11, está en
> producción desde el 2026-10-17.
>
> *Antes (2026-09-30):* respondidas Q1 (A), Q4, Q11 (C) y Q6 en cuanto al mecanismo
> ([ADR-12](Decisions/ADR-12.md)). Siguen abiertas Q2, Q3, Q5, Q7, Q8, Q9 y Q10.
>
> **2026-10-04:** la implementación de la Fase 2 dejó **cuatro preguntas nuevas, Q12 a Q15**, que no
> bloquean el MVP ni el merge ([sección propia](#fase-2--decisiones-pendientes-tras-implementar-2026-10-04)).
>
> **2026-10-11:** las preguntas de seguridad las responde el **arquitecto**: las de sesión, registro
> y enlace son la otra mitad de Q7, Q5 y Q11, y las dos restantes son **Q16** (vía pública) y **Q17**
> (datos de salud). Las pruebas son parte del trabajo de desarrollo.
>
> **2026-10-14:** **Q11 respondida B**, con su otra mitad de seguridad (requisitos S1–S3 y límite de
> tasa): [ADR-10](Decisions/ADR-10.md) aceptado y la [Fase 3](Fases/fase-3-us04-respuesta-paciente.md) en
> construcción. La regla de `ghosting` G1 responde además la **pregunta 1 de Q6**.
>
> **2026-10-17:** la Fase 3 llegó a producción con el enlace y el límite de tasa que pedían Q11 y Q16.
>
> **2026-10-30:** **Q6 queda respondida entera**: el usuario decidió su **pregunta 2** (las `confirmada` que
> nadie cerró siguen neutras y van a una lista de citas pasadas sin cerrar, [abajo](#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1)).
> El job G1 que responde la pregunta 1 está prendido en production desde el 2026-10-27
> ([DT-11](Deudas/DT-11.md), cerrada).

**Equipo:** 1 I+D · 2 desarrolladores · el arquitecto decide el diseño y los requisitos de seguridad.

**Principio del reparto:** una pregunta puede tocar a varios roles, pero **la pregunta que se le hace
a cada uno es distinta**. Una pregunta de seguridad no es "¿rotación o lista de revocación?" — eso es
una decisión de implementación. El arquitecto fija qué debe poder hacer el sistema cuando una sesión
se compromete, y los desarrolladores eligen el mecanismo que cumpla ese requisito.

---

## Reparto rápido

| # | Pregunta | Responde | Bloquea |
|---|----------|----------|---------|
| 10 | Validación con usuarios reales | **I+D** | 1, 2, 3, 5 — y de facto todo lo demás |
| 1 | ¿El MVP incluye recordatorios? | **I+D** → decisión conjunta | ✅ **respondida (2026-09-30): A** — entran en el MVP |
| 2 | ¿El prepago entra alguna vez? | **I+D** → decisión conjunta | modelo de negocio |
| 3 | ¿La agenda es del profesional o de la organización? | **I+D** | si "clínica" es cliente viable |
| 5 | ¿Registro abierto, por invitación o lista de espera? | **I+D** + **arquitecto** (defensas contra abuso) | DT-06 |
| 4 | Solapamiento: ¿avisar o rechazar? | **I+D** decide, **dev** ejecuta | nada; es barato |
| 6 | Planificador del proceso de cierre | **desarrolladores** | ✅ **mecanismo decidido (2026-09-30)** en [ADR-12](Decisions/ADR-12.md) · pregunta 1 ✅ por la regla G1 (2026-10-14), con el job prendido en production desde el 2026-10-27 (DT-11 cerrada) · **pregunta 2 ✅ (2026-10-30)**: las `confirmada` sin cerrar siguen neutras y van a una lista de citas pasadas sin cerrar ([ADR-14](Decisions/ADR-14.md)) |
| 7 | Renovación y revocación de sesión | **arquitecto** define requisito, **dev** elige mecanismo | DT-01 |
| 8 | ADR-08 — tenant en la URL | **desarrolladores** | el login · *(antes: "toda la vía pública"; la ruta pública ya lleva el slug en la URL desde el 2026-09-10, [ADR-09 §11.b](Decisions/ADR-09.md))* |
| 9 | Modelo de disponibilidad | **desarrolladores** (solo evaluar riesgo) | nada hoy |
| 11 | ¿Cómo llega al paciente el enlace de su cita, y cómo se sabe que es él? | **I+D** → decisión conjunta; seguridad del enlace: **arquitecto** | ✅ **respondida (2026-10-14): B** — el enlace va en el recordatorio · seguridad: S1–S3 + límite de tasa · ADR-10 aceptado, Fase 3 en producción (2026-10-17) |
| 12 | ¿Se oculta `/recordatorios` al rol `recepcion`? | **I+D** (producto) → **dev** ejecuta | nada; afecta a la primera cuenta con ese rol |
| 13 | Textos y colores de los estados de recordatorio | **I+D** (UX) | nada; es copy |
| 14 | ¿Se mantiene la vista *Contacto* del voucher? | **I+D** (producto) | nada |
| 15 | ¿Cuándo reinicia Resend la cuota mensual del plan gratis? | **desarrolladores** (verificar con el proveedor) | nada hoy; afina el contador ([DT-36](Deudas/DT-36.md)) |
| 16 | Modelo de amenazas de la vía pública | **arquitecto** | nada hoy (la vía pública ya está construida); afina DT-18, DT-23 y DT-28 · el límite de tasa de la ruta pública ya quedó fijado en la Fase 3 (2026-10-14) y está en producción (2026-10-17) |
| 17 | Manejo de datos de salud y retención | **arquitecto** | DT-26 |

### Por fase del roadmap

*(2026-09-30; Q12–Q15 el 2026-10-04; Q16 y Q17 el 2026-10-11; Q11 y Q6 el 2026-10-14; Q8 el 2026-10-18.)* A qué fase de construcción ([`Fases/`](Fases/README.md)) toca cada pregunta. Las que no
tienen fase son de producto o de modelo de negocio.

| Fase | Preguntas |
|---|---|
| [Fundaciones](Fases/fase-base-fundaciones.md) | Q5 (registro) · Q7 (sesión) · Q8 (ADR-08 en el login) |
| [Fase 0 — US-06](Fases/fase-0-us06-dashboard.md) | Q4 (solapamiento, ✅) · Q6 (job de ghosting) |
| [Fase 1 — US-02](Fases/fase-1-us02-gestion-citas.md) | Q4 ✅ · Q11 ✅ C (en la Fase 1; en la Fase 3 pasó a B) · Q8 (la ruta pública ya usa el slug; falta el login) · Q9 (disponibilidad) · Q16 · Q17 |
| [Fase 2 — US-03](Fases/fase-2-us03-recordatorios.md) | Q1 ✅ A · Q6 ✅ (mecanismo) · Q12, Q13, Q14, Q15 (2026-10-04) |
| [Fase 3 — US-04](Fases/fase-3-us04-respuesta-paciente.md) | Q11 ✅ **B** (2026-10-14), con la seguridad del enlace (S1–S3 y límite de tasa) · Q6 pregunta 1 ✅ (regla G1) · en producción desde el 2026-10-17 |
| [Fase 5 — US-07](Fases/fase-5-us07-scoring.md) | Q6 ✅ (pregunta 2 del job de cierre, respondida el 2026-10-30; la 1 la resolvió G1) |
| sin fase | Q2 (prepago) · Q3 (agenda de la organización) · Q10 (validación, [etapa 1 del producto](Descripcion/fase-1-validacion.md)) |

---

## Para I+D

### Q10 — La validación. Empieza por aquí.

**Es la entrada de todo lo demás.** Cuatro de las once preguntas se responden solas con evidencia de
campo, y hoy hay cero conversaciones registradas.

**Pregunta:** ¿el problema que describimos es el que esta gente realmente tiene, y les molesta lo
suficiente para cambiar de hábito?

**Método:** 5–10 conversaciones con profesionales de la salud independientes y con clínicas
pequeñas. No entrevistas de producto — **conversaciones sobre cómo trabajan hoy**. La pregunta que
más informa no es "¿usarías esto?" sino "¿qué hiciste la última vez que alguien no llegó?".

**Entregable:** un documento de patrones, no transcripciones. Lo que se repitió en 3 de 5 vale; lo
que dijo uno solo es anécdota — salvo que contradiga nuestra hipótesis, en cuyo caso vale doble.

**Aprovechar el viaje:** esas mismas conversaciones responden dos cosas que el diseño dejó abiertas
—la lista de tipos de consulta ([DT-24](Deudas/DT-24.md)) y qué necesita saber el profesional antes
de una hora— así que conviene llevarlas preparadas.

### Q1 — ¿El MVP incluye recordatorios automáticos?

> ✅ **Respondida (2026-09-30): A — los recordatorios (RF-06) entran en el MVP.** Canal: correo vía
> Resend; contenido solo informativo; el enlace para responder llega en la Fase 3. En la misma
> decisión **el scoring (RF-08) sale del MVP** y pasa a la v2. Diseño en
> [ADR-13](Decisions/ADR-13.md) y plan en [US-03](US/03-recordatorios.md). El MVP queda en tres
> piezas: dashboard, gestión de citas y recordatorios ([etapa 3 del producto](Descripcion/fase-3-mvp.md)).

**El problema concreto:** los criterios de éxito dicen que el profesional *deja de mandar WhatsApps*
y *se desliga de presionar al paciente*. Las tres piezas del MVP son todas del lado del profesional:
**ninguna le habla al paciente.** El MVP, tal como está, no puede cumplir dos de sus tres criterios.

**Pregunta para el campo:** describe la v1 sin recordatorios —dashboard, gestión de citas, historial
de comportamiento— y pregunta si eso, solo, ya les sirve. Y si pagarían por eso solo.

**Entregable:** una recomendación entre estas tres:
- **A.** Meter recordatorios en el MVP (cuatro piezas en vez de tres).
- **B.** Reescribir los criterios de éxito de la v1 como "orden y visibilidad", y dejar el desligue
  para la v2.
- **C.** No decidir. *Es la peor: se lanza creyendo que se cumplió la promesa.*

### Q2 — ¿El prepago entra alguna vez?

**La tensión:** nuestro propio diagnóstico dice que los profesionales *"empiezan a cobrar por
anticipado"*, y el alcance excluye explícitamente todo lo relativo a dinero. Estamos renunciando a
la palanca que el mercado ya adoptó, apostando a que recordatorios y reputación bastan.

**Pregunta para el campo:** ¿los que ya cobran por anticipado siguen teniendo no-shows? Si el prepago
les funcionó, nuestro producto compite contra algo que ya resuelve el problema. Si no les funcionó
del todo, ahí está nuestro espacio.

**Entregable:** cuántos de los entrevistados cobran por anticipado, cómo lo hacen, y si les resolvió
el problema. Con eso se decide en conjunto (ver más abajo).

### Q3 — ¿La agenda es del profesional o de la organización?

**Hoy la cita es del profesional:** el dashboard filtra por quién eres, no por dónde trabajas. Nadie
puede ver la agenda de un colega ni cubrir a alguien enfermo. Para un independiente es exactamente
lo correcto; para una clínica es un techo.

**Pregunta para el campo:** de los entrevistados que trabajan en clínica, ¿comparten agenda?
¿Alguien la administra por ellos? ¿Se cubren entre colegas?

**Entregable:** si "clínica pequeña" es un segmento real con agenda compartida, o si en la práctica
son independientes que comparten local. **La respuesta decide si `CLINICA` es un cliente o una
etiqueta.**

### Q4 — Solapamiento: ¿avisar o rechazar?

> ✅ **Respondida (2026-09-25): avisar y permitir.** Ver [ADR-11](Decisions/ADR-11.md).

Hoy el sistema acepta dos citas del mismo profesional a la misma hora, en silencio.

**Pregunta:** ¿hay consultas que sobrevenden a propósito, o un choque es siempre un error?

**Entregable:** elegir. *Recomendación: avisar y permitir* — cuesta una consulta y deja la decisión
en quien sabe si es error o intención. Rechazar obliga a definir reglas de borde (¿citas pegadas?,
¿colchón entre pacientes?) que empiezan a construir el modelo de disponibilidad.

### Q5 — ¿Registro abierto, por invitación o lista de espera?

**Pregunta para I+D:** ¿cómo van a llegar los primeros clientes? Si es por recomendación directa, la
invitación no cuesta nada y elimina un problema entero. Si la apuesta es crecimiento orgánico, el
registro abierto necesita defensas que hoy no existen.

**La otra mitad: superficie de abuso** *(arquitecto)*. `POST /api/usuarios` es público, sin
verificación de correo, sin captcha y sin límite de tasa *(2026-10-17: ya tiene uno, 5 registros por hora
por IP, con la Fase 3 —[DT-18](Deudas/DT-18.md)—; lo demás sigue igual)*. Un mismo correo puede fundar organizaciones
ilimitadas. Y el identificador público que se genera es **permanente** y será el subdominio del
cliente: el daño no es solo de almacenamiento, es de espacio de nombres. ¿Cuánto se puede ensuciar
esto y con qué esfuerzo? ¿Cuál es el mínimo de defensas para poder abrir el registro?

**Entregable:** la respuesta de I+D y, si el registro queda abierto, el mínimo de defensas exigible.
Si los primeros clientes llegan por recomendación, la invitación elimina el problema de raíz y no hay
que construir nada.

### Q11 — ¿Cómo le llega al paciente el enlace de su cita?

> ✅ **Respondida (2026-10-14): B — el sistema pone el enlace dentro del recordatorio.** El arquitecto
> aprobó el diseño de la [Fase 3](Fases/fase-3-us04-respuesta-paciente.md) y [ADR-10](Decisions/ADR-10.md)
> pasó a **aceptado**. Cada recordatorio por correo lleva un botón fijo, *Ver o responder mi hora*, que abre
> `/cita#<token>`; el paciente confirma, cancela o pide otra hora. La otra mitad, la seguridad del enlace,
> quedó respondida con los requisitos S1–S3 y el límite de tasa ([abajo](#la-otra-mitad-respondida-2026-10-14)).
> Plan: [US-04](US/04-respuesta-paciente.md). El consentimiento ([DT-16](Deudas/DT-16.md)) **no** pasa a
> bloqueante: sigue como deuda por decisión del arquitecto.
>
> *Antes (2026-09-25):* ✅ **respondida C — US-02.07 sale de la v1.** [ADR-10](Decisions/ADR-10.md) quedó
> propuesto y aplazado.
>
> **Nota (2026-09-30):** con Q1 → A, el canal que faltaba va a existir ([ADR-13](Decisions/ADR-13.md)).
> La respuesta C no se reabre, pero el motivo de fondo ("no hay canal") desaparece: cuando se aborde
> la Fase 3, ADR-10 se retoma con la salida **B** (el sistema emite el enlace dentro del recordatorio).

**El problema concreto:** [US-02.07](US/02.07-paciente-reagenda-cancela.md) quiere que el paciente cancele
o pida reagendar **sin cuenta**, desde un enlace que sirve para una sola cita. El mecanismo está
diseñado; lo que no existe es **quién le entrega ese enlace**. RF-07 dice *"desde el recordatorio"*,
y los recordatorios (RF-06) están fuera del MVP. Es la misma pregunta que Q1 vista desde el paciente.
*(Así era el 2026-09-25. Con Q1 → A los recordatorios entraron al MVP y, desde el 2026-10-17, llevan el
enlace.)*

**Pregunta para el campo:** ¿el profesional aceptaría **copiar y enviar él mismo** el enlace por
WhatsApp al agendar? Es un paso manual —justo lo que el producto promete eliminar— pero es un único
mensaje, y le ahorra todas las llamadas de "no puedo ir". ¿Y los pacientes abrirían un enlace así?

**Entregable:** una recomendación entre estas tres:
- **A.** Puente manual: el profesional envía el enlace desde el voucher de la cita
  ([US-02.08](US/02.08-voucher-cita.md)) hasta que exista RF-06.
- **B.** Esperar a RF-06: US-02.07 entra cuando entren los recordatorios (depende de Q1).
- **C.** Aplazar US-02.07 fuera de la v1.

*Nota técnica:* el enlace se diseña para que **no dependa de quién lo entrega** — A y B usan el
mismo. La respuesta cambia el alcance, no el diseño. Diseño propuesto en
[ADR-10](Decisions/ADR-10.md) (§6 detalla qué cambia con A, B o C, y cuándo el consentimiento de
[DT-16](Deudas/DT-16.md) pasa a bloqueante). **ADR-10 no se acepta sin esta respuesta.**

**La otra mitad: seguridad del enlace** *(arquitecto, antes de construirlo)*. El enlace por cita es la
**primera superficie sin sesión que modifica una cita**: un secreto que sirve para una sola cita,
guardado hasheado, que caduca a la hora de inicio y se revoca al cerrarse la cita. Quien tenga el
enlace puede cancelar o pedir otra hora. El arquitecto fija el requisito, no la solución:

1. **Reenvío y número equivocado:** el enlace es una capacidad transferible. ¿Qué es lo mínimo que
   debe poder hacer el sistema cuando llega a quien no es? (Hoy: el profesional lo reemite y el
   anterior deja de servir.)
2. **Qué se muestra:** fecha, hora, con quién y estado — sin RUT ni contacto. ¿El tipo de consulta
   es dato de salud que no debe aparecer en un enlace reenviable?
3. **Dónde viaja el secreto:** la propuesta es que nunca aparezca en la URL de la API (logs,
   proxies, cabecera `Referer`). ¿Es suficiente?
4. **Límite de tasa:** con un secreto no adivinable, ¿qué política exige esta superficie además de
   la de [DT-18](Deudas/DT-18.md)?
5. **Hash:** ¿basta SHA-256 sin clave o hace falta HMAC?

Lo que se espera está en [ADR-10 § Pendiente para aceptar](Decisions/ADR-10.md#pendiente-para-aceptar).
**ADR-10 tampoco se acepta sin esta mitad.** Se decide en la ronda de diseño de la
[Fase 3](Fases/fase-3-us04-respuesta-paciente.md).

#### La otra mitad, respondida (2026-10-14)

| Pregunta | Requisito del arquitecto |
|---|---|
| 1. Reenvío y número equivocado | **S1:** el profesional **invalida** el enlace desde el voucher; sube la versión y el anterior deja de servir. El paciente recibe el siguiente con el próximo recordatorio (límites en [DT-42](Deudas/DT-42.md)) |
| 2. Qué se muestra | **S2:** inicio, zona, duración, estado, nombre del profesional, nombre de la organización, acciones permitidas y la petición de otra hora abierta. **Nunca** nombre del paciente, RUT, contacto, tipo de consulta ni ids internos |
| 3. Dónde viaja el secreto | **S3:** en el fragmento (`/cita#<token>`) y a la API en la cabecera `X-Enlace-Cita`; respuestas `no-store` y `no-referrer`; sin scripts de terceros; la página limpia el fragmento. Y una exigencia nueva: **abrir la página nunca ejecuta una acción** (los escáneres de enlaces de Gmail y Outlook abren los correos antes que el paciente); toda acción es un `POST` tras un clic |
| 4. Límite de tasa | 30/min por IP en las rutas del enlace y 5/hora por enlace en sus acciones; además 5/min por IP en el login, 5/hora por IP en el registro y en la solicitud pública. En memoria, una réplica ([ADR-10 §10](Decisions/ADR-10.md#10-límite-de-tasa-l1l3), [DT-18](Deudas/DT-18.md)) |
| 5. Hash | **HMAC:** el token se deriva con HMAC-SHA256 y una clave del servidor (recalculable, uno por cita); en la base, solo el SHA-256 del token ([DT-45](Deudas/DT-45.md) para la rotación de la clave) |

---

## Para los desarrolladores

Sugerencia de reparto entre los dos, porque las dos mitades no se bloquean entre sí:

- **Dev A — parar el reloj:** Q6 (planificador) y el proceso de cierre.
- **Dev B — habilitar la vía pública:** Q8 (ADR-08) y el límite de tasa. *(2026-10-18: la vía pública
  existe desde el 2026-09-10 y el límite de tasa desde la Fase 3; de Q8 solo queda el login.)*

### Q6 — Planificador para el proceso de cierre *(Dev A · ~~prioridad 1~~)*

> ✅ **Respondida en cuanto al mecanismo (2026-09-30):** [ADR-12](Decisions/ADR-12.md). Planificador
> dentro del proceso (`@nestjs/schedule`, Railway siempre encendido) sobre tablas de Postgres con
> `FOR UPDATE SKIP LOCKED`; **sin Redis ni BullMQ** por ahora (quedan como evolución). La cola se pagó
> "ahora", pero en Postgres: es el outbox de los hechos y la tabla de recordatorios.
>
> **El job de cierre se aplaza:** el scoring salió del MVP, así que deja de ser prioridad 1
> ([DT-11](Deudas/DT-11.md)). Las preguntas 3, 4 y 5 de abajo quedan resueltas en general por ADR-12
> §8; **siguen abiertas la 1 y la 2** y la regla de ADR-10 §5, para cuando se retome.
>
> **2026-10-14:** la **pregunta 1** y la regla de ADR-10 §5 quedan resueltas por la regla de `ghosting`
> **G1** que fijó el arquitecto con la Fase 3: una cita es `ghosting` si sigue `pendiente` pasado el fin
> del día de la clínica de su `inicio`, al paciente se le envió al menos un recordatorio con enlace y no
> tiene una petición de otra hora abierta ([DT-11](Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14)). El
> job sigue aplazado. **Sigue abierta la pregunta 2** (las `confirmada` que nadie cerró). Lo que sí se
> pierde cada día es la asistencia real de las citas pasadas ([DT-30](Deudas/DT-30.md)), no el
> `ghosting`; sus botones esperan a la Fase 3 (decisión del 2026-09-30). *(Revertida el 2026-10-05: los
> botones Confirmar, Asistió y No asistió están en el voucher y DT-30 quedó mitigada. La fecha de corte de G1
> es el 2026-10-17.)*
>
> **2026-10-27:** el job G1 se construyó en [US-07.01](US/07.01-registro-hechos.md) y quedó **prendido en
> production** ([DT-11](Deudas/DT-11.md), cerrada).
>
> ✅ **2026-10-30: la pregunta 2 queda respondida** (decisión del usuario, en
> [ADR-14](Decisions/ADR-14.md#preguntas-abiertas-y-lo-que-queda-a-confirmar)). Las `confirmada` que nadie
> cerró **siguen neutras** para la calificación: **no se adivina la asistencia** y el job no las toca. En vez de
> eso, aparecen en una **lista de "citas pasadas sin cerrar"** para que el profesional las marque. La misma
> lista ayuda a que G1 no cierre por error a quien sí llegó (las `pendiente` pasadas también salen ahí antes de
> que corra el job). Es el aviso que ya proponía el punto 3 de *Cómo se cierra* de [DT-30](Deudas/DT-30.md).
> Como no perfila a nadie, **no depende de la revisión legal y podría adelantarse** a US-07.02: queda como
> **candidata**, sin US ni número todavía (lo decide el usuario). **Con esto Q6 queda respondida entera.**

**Por qué es lo más urgente del tablero:** el historial de comportamiento del paciente
—[DT-11](Deudas/DT-11.md), el diferenciador del producto y un pilar del MVP— **no se está
acumulando**, y no se puede reconstruir hacia atrás. Es la única deuda cuyo coste crece solo.

**Decisión técnica:** no existe ningún planificador en el proyecto. Temporizador dentro del proceso
de la app, o cola aparte con reintentos. [ADR-04](Decisions/ADR-04.md) mencionaba una cola; hoy, si
el job es lo único que corre, probablemente sea sobre-ingeniería — pero RNF-03 va a exigir una cola
igual cuando entren recordatorios, así que la pregunta real es **si conviene pagarla ahora o después**.

**Lo que hay que decidir además del mecanismo** (y no es solo cablear):

1. **¿Cuándo está vencida una cita?** ¿Al pasar `inicio`, o al pasar `inicio + duración`, más margen?
2. **¿Qué pasa con las `confirmada` que el profesional nunca cerró?** ADR-04 no lo cubre. Quedan en
   limbo permanente — y son justamente las que más importan para RF-08, porque son de alguien que sí
   se comprometió. ¿El job las toca, o solo avisa? → ✅ **(2026-10-30) no las toca: siguen neutras y se
   muestran en la lista de citas pasadas sin cerrar** (arriba).
3. **"Ya pasó" según el reloj de la clínica**, no el del servidor. `timezone.ts` ya lo resuelve.
4. **Idempotencia:** correr dos veces no debe duplicar nada.
5. **Rompe un patrón a propósito:** todas las consultas del sistema están acotadas a un tenant; esta
   barre todas las organizaciones. Que sea explícito, no accidental.

**Entregable:** ~~ADR corto + el job + tests.~~ ADR-12 escrito; el job y sus tests, aplazados *(2026-10-20: en
producción con US-07.01; prendido el 2026-10-27)*. *(El número 10 lo tomó [ADR-10](Decisions/ADR-10.md),
enlace por cita de US-02.07, y el 11 [ADR-11](Decisions/ADR-11.md), solapamiento; este ADR usa el
siguiente número libre: **ADR-12**.)* Debe recoger además la regla
que ADR-10 §5 le deja anotada: **una petición de reagendamiento sin atender no debería terminar en
`ghosting`** — el paciente avisó.

### Q8 — ADR-08, el tenant en la URL *(Dev B · prioridad 2)*

> **Estado (2026-10-18):** la vía pública **ya no depende de esto**. `POST /api/publico/:tenantSlug/solicitudes`
> lleva el slug en la URL desde el 2026-09-10 (`e1253c3`, [ADR-09 §11.b](Decisions/ADR-09.md)), y el enlace
> del paciente de la Fase 3 no lleva `tenantSlug` ([ADR-10](Decisions/ADR-10.md), *Relación*). Lo que queda
> es el **login**, que sigue recibiendo `tenantSlug` en el cuerpo. La condición para mergear de abajo vale
> para ese cambio.

Ya está decidido y documentado; falta implementarlo. **Dejó de ser una mejora de experiencia del
login: es prerrequisito de infraestructura de la vía pública** — el enlace que el profesional
comparte necesita identificar al profesional en la dirección. *(Ver el estado de arriba: ese
prerrequisito se cumplió sin migrar el login.)*

**Entregable:** Fase 1 del plan de ADR-08 (segmento de ruta). El plan de ejecución ya está escrito,
paso a paso.

**Condición para mergear:** mover el tenant a la URL tiene un punto fácil de romper. **Si un
identificador inexistente responde distinto de una contraseña incorrecta, se reintroduce la
enumeración de organizaciones que el 401 genérico evita.** El propio ADR lo marca como su mayor
riesgo: el PR debe probar que ambas respuestas son idénticas.

### Q7 — Renovación y revocación de sesión *(bloqueado hasta que el arquitecto defina el requisito)*

**Estado:** la credencial es autosuficiente y **no se puede invalidar** antes de que expire. Cerrar
sesión es cosmético. La caducidad está en 1 día cuando el objetivo escrito era 15 minutos, porque no
hay mecanismo de renovación.

**No empiecen por el mecanismo.** El arquitecto define primero el requisito: ¿cuál es la ventana
máxima aceptable con una credencial robada, y qué debe poder hacer el sistema cuando eso pasa? ¿Basta
con que expire, o hace falta corte inmediato —usuario dado de baja, dispositivo perdido—? Con eso,
rotación de credenciales o lista de revocación se elige casi solo.

Lo que sí pueden adelantar: **el orden importa.** Bajar la caducidad antes de que exista la
renovación expulsa usuarios a mitad de consulta.

### Q9 — Modelo de disponibilidad *(no construir · solo evaluar)*

Aplazado a fase 2 conscientemente *(la segunda fase de ADR-09, no la Fase 2 del roadmap, que son
los recordatorios; nota del 2026-09-30)*. **La única pregunta ahora es defensiva:** ¿algo de lo que vamos a
construir en los próximos dos meses hace más caro añadirlo después?

**Entregable:** una respuesta de un párrafo. Si es "no", se archiva y no se vuelve a tocar. Si es
"sí", decir qué exactamente.

---

## Para el arquitecto

*(2026-10-11.)* El arquitecto **define los requisitos de seguridad antes de que se construya la parte
peligrosa**, y los desarrolladores eligen el mecanismo. Además de
estas dos, le tocan las mitades de seguridad de [Q5](#q5--registro-abierto-por-invitación-o-lista-de-espera)
(abuso del registro), [Q7](#q7--renovación-y-revocación-de-sesión-bloqueado-hasta-que-el-arquitecto-defina-el-requisito)
(sesión) y [Q11](#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) (enlace por cita, ✅ respondida
el 2026-10-14 con S1–S3 y el límite de tasa), y la condición de merge de
[Q8](#q8--adr-08-el-tenant-en-la-url-dev-b--prioridad-2). Los hallazgos de
seguridad ya fichados viven en sus deudas: [DT-02](Deudas/DT-02.md), [DT-04](Deudas/DT-04.md),
[DT-05](Deudas/DT-05.md) y [DT-18](Deudas/DT-18.md).

### Q16 — Modelo de amenazas de la vía pública

Un enlace que se publica a propósito en Instagram y WhatsApp, y que escribe en la base de datos sin
autenticación. Ya está construido (Fase 1) con RUT válido obligatorio (módulo 11), una solicitud
abierta por RUT y profesional y respuesta uniforme; el límite de tasa quedó aceptado como deuda
([DT-18](Deudas/DT-18.md)). *(2026-10-14: la Fase 3 le pone 5 solicitudes por hora por IP, y la regla
anti-spam por RUT pasa a contar solo las solicitudes `nueva`, no las peticiones de otra hora.)*

**Preguntas:**
1. El algoritmo del dígito verificador es público. **¿Qué frena realmente el RUT, y qué no?** Está
   asumido que "eleva el piso, no cierra la puerta" — confirmarlo o desmentirlo.
2. **Suplantación:** se puede pedir hora a nombre de otra persona. Cuando exista el historial de
   reputación, ¿puede un tercero ensuciar la de alguien real? ([DT-23](Deudas/DT-23.md))
3. **Sondeo:** la respuesta uniforme pretende impedir averiguar qué RUT es paciente de qué
   profesional de la salud. ¿Lo consigue? Es una filtración más grave que la enumeración de
   organizaciones.
4. **[DT-28](Deudas/DT-28.md):** la regla anti-spam bloqueaba a un paciente legítimo si el
   profesional abandonaba la bandeja (mitigada con una ventana de 72 h). ¿Hay más casos donde una
   defensa se vuelva contra el usuario?

**Entregable:** modelo de amenazas + el mínimo de defensas exigible.

### Q17 — Manejo de datos de salud

El sistema guarda RUT, nombre, contacto y motivo de consulta. Con la vía pública guarda también
**datos de personas cuya solicitud fue rechazada — gente que nunca llegó a ser paciente** — y hoy no
hay política de retención ([DT-26](Deudas/DT-26.md)).

**Pregunta:** ¿qué exige la normativa chilena de datos personales aplicable a salud, y qué plazo de
retención corresponde? Además: el RUT es un identificador nacional y no debe aparecer en URLs ni en
logs — verificar que efectivamente no aparece.

> **Nota (2026-10-31).** Un pre-análisis legal hecho con una IA el 2026-10-30 (**no es un abogado ni una opinión
> legal**; el usuario no tiene abogado) responde en parte la primera mitad. Lo que exige la normativa, lo que Citia ya
> tiene, lo que falta por prioridad y las preguntas para el abogado están en [`Cumplimiento/`](Cumplimiento/README.md),
> con seis deudas nuevas ([DT-51](Deudas/DT-51.md) a [DT-56](Deudas/DT-56.md)). Sobre el plazo: **no hay uno único**;
> la ficha clínica se guarda al menos 15 años (Ley 20.584, art. 13), pero eso no obliga a guardar igual cada registro
> administrativo, así que hace falta un plazo por finalidad: [DT-26](Deudas/DT-26.md) pasó ese día de las solicitudes
> a una política general de conservación. Sobre el RUT, lectura del código del backend (2026-10-31, sin ejecutar
> tests): las rutas usan UUID, ninguna query lleva el RUT, y pino redacta `rut` por nombre de campo y no registra
> cuerpos (`test/logs-redaccion.e2e-spec.ts`); faltan las URLs del frontend. Detalle de los logs en
> [DT-52](Deudas/DT-52.md). **La pregunta sigue abierta** hasta la revisión de un abogado.

---

## Fase 2 — decisiones pendientes tras implementar (2026-10-04)

Salieron al construir los recordatorios (backend [PR #1](https://github.com/Citia-solutions/citia-backend/pull/1),
frontend [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2)). **Ninguna bloquea el merge**:
el código tiene un comportamiento por defecto razonable para cada una. Guía de la fase:
[Fase 2 § Decisiones pendientes](Fases/fase-2-us03-recordatorios.md#decisiones-pendientes-del-usuario-2026-10-04).

### Q12 — ¿Ocultar `/recordatorios` al rol `recepcion`?

La configuración de recordatorios es **por usuario** y se aplica a las citas de las que ese usuario es
dueño (`cita.usuarioId`). Una cuenta `recepcion` también ve la pantalla y, si guarda, crea una
configuración que no afecta a ninguna cita. Hoy no hay cuentas de recepción ([DT-07](Deudas/DT-07.md))
y el rol no se verifica en ninguna ruta ([DT-02](Deudas/DT-02.md)).

- **A.** Ocultar la entrada del menú y la ruta para `recepcion` (solo frontend).
- **B.** Además, que el backend responda 403 en `PUT /api/recordatorios/configuracion` para ese rol
  (estrena la verificación de rol de DT-02).
- **C.** Dejarlo como está hasta que exista el alta de un segundo usuario (DT-07).

**Entregable:** la elección; si es B, entra con DT-02.

### Q13 — Textos y colores de los estados de recordatorio

El frontend muestra *Programado* (azul), *Enviado* y *Entregado* (verde), *Falló* (rojo), *Cancelado*
(gris) y *Omitido* (ámbar), y una frase por motivo (p. ej. *"El paciente no tiene correo registrado."*).
La tabla completa está en `citia-frontend/context/Features/recordatorios.md`. Preguntas concretas: ¿*Falló*
o *No enviado*? ¿Se distingue *Enviado* de *Entregado* para el profesional, o se muestran igual?

**Entregable:** la tabla de textos aprobada (o corregida).

### Q14 — ¿Se mantiene la vista *Contacto* del voucher?

El frontend agregó al voucher una cuarta vista, **Contacto**, que completa o corrige teléfono y correo
del paciente con `PATCH /api/pacientes/:id`, y botones *"Agregar correo"* / *"Revisar correo"* cuando
un recordatorio no salió por eso. ADR-13 pedía la ruta, pero no dónde ponerla. La alternativa es una
ficha de paciente (Fase 6, US-08), que todavía no existe.

**Entregable:** sí / no; si es no, dónde se edita el contacto mientras tanto.

### Q15 — ¿Cuándo reinicia Resend la cuota mensual del plan gratis?

La documentación de Resend confirma que la cuota **diaria** se cuenta por día UTC, pero no dice si la
**mensual** del plan gratis reinicia el día 1 (mes calendario) o en la fecha de alta de la cuenta. El
contador local asume **mes calendario UTC**. Si fuera por fecha de alta, el contador podría dejar de
llamar al proveedor unos días antes o después de lo debido; el 429 del proveedor sigue mandando
([DT-36](Deudas/DT-36.md)).

**Entregable:** el dato (soporte de Resend o la página de la cuenta) y, si no es mes calendario, el
ajuste de `periodoMesUtc` en `recordatorio/domain/periodos-conteo.ts`.

---

## Las tres que necesitan decisión conjunta

Aquí los roles **van a estar en desacuerdo**, y está bien: por eso son decisiones y no tareas.

### 1. Prepago (Q2)

| Rol | Postura previsible |
|---|---|
| I+D | Es la palanca que el mercado ya usa. Sin ella competimos en desventaja. |
| Arquitecto (seguridad) | Manejar dinero multiplica la superficie regulatoria y de ataque por un orden de magnitud. |
| Desarrollo | Es un subsistema completo, no una feature. |

**Nadie tiene razón solo.** La decisión es si la ventaja comercial paga el coste combinado.

### 2. Registro abierto (Q5)

I+D quiere la mínima fricción para crecer; la seguridad pide fricción porque es lo único que frena el
abuso. **Tensión directa.** La invitación puede ser el punto medio que le sirve a los dos — si los
primeros clientes llegan por recomendación, no se pierde nada.

### 3. Recordatorios en el MVP (Q1)

> ✅ **Decidida (2026-09-30): entran.** El coste quedó con número en [ADR-12](Decisions/ADR-12.md) y
> [ADR-13](Decisions/ADR-13.md) (cola en Postgres, un canal, observabilidad en plan gratis). El
> consentimiento efectivo se aceptó como riesgo con fecha de revisión ([DT-16](Deudas/DT-16.md)).

I+D dirá que los criterios de éxito los exigen. Desarrollo dirá que arrastran cola con reintentos,
canal de mensajería y observabilidad. Desde la seguridad, además, arrastran verificación de contacto y
consentimiento efectivo. **Es alcance contra coste, y hay que ponerle número al coste antes de
decidir.**

---

## Orden sugerido

**Semana 1, en paralelo:**
- I+D sale a conversar (Q10). Sin esto, cuatro preguntas siguen siendo opinión.
- ~~Dev A ataca el planificador y el proceso de cierre (Q6). **Es lo único con reloj.**~~
  *(2026-09-30: el planificador se decidió en ADR-12 y se construye con la Fase 2; el cierre se aplaza.
  El reloj que sigue corriendo es [DT-30](Deudas/DT-30.md).)*
- Dev B implementa ADR-08 (Q8).
- El arquitecto fija el requisito de revocación (Q7) y el mínimo de defensas del registro (Q5).

**Semana 2:**
- Con la evidencia de I+D, decidir en conjunto Q1, Q2 y Q5.
- Dev B empieza la vía pública, con el modelo de amenazas (Q16) ya en la mano.
- Q7 se implementa con su requisito definido.

**Q4 y Q9** son de bajo coste y no bloquean nada: se resuelven cuando toque.

---

**Ver también:** [Descripcion/](Descripcion/README.md) · [Decisions/](Decisions/README.md) ·
[Deudas/](Deudas/README.md)
