# Las decisiones del frontend (FD)

> **Qué vas a entender acá:** qué es una "FD", por qué viven en el repo del backend y no en el del
> frontend, y la historia de cada una de las seis (FD-01 a FD-06): qué propuso el front, qué se decidió
> al final y con qué ADR chocó o se alineó.
>
> **Antes conviene leer:** [03-decisiones-adr.md](03-decisiones-adr.md) (sobre todo ADR-08, ADR-09 y
> ADR-10), [04-roadmap-y-fases.md](04-roadmap-y-fases.md) (Fases 1 y 3) y, si no conoces el front,
> [10-el-frontend.md](10-el-frontend.md). Los términos raros (tenant, slug, token, bandeja…) están en
> [11-glosario.md](11-glosario.md).

---

## Qué es una FD

Un **ADR** es una decisión de arquitectura del backend: cómo se guarda una cita, cómo se firma un
token, etc. Una **FD** (*Frontend Decision*) es otra cosa: una decisión de **producto o de diseño**
que se toma mirando la pantalla, pero que **obliga al backend** a hacer (o a no hacer) algo.

Un ejemplo para que se entienda: si el front decide "el paciente elige la hora y queda reservada al
instante", eso no es un detalle visual. El backend tendría que saber qué horas están libres, evitar
que dos personas tomen la misma, etc. Una decisión de la vitrina que mueve la bodega.

### ¿Por qué viven en el repo del backend?

Para que **los dos lados lean lo mismo**. Las decisiones de arquitectura y de dominio se documentan una
sola vez, en `citia-backend/context/`; el `context/` del frontend es delgado a propósito. Si las FD
vivieran en el repo del front, el backend podría tomar una decisión contraria sin enterarse (y eso
casi pasó, ver FD-01).

### Cómo está escrita cada una

Cada archivo `FD-XX.md` describe **una** decisión con tres partes: **Por qué** (el problema),
**Qué implica** (lo que le pide al backend) y **Pendiente**. Arriba lleva la fase, la feature y los
ADR relacionados, y un **estado**: *Tomada*, *Temporal*, *Propuesta*, *Descartada* o *resuelta en
parte*.

Un detalle de estilo que vas a ver en todo el proyecto: cuando algo cambia, **no se reescribe el texto
original**, se agrega una **nota fechada** arriba o abajo (*"Nota (2026-09-30)…"*). Así queda el
registro de lo que se pensó y de lo que pasó después. Cuando leas una FD, **manda la nota más
reciente**, no el cuerpo original.

### De dónde salieron

Las seis nacieron juntas el **2026-09-10**, en un mismo commit (`16b50e1`), escritas por el equipo
del frontend mientras construía la página pública donde el paciente pide hora. Por eso FD-01 a FD-05
son de la [Fase 1](../Fases/fase-1-us02-gestion-citas.md) (gestión de citas) y solo FD-06 mira más
lejos, a la [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md) (la respuesta del paciente).

> **Una FD no se impone sola.** Si choca con un ADR, alguien tiene que decidir y una de las dos queda
> marcada como superada. En este proyecto esa decisión la toma el arquitecto (el usuario). Es lo que
> pasó con FD-01.

---

## Resumen de un vistazo (estado al 2026-10-15)

