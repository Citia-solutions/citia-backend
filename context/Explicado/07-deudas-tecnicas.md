# Deudas técnicas: lo que el sistema todavía no hace (y lo sabemos)

> **Qué vas a entender acá:** qué es una deuda técnica, por qué este proyecto las anota con número
> (DT-01 a DT-46), cómo leer su severidad y su estado, y qué dice cada una en simple, agrupadas por
> tema. Al principio están las ocho que más conviene tener en la cabeza.
>
> **Antes conviene leer:** [02 — Cómo está armado](02-como-esta-armado.md),
> [03 — Decisiones (ADR)](03-decisiones-adr.md) y [04 — Roadmap y fases](04-roadmap-y-fases.md). Los
> términos raros (tenant, slug, outbox, ghosting, token…) están en el [glosario](11-glosario.md).

**Estado de referencia: 2026-10-18.** Fundaciones y Fases 0, 1 y 2 están en producción (eso es el
MVP), y la Fase 3 (el paciente responde desde el correo) también, desde el 2026-10-17. Varias deudas
cambiaron de estado con ese release; lo marco en cada una.

---

## Qué es una deuda técnica

Piensa en una casa a la que te cambiaste antes de terminarla. Funciona y vives en ella, pero hay un
enchufe sin tapa, una puerta que no cierra con llave y un cuarto sin pintar. Puedes vivir así un
tiempo, siempre que **sepas** dónde está cada cosa y no se te olvide que el enchufe está pelado.

Una deuda técnica es eso: algo que el sistema **no hace y debería**, o que hace de forma
provisional. A veces es un descuido, pero en este proyecto casi siempre es una **elección**: se
priorizó entregar algo antes y se dejó anotado lo que faltó.

La regla del proyecto, escrita en el [índice de deudas](../Deudas/README.md): **una deuda conocida y
escrita no es deuda oculta.** Lo que no puede pasar es que una limitación viva solo en la cabeza de
alguien. Por eso cada una tiene su ficha.

## Cómo está escrita cada ficha

Cada deuda vive en `context/Deudas/DT-NN.md`. El número es permanente: una deuda cerrada conserva su
número y su ficha (DT-10 sigue ahí aunque se cerró en agosto).

Todas tienen la misma forma:

- **Cabecera:** en qué fase nació, qué feature o plan la toca, con qué ADR o pregunta se relaciona.
- **Origen:** el párrafo concreto (de un ADR o de una feature) que la creó. El ADR enlaza a la deuda
  y la deuda al ADR: el camino se puede recorrer en los dos sentidos.
- **Severidad y estado** (abajo te explico cómo leerlos).
- **Qué pasa**, **Por qué importa** y **Cómo se cierra.** El último es clave: una deuda se cierra
  cuando se cumple algo verificable (un test, un cambio visto en producción), no cuando "parece
  arreglada".
- **Notas con fecha.** Cuando algo cambia, lo anterior no se borra: se tacha (~~así~~) y se agrega
  una nota fechada. Así se ve cómo evolucionó la decisión y por qué.

## Cómo leer la severidad

| Severidad | Qué significa en la práctica |
|---|---|
| **alta** | puede hacer daño real (seguridad, datos, temas legales) o impide tener clientes reales |
| **media** | es riesgosa o molesta, pero hay atenuantes o el daño es acotado |
| **baja** | un detalle, código muerto, o un riesgo raro con poco daño |
| **cosmética** | solo orden (DT-21 fue la única) |

Una **flecha** (`media → alta`) significa que la deuda **escala sola** cuando pasa algo. Por ejemplo,
DT-02 se vuelve alta el día que exista un segundo usuario por organización (DT-07); DT-33 sube cuando
lleguen las alertas al profesional de la Fase 4.

## Cómo leer los estados

El índice define cinco estados formales, pero las fichas usan algunos más. Esta es la lista completa,
con lo que significa cada uno en la práctica:

| Estado | Qué quiere decir | Ejemplos |
|---|---|---|
| **abierta** | el problema existe hoy en el código | DT-01, DT-14 |
| **prevista** | **todavía no existe**: aparecerá al implementar o desplegar un diseño ya aprobado. Es deuda "firmada a sabiendas" | hoy ninguna; DT-42 a DT-45 lo fueron hasta el release de la Fase 3 |
| **resuelta en diseño** | hay un ADR que dice cómo cerrarla; falta construirlo | hoy ninguna; DT-12 lo fue hasta implementarse |
| **aplazada** | se decidió conscientemente no hacerla todavía | DT-11, DT-17, DT-24 |
| **riesgo aceptado** | se sabe que es un problema y se eligió convivir con él, con condiciones que obligan a revisarlo | DT-16, DT-38, DT-42 |
| **mitigada** | no se resolvió entera, pero el daño bajó y lo que queda es menor | DT-28, DT-30 |
| **en producción, falta una comprobación** | el arreglo ya funciona en producción; falta verificar la última condición de cierre | DT-18 |
| **cerrada** | se cumplió el criterio de cierre | DT-10, DT-12, DT-21, DT-22, DT-27 |

> **Por qué `prevista` es el estado más útil.** Separa la deuda que **ya tienes** de la que **estás
> firmando** al aprobar un diseño. Si la anotas antes de contraerla, dentro de seis meses se lee como
> una elección y no como un descuido. Cuando el arquitecto aprobó el enlace del paciente (ADR-10), se
> anotaron de inmediato las cuatro deudas que ese diseño traía (DT-42 a DT-45).

