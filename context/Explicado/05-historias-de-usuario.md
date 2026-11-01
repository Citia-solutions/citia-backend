# Las historias de usuario y sus planes

> **Qué vas a entender acá:** qué es una historia de usuario (US), qué es un "plan de US" en Citia y por
> qué se escribe antes de programar, cómo se numeran las historias y qué dice cada uno de los seis planes
> que hay en `context/US/`. Al final de la introducción tienes una tabla con todas las US del roadmap y su
> estado al 2026-10-18.
>
> **Antes conviene leer:** [01-el-producto.md](01-el-producto.md) (qué problema resuelve Citia) y
> [04-roadmap-y-fases.md](04-roadmap-y-fases.md) (en qué orden se construye). Para el "porqué" de las
> decisiones técnicas, [03-decisiones-adr.md](03-decisiones-adr.md). Los términos raros (tenant, slug,
> outbox, ghosting…) están en [11-glosario.md](11-glosario.md).

---

## Qué es una historia de usuario

Una historia de usuario es una necesidad contada desde el punto de vista de quien la tiene, con una frase
de molde:

> Como **[quién]** quiero **[qué]** para **[para qué]**.

Un ejemplo real, de US-03: *"Como profesional de la salud quiero que mis pacientes reciban un recordatorio
automático por correo antes de su hora, para no tener que escribirles yo."*

La frase es vaga a propósito: describe el problema, no la solución. Lo que la vuelve verificable son los
**criterios de aceptación**, una lista de cosas concretas que tienen que cumplirse para darla por hecha. En
US-03, por ejemplo: "por defecto se envía 24 h y 2 h antes", "no se envía entre las 21:00 y las 08:00",
"el correo nunca lleva el tipo de consulta".

Cada US cuelga de un **requisito funcional** del producto (los RF de [`rf.md`](../rf.md)). El requisito dice
*qué tiene que hacer el sistema*; la historia lo aterriza a *quién lo usa y para qué*. Así, US-06 implementa
RF-03 (dashboard del día), US-03 implementa RF-06 (recordatorios) y US-04 implementa RF-07 (respuesta del
paciente).

---

## Qué es un "plan de US" en este proyecto

En Citia, antes de escribir código para una historia que no es trivial, se escribe un **plan** en
`context/US/`. Todos arrancan con la misma advertencia:

> Solo decisiones y orden. Sin código. Brief para los agentes.

Piensa en el plano de una casa. El arquitecto no pone ladrillos, pero sin plano cada maestro construye a su
manera y después las paredes no calzan. Acá los "maestros" son los sub-agentes (base de datos, API,
infraestructura, tests) que trabajan en paralelo, y el plan es lo que garantiza que lo que haga cada uno
encaje con lo de los demás. Desde la Fase 3 el plan lo dice sin rodeos: **"este plan es el contrato: si algo
choca con el código, se implementa lo más cercano posible y se reporta; no se rediseña"**.

### Las partes de un plan

Los primeros planes eran simples. El molde maduro (US-03 y US-04) tiene estas secciones:

| Sección | Qué responde |
|---|---|
| Descripción | la historia y sus criterios de aceptación |
| Punto de partida | qué existe ya, **verificado en el código** (no de memoria) |
| Decisiones | cada pregunta abierta, con sus opciones, pros, contras y veredicto |
| Modelo de datos y rutas | el contrato: tablas, columnas, endpoints, forma de las respuestas |
| Orden de construcción | qué agente hace qué y qué depende de qué |
| Definición de Terminado | la lista de chequeo, con el test que prueba cada punto |
| Fuera de alcance | lo que a propósito **no** se hace, para que nadie lo agregue "de pasada" |
| Deudas que toca | qué [deudas técnicas](07-deudas-tecnicas.md) cierra, crea o acepta |

### La Definición de Terminado