| FD | Qué proponía el front | Estado hoy | ADR con el que se cruza |
|----|----------------------|------------|-------------------------|
| [FD-01](../Frontend-Decisions/FD-01.md) | El enlace público **reserva** la hora al instante | ❌ **Descartada** (2026-09-29) | **Choca** con ADR-09 decisión 2 (el paciente pide, no reserva). Ganó ADR-09 |
| [FD-02](../Frontend-Decisions/FD-02.md) | Cada profesional comparte **su propio** enlace | ✅ Tomada, con un matiz | Depende de ADR-08; resuelta por ADR-09 §11 (el enlace es de la **organización**) |
| [FD-03](../Frontend-Decisions/FD-03.md) | Mismos datos, dos formas de entrar (panel y enlace) | ✅ Tomada, a medias en la práctica | Se alinea con ADR-09 §8 (defensas del enlace); su "mismo contrato" no se siguió (ADR-09 §1) |
| [FD-04](../Frontend-Decisions/FD-04.md) | La vista pública todavía no guarda nada | ⏱️ Temporal · **superada** el mismo día | ADR-09 (la ruta pública ya existía al final del día) |
| [FD-05](../Frontend-Decisions/FD-05.md) | El flujo público vive junto al del panel, por ahora | ✅ Tomada (sigue así) | Ninguno: es una decisión casi solo del front |
| [FD-06](../Frontend-Decisions/FD-06.md) | Confirmar, cancelar o cambiar la hora desde el correo | 🟡 Propuesta · **resuelta en parte** por ADR-10 (2026-10-14) | **Choca en un punto** con ADR-10 §4 y ADR-09 §2: "cambiar la hora" es una petición manual |

---

## Primero, un poco de contexto: la "vía pública"

Casi todas las FD giran alrededor de la misma pieza, así que conviene tenerla clara.

El profesional comparte un enlace (por WhatsApp o redes) del tipo
`app.citiahealth.cl/agendar-cita/clinica-demo`. Un paciente **sin cuenta** lo abre, llena un
formulario y pide hora. Eso no crea una cita: crea una **solicitud** (`SolicitudCita`) que llega a la
**bandeja** del profesional, quien la acepta (y ahí recién nace la cita, con la hora que él fija) o la
rechaza.

Ese diseño es el [ADR-09](../Decisions/ADR-09.md), del 2026-08-23. Lo importante para este archivo:
el ADR-09 llegó **antes** que las FD. Por eso FD-01 terminó chocando con él.

---

## FD-01 — "El enlace público reserva la hora de verdad"

**Estado: ❌ Descartada (2026-09-29).** Rige el ADR-09.

### Qué propuso el front

Que el paciente entre al enlace, elija día y hora, y **esa hora quede ocupada al instante**, sin que
el profesional tenga que revisar nada. La razón era razonable: el profesional no siempre puede estar
pendiente de su agenda, y el equipo lo pedía.

La propia FD reconocía el costo: el backend tendría que cambiar una decisión ya tomada y resolver
cómo se manejan las horas disponibles y cómo se evita que dos personas tomen el mismo hueco.

### Con qué chocó

Con la **decisión 2 del [ADR-09](../Decisions/ADR-09.md)**: *"el paciente pide; el profesional fija la
hora"*. El ADR-09 había evaluado justo las dos opciones:

| Opción | Qué necesita | Veredicto del ADR-09 |
|---|---|---|
| **B1. Pide** — el paciente indica una preferencia y el profesional fija la hora al aceptar | nada nuevo | ✅ elegida |
| **B2. Reserva** — el paciente elige un hueco real de un calendario | un modelo de disponibilidad, cálculo de huecos, bloqueo ante reservas simultáneas, anticipación mínima | aplazada |

### Por qué ganó el ADR-09

- **B2 multiplica el trabajo por tres o cuatro.** No es "mostrar un calendario": es saber qué horas
  tiene libres cada profesional (horario de atención, vacaciones, bloqueos), y eso hoy no existe en
  el sistema.
- **No da más valor todavía.** Al principio, mientras el profesional no confía en el sistema, igual va
  a revisar cada cita a mano.
- **B1 se puede convertir en B2 sin rehacer nada.** La solicitud pasa de "preferencia en texto" a
  "hueco elegido" y el resto del flujo queda igual.
- Además, con B1 la tabla `citas` sigue significando "compromiso real": nada que escriba un anónimo
  entra directo a la agenda.

El 2026-09-29 (commit `31ea490`) se cerró el tema: el ADR-09 se reafirmó y FD-01 quedó descartada. El
texto original se conservó como registro.

### Qué quedó en el código