Muchas fichas tienen además **disparadores**: condiciones concretas que obligan a reabrir la decisión
("cuando entre el primer cliente real", "antes del 1 de diciembre de 2026"). Un riesgo aceptado sin
disparador sería un olvido con otro nombre.

### La foto al 2026-10-18

| Estado | Cuántas | Cuáles |
|---|---|---|
| cerradas | 5 | DT-10, DT-12, DT-21, DT-22, DT-27 |
| mitigadas | 2 | DT-28, DT-30 |
| en producción, falta una comprobación | 1 | DT-18 |
| aplazadas | 3 | DT-11, DT-17, DT-24 |
| riesgo aceptado | 1 | DT-16 |
| previstas | 0 | — (DT-23, DT-25 y DT-26 pasaron a abiertas el 2026-10-18; DT-42 a DT-45, con el release de la Fase 3) |
| abiertas | 34 | todas las demás (DT-14, DT-19, DT-20 y DT-29 con avances parciales; DT-38 y DT-42 abiertas como riesgo aceptado; DT-45 ya cumple su criterio de cierre y falta confirmarlo) |

---

## Las ocho que más conviene conocer

Si vas a leer una sola parte de este documento, que sea esta. Las elegí porque pueden hacer daño de
verdad, porque tienen fecha, o porque son trampas en las que es fácil caer al desplegar.

1. **[DT-40](../Deudas/DT-40.md) y [DT-45](../Deudas/DT-45.md): copiar variables entre entornos.**
   Producción se armó copiando las variables de staging, y con ellas `MENSAJERIA_ADAPTADOR=registro`:
   los recordatorios quedaron "Enviado" sin haber salido nunca, y nada lo mostraba. La Fase 3 trae
   una variable nueva, `ENLACE_CITA_CLAVE`, con el mismo riesgo: **nunca se copia de un entorno a
   otro**. En su release (2026-10-17) falló de otra forma: la clave no le llegó al contenedor y
   production cayó unos 9 minutos. Moraleja: una variable se confirma en los logs del despliegue.
2. **[DT-16](../Deudas/DT-16.md): el consentimiento no se revisa antes de escribirle al paciente.**
   Riesgo aceptado **con fecha**: hay que revisarlo antes de que entre en vigor la Ley 21.719 de datos
   personales (prevista para el 1 de diciembre de 2026). El interruptor ya existe; está apagado.
3. **[DT-01](../Deudas/DT-01.md): la sesión no se puede cortar.** El token del login vale 24 horas y
   nadie puede invalidarlo antes. Cerrar sesión es cosmético: un token robado sirve un día entero.
4. **[DT-03](../Deudas/DT-03.md) y [DT-06](../Deudas/DT-06.md): registro sin verificación ni
   frenos.** No se verifica el correo, no hay "olvidé mi contraseña" y cualquiera puede crear
   organizaciones sin tope. DT-03 está marcada como **bloqueante para clientes reales**: hoy, una
   contraseña olvidada es una organización perdida.
5. **[DT-19](../Deudas/DT-19.md): las alertas por log no le llegan a nadie.** El monitoreo básico
   funciona (si la app o un job se cae, llega un correo). Pero las alertas finas, como la tasa de
   fallo de recordatorios o la cuota de correo agotada, se quedan en los logs de Railway porque falta
   conectar la fuente de logs de Better Stack.
6. **[DT-30](../Deudas/DT-30.md) y [DT-11](../Deudas/DT-11.md): el historial para el futuro
   scoring.** Si el paciente llegó o no llegó solo se puede anotar el día de la cita; si nadie lo
   marca, se pierde para siempre. Desde el 2026-10-05 el voucher tiene los botones. El `ghosting`
   (no avisó y no vino) sí se puede calcular después, y su fecha de corte es **el 2026-10-17**, el día
   en que la Fase 3 llegó a producción.
7. **[DT-23](../Deudas/DT-23.md), [DT-35](../Deudas/DT-35.md) y [DT-42](../Deudas/DT-42.md): nadie
   verifica que el contacto sea de quien dice.** Se puede pedir hora con el RUT de otro, un correo mal
   tipeado manda los recordatorios a un tercero y quien reciba un enlace reenviado puede cancelar la
   cita. Las tres se cierran con **la misma pieza** (verificar el canal de contacto), así que conviene
   construirla una sola vez.
8. **[DT-18](../Deudas/DT-18.md): el límite de tasa.** Estuvo meses sin existir, como riesgo
   aceptado. La Fase 3 lo construyó para todas las rutas públicas y está en producción desde el
   2026-10-17, con **una sola réplica** (el contador vive en memoria). Se cierra al comprobar que, detrás
   del proxy de Railway, cuenta la IP real de cada cliente.

---

## Sesión y login

El login entrega un **JWT**: un token firmado que el frontend manda en cada petición para demostrar
quién es. Las reglas están en [ADR-01](../Decisions/ADR-01.md) y [ADR-03](../Decisions/ADR-03.md).

