# Preguntas abiertas — reparto por rol

Diez decisiones pendientes que bloquean el MVP. Aquí están reformuladas **en el lenguaje de quien
puede responderlas**, con el entregable que se espera de cada una.

**Equipo:** 1 I+D · 2 desarrolladores · 1 hacker ético.

**Principio del reparto:** una pregunta puede tocar a varios roles, pero **la pregunta que se le hace
a cada uno es distinta**. Al hacker no se le pregunta "¿rotación o lista de revocación?" — eso es una
decisión de implementación. Se le pregunta qué debe poder hacer el sistema cuando una sesión se
compromete, y los desarrolladores eligen el mecanismo que cumpla ese requisito.

---

## Reparto rápido

| # | Pregunta | Responde | Bloquea |
|---|----------|----------|---------|
| 10 | Validación con usuarios reales | **I+D** | 1, 2, 3, 5 — y de facto todo lo demás |
| 1 | ¿El MVP incluye recordatorios? | **I+D** → decisión conjunta | alcance de la v1 |
| 2 | ¿El prepago entra alguna vez? | **I+D** → decisión conjunta | modelo de negocio |
| 3 | ¿La agenda es del profesional o de la organización? | **I+D** | si "clínica" es cliente viable |
| 5 | ¿Registro abierto, por invitación o lista de espera? | **I+D** + **hacker** | DT-06 |
| 4 | Solapamiento: ¿avisar o rechazar? | **I+D** decide, **dev** ejecuta | nada; es barato |
| 6 | Planificador del proceso de cierre | **desarrolladores** | DT-11 — la única con reloj |
| 7 | Renovación de sesión | **hacker** define requisito, **dev** elige mecanismo | DT-01 |
| 8 | ADR-08 — tenant en la URL | **desarrolladores**, revisión del **hacker** | toda la vía pública |
| 9 | Modelo de disponibilidad | **desarrolladores** (solo evaluar riesgo) | nada hoy |

---

## Para I+D

### Q10 — La validación. Empieza por aquí.

**Es la entrada de todo lo demás.** Cuatro de las diez preguntas se responden solas con evidencia de
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

Hoy el sistema acepta dos citas del mismo profesional a la misma hora, en silencio.

**Pregunta:** ¿hay consultas que sobrevenden a propósito, o un choque es siempre un error?

**Entregable:** elegir. *Recomendación: avisar y permitir* — cuesta una consulta y deja la decisión
en quien sabe si es error o intención. Rechazar obliga a definir reglas de borde (¿citas pegadas?,
¿colchón entre pacientes?) que empiezan a construir el modelo de disponibilidad.

### Q5 — ¿Registro abierto, por invitación o lista de espera?

**Pregunta para I+D:** ¿cómo van a llegar los primeros clientes? Si es por recomendación directa, la
invitación no cuesta nada y elimina un problema entero. Si la apuesta es crecimiento orgánico, el
registro abierto necesita defensas que hoy no existen.

**Coordinar con el hacker ético**, que tiene la otra mitad de esta pregunta.

---

## Para los desarrolladores

Sugerencia de reparto entre los dos, porque las dos mitades no se bloquean entre sí:

- **Dev A — parar el reloj:** Q6 (planificador) y el proceso de cierre.
- **Dev B — habilitar la vía pública:** Q8 (ADR-08) y coordinar el límite de tasa con el hacker.

### Q6 — Planificador para el proceso de cierre *(Dev A · prioridad 1)*

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
   se comprometió. ¿El job las toca, o solo avisa?
3. **"Ya pasó" según el reloj de la clínica**, no el del servidor. `timezone.ts` ya lo resuelve.
4. **Idempotencia:** correr dos veces no debe duplicar nada.
5. **Rompe un patrón a propósito:** todas las consultas del sistema están acotadas a un tenant; esta
   barre todas las organizaciones. Que sea explícito, no accidental.

**Entregable:** ADR-10 corto + el job + tests.

### Q8 — ADR-08, el tenant en la URL *(Dev B · prioridad 2)*