Algo curioso: **la forma visual de FD-01 sobrevivió, pero cambió su significado.** En
`/agendar-cita/:tenantSlug` el paciente todavía elige un día y una hora en un calendario, porque es la
forma más clara de decir cuándo le acomoda. Pero eso viaja al backend como **texto**
(`preferenciaHoraria: "jueves, 18 de septiembre a las 10:00"`), no como una reserva. Y el texto de la
pantalla se ajustó para no prometer lo que el sistema no sabe:

| Antes | Ahora |
|---|---|
| "Hora disponible" | "¿A qué hora?" |
| — | *"Es tu horario preferido, no una reserva…"* |

Las horas que se muestran son bloques fijos (07:00 a 21:00), no horas libres de verdad: el sistema no
las conoce. Cuando el profesional acepta, la bandeja lee ese texto para **precargarle** la hora.

### Qué sigue abierto

El modelo de disponibilidad, cuando toque, será un ADR propio. Por ahora la única pregunta abierta es
defensiva: [Q9](../PREGUNTAS-ABIERTAS.md#q9--modelo-de-disponibilidad-no-construir--solo-evaluar)
(¿algo de lo que construimos lo hace más caro después?). Ver [08-preguntas-abiertas.md](08-preguntas-abiertas.md).

---

## FD-02 — "Cada profesional comparte su propio enlace"

**Estado: ✅ Tomada**, con un matiz importante.

### Qué propuso el front

Que el enlace sea **personal**: identifica a un profesional concreto, así que la página pública no
necesita un selector de "¿con qué doctor quieres hora?". Cada profesional comparte el suyo.

### Qué le pedía al backend

Que la dirección del enlace lleve "quién es". En ese momento el backend no tenía cómo: el único lugar
donde se identificaba a la organización era el **body** del login (`tenantSlug`), según el
[ADR-03](../Decisions/ADR-03.md). Mover ese dato a la URL es lo que propone el
[ADR-08](../Decisions/ADR-08.md), que estaba (y sigue) **propuesto, sin implementar en el login**.

### Cómo se resolvió

El backend tomó **solo el mecanismo** del ADR-08 (el segmento en la ruta) y lo aplicó a la ruta nueva,
sin tocar el login, que ya estaba en uso ([ADR-09 §11.b](../Decisions/ADR-09.md)):

```
POST /api/publico/:tenantSlug/solicitudes
```

Y el login devuelve `usuario.tenantSlug`, con el que el front arma el enlace
`/agendar-cita/<slug>` y lo ofrece en el botón **"Copiar enlace de agenda"** de `/solicitudes`.

### El matiz: es de la organización, no del profesional

El enlace identifica a la **organización** (el tenant), no a la persona
([ADR-09 §11.a](../Decisions/ADR-09.md)). ¿Por qué? Porque las organizaciones tienen un identificador
público (el `slug`), pero los usuarios **no tienen ninguno**, y crearlo es una decisión de producto que
nadie tomó. La solicitud entra sin profesional asignado (`usuario_id` vacío) y queda a nombre de quien
la acepta.

Hoy da lo mismo, porque **cada organización tiene un solo usuario**: no existe todavía la forma de dar
de alta a un segundo ([DT-07](../Deudas/DT-07.md)). Cuando haya clínicas con varios profesionales, FD-02
habrá que revisarla: o se agrega un identificador público por profesional, o vuelve el selector.

### Un detalle práctico

El botón de copiar el enlace muestra una **advertencia** mientras la constante
`ENLACE_PUBLICO_LISTO` del front sea `false`. Se puso porque la ruta pública no tenía límite de
peticiones ([DT-18](../Deudas/DT-18.md)). La Fase 3 implementó ese límite (5 solicitudes por hora
por IP) y **rige en producción desde el 2026-10-17**; la advertencia sigue hasta que el front cambie la
constante a `true`.

---

## FD-03 — "Mismos datos, dos formas de entrar"

**Estado: ✅ Tomada**, aunque en la práctica se siguió solo a medias.

### Qué propuso el front

El formulario del panel ("+ Nueva cita") y el del enlace piden casi lo mismo: paciente, contacto, hora
y motivo. Lo que cambia es **quién escribe**: el profesional, que ya tiene sesión, o un paciente
anónimo. Entonces "no son dos cosas distintas, son la misma acción con dos puertas". El panel no
necesita defensas extra; el enlace sí (RUT válido, evitar spam). Y sugería que **ambos compartan el
mismo contrato de creación de cita**.

### Lo que sí se cumplió

La idea de las **defensas en la puerta pública** calza con la decisión 8 del ADR-09:

- **RUT obligatorio y válido** (se revisa el dígito verificador). Ojo: eso "eleva el piso, no cierra la
  puerta", porque el algoritmo es público.
- **Una solicitud abierta por RUT** (sin revisar, dentro de una ventana de 72 h) para ese destinatario.
- **Respuesta uniforme:** el backend responde siempre `202` con el mismo mensaje, exista o no la
  organización. Así nadie puede usar el formulario para averiguar qué RUT es paciente de quién.

### Lo que no se siguió: el "mismo contrato"

El ADR-09 decidió que lo que llega por el enlace **no es una cita** sino una `SolicitudCita`, un
agregado aparte (decisión 1). Por eso hoy hay **dos contratos distintos**:

| | Panel ("+ Nueva cita") | Enlace público |
|---|---|---|
| Endpoint | `POST /citas` (con sesión) | `POST /publico/:tenantSlug/solicitudes` (sin sesión) |
| Qué crea | una **Cita** directamente | una **SolicitudCita** en la bandeja |
| La hora | un instante exacto (`inicio`) + duración | una **preferencia en texto** |
| RUT | opcional | obligatorio |
| Archivos del front | `crearCitaApi.ts`, `toCrearCitaRequest.ts` | `agendarCitaApi.ts`, `toSolicitudRequest.ts` |

Las dos puertas **se juntan al aceptar**: aceptar una solicitud crea la cita con el mismo flujo del
panel, sin tocarlo. O sea, la intuición de FD-03 ("es el mismo dato") se respetó, pero en el **paso
final**, no en el contrato de entrada. La FD sigue marcada como *Tomada* en el índice y no tiene nota
que aclare esto.

---

## FD-04 — "La vista pública todavía no guarda nada"

**Estado: ⏱️ Temporal · superada** (el mismo 2026-09-10).

Es la más corta de todas. Cuando se escribió, el formulario público solo mostraba una pantalla de éxito
al confirmar: no enviaba nada, porque el backend todavía no tenía dónde guardarlo. La FD dejaba
registrado eso, para que nadie pensara que funcionaba.

Duró unas horas: la FD entró al mediodía y esa misma tarde llegó el endpoint del backend
(`POST /publico/:tenantSlug/solicitudes`, commit `e1253c3`) y el front empezó a enviar la solicitud de
verdad (commit `1980990` del front). La nota del 2026-09-30 la marca como superada.

**Lo que dejó como lección para el front:** un `202` del backend significa *"recibido para revisión"*,
no *"guardado con certeza"* (por la respuesta uniforme de FD-03). La pantalla final dice exactamente
eso.

---

## FD-05 — "El flujo público vive junto al del panel (por ahora)"

**Estado: ✅ Tomada.** Y sigue así hoy.

### Qué dice

El código de la página pública está en la **misma carpeta** que el modal del panel:
`src/features/crear-cita/`. Ahí conviven el modal (`ModalNuevaCita.vue`, `useCrearCita.ts`) y el flujo
del paciente (`AgendarCitaFlow.vue`, `useAgendarCita.ts`, `flujoCitaModel.ts`, los pasos del
formulario). Funciona, pero mezcla dos cosas que a futuro pueden separarse. La decisión fue **no
reordenar** sin ganar nada visible.

### Por qué casi no toca al backend

Es la única FD que es puramente de organización del front. Se registró junto a las otras porque nació
en la misma conversación, y porque deja dicho cuándo separar: *"cuando el flujo público tenga su propio
backend y contrato"*.

### Ojo

Esa condición **ya se cumple** desde el mismo 2026-09-10 (el enlace tiene su propio contrato, ver la
tabla de FD-03), y aun así nadie volvió a evaluarla. No es un problema urgente, pero es una FD que
quedó "en pausa" sin nota. Como contraste, cuando en la Fase 3 llegó la segunda página pública
(`/cita`), se le dio un feature propio (`features/responder-cita`) desde el principio.

---

## FD-06 — "Confirmar, cancelar o cambiar la hora desde el correo"

**Estado: 🟡 Propuesta · resuelta en parte** por el [ADR-10](../Decisions/ADR-10.md) (2026-10-14).

Es la FD más grande y la que tuvo el camino más largo. Si quieres el detalle de cómo se construyó, lee
[04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md); acá va la historia de la decisión.

### Qué propuso el front (2026-09-10)

Cuando al paciente le llega el recordatorio, tiene que poder **confirmar, cancelar o pedir otro
horario** sin llamar ni escribirle al profesional. Como un correo no hace nada por sí solo, lleva un
**enlace único de esa cita** que abre una página donde el paciente decide.

Los argumentos de la FD:

- Confirmar y cancelar podrían ser botones de un clic en el correo, pero **reagendar siempre necesita
  una página**, porque hay que mostrar horarios disponibles para elegir. Entonces, todo en una sola
  página.
- **Descartado:** que el paciente "responda el correo" y el sistema lo lea. Demasiado frágil.
- El enlace tiene que ser **seguro**: un token firmado, con vencimiento y ligado a esa cita, sin RUT ni
  datos clínicos en la URL.
- Ruta propuesta: algo como `/cita/:token`.

En ese momento dependía de tres cosas que no existían: recordatorios (RF-06, ni siquiera se sabía si
entraban al MVP), un servicio de envío de correos y la identificación pública del profesional (ADR-08).

### El camino (resumido)

| Fecha | Qué pasó |
|---|---|
| 2026-09-10 | FD-06 propuesta |
| 2026-09-23 | El backend escribe el ADR-10 (enlace por cita) como **propuesto** |
| 2026-09-25 | Se **aplaza**: no hay cómo hacerle llegar el enlace al paciente ([Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) → C) |
| 2026-09-30 | Se decide que los recordatorios por correo **sí** entran al MVP ([ADR-13](../Decisions/ADR-13.md)). La plantilla del correo deja un hueco (bloque `accion`) para este enlace |
| 2026-10-06 | Los recordatorios llegan a producción (Fase 2). Ya existe el canal |
| 2026-10-14 | El arquitecto aprueba el diseño de la Fase 3: **ADR-10 aceptado**, Q11 = B (el enlace va dentro del recordatorio) |
| 2026-10-15 | Fase 3 implementada, verificada en local y mergeada a `develop` en los dos repos |
| 2026-10-17 | Release de la Fase 3: llega a producción en los dos repos (backend PR #7, frontend PR #8) |

### Qué se decidió, pieza por pieza

| Lo que pedía FD-06 | Cómo quedó |
|---|---|
| Una sola página con confirmar y cancelar | ✅ **Entra.** La página es `/cita#<token>` |
| Enlace único, firmado, con vencimiento, ligado a la cita, sin datos sensibles en la URL | ✅ **Entra.** Un enlace por cita, token derivado con HMAC, vence en el `inicio` de la cita |
| Ruta tipo `/cita/:token` | 🔄 **Entra distinto:** el token va en el **fragmento** (`#…`), no en la ruta |
| Confirmar y cancelar "de un clic" desde el correo | 🔄 **Entra distinto:** el correo tiene **un solo botón**, *"Ver o responder mi hora"*. Las acciones se hacen **en la página, después de un clic**, nunca al abrir el enlace |
| Reagendar eligiendo entre horarios disponibles | 🔄 **Entra distinto:** en la v1, "cambiar la hora" es una **petición manual** |
| Elegir entre horarios disponibles | ⏸️ **Queda para después**: necesita el modelo de disponibilidad (Q9) |
| Dependía de ADR-08 y de RF-06 | ➖ **Ya no aplica**: el enlace no lleva `tenantSlug` y los recordatorios están en producción |

### Los tres cambios importantes, explicados

**1. El token va en el fragmento, no en la ruta.** Lo que va después del `#` en una URL el navegador
**nunca lo manda al servidor** ni lo pone en la cabecera `Referer`. Con `/cita/:token`, el token habría
quedado en los registros (logs) del servidor que sirve el front y podría filtrarse al abrir un enlace
externo. Además, la página lo lee, lo **borra de la barra de direcciones** y lo guarda solo en memoria.
Hacia la API viaja en una cabecera propia, `X-Enlace-Cita` (ADR-10, opción C4).

**2. Nada se hace con solo abrir el enlace.** Gmail, Outlook y los antivirus corporativos abren los
enlaces de los correos para revisar que no sean peligrosos. Si "confirmar" fuera un clic en el correo
(un `GET`), el antivirus confirmaría citas solo. Por eso abrir la página solo **lee**, y confirmar,
cancelar o pedir otra hora son `POST` que se disparan con un clic dentro de la página.

**3. "Cambiar la hora" es una petición, no una reserva.** Aquí está el choque real. FD-06 daba por
hecho que había horarios disponibles para mostrar, y el sistema **no tiene modelo de disponibilidad**
(es el mismo motivo por el que se descartó FD-01). La v1 lo resuelve así
([ADR-10 §4](../Decisions/ADR-10.md)):

- El paciente escribe su preferencia ("jueves en la tarde").
- Eso crea una `SolicitudCita` de tipo `reagendamiento` en la **misma bandeja** de siempre.
- La cita original **no se mueve**: sigue en su hora hasta que el profesional acepta la petición y fija
  la hora nueva. Ahí recién se mueve (es la misma cita, con su historial).

Por eso en la página el botón dice **"Pedir otra hora"** y nunca "Reagendar": el paciente pide, no
reserva.

### Otro ADR que se tocó: la regla de la vía pública

El [ADR-09 §8](../Decisions/ADR-09.md) tenía una regla dura: *"la vía pública solo escribe en
`solicitudes_cita`"*, para que ningún anónimo toque la agenda. El enlace del paciente la rompe: confirmar
y cancelar **cambian una cita**. El [ADR-10 §9](../Decisions/ADR-10.md) explica por qué es aceptable: el
enlace no es escritura anónima, es una **capacidad delegada** por el profesional sobre **una** cita, con
**tres** operaciones y que se cierra a la hora de inicio. La regla queda **matizada, no derogada**: sigue
valiendo para cualquier superficie pública que no traiga un enlace así.

### Lo que queda pendiente de FD-06

- Que el paciente **elija entre horarios disponibles** (Q9, sin fecha).
- Que **rechazar** una petición de otra hora le avise al paciente: hoy no lo hace
  ([DT-44](../Deudas/DT-44.md), parte 1).

> **Ojo al leer FD-06:** el apartado *"Pendiente"* del final del archivo es el original del 2026-09-10 y
> está desactualizado (habla de RF-06 "sin decidir", de que no existe servicio de correo y de la ruta
> `/cita/:token`). Lo que vale es el bloque **"Resolución (2026-10-14)"** del principio.

---

## Cómo se cruzan las FD con los ADR

| FD | ADR | Relación | Resultado |
|----|-----|----------|-----------|
| FD-01 | [ADR-09](../Decisions/ADR-09.md) decisión 2 | ⚔️ **choque directo** (reservar vs pedir) | Gana ADR-09; FD-01 descartada (2026-09-29) |
| FD-02 | [ADR-08](../Decisions/ADR-08.md), [ADR-09 §11](../Decisions/ADR-09.md) | 🔗 **dependía** de ADR-08 | Se usa solo el mecanismo de ADR-08 en la ruta pública; el enlace es de la organización |
| FD-03 | [ADR-09](../Decisions/ADR-09.md) §1 y §8 | 🤝 **alineada** en las defensas; ↔️ **distinta** en el contrato | Dos contratos que se juntan al aceptar |
| FD-04 | [ADR-09](../Decisions/ADR-09.md) | ⏱️ esperaba su implementación | Superada el mismo día |
| FD-05 | — | (solo front) | Sigue igual |
| FD-06 | [ADR-10](../Decisions/ADR-10.md), [ADR-13](../Decisions/ADR-13.md), [ADR-09](../Decisions/ADR-09.md) §2 y §8 | ⚔️ **choque parcial** en "cambiar la hora"; 🔗 dependía de ADR-13 | Resuelta en parte: petición manual en la v1 |

La nota del 2026-09-30 del [README de las FD](../Frontend-Decisions/README.md) corrige dos relaciones
que el índice original daba por ciertas: FD-02 ya no espera a ADR-08 (la ruta pública ya lleva el slug)
y FD-06 **no** depende de ADR-08 (el enlace por cita no lleva `tenantSlug`: va de token → enlace → cita →
organización).

---

## Lecciones para llevarse

- **Una decisión de pantalla puede ser una decisión de arquitectura.** "Que la hora quede reservada"
  suena a UX y es un modelo de disponibilidad completo. Por eso se escriben donde el backend las lee.
- **Cuando una FD y un ADR chocan, se decide en voz alta.** FD-01 no se ignoró ni se implementó a
  escondidas: se discutió, se descartó con fecha y su texto quedó como registro.
- **La interfaz puede conservar una forma y cambiar su significado.** El calendario de FD-01 sigue ahí,
  pero ahora es una preferencia. El texto de la pantalla ("¿A qué hora?", "Pedir otra hora") hace tanto
  trabajo como el código para no prometer lo que el sistema no cumple.
- **Las propuestas maduran con el código real.** FD-06 acertó en lo grueso (una página, un enlace por
  cita, seguro), y el diseño final mejoró los detalles que solo se ven al construir: el fragmento, los
  antivirus que abren enlaces, la falta de horarios disponibles.

---

## Para profundizar

- Índice de las FD: [Frontend-Decisions/README.md](../Frontend-Decisions/README.md)
- Cada FD: [FD-01](../Frontend-Decisions/FD-01.md) · [FD-02](../Frontend-Decisions/FD-02.md) ·
  [FD-03](../Frontend-Decisions/FD-03.md) · [FD-04](../Frontend-Decisions/FD-04.md) ·
  [FD-05](../Frontend-Decisions/FD-05.md) · [FD-06](../Frontend-Decisions/FD-06.md)
- ADR relacionados: [ADR-03](../Decisions/ADR-03.md) · [ADR-08](../Decisions/ADR-08.md) ·
  [ADR-09](../Decisions/ADR-09.md) · [ADR-10](../Decisions/ADR-10.md) · [ADR-13](../Decisions/ADR-13.md)
- Fases donde nacieron y se resolvieron: [Fase 1](../Fases/fase-1-us02-gestion-citas.md) ·
  [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md)
- Deudas mencionadas: [DT-07](../Deudas/DT-07.md) · [DT-18](../Deudas/DT-18.md) · [DT-44](../Deudas/DT-44.md)
- Preguntas abiertas: [Q9 y Q11 en PREGUNTAS-ABIERTAS.md](../PREGUNTAS-ABIERTAS.md)
- El lado del front: [agendar-cita-paciente](../../../citia-frontend/context/Features/agendar-cita-paciente.md) ·
  [responder-cita-paciente](../../../citia-frontend/context/Features/responder-cita-paciente.md)
- En esta carpeta: [03-decisiones-adr.md](03-decisiones-adr.md) · [04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md) ·
  [10-el-frontend.md](10-el-frontend.md)