- **[DT-01](../Deudas/DT-01.md) · La sesión no se puede renovar ni cortar** · *alta · abierta.*
  El token se valida solo con su firma, sin consultar nada, así que no hay forma de anularlo antes de
  que venza. ADR-01 quería tokens de 15 minutos, pero sin un mecanismo de renovación eso expulsaría
  al usuario cada cuarto de hora, así que quedó en 1 día. Se cierra eligiendo un mecanismo (refresh
  token rotativo o lista de revocación) y **recién después** bajando la caducidad: al revés, expulsa
  usuarios a mitad de consulta. Espera el requisito del arquitecto (Q7, ver
  [08 — Preguntas abiertas](08-preguntas-abiertas.md)).
- **[DT-02](../Deudas/DT-02.md) · El rol viaja en el token y nadie lo mira** · *media, alta cuando
  exista DT-07 · abierta.* Hay guard de autenticación (¿quién eres?) pero no de autorización (¿qué
  puedes hacer?). Hoy da igual: cada organización tiene un solo usuario y es administrador. Se cierra
  con un guard de rol en el mismo release que permita crear un segundo usuario, no antes.
- **[DT-04](../Deudas/DT-04.md) · Login sin límite de intentos** · *media · abierta.* Permite fuerza
  bruta contra contraseñas cuya única regla es "mínimo 8 caracteres", sin dejar rastro. La Fase 3
  agregó 5 intentos por minuto por IP (DT-18, en producción desde el 2026-10-17), pero falta el bloqueo **por cuenta**: un ataque
  repartido entre muchas IP no se frena, y una clínica entera detrás de una misma IP comparte el cupo.
- **[DT-05](../Deudas/DT-05.md) · El login responde más rápido cuando el usuario no existe** · *baja ·
  abierta, barata de cerrar.* El mensaje de error es el mismo para todo (bien), pero si el correo no
  existe se salta el cálculo del hash de la contraseña y responde antes. Midiendo tiempos se puede
  deducir qué correos están registrados. Se arregla comparando siempre contra un hash señuelo.

## Registro, cuentas y organizaciones

Citia es **multi-organización** (multi-tenant): cada profesional o clínica es un "tenant" con su
**slug**, un identificador público tipo `clinica-sol`. El registro (`POST /api/usuarios`) crea la
organización y su primer usuario de una vez.

- **[DT-03](../Deudas/DT-03.md) · Sin verificación de correo ni recuperación de contraseña** · *alta ·
  abierta · bloqueante para clientes reales.* Nadie confirma que el correo del registro exista, y no
  hay "olvidé mi contraseña". Las dos cosas van juntas: no puedes mandar un enlace de recuperación a un
  correo que nunca verificaste.
- **[DT-06](../Deudas/DT-06.md) · Registro público sin ningún freno** · *alta · abierta.* Sin captcha,
  sin verificación y (hasta la Fase 3) sin límite de tasa; un mismo correo puede fundar organizaciones
  ilimitadas. Lo grave no es el espacio en disco sino los **nombres**: el slug es permanente y será el
  subdominio del cliente, así que alguien podría acaparar los nombres buenos. Primero hay que decidir
  si el registro es abierto, por invitación o con lista de espera (Q5); sea cual sea, el mínimo es
  verificar el correo y limitar la tasa. La Fase 3 dejó 5 registros por hora por IP (en producción desde el
  2026-10-17).
- **[DT-07](../Deudas/DT-07.md) · No se puede agregar un segundo usuario** · *media · abierta.* La única
  forma de crear un usuario es fundando una organización. En la práctica toda organización es de una
  persona, y el tipo de cliente `CLINICA` existe en el modelo pero es inalcanzable. Es el gatillo de
  DT-02.
- **[DT-08](../Deudas/DT-08.md) · Dos registros simultáneos pueden calcular el mismo slug** · *baja ·
  abierta.* La base de datos impide el duplicado, así que no se corrompe nada, pero el segundo recibe
  un error feo en vez de `clinica-sol-2`. Se arregla capturando el error y reintentando con el
  siguiente sufijo.
- **[DT-09](../Deudas/DT-09.md) · Una comprobación de correo duplicado que nunca puede saltar** · *baja
  · abierta.* El registro busca si el correo ya existe… dentro de la organización que acaba de crear,
  que obviamente está vacía. Es código muerto que aparenta proteger algo y esconde la decisión real
  (un correo puede fundar organizaciones ilimitadas). Hay que borrarlo o conservarlo **a propósito**.

## Citas, horarios y pacientes

Una cita pasa por una **máquina de estados**: `pendiente`, `confirmada`, `cancelada`, `asistio`,
`no_asistio` y `ghosting`, con reglas sobre qué paso es legal ([ADR-04](../Decisions/ADR-04.md)).

- **[DT-10](../Deudas/DT-10.md) · La máquina de estados era inalcanzable** · *cerrada (2026-08-23).*
  Los estados existían en el dominio pero ningún endpoint los exponía: toda cita nacía y moría
  `pendiente`. El release 1 agregó confirmar, cancelar, asistencia, inasistencia y reagendar.
  `ghosting` sigue sin endpoint **a propósito**: no lo marca una persona, lo marcará un proceso
  automático (DT-11).
- **[DT-22](../Deudas/DT-22.md) · Las citas reagendadas no quedaban conectadas** · *cerrada
  (2026-08-23).* Como "de un estado final no se sale", reagendar tres veces habría dejado cuatro citas
  sin relación entre sí. Se resolvió moviendo **la misma cita** (mismo id) y guardando cada movimiento
  en la bitácora `cambios_cita`. Así el futuro scoring puede contar reagendamientos.