Ya está decidido y documentado; falta implementarlo. **Dejó de ser una mejora de experiencia del
login: es prerrequisito de infraestructura de la vía pública** — el enlace que el profesional
comparte necesita identificar al profesional en la dirección.

**Entregable:** Fase 1 del plan de ADR-08 (segmento de ruta). El plan de ejecución ya está escrito,
paso a paso.

**Revisión obligatoria del hacker antes de mergear** — ver su Q8.

### Q7 — Renovación de sesión *(bloqueado hasta que el hacker defina el requisito)*

**No empiecen por el mecanismo.** El hacker define primero qué debe poder hacer el sistema; con eso,
rotación de credenciales o lista de revocación se elige casi solo.

Lo que sí pueden adelantar: **el orden importa.** Bajar la caducidad antes de que exista la
renovación expulsa usuarios a mitad de consulta.

### Q9 — Modelo de disponibilidad *(no construir · solo evaluar)*

Aplazado a fase 2 conscientemente. **La única pregunta ahora es defensiva:** ¿algo de lo que vamos a
construir en los próximos dos meses hace más caro añadirlo después?

**Entregable:** una respuesta de un párrafo. Si es "no", se archiva y no se vuelve a tocar. Si es
"sí", decir qué exactamente.

---

## Para el hacker ético

El encargo no es auditar lo construido —aunque eso también sirve— sino **definir requisitos de
seguridad antes de que se construya la parte peligrosa**. La vía pública del paciente será la primera
superficie donde escribe alguien sin sesión, y todavía no existe: es el mejor momento posible.

### H1 — Requisito de revocación de sesión *(desbloquea Q7)*

**Estado:** la credencial es autosuficiente y **no se puede invalidar** antes de que expire. Cerrar
sesión es cosmético. La caducidad está en 1 día cuando el objetivo escrito era 15 minutos, porque no
hay mecanismo de renovación.

**Pregunta:** ¿cuál es la ventana máxima aceptable con una credencial robada, y qué debe poder hacer
el sistema cuando eso pasa? ¿Basta con que expire, o hace falta corte inmediato —usuario dado de
baja, dispositivo perdido—?

**Entregable:** el requisito, no la solución. Los desarrolladores eligen el mecanismo que lo cumpla.

### H2 — Superficie de abuso del registro *(la otra mitad de Q5)*

**Estado:** `POST /api/usuarios` es público, sin verificación de correo, sin captcha y sin límite de
tasa. Un mismo correo puede fundar organizaciones ilimitadas. Y el identificador público que se
genera es **permanente** y será el subdominio del cliente: el daño no es solo de almacenamiento, es
de espacio de nombres.

**Pregunta:** ¿cuánto se puede ensuciar esto y con qué esfuerzo? ¿Cuál es el mínimo de defensas para
poder abrir el registro?

**Entregable:** una prueba concreta que demuestre el alcance del problema, y el mínimo exigible.
Coordinar con I+D: si los primeros clientes van a llegar por recomendación, la invitación elimina
esto de raíz y no hay que construir nada.

### H3 — Modelo de amenazas de la vía pública *(antes de construirla)*

Un enlace que se publica a propósito en Instagram y WhatsApp, y que escribe en la base de datos sin
autenticación. El diseño ya contempla: RUT válido obligatorio (módulo 11), una solicitud abierta por
RUT y profesional, límite de tasa, y respuesta uniforme.

**Preguntas:**
1. El algoritmo del dígito verificador es público. **¿Qué frena realmente el RUT, y qué no?** Está
   asumido que "eleva el piso, no cierra la puerta" — confirmarlo o desmentirlo.
2. **Suplantación:** se puede pedir hora a nombre de otra persona. Cuando exista el historial de
   reputación, ¿puede un tercero ensuciar la de alguien real? ([DT-23](Deudas/DT-23.md))
3. **Sondeo:** la respuesta uniforme pretende impedir averiguar qué RUT es paciente de qué
   profesional de la salud. ¿Lo consigue? Es una filtración más grave que la enumeración de
   organizaciones.