Es la parte más importante. Funciona como la lista de chequeo de un piloto antes de despegar: no basta con
"me parece que está listo", cada punto se marca solo cuando hay evidencia. En los planes maduros cada ítem
dice **qué archivo de test lo prueba** (por ejemplo: *"token inválido de seis formas → respuesta idéntica —
`test/portal-paciente.e2e-spec.ts`"*). Lo que no se puede automatizar se marca como *manual* y se hace en
staging o en producción (por ejemplo: "un correo real llega a la bandeja de entrada y no a spam").

¿Por qué tanto rigor? Porque la historia "casi terminada" es la que se rompe en producción. Y porque, si la
lista está escrita **antes**, no se puede acomodar después a lo que salió.

### Plan, ADR y feature: tres documentos distintos

Es fácil confundirlos:

- El **ADR** ([03-decisiones-adr.md](03-decisiones-adr.md)) explica **por qué** se tomó una decisión técnica
  y qué se descartó.
- El **plan de US** dice **qué** se construye, **en qué orden** y **cuándo está terminado**.
- La **feature** ([06-features.md](06-features.md)) describe **lo que quedó en el código**, incluidas las
  diferencias con el plan.

Un plan no se borra cuando se termina: queda como registro de lo que se decidió. Por eso varios llevan
notas fechadas ("*Estado (2026-10-14): …*") en vez de reescribirse. Si un plan y el
[ROADMAP](../ROADMAP.md) no coinciden en el estado, **manda el ROADMAP**.

### No toda US tiene plan

- **US-02 (gestión de citas)** no tiene un `US/02-*.md`: su contrato se escribió directamente en la feature
  [us02-gestion-citas](../Features/us02-gestion-citas.md). Solo sus subtareas más delicadas tuvieron plan.
- **US-05, US-08 y US-09** no tienen plan porque todavía no se diseñan. Escribir los criterios ahora sería adivinar.
  *(US-07 tiene el de su primera subtarea, [US-07.01](../US/07.01-registro-hechos.md); US-10 tiene el suyo,
  [US-10](../US/10-perfil-cuenta.md), desde el 2026-10-31, en diseño.)*
- Los planes del **frontend** viven en el otro repo, en `citia-frontend/context/us/` (por ejemplo
  [02.09](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md), que es solo de frontend).

---

## La numeración

- **US-00** es la base: autenticación y registro. Se parte en **US-00a** (registro) y **US-00b** (login).
  Fue lo primero que se construyó, en la etapa llamada *Fundaciones*.
- **US-01 no existe.** En un documento viejo aparece "US-01 login": es el nombre antiguo de US-00b.
- **US-02 a US-10** son las historias del [ROADMAP](../ROADMAP.md). **El número no es el orden de
  construcción**: US-06 (dashboard) fue la Fase 0 y US-02 (gestión de citas) la Fase 1. El orden lo dan las
  dependencias.
- **`02.NN`** son **subtareas de US-02**, no historias propias: US-02.07 (el paciente cancela o pide otra
  hora), US-02.08 (el voucher del profesional) y US-02.09 (el dashboard refleja los cambios, solo
  frontend). No hay documentos 02.01 a 02.06; por qué la numeración parte en 07 no está documentado.

| Archivo en `context/US/` | Historia | Fase |
|---|---|---|
| [`00-auth.md`](../US/00-auth.md) | US-00a + US-00b | Fundaciones |
| [`06-epic.md`](../US/06-epic.md) | US-06 | Fase 0 |
| [`02.08-voucher-cita.md`](../US/02.08-voucher-cita.md) | subtarea de US-02 | Fase 1 |
| [`02.07-paciente-reagenda-cancela.md`](../US/02.07-paciente-reagenda-cancela.md) | subtarea de US-02 | Fase 1, absorbida en la Fase 3 |
| [`03-recordatorios.md`](../US/03-recordatorios.md) | US-03 | Fase 2 |
| [`04-respuesta-paciente.md`](../US/04-respuesta-paciente.md) | US-04 | Fase 3 |

### Todas las US del roadmap

Estado al 2026-10-18. El RF solo aparece donde los documentos lo nombran.

| US | De qué trata | RF | Fase | Plan | Estado |
|---|---|---|---|---|---|
| US-00a | Registro: crear la organización y su primer usuario | — | Fundaciones | [00-auth](../US/00-auth.md) | ✅ en producción |
| US-00b | Login con JWT dentro de una organización | — | Fundaciones | [00-auth](../US/00-auth.md) | ✅ en producción |
| US-02 | Gestión de citas: crear, editar, reagendar, cancelar, agenda, bandeja | — | Fase 1 | sin plan propio ([us02](../Features/us02-gestion-citas.md)) | ✅ cerrada, en producción |
| ↳ US-02.07 | El paciente cancela o pide otra hora | RF-07 | Fase 1 → 3 | [02.07](../US/02.07-paciente-reagenda-cancela.md) | 🔀 absorbida por US-04 |
| ↳ US-02.08 | Voucher de la cita (profesional) | — | Fase 1 | [02.08](../US/02.08-voucher-cita.md) | ✅ en producción |
| ↳ US-02.09 | El dashboard refleja los cambios (solo frontend) | — | Fase 1 | [en el frontend](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) | ✅ en producción |
| US-03 | Recordatorios por correo al paciente | RF-06 | Fase 2 | [03](../US/03-recordatorios.md) | ✅ cerrada en producción (2026-10-07) |
| US-04 | El paciente responde desde el recordatorio | RF-07 | Fase 3 | [04](../US/04-respuesta-paciente.md) | ✅ en producción (2026-10-17) · faltan los dos puntos manuales |
| US-05 | Alertas al profesional | RF-05 | Fase 4 | — | ⬜ sin empezar (el outbox que necesita ya existe) |
| US-06 | Dashboard de citas del día | RF-03 | Fase 0 | [06-epic](../US/06-epic.md) | ✅ cerrada, en producción |
| US-07 | Calificación de asistencia (*scoring*) | RF-08 | Fase 5 | — | ⏸ aplazada a la v2 |
| US-08 | Monitoreo y seguimiento del paciente | RF-01 | Fase 6 | — | 🔶 solo el alta del paciente y la edición de su contacto |
| US-09 | (sin definir) | — | — | — | ⬜ pendiente de definir |
| US-10 | Perfil, suscripción y soporte | RF-04 | Fase 7 | [US-10](../US/10-perfil-cuenta.md) | 🔶 en diseño (2026-10-31): [ADR-15](../Decisions/ADR-15.md) propuesto, sin implementar |

---

## US-00 — Autenticación y registro

Plan: [`US/00-auth.md`](../US/00-auth.md) · Features: [us00a](../Features/us00a-registro-inicial.md),
[us00b](../Features/us00b-login.md)

### La necesidad

Antes de cualquier otra cosa, un profesional (o una clínica) tiene que poder crear su cuenta y entrar, y
ver **solo sus datos**, nunca los de otra organización. Es la puerta de entrada y el muro entre clientes.

### Cómo se decidió construirlo

- **Registro (US-00a):** `POST /api/usuarios` crea de una vez la organización (el **tenant**) y su primer
  usuario, que siempre nace `ADMINISTRADOR`. El id de la organización lo genera el servidor, **nunca** llega
  del cliente: si el cliente pudiera mandarlo, podría colarse en una organización ajena.
- **El mismo correo puede existir en dos organizaciones.** La unicidad es "correo dentro de la
  organización", no global. Consecuencia directa: para el login no basta el correo, hay que decir en qué
  organización. Por eso cada organización tiene un **slug**, un nombre corto y legible (`clinica-sur`) que se
  genera solo al registrarse, con sufijo `-2`, `-3`… si se repite ([ADR-03](../Decisions/ADR-03.md)).
- **Todo o nada.** Crear organización y usuario va en una sola transacción: si falla el usuario, no queda una
  organización "huérfana" sin nadie adentro ([ADR-06](../Decisions/ADR-06.md)).
- **Login (US-00b):** recibe slug, correo y contraseña; devuelve un **JWT** (un token firmado que el
  frontend manda en cada petición) con el id del usuario, su correo, su organización y su rol. Cualquier
  fallo responde el mismo `401 "Credenciales inválidas"`, para no revelar si la organización o el correo
  existen.
- **Arquitectura limpia:** no se usó la estrategia `passport-local` de Nest; la contraseña se valida en el
  servicio de aplicación y la firma del JWT pasa por un puerto (`ITokenSigner`), para que la lógica no
  dependa del framework ([ADR-02](../Decisions/ADR-02.md)).

### Su Definición de Terminado, en simple

Este primer plan no tiene una sección "Definición de Terminado" aparte: son criterios de aceptación y una
lista de tareas con casillas. Todas marcadas: entidades, puertos, transacción, migraciones, tests de
integración contra una base real y tests de punta a punta del login → recurso protegido.

### Estado

✅ **Cerrada, en producción.** Después se le sumaron cosas sin tocar el plan: `tenantSlug` y `tenantNombre`
en la respuesta del login (Fases 1 y 2) y, con la Fase 3 (en producción desde el 2026-10-17), un límite de 5
logins por minuto y 5 registros por hora por IP.

---

## US-06 — Dashboard de citas del día

Plan: [`US/06-epic.md`](../US/06-epic.md) · Feature: [us06](../Features/us06-dashboard-citas.md) ·
Fase: [Fase 0](../Fases/fase-0-us06-dashboard.md)

### La necesidad

*"Como profesional de la salud quiero ver un layout con mis citas del día para prepararme para cada
atención."* Criterios: que cargue en menos de 2 s; solo las citas de hoy del profesional logueado; cada una
con paciente, hora, duración, tipo de consulta y estado; en orden cronológico; las pasadas en gris o
tachadas; y un clic que abra el detalle con reagendar y cancelar.

### El problema que destapó

El frontend ya tenía el dashboard dibujado, con datos falsos. Pero en el backend **no existían ni la cita ni
el paciente**, ni forma de crear citas. No se puede mostrar lo que no existe. Por eso el plan construyó
primero la base y recién encima la vista. Por eso también se llama *epic*: una historia que arrastró a otras.

### Cómo se decidió construirlo

1. **Paciente mínimo**, que pertenece a la organización (compartido entre los profesionales de una clínica).
2. **Cita con arquitectura hexagonal completa**, porque es el corazón del negocio. La hora de inicio es un
   solo valor fecha-hora (no fecha y hora separadas). El estado es privado y solo cambia por métodos que
   validan la regla: nadie escribe `cita.estado = 'cancelada'` a mano ([ADR-04](../Decisions/ADR-04.md)).
3. **Seis estados en un grafo cerrado:** `pendiente`, `confirmada`, `cancelada`, `asistio`, `no_asistio` y
   `ghosting`. De un estado final no se sale; una cita cancelada no se reabre, se crea otra. `ghosting`
   (nunca confirmó y no apareció) se separa de `no_asistio` (confirmó y no llegó) a propósito, pensando en el
   futuro scoring.
4. **El `ghosting` lo marcaría un proceso automático** y quedaría guardado en la base, no calculado al vuelo,
   para que el historial sea confiable. El plan decía "BullMQ, infra ya existente"; una nota del 2026-09-30
   lo corrige: nunca hubo Redis, el mecanismo vigente es un planificador sobre Postgres
   ([ADR-12](../Decisions/ADR-12.md)) y ese proceso está aplazado junto con el scoring
   ([DT-11](../Deudas/DT-11.md)).
5. **`GET /api/citas/hoy`** fue la primera ruta protegida por el guard de JWT ("estrena el guard"): filtra
   por la organización y el profesional que vienen **en el token**.
6. **Nada de dinero.** El diseño traía tarjetas de ingresos, pero la etapa 0 del producto había dicho "no
   hace nada de dinero". Decisión del 2026-06-30: el dashboard muestra solo citas.

El orden fue: paciente → cita (dominio) → cita (base de datos) → crear cita → `/hoy` → frontend. Quedaron
para después el proceso de `ghosting` y el scoring.

### Su Definición de Terminado, en simple

Que un token inválido o vencido se rechace; que nadie vea citas de otra organización; que una transición
ilegal (confirmar una cita cancelada) dé error; que el dashboard use datos reales, cero datos falsos; y que
cargue en menos de 2 s.

### Estado

✅ **Cerrada el 2026-09-28**, en producción: el frontend consume la lista real y se probó contra Postgres.
Ojo con dos cosas: las casillas de la Definición de Terminado **nunca se actualizaron en el plan** (siguen a
medio marcar), aunque su cabecera y el ROADMAP la dan por cerrada; y la medición de los 2 s **no consta** en
ningún documento ([guía de la Fase 0](../Fases/fase-0-us06-dashboard.md)).

---

## US-02.08 — El voucher de la cita

Plan: [`US/02.08-voucher-cita.md`](../US/02.08-voucher-cita.md) · Feature:
[us02 § Detalle](../Features/us02-gestion-citas.md#detalle-de-la-cita-us-0208) · Fase:
[Fase 1](../Fases/fase-1-us02-gestion-citas.md)

### La necesidad

*"Como profesional de la salud quiero abrir una cita y ver toda su información en una tarjeta tipo voucher,
para poder reagendarla o cancelarla desde ahí."* Era justo el criterio que le faltaba a US-06 (clic → detalle).

### Cómo se decidió construirlo

El plan partió mirando el código y encontró que **casi todo ya existía**: las rutas para reagendar, cancelar,
confirmar, etc. Faltaba una sola cosa: leer una cita por su id junto con los datos de su paciente.

1. **`GET /api/citas/:id`**, protegido y filtrado por la organización del token. Si la cita no existe o es de
   otra organización, responde **el mismo 404**: decir "existe pero no es tuya" ya sería filtrar información.
   No devuelve ids internos ni el consentimiento (menos campos, menos superficie de fuga) y el RUT va en el
   cuerpo, nunca en la URL.
2. **¿Quién decide qué botones se muestran?** La opción fácil era que el frontend lo dedujera del estado.
   Se descartó porque copia la máquina de estados en otro repo: el día que cambie una regla, alguien olvida
   copiarla y un botón habilitado responde error. Se eligió que el backend devuelva `accionesPermitidas`,
   **calculadas por la propia entidad `Cita`** con las mismas reglas que usa para rechazar una transición.
   Es una **pista para la interfaz, no un permiso**: como el letrero de "abierto" de una tienda, te orienta,
   pero quien decide si te atienden está adentro. Si el estado cambió entre que abriste el voucher y el
   clic, la acción igual responde 409 y el frontend recarga.
3. **Ninguna ruta nueva de escritura.** El voucher usa las que existen, con dos advertencias para el
   frontend: reagendar devuelve la cita a `pendiente` (la confirmación era para otra hora) y la fecha debe
   viajar con su zona horaria explícita ([DT-14](../Deudas/DT-14.md)).
4. **Pregunta que quedó abierta:** ¿basta con que la cita sea de la organización o debe ser del profesional
   logueado? Se igualó al resto de las rutas (solo organización) y se dejó para decidirlo todo junto en
   [Q3](../PREGUNTAS-ABIERTAS.md) (¿la agenda es del profesional o de la organización?).

### Su Definición de Terminado, en simple

El detalle llega en **una** llamada; otra organización responde igual que una cita inexistente; un id mal
formado da 400; los botones permitidos son correctos en los seis estados y los calcula la entidad (con test
de dominio); no se filtran campos internos; `/hoy` sigue funcionando; y el voucher del frontend usa el
endpoint real.

### Estado

✅ **Implementada el 2026-09-24**, en `develop` el 2026-09-25 (`2877b13`) y hoy en producción. El plan
dejaba anotado que faltaba la prueba manual contra Postgres; se hizo en el cierre de la Fase 1 (2026-09-28).
El detalle creció sin romperse: la Fase 3 le sumó quién confirmó y quién canceló la cita.

---

## US-02.07 — El paciente cancela o pide otra hora

Plan: [`US/02.07-paciente-reagenda-cancela.md`](../US/02.07-paciente-reagenda-cancela.md) · hoy vigente:
[US-04](../US/04-respuesta-paciente.md)

### La necesidad

*"Como paciente quiero cancelar mi cita o pedir que me la cambien de hora, sin tener cuenta ni llamar a la
consulta, para avisar a tiempo cuando no puedo ir."*

### Por qué fue difícil

Era la **primera vez que alguien sin cuenta iba a poder modificar una cita**. Hasta entonces, la vía pública
solo dejaba solicitudes en una bandeja: el paciente pide, el profesional decide
([ADR-09](../Decisions/ADR-09.md)). Además faltaban dos piezas: saber que quien aprieta el botón es el
paciente de **esa** cita, y un canal para hacerle llegar el enlace (todavía no había recordatorios).

### Lo que analizó

- **Cómo identificar al paciente.** Tres caminos: (a) un enlace con un token secreto por cita
  (recomendado); (b) que escriba su RUT y reciba un código (descartado: necesita el canal que no había, y una
  pantalla de "escribe tu RUT" permitiría sondear qué RUT es paciente de qué profesional); (c) esperar a los
  recordatorios.
- **Qué ve el paciente:** lo mínimo para reconocer su cita (fecha, hora, duración, con quién, estado). Nunca
  el RUT, el contacto ni el tipo de consulta, que puede ser un dato de salud ("control de embarazo").
- **Cancelar** = la misma transición que ya usaba el profesional, pero registrando al paciente como autor.
- **Pedir otra hora** = una petición: la cita no se mueve hasta que el profesional fije la nueva hora.
- **Nada después de la hora de la cita.** Si el paciente pudiera cancelar después de no ir, convertiría su
  inasistencia en una cancelación y limpiaría su propio historial. El plan la llama "la razón más fuerte de
  todo el diseño".

### Qué pasó con ella

- **2026-09-23:** bloqueada en diseño; se propone [ADR-10](../Decisions/ADR-10.md).
- **2026-09-25:** aplazada fuera de la v1 ([Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita)
  → C): sin canal no había cómo entregar el enlace.
- **2026-10-14:** **absorbida por US-04.** Cuando la Fase 2 trajo los recordatorios por correo, el canal
  existió y la historia volvió, dentro de una más grande.

El plan conserva una tabla de lo que se mantuvo y lo que cambió. Se mantuvo lo esencial: un token por cita,
el mismo 404 para todo enlace no válido, el token fuera de la URL de la API, los datos mínimos, el paciente
como autor en la bitácora, la petición que no mueve la cita y "nada después del inicio". Cambió el cómo: el
token pasó a calcularse con una clave secreta (HMAC) en vez de ser aleatorio; nace con el primer
recordatorio en vez de que lo emita el profesional; el profesional solo puede invalidarlo; se quitó el tope
de 30 días; **confirmar** entró al alcance; y la petición de otra hora vive en la bandeja existente en vez de
en una tabla nueva.

### Su Definición de Terminado

**Reemplazada** por la de US-04. Varios puntos de la original ya no aplican (reemitir el enlace, la marca en
el dashboard).

### Estado

🔀 **Absorbida por US-04.** El documento se conserva como el análisis del que salió ADR-10. La lección: un
buen análisis no se pierde aunque la historia se aplace.

---

## US-03 — Recordatorios al paciente

Plan: [`US/03-recordatorios.md`](../US/03-recordatorios.md) · Feature:
[us03](../Features/us03-recordatorios.md) · Fase: [Fase 2](../Fases/fase-2-us03-recordatorios.md)

### La necesidad

Dos voces: el **profesional** quiere que sus pacientes reciban un recordatorio automático por correo, para no
escribirles él; el **paciente** quiere saber fecha, hora, con quién es su cita y cómo avisar si no puede ir.

Los criterios principales: al crear una cita se programan sus recordatorios (por defecto 24 h y 2 h antes);
reagendar los reprograma, cancelar los anula; el correo lleva solo fecha, hora, profesional, organización y
contacto, nunca el tipo de consulta; nada entre las 21:00 y las 08:00; el profesional ve el estado de cada
recordatorio y puede configurar los momentos (de 1 a 3), apagarlos y dejar un correo para que le respondan; y
si los envíos fallan, el equipo recibe una alerta.

### Cómo se decidió construirlo

El porqué está en [ADR-12](../Decisions/ADR-12.md) y [ADR-13](../Decisions/ADR-13.md); el plan lo resume en
una tabla:

- **Outbox.** Cuando pasa algo con una cita (se crea, se reagenda…), el *hecho* se guarda en la tabla
  `eventos_salida` **en la misma transacción** que el cambio. Después, un despachador lo reparte a quien
  escuche. Es como un buzón: aunque el cartero pase más tarde, la carta ya está adentro y no se pierde si el
  servidor se cae justo después de guardar la cita.
- **Planificador dentro del mismo proceso**, sobre Postgres, sin Redis ni colas externas: más simple de
  operar para un equipo chico.
- **Reconciliar en vez de aplicar cambios.** Ante cada hecho, el sistema mira la cita **como está ahora** y
  ajusta sus recordatorios. Si un hecho llega dos veces o desordenado, el resultado es el mismo.
- **Resend** como proveedor de correo, detrás de un puerto; en desarrollo, un adaptador `registro` que no
  envía nada.
- **El correo del paciente pasa a ser obligatorio** al crearlo.
- **Consentimiento:** la regla está escrita pero **apagada**; riesgo aceptado ([DT-16](../Deudas/DT-16.md)).
- **Observabilidad:** logs en JSON, un *health check* y Better Stack para enterarse de un fallo antes que el
  cliente.

El plan preveía dos PR y 14 pasos repartidos entre agentes (unos 14 días-persona). Se construyó en una sola
rama y un solo PR, pero respetando el orden de los pasos en los commits. En paralelo, el usuario hizo los
**prerrequisitos operativos**: comprar el dominio, verificarlo en Resend, crear las cuentas y cargar las
variables en Railway.

### Su Definición de Terminado, en simple

Está agrupada por temas: que el outbox no pierda ni duplique hechos (con tests contra Postgres); que la
planificación sea correcta, incluidos los fines de semana de cambio de horario en Chile; que crear,
reagendar y cancelar produzcan los recordatorios esperados; que el proveedor, la cuota y los webhooks se
comporten bien; que el correo del paciente se exija; y que los logs no tengan datos personales. Más dos
puntos manuales: ver el latido y una alerta en Better Stack, y que un correo real llegue con sus firmas en
regla.

### Estado

✅ **Cerrada en producción el 2026-10-07**: tres correos reales llegaron a la bandeja de entrada y el voucher
los mostró *Entregado*. La Definición de Terminado está completa con dos salvedades: no se forzó una alerta de
prueba ([DT-19](../Deudas/DT-19.md)) y no se revisaron las cabeceras de autenticación del correo, al que
además le falta el registro DMARC ([DT-41](../Deudas/DT-41.md)). Quedaron fuera a propósito WhatsApp y SMS,
responder desde el correo (eso es US-04) y revisar el consentimiento.

---

## US-04 — El paciente responde desde el recordatorio

Plan: [`US/04-respuesta-paciente.md`](../US/04-respuesta-paciente.md) · Feature:
[us04](../Features/us04-respuesta-paciente.md) · Fase:
[Fase 3](../Fases/fase-3-us04-respuesta-paciente.md) · **contada a fondo en
[04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md)**

### La necesidad

El **paciente** quiere confirmar, cancelar o pedir otra hora desde el mismo correo del recordatorio, sin
cuenta y sin llamar. El **profesional** quiere saber quién confirmó o canceló cada cita, atender las
peticiones de otra hora en su bandeja e invalidar el enlace si llegó a quien no era.

### Cómo se decidió construirlo

Las decisiones se aprobaron el 2026-10-14, junto con [ADR-10](../Decisions/ADR-10.md), y el plan las ordena
con códigos: **S** (seguridad), **E** (el enlace), **R** (pedir otra hora), **G** (`ghosting`) y **L** (límite
de tasa). Las centrales: un solo botón fijo en cada correo (*Ver o responder mi hora*); un token por cita,
calculado con una clave secreta, que nace con el primer recordatorio; abrir la página no hace nada, toda
acción es un botón; pedir otra hora entra a la bandeja y, al aceptarla, el profesional mueve **la misma**
cita; la regla de `ghosting` queda escrita pero no se programa todavía; y límite de tasa en las cuatro
superficies públicas. Todo esto, con el porqué de cada regla, está en
[04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md).

El orden de construcción tiene nueve pasos (del 0 al 8): arquitectura → infraestructura (clave, proxy, CORS,
logs, límite de tasa) → base de datos → módulo `cita` → `recordatorio` → `solicitud` → el módulo nuevo
`portal-paciente` → tests → documentación. El frontend avanzó en paralelo contra el mismo contrato.

### Su Definición de Terminado, en simple

Es la más larga del proyecto. Pide, entre otras cosas: que un enlace no válido responda **exactamente igual**
de seis formas distintas; que en la base solo quede el hash del token; que nada funcione después de la hora
de la cita, probado en la lógica y no solo en la pantalla; que el enlace de una cita no sirva para otra; que
la respuesta pública no traiga datos del paciente; que confirmar, cancelar y pedir otra hora dejen al paciente
como autor; que el correo sea idéntico entre reintentos; que el límite de tasa responda 429; que el token no
aparezca en los logs; y que el dashboard no cambie. Dos puntos son manuales: un correo real con el botón, y
comprobar que los escáneres de enlaces de Gmail y Outlook **no** confirman la cita solos.

### Estado

✅ **En producción desde el 2026-10-17.** Se implementó y verificó en local el 2026-10-15, con lo automático en
verde (1709 unitarios, 287 e2e y 139 de integración), se mergeó a `develop` ese mismo día (backend PR #6) y
salió a producción dos días después (backend PR #7, frontend PR #8). Faltan los dos puntos manuales
([checklist de salida](../Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción)).

---

## Lecciones para llevarse

- **El punto de partida se verifica en el código.** El plan de US-02.08 descubrió que faltaba una sola ruta;
  el de US-06, que faltaba todo.
- **Un plan aplazado no es trabajo perdido.** US-02.07 se aplazó por falta de canal y su análisis terminó
  siendo la base de US-04.
- **La Definición de Terminado con su test al lado** evita el "casi listo".
- **Actualiza el estado.** Si no, pasa lo de US-06: casillas viejas que contradicen la cabecera.

---

## Para profundizar

- Los planes: [00-auth](../US/00-auth.md) · [06-epic](../US/06-epic.md) ·
  [02.08-voucher-cita](../US/02.08-voucher-cita.md) ·
  [02.07-paciente-reagenda-cancela](../US/02.07-paciente-reagenda-cancela.md) ·
  [03-recordatorios](../US/03-recordatorios.md) · [04-respuesta-paciente](../US/04-respuesta-paciente.md)
- El estado de todo: [ROADMAP](../ROADMAP.md) · guías por fase en [Fases/](../Fases/README.md)
- Los requisitos de los que cuelgan: [rf.md](../rf.md) · [rnf.md](../rnf.md) ·
  [Descripcion/fase-2-requisitos.md](../Descripcion/fase-2-requisitos.md)
- Los planes del frontend: [`citia-frontend/context/us/`](../../../citia-frontend/context/us/)
- Lo que quedó construido: [06-features.md](06-features.md)