- **[DT-12](../Deudas/DT-12.md) · Dos citas a la misma hora sin aviso** · *media · cerrada (2026-09-28).*
  Nada impedía agendar dos pacientes a la misma hora. Se decidió **avisar y permitir** (ADR-11): el sistema
  advierte el choque pero deja agendar, porque hay consultas que sobrevenden a propósito. Está en el código
  desde el 2026-09-28 y en producción con la Fase 1; la ficha la marca cerrada desde el 2026-10-18.
- **[DT-13](../Deudas/DT-13.md) · Se aceptan citas en el pasado** · *baja, media cuando exista el
  proceso de cierre · abierta.* Hoy solo ensucia el historial. Mañana, el proceso de `ghosting`
  marcaría como "no vino" a alguien que nunca supo de esa cita.
- **[DT-14](../Deudas/DT-14.md) · La hora de la cita se acepta sin zona horaria** · *media · abierta.*
  ADR-07 arregló la zona en la **salida**: se guarda en UTC y se muestra en hora de la clínica. Pero en
  la **entrada**, una fecha sin zona se interpreta como UTC, la del servidor: el mismo desfase de horas
  entra por la puerta de atrás, y reagendar multiplica las veces que pasa. Se cierra exigiendo la zona
  o interpretando la hora como hora de la clínica.
- **[DT-17](../Deudas/DT-17.md) · Una sola zona horaria para toda la instalación** · *baja · aplazada.*
  `APP_TZ` es global. Sirve mientras todos los clientes estén en el mismo huso; el primero que no lo
  esté vería sus horas corridas. Los recordatorios heredan lo mismo (las horas sin envío, 21:00–08:00).
  El cambio es barato: el código ya recibe la zona como parámetro, solo hay que cambiar de dónde sale.
- **[DT-15](../Deudas/DT-15.md) · No se puede buscar un paciente** · *alta · abierta, neutralizada
  para crear citas.* El módulo de pacientes solo tenía alta, y sin búsqueda no se podía agendar dos
  veces al mismo paciente. Desde el release 1 el modal manda los datos del paciente junto con la cita y
  el backend lo encuentra o lo crea por RUT, así que el flujo básico funciona. Buscar, listar y editar
  siguen faltando; son de la Fase 6.

## El historial de comportamiento (camino al scoring)

El **scoring** (RF-08) es calificar a cada paciente según su historial: ¿cumple o no cumple? Salió
del MVP el 2026-09-30 y pasó a la v2, pero necesita datos que se juntan **hoy**.

- **[DT-11](../Deudas/DT-11.md) · No existe el proceso que marca `ghosting`** · *media (antes crítica)
  · aplazada.* Se aplazó junto con el scoring porque el `ghosting` **se puede reconstruir después**:
  depende de datos que ya se guardan (estado y hora). Con una trampa: antes de que existiera una forma
  real de confirmar, "pendiente y ya pasó" no significaba "no avisó", sino "nadie registró nada". Por
  eso tiene **fecha de corte**. La regla quedó escrita el 2026-10-14 (G1): es `ghosting` si la cita
  sigue pendiente pasado el fin del día (hora de la clínica), al paciente le llegó al menos un
  recordatorio con enlace y no tiene un pedido de otra hora abierto. La fecha de corte es el despliegue
  de la Fase 3 en producción: el **2026-10-17**. Falta decidir qué hacer con las citas `confirmada` que
  nadie cerró (Q6).
- **[DT-30](../Deudas/DT-30.md) · La asistencia real no se registraba** · *baja (era alta) · mitigada
  (2026-10-05).* Si el paciente llegó o no llegó solo lo sabe el profesional ese día; nada permite
  deducirlo después. El 2026-09-30 se decidió esperar a la Fase 3; el 2026-10-05 se revirtió y el
  voucher ya ofrece Confirmar, Asistió y No asistió. Lo anterior a esa fecha se perdió. Ojo con un
  detalle: el grafo de ADR-04 solo deja marcar asistencia desde `confirmada`, así que una cita
  pendiente vencida hay que confirmarla primero.

## La vía pública y las solicitudes de hora

Desde la Fase 1 hay un enlace público (`/agendar-cita`) que el profesional comparte en redes. Ahí el
paciente **pide** hora, no reserva: la solicitud cae en una bandeja y el profesional la acepta o la
rechaza ([ADR-09](../Decisions/ADR-09.md)). Fue la primera vez que alguien sin cuenta escribía en la
base de datos.

- **[DT-23](../Deudas/DT-23.md) · Nada verifica que el RUT sea de quien lo escribe** · *media ·
  abierta (desde la vía pública, 2026-09-10).* El RUT se valida con el dígito verificador, que es aritmética
  pública, no por titularidad; teléfono y correo tampoco se verifican. Cualquiera puede pedir hora a
  nombre de otro: el profesional pierde un hueco y, con el scoring, un tercero podría ensuciarle la
  reputación a una persona real. Un detalle fino: al aceptar una solicitud de un RUT ya registrado con
  el correo vacío, se completa con el correo del formulario, así que un impostor podría quedarse con
  los recordatorios de otro. Se cierra verificando el canal de contacto (la misma pieza que DT-35 y
  DT-42).
