# El producto: qué es Citia y por qué existe

**Qué vas a entender acá.** Qué problema ataca Citia y para quién, cómo se pasó de "hay un dolor" a
"esto es lo que construimos primero", qué piden los requisitos (RF y RNF) en palabras simples, y qué
quedó dentro y fuera del MVP, con el porqué de cada cosa.

**Antes conviene leer.** Nada: este es el punto de partida. Si te topas con un término raro (tenant,
ghosting, outbox…), está en el [glosario](11-glosario.md).

---

## Citia en una frase

Citia ataca el **ausentismo en las horas médicas**: el paciente que reserva y no llega. Cada hora
perdida es plata que el profesional no factura y una lista de espera que se alarga. Hoy ese profesional
lo combate a mano: le escribe a cada paciente por WhatsApp para preguntarle si va, y anota todo en un
Excel o en un cuaderno.

La idea de Citia es que el sistema haga esa persecución por él: recordarle la hora al paciente,
dejarlo responder y llevar la cuenta de quién cumple y quién no.

## Para quién es

El documento de la [etapa 0](../Descripcion/fase-0-problema.md) nombra tres tipos de cliente:

1. **Clínicas pequeñas.**
2. **Clínicas de nicho** (marcadas como "potencial cliente").
3. **Profesionales de la salud independientes**: el dentista, la psicóloga o el kinesiólogo que
   atiende solo.

Todo está pensado para **Chile**: el paciente se identifica con su **RUT**, las horas se calculan en la
zona horaria de Santiago, los costos se estiman en pesos y el consentimiento del paciente se revisa
contra una ley chilena (la 21.719). Puedes ver estos detalles en el [glosario](11-glosario.md).