4. **[DT-28](Deudas/DT-28.md):** la regla anti-spam bloquea de por vida a un paciente legítimo si el
   profesional abandona la bandeja. ¿Hay más casos donde una defensa se vuelva contra el usuario?

**Entregable:** modelo de amenazas + el mínimo de defensas exigible antes de publicar el enlace.

### H4 — Revisión de ADR-08 antes del merge

Mover el tenant a la URL tiene un punto fácil de romper: **si un identificador inexistente responde
distinto de una contraseña incorrecta, se reintroduce la enumeración de organizaciones que el 401
genérico evita.** El propio ADR lo marca como su mayor riesgo.

**Entregable:** revisión del PR, específicamente sobre eso.

### H5 — Manejo de datos de salud

El sistema guarda RUT, nombre, contacto y motivo de consulta. Con la vía pública guardará también
**datos de personas cuya solicitud fue rechazada — gente que nunca llegó a ser paciente** — y hoy no
hay política de retención ([DT-26](Deudas/DT-26.md)).

**Pregunta:** ¿qué exige la normativa chilena de datos personales aplicable a salud, y qué plazo de
retención corresponde? Además: el RUT es un identificador nacional y no debe aparecer en URLs ni en
logs — verificar que efectivamente no aparece.

### H6 — Hallazgos ya fichados, para confirmar o descartar

No hace falta buscarlos, ya están localizados. Falta confirmar gravedad y prioridad:

- [DT-02](Deudas/DT-02.md) el rol viaja en la credencial y **ningún endpoint lo verifica**
- [DT-04](Deudas/DT-04.md) login sin límite de intentos
- [DT-05](Deudas/DT-05.md) la respuesta de login no es uniforme en el tiempo (enumeración por tiempos)
- [DT-18](Deudas/DT-18.md) no existe límite de tasa en ninguna superficie

---

## Las tres que necesitan decisión conjunta

Aquí los roles **van a estar en desacuerdo**, y está bien: por eso son decisiones y no tareas.

### 1. Prepago (Q2)

| Rol | Postura previsible |
|---|---|
| I+D | Es la palanca que el mercado ya usa. Sin ella competimos en desventaja. |
| Hacker | Manejar dinero multiplica la superficie regulatoria y de ataque por un orden de magnitud. |
| Desarrollo | Es un subsistema completo, no una feature. |

**Nadie tiene razón solo.** La decisión es si la ventaja comercial paga el coste combinado.

### 2. Registro abierto (Q5)

I+D quiere la mínima fricción para crecer; el hacker quiere fricción porque es lo único que frena el
abuso. **Tensión directa.** La invitación puede ser el punto medio que le sirve a los dos — si los
primeros clientes llegan por recomendación, no se pierde nada.

### 3. Recordatorios en el MVP (Q1)

I+D dirá que los criterios de éxito los exigen. Desarrollo dirá que arrastran cola con reintentos,
canal de mensajería y observabilidad. El hacker añadirá que arrastran verificación de contacto y
consentimiento efectivo. **Es alcance contra coste, y hay que ponerle número al coste antes de
decidir.**

---

## Orden sugerido

**Semana 1, en paralelo:**
- I+D sale a conversar (Q10). Sin esto, cuatro preguntas siguen siendo opinión.
- Dev A ataca el planificador y el proceso de cierre (Q6). **Es lo único con reloj.**
- Dev B implementa ADR-08 (Q8).
- Hacker entrega H1 (requisito de revocación) y H2 (abuso del registro).

**Semana 2:**
- Con la evidencia de I+D, decidir en conjunto Q1, Q2 y Q5.
- Dev B empieza la vía pública, con el modelo de amenazas de H3 ya en la mano.
- Q7 se implementa con el requisito de H1 definido.

**Q4 y Q9** son de bajo coste y no bloquean nada: se resuelven cuando toque.

---

**Ver también:** [Descripcion/](Descripcion/README.md) · [Decisions/](Decisions/README.md) ·
[Deudas/](Deudas/README.md)