- **[DT-28](../Deudas/DT-28.md) · Una solicitud sin revisar bloqueaba al paciente** · *media · mitigada
  (2026-08-24).* La regla anti-spam permite una sola solicitud abierta por RUT y profesional. Si el
  profesional nunca mira la bandeja, el paciente quedaba bloqueado para siempre, y como la respuesta
  es siempre la misma (por privacidad), ni se enteraba. Se mitigó con una ventana: solo bloquean las
  solicitudes de las últimas 72 horas. La lección que deja la ficha: no se construyó la pieza que
  faltaba, **se reformuló la pregunta** ("¿hay una solicitud abierta **reciente**?"). Queda avisar al
  profesional de las solicitudes sin atender y confirmarle al paciente que su pedido llegó.
- **[DT-25](../Deudas/DT-25.md) · La apuesta del formulario no se puede medir** · *media · abierta
  (desde la vía pública).* El formulario pide siete campos obligatorios, y quedó escrito que si poca gente lo
  completa, el correo sería el primero en volverse opcional. Pero no se mide cuánta gente abre el
  enlace ni cuánta abandona, así que esa condición no se puede evaluar. En palabras de la ficha: una
  apuesta que no se puede medir es una suposición permanente. Lo mínimo es contar visitas contra
  solicitudes.
- **[DT-24](../Deudas/DT-24.md) · El tipo de consulta es texto libre** · *baja · aplazada.* "control",
  "Control" y "control mensual" son tres cosas distintas para el sistema. Se dejó así a propósito para
  juntar ejemplos reales antes de diseñar la lista: pasar de texto libre a lista es barato; al revés,
  no.

## Datos personales y retención

Citia guarda datos de salud: quién consulta, con quién y, a veces, por qué. RNF-02 pide privacidad y
consentimiento del paciente, y la Ley 21.719 los trata como datos sensibles.

- **[DT-16](../Deudas/DT-16.md) · El consentimiento se guarda y nadie lo lee** · *alta · riesgo
  aceptado (2026-09-30), revisar antes del 2026-12-01.* El campo `consentimiento` del paciente no se
  consulta antes de enviar nada, y en el alta manual lo marca el profesional, no el paciente. Con los
  recordatorios ese campo pasó a ser la puerta legal para escribirle a una persona, y el remitente es
  Citia. Se decidió enviar igual y dejar el interruptor listo: la política existe, probada, y está
  apagada con `RECORDATORIO_EXIGIR_CONSENTIMIENTO=false`; encenderla es cambiar una variable.
  Disparadores para revisarlo: la Ley 21.719, el primer cliente real, el primer reclamo o la entrada
  de WhatsApp. La Fase 3 no lo cambió (decisión del arquitecto), aunque ahora el correo permite
  responder.
- **[DT-26](../Deudas/DT-26.md) · Las solicitudes rechazadas se guardan para siempre** · *media ·
  abierta (desde la vía pública).* Una solicitud rechazada conserva RUT, nombre, contacto y motivo de consulta de
  alguien que nunca llegó a ser paciente: mucho riesgo y cero utilidad. No hay plazo de borrado. Las
  Fases 2 y 3 sumaron tablas a la misma pregunta (`recordatorios`, `supresiones_correo`,
  `enlaces_cita` y los pedidos de otra hora). El plazo se decide con criterio legal, no técnico (Q17).
  Como contraste, el outbox sí borra lo ya entregado a los 14 días.

## Los hechos del sistema y el outbox

Cuando una cita cambia, el sistema publica un **hecho** (`CitaCreada`, `CitaCancelada`…) para que
otros módulos reaccionen; por ejemplo, los recordatorios se reprograman. Desde la Fase 2 esos hechos
se guardan en una tabla buzón, `eventos_salida` (el **outbox**), en la misma transacción que el
cambio, y un despachador los reparte cada pocos segundos ([ADR-12](../Decisions/ADR-12.md)). Es como
echar la carta al buzón en el mismo acto en que firmas el contrato: si el contrato se anula, la carta
tampoco sale.

- **[DT-27](../Deudas/DT-27.md) · Los hechos se publicaban fuera de la transacción** · *cerrada
  (2026-10-03; en producción desde el 2026-10-06).* Antes, si la operación fallaba después de
  publicar, quedaba un hecho de algo que no pasó (fantasma), y también podía pasar lo contrario (un
  hecho perdido). Con recordatorios eso habría sido un correo por una cita inexistente o uno que nunca
  sale. Se cerró con el outbox, y un test contra Postgres lo demuestra.