Y es **multi-organización**: una sola instalación de Citia atiende a muchos clientes a la vez, y cada
uno (una clínica o un profesional independiente) es una **organización** separada, que en el código se
llama **tenant**. Ningún cliente ve los datos de otro. Cómo se logra eso está en
[02 — Cómo está armado](02-como-esta-armado.md#multi-organización-cada-cliente-en-su-propia-caja).

## El problema de fondo

### Lo que pasa hoy sin Citia

Según la [etapa 0](../Descripcion/fase-0-problema.md), el profesional:

- pregunta, insiste y pide por WhatsApp que le avisen si van a ir;
- lleva el registro en una planilla o en un bloc de notas.

O sea, **la solución actual existe y funciona a medias**. Citia no compite contra "nada": compite contra
WhatsApp más una planilla. Eso importa porque el producto tiene que ser claramente más cómodo que lo que
el profesional ya sabe usar.

### Por qué duele

| Dolor | Qué provoca |
|---|---|
| No controla al paciente | No sabe con quién puede contar |
| No controla la hora reservada | El hueco se pierde sin aviso |
| La plata queda en manos del paciente | Nada retiene el compromiso |
| Termina discutiendo con sus pacientes | Los pierde como clientes |

La última fila es la más silenciosa: **el profesional paga la inasistencia dos veces**, primero con la
hora perdida y después con la relación dañada por tener que andar reclamando.

### El "ghosting"

En el proyecto se distingue entre dos maneras de faltar, y vale la pena entenderlas desde ya porque
aparecen por todos lados:

- **No asistió** (`no_asistio`): el paciente **confirmó** que iba y no llegó.
- **Ghosting** (`ghosting`): el paciente **nunca confirmó** y tampoco apareció. Simplemente se
  desvaneció, como cuando alguien deja de contestar los mensajes.

Se guardan separados a propósito: para calificar a un paciente no es lo mismo alguien que avisó y falló
que alguien que nunca dio señales. La regla exacta de cuándo una cita pasa a `ghosting` se fijó el
2026-10-14 (la "regla G1", en [DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14)), pero el
proceso que la aplica todavía **no está construido**: llega con la calificación de pacientes, en la v2.

## Cómo se llegó al alcance: las cuatro etapas del producto

Antes de escribir código, el producto se pensó en cuatro **etapas**: entender el problema, validarlo,
escribir los requisitos y recortar el MVP. Están en la carpeta [`Descripcion/`](../Descripcion/README.md).

> **Ojo con la palabra "fase".** Los archivos de esas etapas se llaman `fase-0-problema.md`,
> `fase-1-validacion.md`… por razones históricas, pero **no son las fases del roadmap**. Las fases del
> roadmap (Fundaciones, Fase 0, Fase 1…) son etapas de **construcción** y se explican en
> [04 — Roadmap y fases](04-roadmap-y-fases.md). Por ejemplo, la "etapa 1" del producto es la
> validación, mientras que la "Fase 1" del roadmap es la gestión de citas. La equivalencia útil:
> **la etapa 3 del producto (el MVP) son las fases 0, 1 y 2 del roadmap.**

| Etapa | Pregunta que responde | Estado |
|---|---|---|
| [0 — Problema](../Descripcion/fase-0-problema.md) | ¿Qué problema, para quién, y qué **no** haremos? | ✅ definida |
| [1 — Validación](../Descripcion/fase-1-validacion.md) | ¿El problema es real? ¿Pagarían por resolverlo? | ⚠️ **pendiente** |
| [2 — Requisitos](../Descripcion/fase-2-requisitos.md) | ¿Qué debe hacer el sistema y con qué calidad? | ✅ requisitos · ⚠️ criterios de aceptación solo en lo construido |
| [3 — MVP](../Descripcion/fase-3-mvp.md) | ¿Qué es lo mínimo que entrega valor? | ✅ decidido el 2026-09-30 y en producción |

### Etapa 0: el problema y los límites

Además de describir el dolor, esta etapa deja dos **límites explícitos**: Citia **no maneja dinero**
(nada de cobros, pagos, retenciones ni facturación) y **no gestiona inventarios**.

También propone una idea de valor: controlar al paciente con un porcentaje de asistencia y una
calificación por su comportamiento histórico, para que el profesional "se desligue" de perseguir gente.
Y define tres **criterios de éxito**:

1. El profesional **deja de mandar WhatsApps** a sus pacientes.
2. Se **desliga de presionar** al paciente para que vaya.
3. Tiene **un lugar donde monitorear** sus consultas y sus pacientes.

Lo interesante es que el mismo documento reconoce dos **tensiones** en vez de esconderlas:

- **La palanca más fuerte queda fuera.** El diagnóstico dice que muchos profesionales ya cobran por
  adelantado para protegerse del no-show. Pero el alcance excluye el dinero. Puede ser lo correcto
  (manejar pagos multiplica la complejidad técnica y legal), pero es una **apuesta**: que los
  recordatorios y la reputación basten sin cobrar antes. Sigue abierta como
  [Q2](../PREGUNTAS-ABIERTAS.md).
- **Los criterios 1 y 2 exigían algo que el primer recorte no tenía**: que el sistema le hable al
  paciente. Esto se resolvió en la etapa 3 (más abajo).

### Etapa 1: la validación que falta

El objetivo era confirmar que el problema es real **antes** de invertir semanas de código, con 5 a 10
conversaciones con profesionales. **No se ha hecho.** El documento lo dice sin rodeos: lo de la etapa 0
es hipótesis, no un hallazgo de terreno.

¿Eso invalida lo construido? No del todo: la base (identidad, aislamiento entre clientes, agenda) sirve
para casi cualquier versión del producto. Pero hay decisiones que dependen del cliente real y siguen
sin base: qué canal prefieren los pacientes, si el prepago debería entrar, qué tipos de consulta
ofrecer, y si "clínica" es un segmento real o todos son independientes. Es la pregunta
[Q10](../PREGUNTAS-ABIERTAS.md), la que en la práctica bloquea a casi todas las demás.

La propia etapa sugiere lo más barato: media hora con dos o tres profesionales, y publicar un formulario
simple para ver si los pacientes de verdad lo llenan.

### Etapa 2: los requisitos

Traduce el problema a **qué debe hacer el sistema** (requisitos funcionales, RF) y **con qué calidad**
(requisitos no funcionales, RNF). Las fuentes únicas son [`rf.md`](../rf.md) y [`rnf.md`](../rnf.md);
los explicamos en la sección siguiente.

Un detalle honesto de esta etapa: los **criterios de aceptación** (cómo sabemos que algo está terminado)
solo están escritos para lo que ya se construyó. Para lo demás no, a propósito: escribirlos ahora sería
adivinar. Pero conviene no confundir "el requisito está enunciado" con "sabemos cuándo está listo".

> La tabla de estados de la etapa 2 quedó desactualizada (dice ❌ en cosas que ya están en producción);
> el propio documento lo advierte con notas fechadas. Para el estado real, manda el
> [ROADMAP](../ROADMAP.md#resumen).

### Etapa 3: el MVP

La pregunta era: *si solo pudiéramos construir tres cosas, ¿cuáles serían?* La respuesta vigente
(2026-09-30) es:

| # | Pieza | Requisito | Fase del roadmap | Estado |
|---|---|---|---|---|
| 1 | Dashboard con las citas del día | RF-03 · US-06 | Fase 0 | ✅ en producción |
| 2 | Gestión de citas: agendar, editar, reagendar, cancelar, agenda semanal, bandeja de solicitudes, aviso de choques de horario | US-02 | Fase 1 | ✅ en producción |
| 3 | Recordatorios al paciente por correo | RF-06 · US-03 | Fase 2 | ✅ en producción desde el 2026-10-06 |

**El cambio de alcance del 2026-09-30.** Originalmente la tercera pieza era la **calificación de
asistencia** (el "scoring", RF-08). El problema: con ese recorte **ninguna pieza le hablaba al
paciente**, así que el MVP no cumplía sus propios criterios de éxito 1 y 2. Se planteó como la pregunta
[Q1](../PREGUNTAS-ABIERTAS.md) y el usuario respondió **A**: los recordatorios entran y el scoring pasa a
la **v2**. Siguen siendo tres piezas: una entró y otra salió.

¿Por qué ese cambio tiene sentido? Piensa en un restaurante: antes de poder ponerle nota a los clientes
que no llegan a su reserva, tienes que poder **recordarles** que reservaron. Si no, la nota mide tu
propio silencio, no el comportamiento del cliente.

## Los requisitos funcionales, explicados

Estado al 2026-10-18.

| RF | Qué pide, en simple | Dónde se construye | Estado |
|---|---|---|---|
| **RF-00** Inicio de sesión | Entrar con credenciales. En la práctica se entra con el identificador de la organización (su **slug**), el correo y la contraseña, no con un "nombre de usuario" como dice el texto original | Fundaciones (US-00b) | ✅ en producción |
| **RF-01** Monitoreo del paciente | Ver la ficha de cada paciente, su historial y notas de seguimiento | Fase 6 (US-08) | 🔶 solo crear un paciente y editar su contacto |
| **RF-02** Calendarios externos | Sincronizar con el calendario que ya usa el profesional (Google, Outlook) | ninguna fase lo cubre todavía | ⬜ |
| **RF-03** Dashboard del día | Una pantalla con las citas de hoy: paciente, hora, fecha | Fase 0 (US-06) | ✅ en producción |
| **RF-04** Perfil | Configurar la cuenta, la suscripción, pedir soporte | Fase 7 (US-10) | ⬜ |
| **RF-05** Alertas al profesional | Avisarle cuando un paciente reagenda, cancela o pide hora | Fase 4 (US-05) | ⬜ (la "tubería" de eventos ya existe; falta quien la escuche) |
| **RF-06** Recordatorios al paciente | Enviarle recordatorios automáticos en momentos configurables | Fase 2 (US-03) | ✅ en producción, por correo |
| **RF-07** Respuesta del paciente | Que el paciente confirme, cancele o pida otra hora desde el recordatorio | Fase 3 (US-04) | ✅ en producción desde el 2026-10-17 |
| **RF-08** Calificación de asistencia | Calcular el % de asistencia y una etiqueta por comportamiento | Fase 5 (US-07) | ⏸ v2 |

Hay dos funcionalidades que **no tienen número RF** pero existen: el **alta de una organización** con su
primer usuario (US-00a) y la **gestión de citas** completa (US-02), que incluye un enlace público donde el
paciente **pide** hora y el profesional la acepta o la rechaza en una bandeja. Las historias de usuario se
explican en [05 — Historias de usuario](05-historias-de-usuario.md).

Fíjate en el comentario que acompaña a RF-07 en `rf.md`: *"Esto cierra el loop"*. Es la idea central del
producto: recordatorio → respuesta → alerta al profesional → historial. Hoy están en producción los dos
primeros eslabones; las alertas (RF-05) y el historial (RF-08) vienen después.

## Los requisitos no funcionales, explicados

Los RNF no dicen *qué* hace el sistema, sino *qué tan bien*. Algunos ya obligaron a tomar decisiones
grandes; otros todavía nadie los ha tratado.

| RNF | Qué exige | Qué se hizo |
|---|---|---|
| **RNF-01** Rapidez de reflejo | Un cambio de cita se ve en el dashboard en menos de 3 s, con hasta 20 profesionales a la vez | El dashboard se refresca tras crear, reagendar o cancelar. Para las alertas en menos de 3 s (Fase 4) hará falta despertar al procesador de eventos al instante ([DT-33](../Deudas/DT-33.md)) |
| **RNF-02** Seguridad y privacidad | Cifrado, que cada profesional vea solo **sus** datos y consentimiento del paciente para recibir mensajes | El aislamiento va "sellado" en el token de sesión ([ADR-01](../Decisions/ADR-01.md)). El consentimiento se guarda pero **nadie lo revisa**: riesgo aceptado hasta la Ley 21.719 ([DT-16](../Deudas/DT-16.md)) |
| **RNF-03** Confiabilidad de los recordatorios | Entregar al menos el 99 % de los recordatorios, con reintento y registro de entrega | Es el que más pesó: obligó a una cola con reintentos y al **outbox** ([ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md)). El texto lo dice claro: *"si el recordatorio no llega, no tienes producto"* |
| **RNF-04** Disponibilidad | 99,5 % en horario de atención | No hay documento que lo trate todavía |
| **RNF-05** Rendimiento | Dashboard y calendario en menos de 2 s | Anotado como objetivo en el plan del dashboard ([US-06](../US/06-epic.md)) |
| **RNF-06** Escalabilidad | Aguantar más profesionales y citas sin degradarse | No hay documento que lo trate todavía |
| **RNF-07** Usabilidad | Agendar o reagendar en 3 pasos o menos, sin capacitación | No hay documento que lo mida todavía |
| **RNF-08** Observabilidad | Logs y alertas para enterarse de un recordatorio fallido antes que el cliente | Better Stack, logs JSON y latidos de los procesos ([DT-19](../Deudas/DT-19.md): falta conectar la fuente de logs) |
| **RNF-09** Compatibilidad | Sincronizar con Google Calendar / Outlook | Va de la mano con RF-02: sin construir |

Un detalle que conecta RNF-03 con RNF-08: sin observabilidad, el 99 % de entrega es **imposible de
verificar**. Por eso se construyeron juntos en la Fase 2.

## Qué entró al MVP y qué quedó fuera, y por qué

### Lo que se le promete al primer cliente

La [etapa 3](../Descripcion/fase-3-mvp.md) lo formula con honestidad:

> *"Tus pacientes reciben un recordatorio automático por correo antes de cada hora, y tú ves si les
> llegó."*

**No** se prometía que el paciente confirme o cancele con un clic (eso es la Fase 3, fuera del MVP, que
igual llegó a producción el 2026-10-17) ni el historial de comportamiento (v2).

Contra los criterios de éxito, el MVP queda así:

| Criterio | Con el MVP |
|---|---|
| 1. Deja de mandar WhatsApps | **En parte**: Citia manda el "te recuerdo tu hora", pero la respuesta del paciente seguía llegando por teléfono hasta la Fase 3 |
| 2. Se desliga de presionar | **En parte**: el recordatorio sale solo; el registro de quién cumple llega con el scoring |
| 3. Monitorea sus consultas | **Sí**, y además ve si cada recordatorio salió, llegó o falló |

### Lo que quedó fuera

| Fuera | Por qué |
|---|---|
| **Dinero y prepago** | Límite de la etapa 0: multiplica la complejidad técnica y regulatoria. Es una apuesta consciente, abierta en [Q2](../PREGUNTAS-ABIERTAS.md) |
| **Inventarios** | Límite de la etapa 0: no es el dolor que se ataca |
| **WhatsApp y SMS** | WhatsApp Business cobra por conversación, pide verificar el negocio y aprobar plantillas con Meta, y exige consentimiento explícito (lo que volvería bloqueante a [DT-16](../Deudas/DT-16.md)). El SMS cuesta por mensaje en Chile. El correo es barato y el paciente ya deja su correo al pedir hora. Quedan como "otro adaptador" para después ([ADR-13](../Decisions/ADR-13.md)) |
| **Scoring (RF-08)** | Pasó a la v2 el 2026-09-30 para hacerle espacio a los recordatorios. Es el "segundo valor agregado" del negocio |
| **Respuesta del paciente (RF-07)** | No cabía en tres piezas. Es la Fase 3: formalmente está **fuera** del MVP, y está en producción desde el 2026-10-17 |
| **Alertas, monitoreo, calendarios, perfil** | RF-05, RF-01, RF-02 y RF-04: no están entre las tres piezas |

### Lo que se pierde por aplazar el scoring

El scoring necesita historial de quién cumple y quién no. Aquí hay una distinción fina que el proyecto
cuida mucho:

- **El `ghosting` se puede reconstruir después.** Depende de datos guardados (estado y fecha de la
  cita), así que un proceso puede marcarlo meses más tarde. Solo necesita una **fecha de corte**: no
  sirve marcar como ghosting a alguien que no tenía cómo confirmar. Esa fecha es el día en que la Fase 3
  llegó a producción: el **2026-10-17** ([DT-11](../Deudas/DT-11.md)).
- **La asistencia real no se puede reconstruir.** Si el paciente llegó o no, solo lo sabe el profesional
  ese día. Por eso, desde el 2026-10-05 el detalle de la cita (el "voucher") tiene botones de *Asistió* y
  *No asistió*. Lo anterior a esa fecha se perdió ([DT-30](../Deudas/DT-30.md), mitigada).

### La restricción del modo prueba

El piloto corre con planes gratis. El que manda es el del proveedor de correo: **100 correos al día**.
Con dos recordatorios por cita, eso da para **unas 50 citas diarias entre todos los profesionales**
(unos 9 profesionales con 5 o 6 citas al día). Pasar a pago cuesta US$20 al mes y se decide cuando el
aviso del 80 % empiece a saltar seguido ([stack § Modo prueba](../stack-tecnologico.md#modo-prueba)).

## Dónde estamos hoy (2026-10-18)

- **El MVP completo está en producción** (`app.citiahealth.cl`) desde el release del 2026-10-06. La
  Fase 2 se cerró el 2026-10-07, cuando tres recordatorios reales llegaron a la bandeja de entrada.
- **La Fase 3** (el paciente responde desde el correo) está **en producción desde el 2026-10-17**: cada
  recordatorio lleva el botón para confirmar, cancelar o pedir otra hora. Falta cerrarla con una prueba
  con un correo real. Se cuenta en detalle en [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md).
- **Lo que viene** según el [ROADMAP](../ROADMAP.md#resumen): alertas al profesional (Fase 4), scoring
  (Fase 5, v2), monitoreo de pacientes (Fase 6), perfil y soporte (Fase 7).

## Lo que sigue abierto a nivel de producto

- **Validar con usuarios reales** ([Q10](../PREGUNTAS-ABIERTAS.md)): la etapa 1 sigue pendiente.
- **¿El prepago entra alguna vez?** ([Q2](../PREGUNTAS-ABIERTAS.md)).
- **¿La agenda es del profesional o de la organización?** ([Q3](../PREGUNTAS-ABIERTAS.md)): decide si
  "clínica" es un cliente viable. Hoy cada registro crea una organización con un solo usuario y no
  existe el alta de un segundo usuario ([DT-07](../Deudas/DT-07.md)).
- **El consentimiento del paciente** ([DT-16](../Deudas/DT-16.md)): hay que revisarlo antes de que entre
  en vigor la Ley 21.719 (prevista para el 2026-12-01).

Las preguntas abiertas se explican en [08 — Preguntas abiertas](08-preguntas-abiertas.md).

## Ideas para llevarse

- **Un producto se define tanto por lo que no hace como por lo que hace.** "No maneja dinero" es una
  decisión con costo, y está escrita como tal.
- **Revisa el alcance contra tus propios criterios de éxito.** El cambio del 2026-09-30 salió de notar
  que el MVP no cumplía lo que él mismo prometía.
- **Separa lo que se puede reconstruir de lo que no.** Aplazar el scoring era barato; perder la
  asistencia real no, y por eso se mitigó aparte.

---

## Para profundizar

- [`Descripcion/README.md`](../Descripcion/README.md) — las etapas del producto y lo que queda por decidir.
- [Etapa 0 — Problema](../Descripcion/fase-0-problema.md) · [Etapa 1 — Validación](../Descripcion/fase-1-validacion.md) ·
  [Etapa 2 — Requisitos](../Descripcion/fase-2-requisitos.md) · [Etapa 3 — MVP](../Descripcion/fase-3-mvp.md)
- [`rf.md`](../rf.md) y [`rnf.md`](../rnf.md) — los requisitos, fuente única.
- [`ROADMAP.md`](../ROADMAP.md) — el estado de cada fase (manda sobre los demás documentos).
- [`README.md`](../README.md) de `context/` — el mapa de toda la documentación.
- [`PREGUNTAS-ABIERTAS.md`](../PREGUNTAS-ABIERTAS.md) — Q1, Q2, Q3 y Q10.
- [ADR-13](../Decisions/ADR-13.md) — por qué correo y no WhatsApp.
- [DT-11](../Deudas/DT-11.md), [DT-16](../Deudas/DT-16.md), [DT-30](../Deudas/DT-30.md) — ghosting, consentimiento y asistencia.
- [`stack-tecnologico.md` § Modo prueba](../stack-tecnologico.md#modo-prueba) — los límites de los planes gratis.