- **[DT-32](../Deudas/DT-32.md) · No hay orden garantizado entre hechos de la misma cita** · *baja ·
  abierta.* Un hecho que falla se reintenta más tarde, y mientras tanto pasan los siguientes. Funciona
  porque el suscriptor de recordatorios no aplica "deltas": relee la cita y se ajusta a su estado
  actual (como mirar el saldo de la cuenta en vez de sumar movimientos sueltos). Pero eso es una
  convención, no una garantía, y las alertas de la Fase 4 son naturalmente deltas ("el paciente
  canceló"). Se decide en el ADR de esa fase.
- **[DT-33](../Deudas/DT-33.md) · Hasta 5 segundos entre el cambio y su efecto** · *baja, media con
  las alertas · abierta.* El despachador revisa el buzón cada 5 segundos. Para un recordatorio que
  sale horas después da igual (el frontend muestra "Programando…"), pero las alertas al profesional
  (RF-05) piden menos de 3 segundos. La solución prevista es `LISTEN/NOTIFY` de Postgres, en la Fase 4.
- **[DT-34](../Deudas/DT-34.md) · La "carta muerta" no tiene herramienta** · *baja · abierta.* Un hecho
  que falla 10 veces queda `fallido`, con una alerta en el log, y para reintentarlo solo hay SQL a
  mano. Falta un comando de soporte. Para los recordatorios casi todo se repara solo con la
  reconciliación de respaldo de cada hora, salvo un caso puntual (un cambio de antelaciones que muera
  en el buzón).

## Recordatorios y correo

La Fase 2 manda correos por Resend desde `recordatorios@notificaciones.citiahealth.cl`, por defecto
24 h y 2 h antes ([ADR-13](../Decisions/ADR-13.md)). Un recordatorio queda **enviado** cuando Resend
lo acepta y **entregado** cuando Resend avisa (por webhook) que llegó al buzón.

- **[DT-40](../Deudas/DT-40.md) · Con el adaptador `registro`, "Enviado" no significa enviado** ·
  *media · abierta (mitigada al corregir la variable).* El adaptador `registro` existe para
  desarrollo, tests y staging: no manda nada, solo escribe en el log y responde "aceptado". Producción
  arrancó con esa variable copiada de staging y el profesional veía "Enviado" sin que saliera ningún
  correo. Es el único fallo de la fase que no deja rastro visible. La recomendación de la ficha: que
  producción **no arranque** con `registro` salvo con una confirmación explícita
  (`MENSAJERIA_REGISTRO_PERMITIDO=true`) y que los envíos simulados no cuenten para la cuota.
- **[DT-35](../Deudas/DT-35.md) · El correo del paciente no se verifica** · *media · abierta.* Es
  obligatorio desde la Fase 2, pero nadie confirma que sea suyo. Un buzón inexistente rebota y el
  voucher muestra "Revisar correo"; en cambio, un error de tipeo que cae en el buzón real de otra
  persona no se detecta, y ese tercero recibe fecha, hora, profesional y organización (que puede
  delatar la especialidad). Mitigación barata mientras tanto: pedir el correo dos veces.
- **[DT-36](../Deudas/DT-36.md) · Una sola cuota de correo para toda la plataforma** · *media ·
  abierta.* Todas las organizaciones comparten una cuenta gratis de Resend: 100 correos al día y 3.000
  al mes, unas 50 citas diarias entre todos. Hay contador local, aviso al 80 % y un tope de 40 por
  organización al día, pero un profesional con mucha agenda puede dejar sin recordatorios a los demás.
  Se cierra pasando a Resend Pro (US$20 al mes) cuando el aviso del 80 % salte seguido o haya más de
  unos 9 profesionales activos.
- **[DT-37](../Deudas/DT-37.md) · Un "Enviado" puede no llegar nunca a "Entregado"** · *baja ·
  abierta.* Si el aviso del webhook se pierde, el recordatorio queda "Enviado" para siempre y la tasa
  de fallo no lo cuenta. El webhook ya funciona en producción (2026-10-07); falta medir los "Enviado"
  viejos (por ejemplo, más de 6 horas sin novedad) y alertar si se acumulan.
- **[DT-38](../Deudas/DT-38.md) · Reagendar en el mismo segundo del envío** · *baja · abierta, riesgo
  aceptado.* Si el profesional mueve la cita justo mientras sale un recordatorio, el paciente puede
  recibir la hora vieja. Después le llegan los de la hora nueva, pero sin una corrección explícita. Es
  raro y acotado; se revisa con el primer caso real.
- **[DT-39](../Deudas/DT-39.md) · No hay cómo sacar una dirección de la lista de supresión** · *baja ·
  abierta.* Una dirección que rebota o se queja queda suprimida (se guarda solo su hash, para todas
  las organizaciones y sin vencimiento) y no se le vuelve a escribir. Un rebote puede ser pasajero,
  pero para quitarla solo hay SQL a mano, y además hay que quitarla en el panel de Resend.
- **[DT-41](../Deudas/DT-41.md) · Falta DMARC en el subdominio de envío** · *baja · abierta.* Los
  correos llegan a la bandeja de entrada, pero falta el registro DMARC (la política que les dice a
  Gmail u Outlook qué hacer con un correo que suplante al dominio), no se revisaron las cabeceras de
  autenticación y no se confirmó en Resend que el seguimiento de aperturas y clics esté apagado (una
  promesa de privacidad de ADR-13). Son tres pasos de configuración, sin código.

## Límite de tasa

Un **límite de tasa** es como el guardia de la entrada que deja pasar a tantas personas por minuto:
evita que alguien martille el servidor probando contraseñas o inundando una bandeja.

- **[DT-18](../Deudas/DT-18.md) · No existía límite de tasa en ninguna ruta** · *media · en producción
  desde el 2026-10-17; se cierra con la prueba de `trust proxy`.* Su historia resume bien cómo se manejan los riesgos aquí: se
  aplazó cuando nada estaba en internet (2026-08-24), se aceptó como riesgo al desplegar (2026-09-29)
  y se construyó cuando llegó el enlace del paciente, la primera ruta sin sesión que **modifica** una
  cita. La política quedó así:

  | Ruta | Se cuenta por | Límite |
  |---|---|---|
  | página del enlace del paciente | IP | 30 por minuto |
  | acciones del enlace (confirmar, cancelar, otra hora) | enlace | 5 por hora |
  | login | IP | 5 por minuto |
  | registro | IP | 5 por hora |
  | solicitud pública de hora | IP | 5 por hora |

  Al pasarse, la respuesta es un **429** genérico. El contador vive **en memoria**, válido con una
  sola réplica; y como en Railway todo pasa por un proxy, se configuró `trust proxy` para contar la IP
  del cliente y no la del proxy. Quedan fuera, en otras deudas: el bloqueo por cuenta (DT-04), el
  captcha y la verificación del registro (DT-06) y un contador compartido (Redis o Postgres) si algún
  día hay más de una réplica.

## Observabilidad

**Observabilidad** es poder ver qué pasa adentro del sistema en producción: logs, monitores y
alertas. RNF-08 la pide para enterarse de un recordatorio fallido antes que el cliente.

- **[DT-19](../Deudas/DT-19.md) · Sin observabilidad** · *media (era alta) · verificada en producción,
  abierta por los logs.* Ya existen logs en JSON (con `pino`) que tapan datos personales y
  credenciales, un endpoint `GET /api/health` vigilado por Better Stack y dos **latidos**: cada job
  "avisa que está vivo" cada cierto tiempo y, si deja de avisar, llega un correo. Todo eso está en Up
  desde el 2026-10-07. Lo que falta: conectar la fuente de logs a Better Stack, crear las alertas por
  consulta de log y hacer una prueba de alerta forzada (detener un job y ver llegar el aviso). Sin la
  fuente de logs, la alerta de tasa de fallo, que es justo la medición de RNF-03, no le llega a nadie.

## El enlace del paciente (Fase 3)

Estas cuatro nacieron con el diseño de la Fase 3 ([ADR-10](../Decisions/ADR-10.md)); el detalle de
cómo funciona el enlace está en [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md). Se anotaron como
`prevista` al aprobar el diseño y pasaron a `abierta` el 2026-10-17, cuando la fase llegó a producción.

- **[DT-42](../Deudas/DT-42.md) · El enlace no verifica identidad** · *media · abierta, riesgo
  aceptado.* El enlace es una **capacidad**: quien lo tenga puede confirmar, cancelar o pedir otra
  hora, sin importar quién sea. Llega a otra persona si el paciente reenvía el correo, si el buzón es
  compartido o si el correo está mal escrito. Hay mitigaciones (datos mínimos en la página, solo sirve
  antes de la hora, el profesional puede invalidarlo, la bitácora guarda con qué enlace se hizo, 5
  acciones por hora), pero tienen límites: invalidar no entrega un enlace nuevo (llega con el
  próximo recordatorio), y la bitácora sabe **con qué enlace** se hizo algo, no **quién** lo usó.
- **[DT-43](../Deudas/DT-43.md) · El profesional no se entera en el momento** · *baja, media con
  volumen · abierta; se cierra en la Fase 4.* Si el paciente cancela, el profesional lo ve recién
  cuando abre la aplicación. Una cancelación de última hora deja un hueco que podría haber llenado. Lo
  necesario ya quedó puesto: los hechos llevan quién los causó (el "actor") y la alerta será un
  suscriptor más del outbox.
- **[DT-44](../Deudas/DT-44.md) · Rechazar un pedido de otra hora no avisa al paciente** · *baja ·
  abierta, solo la parte 1.* Pedir otra hora deja una solicitud en la bandeja. Si el profesional la
  rechaza, la cita queda como estaba y nadie le dice nada al paciente. Avisarle sería un correo nuevo,
  y cualquier mensaje nuevo al paciente debe pasar antes por la revisión de consentimiento (DT-16). La
  parte 2 (reagendar desde el voucher no cerraba el pedido) se resolvió al implementar: un suscriptor
  del outbox lo da por atendido.
- **[DT-45](../Deudas/DT-45.md) · Cambiar la clave del enlace los rompe en silencio** · *media → baja
  con la corrección · abierta, con la corrección en producción.* El token del enlace no se guarda: se
  recalcula con la clave `ENLACE_CITA_CLAVE`. Si la clave cambia, el siguiente correo llevaría un
  enlace que no funciona, y como el error es idéntico a cualquier otro (a propósito, para no dar
  pistas), nadie se enteraría. La corrección ya está en el código: al preparar el enlace se comprueba
  que corresponda a la clave vigente y, si no, se revoca y se emite uno nuevo, con un aviso en el log.
  Para rotar la clave: hacerlo en las horas sin envíos (21:00–08:00) y nunca copiarla de otro entorno.

## Código, pruebas y herramientas

- **[DT-20](../Deudas/DT-20.md) · Las pruebas de punta a punta no corren solas: no hay pipeline** · *media ·
  abierta.* Hasta el 2026-10-18 se titulaba "nunca se han ejecutado", pero las suites con base de datos
  corren en verde contra Postgres local desde la Fase 1 (en la Fase 3, 287 e2e y 139 de integración). Sigue abierta porque **no hay
  pipeline**: ningún test corre solo al abrir un PR, y algunos casos de concurrencia (como aceptar la
  misma solicitud dos veces a la vez) solo se verificaron a mano, según la ficha.
- **[DT-21](../Deudas/DT-21.md) · Carpetas vacías con nombres mal escritos** · *cerrada (2026-10-03).*
  Convivían `aplication/` con `application/` e `infraestructure/` con `infrastructure/`. Se rehízo el
  módulo `recordatorio/` y se borraron las de `paciente/`.
- **[DT-29](../Deudas/DT-29.md) · Rutas del backend que nadie llama** · *baja · abierta (mitigada).*
  No es un defecto: es que los dos repos avanzan a ritmos distintos. Al 2026-10-18 son 4 de 29 rutas:
  crear usuario y crear paciente sueltos, editar una cita y el historial de una cita (las cinco de la Fase 3
  nacieron consumidas).
  Sirve como regla práctica: **antes de crear un endpoint nuevo, mira esta lista**, puede que ya
  exista.
- **[DT-31](../Deudas/DT-31.md) · Imports que se saltan las capas sin que el test lo vea** · *baja ·
  abierta.* La arquitectura hexagonal ([ADR-02](../Decisions/ADR-02.md)) dice que `domain/` y
  `application/` no dependen del framework, y un test (`src/arquitectura.spec.ts`) lo vigila. Pero no
  ve dos atajos: servicios que importan DTOs de `presentation/` (y con ellos `class-validator`) y
  puertos que importan un tipo de `shared/application`. El efecto es que los casos de uso quedan
  atados a HTTP y cuesta llamarlos desde un job. La recomendación: congelar el problema con el test
  para que no crezca y arreglar módulo por módulo cuando se toque cada uno, como ya hace
  `recordatorio`.
- **[DT-46](../Deudas/DT-46.md) · Columnas de fecha sin zona en los tests** · *baja · abierta
  (2026-10-15).* Las migraciones crean las fechas con zona (`timestamptz`), pero ocho columnas de
  entidades antiguas no lo declaran. Los tests que crean el esquema desde las entidades
  (`synchronize`) las crean sin zona, y la hora leída puede correrse según la máquina. Producción no
  se ve afectada. Se arregla agregando el tipo, sin migración.

---

## Cadenas y familias: deudas que conviene mirar juntas

Algunas deudas no se entienden solas. Estas son las relaciones que más se repiten en las fichas:

| Relación | Qué significa |
|---|---|
| DT-07 → DT-02 | el día que exista un segundo usuario, hay que verificar roles en el mismo release |
| DT-10 (cerrada) → DT-11 → scoring, con DT-30 | sin estados no hay cierre; sin cierre ni asistencia, no hay con qué calificar |
| DT-23 + DT-35 + DT-42 | se cierran con una sola pieza: verificar el canal de contacto del paciente |
| DT-40 + DT-45 | el mismo patrón: variables copiadas entre entornos que fallan en silencio |
| DT-18 agrupa DT-04 y DT-06 | el límite de tasa general ya está; lo específico de login y registro sigue aparte |
| DT-32 + DT-33 + DT-43 | lo que hay que resolver para las alertas en tiempo real de la Fase 4 |
| DT-16 + DT-26 (+ DT-44) | la revisión legal de datos de salud antes de la Ley 21.719 (ver Q17) |

## Cómo trabajar con las deudas

- **Antes de tocar un módulo**, busca sus DT (el índice tiene una tabla por origen). Puede que lo que
  ibas a "arreglar" sea una decisión consciente, o que tu cambio sea la ocasión barata de cerrar una.
- **Al diseñar**, anota las deudas que tu diseño va a crear como `prevista`, antes de construirlo.
- **Al cerrar**, cumple el criterio verificable de la ficha y deja la fecha y el commit.
- **No borres historia**: tacha y agrega una nota fechada.

## Ojo: estados que todavía no se actualizan

Al cruzar las fichas con el [ROADMAP](../ROADMAP.md) (que manda en cuanto a estado) aparecen algunas
diferencias. No cambian lo que dice cada deuda, pero conviene saberlas:

- **DT-15** sigue en severidad alta aunque está neutralizada para crear citas; la ficha deja pendiente
  decidir si baja.

*(2026-10-18.)* Las demás diferencias que se anotaron aquí el 2026-10-15 —DT-12 sin marcar cerrada, DT-23,
DT-25 y DT-26 como `prevista`, el título de DT-20, el conteo de DT-29, la fila de la Fase 5 sobre DT-30 y
el estado de las fichas de la Fase 3— ya se corrigieron en las fichas y en el índice.

## Para profundizar

- [Índice de deudas](../Deudas/README.md): tablas por severidad, por origen y por fase.
- [ROADMAP](../ROADMAP.md): el estado de cada fase y las deudas que la bloquean.
- [Guías por fase](../Fases/README.md): qué deudas creó, cerró o movió cada fase.
- [08 — Preguntas abiertas](08-preguntas-abiertas.md): varias deudas esperan una de esas decisiones
  (Q5 para DT-06, Q7 para DT-01, Q17 para DT-26).
- [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md): el contexto de DT-42 a DT-45.
- Fichas individuales: [DT-01](../Deudas/DT-01.md) a [DT-46](../Deudas/DT-46.md).
