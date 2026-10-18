# Preguntas abiertas: las decisiones que el código no puede tomar solo

> **Qué vas a entender acá:** qué es `PREGUNTAS-ABIERTAS.md`, por qué las preguntas están repartidas
> por rol y qué se pregunta en cada una de las diecisiete (Q1 a Q17): por qué importa, quién la decide
> y si ya tiene respuesta. Al final, las tres decisiones que necesitan acuerdo entre roles.
>
> **Antes conviene leer:** [01 — El producto](01-el-producto.md), [04 — Roadmap y fases](04-roadmap-y-fases.md)
> y [07 — Deudas técnicas](07-deudas-tecnicas.md): muchas preguntas destraban una deuda. Los términos
> raros están en el [glosario](11-glosario.md).

**Estado de referencia: 2026-10-18.** Fundaciones y Fases 0, 1, 2 y 3 en producción (la Fase 3, desde
el 2026-10-17).

---

## Qué es este documento

Un desarrollador puede decidir **cómo** hacer algo. Lo que no puede decidir solo es **qué** hacer
cuando la respuesta depende de los usuarios, del negocio o de cuánto riesgo se acepta. ¿Los
recordatorios entran al MVP? ¿Cualquiera puede registrarse? ¿Cuánto tiempo puede servir un token
robado? Esas son las preguntas abiertas.

[`PREGUNTAS-ABIERTAS.md`](../PREGUNTAS-ABIERTAS.md) partió con **once** decisiones que bloqueaban el
MVP y hoy tiene **diecisiete**. Cada una está escrita en el
idioma de quien la puede responder, y trae un **entregable**: lo que esa persona tiene que devolver
(una recomendación entre opciones, un documento de patrones, un requisito).

El camino típico de una pregunta es este:

```
pregunta  →  respuesta  →  ADR (la decisión, por escrito)  →  código
                                  └→ si deja algo pendiente, nace una deuda (DT)
```

Dos ejemplos reales: Q4 (¿qué hacer con dos citas a la misma hora?) se respondió, quedó en
[ADR-11](../Decisions/ADR-11.md) y cerró la deuda DT-12. Q11 (¿cómo le llega el enlace al paciente?)
se respondió, quedó en [ADR-10](../Decisions/ADR-10.md), se construyó en la Fase 3 (en producción desde
el 2026-10-17) y dejó anotadas cuatro deudas nuevas (DT-42 a DT-45).

## El equipo y el principio del reparto

| Rol | Qué decide |
|---|---|
| **I+D** (1 persona) | investigación con usuarios y producto: si el problema es real, qué entra al alcance, textos y prioridades |
| **Desarrolladores** (2) | los mecanismos técnicos, una vez que está claro qué se quiere |
| **Arquitecto** | el diseño y los **requisitos de seguridad**: qué tiene que poder hacer el sistema cuando algo sale mal, definido antes de construir la parte peligrosa |

El principio que ordena todo el documento: un mismo tema puede tocar a varios roles, pero **la
pregunta que se le hace a cada uno es distinta**.

El ejemplo del propio documento es la sesión (Q7). Al arquitecto **no** se le pregunta "¿refresh
token o lista de revocación?": eso es implementación. Se le pregunta "¿cuánto tiempo puede servir
una credencial robada, y qué tiene que poder hacer el sistema si pasa?". Con ese requisito en la mano,
los desarrolladores eligen el mecanismo, que "se elige casi solo". Es como encargar una casa: al
dueño no le preguntas qué viga usar, le preguntas cuántas personas van a vivir ahí.

## Cómo está organizado

El documento original tiene estas partes, en este orden:

1. **Reparto rápido:** una tabla con cada pregunta, quién la responde y qué bloquea.
2. **Por fase del roadmap:** a qué fase de construcción toca cada una (las de negocio no tienen fase).
3. **Para I+D:** Q10, Q1, Q2, Q3, Q4, Q5 y Q11.
4. **Para los desarrolladores:** Q6, Q8, Q7 y Q9.
5. **Para el arquitecto:** Q16 y Q17, más las "mitades de seguridad" de Q5, Q7 y Q11.
6. **Decisiones pendientes de la Fase 2:** Q12 a Q15, que salieron al construir los recordatorios.
7. **Las tres que necesitan decisión conjunta:** prepago, registro abierto y recordatorios.
8. **Orden sugerido:** qué atacar en la semana 1 y en la 2.

Un consejo para leerlo: cuando una pregunta se responde, se agrega arriba una **nota fechada**
("Respondida (2026-09-30): …") y el planteamiento original se deja abajo como historia. Si el texto
de abajo contradice la nota, **manda la nota**.

## La foto al 2026-10-18

| # | Tema | Decide | Estado |
|---|---|---|---|
| Q1 | ¿Recordatorios en el MVP? | I+D, decisión conjunta | **respondida** (2026-09-30): sí, entran |
| Q2 | ¿El prepago entra alguna vez? | I+D, decisión conjunta | abierta |
| Q3 | ¿La agenda es del profesional o de la organización? | I+D | abierta |
| Q4 | Dos citas a la misma hora: ¿avisar o rechazar? | I+D decide, desarrollo ejecuta | **respondida** (2026-09-25): avisar y permitir |
| Q5 | ¿Registro abierto, por invitación o lista de espera? | I+D y arquitecto | abierta |
| Q6 | El proceso automático que cierra citas vencidas | desarrolladores | **en parte:** mecanismo decidido y subpregunta 1 respondida; subpregunta 2 abierta; el proceso, aplazado |
| Q7 | Renovar y cortar sesiones | arquitecto (requisito) y desarrolladores (mecanismo) | abierta, esperando el requisito |
| Q8 | El tenant en la URL (ADR-08) | desarrolladores | **a medias:** la ruta pública ya lo usa; falta el login |
| Q9 | Modelo de disponibilidad | desarrolladores (solo evaluar) | abierta |
| Q10 | Validación con usuarios reales | I+D | abierta: sin evidencia registrada |
| Q11 | ¿Cómo le llega al paciente el enlace de su cita? | I+D y arquitecto (seguridad) | **respondida** (2026-10-14): en el recordatorio |
| Q12 | ¿Ocultar `/recordatorios` al rol recepción? | I+D, ejecuta desarrollo | abierta |
| Q13 | Textos y colores de los estados de recordatorio | I+D | abierta |
| Q14 | ¿Se mantiene la vista *Contacto* del voucher? | I+D | abierta |
| Q15 | ¿Cuándo reinicia la cuota mensual de Resend? | desarrolladores | abierta |
| Q16 | Modelo de amenazas de la vía pública | arquitecto | abierta (el límite de tasa ya quedó fijado) |
| Q17 | Datos de salud y retención | arquitecto | abierta |

En resumen: tres respondidas (Q1, Q4, Q11), dos a medias (Q6, Q8) y doce abiertas. Ninguna de las
abiertas bloquea hoy una fase en construcción (no hay ninguna en construcción: la última, la Fase 3, está
en producción).

---

## Para I+D

### [Q10 — La validación (empieza por aquí)](../PREGUNTAS-ABIERTAS.md#q10--la-validación-empieza-por-aquí)

**Qué se pregunta:** ¿el problema que describimos (pacientes que no llegan, el profesional
persiguiéndolos por WhatsApp) es el que esta gente tiene de verdad, y les molesta lo suficiente para
cambiar de hábito?

**Por qué importa:** es la entrada de todo lo demás. Q1, Q2, Q3 y Q5 se responden con evidencia de
terreno, no con opiniones. Además, la [etapa de validación del producto](../Descripcion/fase-1-validacion.md)
tenía como objetivo confirmar el problema "antes de invertir semanas de código", y ya hay varias
semanas de código invertidas sobre una hipótesis. Eso no invalida lo construido (identidad,
aislamiento entre clientes y agenda sirven para casi cualquier versión del producto), pero las
decisiones que dependen del cliente concreto siguen sin base.

**Cómo:** 5 a 10 conversaciones con profesionales independientes y clínicas pequeñas, sobre cómo
trabajan hoy. La pregunta que más informa no es "¿usarías esto?", sino "¿qué hiciste la última vez
que alguien no llegó?". El entregable es un documento de patrones: lo que se repite en 3 de 5 vale;
lo que dijo uno solo es anécdota, salvo que contradiga la hipótesis, y entonces vale doble. De paso
sirve para armar la lista de tipos de consulta (DT-24).

**Estado:** abierta. La etapa de validación figura como pendiente, sin evidencia registrada.

### [Q1 — ¿El MVP incluye recordatorios automáticos?](../PREGUNTAS-ABIERTAS.md#q1--el-mvp-incluye-recordatorios-automáticos)

**Qué se pregunta:** los criterios de éxito decían que el profesional "deja de mandar WhatsApps",
pero las tres piezas originales del MVP (dashboard, gestión de citas e historial) eran todas del lado
del profesional: **ninguna le hablaba al paciente**. Así, el MVP no podía cumplir lo que prometía.
Las opciones eran meter los recordatorios (A), reescribir los criterios de éxito (B) o no decidir
(C, "la peor: se lanza creyendo que se cumplió la promesa").

**Respuesta (2026-09-30): A.** Los recordatorios entran, por correo vía Resend, y en la misma
decisión el scoring sale del MVP y pasa a la v2. El diseño está en [ADR-12](../Decisions/ADR-12.md) y
[ADR-13](../Decisions/ADR-13.md), y es la Fase 2, hoy en producción.

### [Q2 — ¿El prepago entra alguna vez?](../PREGUNTAS-ABIERTAS.md#q2--el-prepago-entra-alguna-vez)

**Qué se pregunta:** nuestro propio diagnóstico dice que los profesionales ya cobran por adelantado
para frenar las inasistencias, y Citia deja fuera todo lo relacionado con dinero. ¿Estamos compitiendo
contra algo que ya resuelve el problema?

**Por qué importa:** si el prepago les funcionó, el producto compite contra algo que ya sirve; si no
les funcionó del todo, ahí está nuestro espacio. La pregunta de terreno es: ¿los que cobran por
anticipado siguen teniendo pacientes que no llegan?

**Quién:** I+D trae la evidencia (cuántos cobran por anticipado, cómo y si les resolvió el problema)
y después se decide en conjunto (ver el final). **Estado:** abierta.

### [Q3 — ¿La agenda es del profesional o de la organización?](../PREGUNTAS-ABIERTAS.md#q3--la-agenda-es-del-profesional-o-de-la-organización)

**Qué se pregunta:** hoy cada cita es de un profesional; nadie puede ver la agenda de un colega ni
cubrir a alguien enfermo. Para un independiente es lo correcto; para una clínica es un techo.

**Por qué importa:** decide si `CLINICA` es un tipo de cliente real o una etiqueta. Si las clínicas
pequeñas comparten agenda de verdad, el modelo tiene que cambiar; si son independientes que comparten
local, no. Está ligada a DT-07 (no se puede agregar un segundo usuario).

**Quién:** I+D, preguntando en terreno si comparten agenda y si alguien la administra por ellos.
**Estado:** abierta.

### [Q4 — Solapamiento: ¿avisar o rechazar?](../PREGUNTAS-ABIERTAS.md#q4--solapamiento-avisar-o-rechazar)

**Qué se pregunta:** el sistema aceptaba en silencio dos citas del mismo profesional a la misma hora.
¿Hay consultas que sobrevenden a propósito, o un choque es siempre un error?

**Respuesta (2026-09-25): avisar y permitir** ([ADR-11](../Decisions/ADR-11.md)). Cuesta una consulta
a la base y deja la decisión en quien sabe si es un error o algo intencional. Rechazar obligaba a
definir reglas de borde (¿citas pegadas?, ¿colchón entre pacientes?) que ya son el comienzo de un
modelo de disponibilidad (Q9). Está implementado desde la Fase 1 (DT-12).

### [Q5 — ¿Registro abierto, por invitación o lista de espera?](../PREGUNTAS-ABIERTAS.md#q5--registro-abierto-por-invitación-o-lista-de-espera)

**Qué se pregunta:** tiene dos mitades.

- **La de I+D:** ¿cómo van a llegar los primeros clientes? Si es por recomendación directa, la
  invitación no cuesta nada y elimina un problema entero. Si la apuesta es crecer solo, el registro
  abierto necesita defensas que hoy no existen.
- **La del arquitecto:** la superficie de abuso. El registro es público, sin verificar correo, sin
  captcha, y un mismo correo puede fundar organizaciones ilimitadas. El slug que se genera es
  **permanente** y será el subdominio del cliente, así que el daño no es solo de espacio en disco:
  es de nombres. ¿Cuál es el mínimo de defensas para poder abrir el registro?

**Estado:** abierta. Desde la Fase 3 el registro tiene un límite de 5 por hora por IP, pero siguen
faltando la verificación de correo y el captcha (DT-06, DT-03).

### [Q11 — ¿Cómo le llega al paciente el enlace de su cita?](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita)

**Qué se pregunta:** la idea era que el paciente pudiera cancelar o pedir otra hora **sin cuenta**,
desde un enlace que sirve para una sola cita. El mecanismo estaba diseñado; lo que faltaba era
**quién le entrega ese enlace**. Las opciones eran: que el profesional lo mande a mano por WhatsApp
(A), que vaya dentro del recordatorio automático (B), o aplazarlo (C). El diseño del enlace no depende
de quién lo entrega: la respuesta cambia el alcance, no el diseño.

**Cómo se respondió, en dos tiempos:**

- **2026-09-25: C.** Como todavía no había recordatorios, no había canal, y la funcionalidad salió de
  la v1.
- **2026-10-14: B.** Con los recordatorios ya en producción (Q1), el canal existía. El arquitecto
  aprobó el diseño de la Fase 3 y ADR-10 pasó a aceptado: cada recordatorio lleva un botón, *Ver o
  responder mi hora*, que abre la página del paciente.

**La mitad de seguridad (arquitecto).** Era la primera ruta sin sesión capaz de **modificar** una
cita, así que el arquitecto fijó cinco requisitos antes de construirla:

| Pregunta | Lo que se decidió, en simple |
|---|---|
| ¿Y si el enlace llega a quien no es? | el profesional puede **invalidarlo** desde el voucher; el siguiente recordatorio trae uno nuevo (con los límites de DT-42) |
| ¿Qué se muestra? | fecha, hora, duración, estado, profesional y organización; **nunca** nombre del paciente, RUT, contacto ni tipo de consulta |
| ¿Por dónde viaja el secreto? | después del `#` de la URL (no llega al servidor ni a los logs) y a la API en una cabecera; además, **abrir la página nunca ejecuta una acción**, porque Gmail y Outlook abren los enlaces para revisarlos |
| ¿Qué límite de tasa? | 30 por minuto por IP y 5 acciones por hora por enlace; de paso, límites para login, registro y solicitud pública (DT-18) |
| ¿Cómo se guarda? | el token se calcula con HMAC y una clave del servidor; en la base solo queda su hash (DT-45 cubre qué pasa si la clave cambia) |

Un punto que quedó explícito: el consentimiento del paciente (DT-16) **no** pasó a ser bloqueante;
sigue como deuda por decisión del arquitecto. La historia completa está en
[04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md).

---

## Para los desarrolladores

El documento sugiere repartir el trabajo entre los dos desarrolladores en dos frentes que no se
bloquean: **"parar el reloj"** (Q6, el proceso de cierre) y **"habilitar la vía pública"** (Q8 y el
límite de tasa).

### [Q6 — El planificador para el proceso de cierre](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1)

**Qué se pregunta:** no existía nada en el proyecto que corriera tareas programadas. Hacía falta una
para marcar como `ghosting` las citas vencidas sin confirmar. ¿Un temporizador dentro de la app, o
una cola aparte con reintentos (Redis, BullMQ)? Y como los recordatorios iban a exigir una cola de
todas formas, la pregunta real era **si convenía pagarla ahora o después**. Además del mecanismo,
había cinco subpreguntas:

1. ¿Cuándo está vencida una cita: al pasar su hora, al terminar, con margen?
2. ¿Qué pasa con las citas `confirmada` que el profesional nunca cerró?
3. "Ya pasó" según el reloj de la clínica, no el del servidor.
4. Correr el proceso dos veces no debe duplicar nada.
5. Es la primera consulta que recorre **todas** las organizaciones a la vez; tiene que ser explícito,
   no un accidente.

**Lo que ya se respondió:**

- **El mecanismo (2026-09-30, [ADR-12](../Decisions/ADR-12.md)):** un planificador dentro del mismo
  proceso (`@nestjs/schedule`) sobre tablas de Postgres con `FOR UPDATE SKIP LOCKED`, que permite que
  varios procesos tomen tareas sin pisarse (cada uno se salta las filas que otro ya tomó). Sin Redis
  por ahora. La cola se pagó "ahora", pero en Postgres. Las subpreguntas 3, 4 y 5 quedaron resueltas
  en general por ese ADR.
- **La subpregunta 1 (2026-10-14):** la regla de `ghosting` G1 dice que una cita vence al terminar el
  día de la clínica, y solo cuenta si al paciente le llegó un recordatorio con enlace y no tenía un
  pedido de otra hora abierto ([DT-11](../Deudas/DT-11.md)).

**Lo que sigue abierto:** la subpregunta 2, las `confirmada` que nadie cerró. Y el proceso en sí se
**aplazó** junto con el scoring.

> **Por qué dejó de ser "lo más urgente".** El texto original decía que era la prioridad 1 porque el
> historial "no se puede reconstruir hacia atrás". Después se separó la idea en dos: el `ghosting`
> **sí** se puede calcular después (con una fecha de corte), y lo que se pierde de verdad es la
> asistencia real, que es otra deuda (DT-30).

### [Q8 — ADR-08, el tenant en la URL](../PREGUNTAS-ABIERTAS.md#q8--adr-08-el-tenant-en-la-url-dev-b--prioridad-2)

**Qué se pregunta:** hoy el login recibe el slug de la organización en el cuerpo de la petición
([ADR-03](../Decisions/ADR-03.md)). [ADR-08](../Decisions/ADR-08.md) propone moverlo a la URL. No es
una mejora estética: el enlace público que comparte el profesional necesita identificarlo en la
dirección misma.

**La condición para aceptarlo:** si una organización inexistente responde distinto que una contraseña
incorrecta, cualquiera puede averiguar qué organizaciones existen. El cambio debe probar que ambas
respuestas son idénticas.

**Estado: a medias.** La ruta pública de solicitudes ya lleva el slug en la URL
(`/api/publico/:tenantSlug/solicitudes`), porque ADR-09 adoptó esa parte. Falta el login, y ADR-08
sigue propuesto (su cabecera lo dice así desde el 2026-10-18: "sin implementar en el login"). Ya no
bloquea nada: el enlace de la Fase 3 no lleva slug.

### [Q7 — Renovación y revocación de sesión](../PREGUNTAS-ABIERTAS.md#q7--renovación-y-revocación-de-sesión-bloqueado-hasta-que-el-arquitecto-defina-el-requisito)

**Qué se pregunta:** el token del login no se puede invalidar antes de que venza, cerrar sesión es
cosmético y la caducidad quedó en 1 día cuando el objetivo eran 15 minutos (DT-01). El documento
dice "no empiecen por el mecanismo": primero el arquitecto define el requisito. ¿Cuál es la ventana
máxima aceptable con una credencial robada? ¿Basta con que expire, o hace falta un corte inmediato
(usuario dado de baja, dispositivo perdido)?

**Lo que sí se sabe:** el orden importa. Bajar la caducidad antes de tener renovación expulsa a los
usuarios a mitad de consulta.

**Quién:** el arquitecto define el requisito y los desarrolladores eligen el mecanismo. **Estado:**
abierta; el requisito no está definido.

### [Q9 — Modelo de disponibilidad](../PREGUNTAS-ABIERTAS.md#q9--modelo-de-disponibilidad-no-construir--solo-evaluar)

**Qué se pregunta:** el modelo de disponibilidad (horarios de atención, bloques libres) está aplazado
a propósito. Ojo con el nombre: es la "segunda fase" de ADR-09, no la Fase 2 del roadmap. La única
pregunta por ahora es defensiva: **¿algo de lo que estamos construyendo encarece agregarlo después?**
Se espera un párrafo: si la respuesta es "no", se archiva.

**Estado:** abierta; no consta una respuesta. Reaparece como dependencia cada vez que se habla de que
el paciente elija entre horarios disponibles en vez de pedir "otra hora" a mano (FD-06, DT-44).

---

## Para el arquitecto

Desde el 2026-10-11, el arquitecto **define los requisitos de seguridad antes de que se construya la
parte peligrosa**, y los desarrolladores eligen cómo cumplirlos. Además de Q16 y Q17, le tocan las
mitades de seguridad de Q5 (abuso del registro), Q7 (sesión) y Q11 (ya respondida), y la condición
para aceptar Q8. Los problemas de seguridad que ya se conocen viven como deudas: DT-02, DT-04, DT-05
y DT-18.

### [Q16 — Modelo de amenazas de la vía pública](../PREGUNTAS-ABIERTAS.md#q16--modelo-de-amenazas-de-la-vía-pública)

Un **modelo de amenazas** es una lista ordenada de quién podría abusar de algo, cómo lo haría y cuál
es la defensa mínima exigible. Aquí el objeto es el enlace de agenda que el profesional publica en
Instagram y WhatsApp, y que escribe en la base sin pedir cuenta. Ya está construido, con RUT válido
obligatorio, una solicitud abierta por RUT y profesional, y una respuesta siempre igual.

**Las cuatro preguntas:**

1. **¿Qué frena de verdad el RUT?** El algoritmo del dígito verificador es público: se asume que
   "eleva el piso, no cierra la puerta". Hay que confirmarlo o desmentirlo.
2. **Suplantación:** se puede pedir hora a nombre de otra persona. Cuando exista el scoring, ¿podría
   un tercero ensuciar la reputación de alguien real? (DT-23)
3. **Sondeo:** la respuesta uniforme busca impedir averiguar si un RUT es paciente de cierto
   profesional de la salud. ¿Lo logra? Sería una filtración más grave que saber qué organizaciones
   existen.
4. **Defensas que se vuelven contra el usuario:** la regla anti-spam bloqueaba a pacientes legítimos
   si el profesional abandonaba la bandeja (DT-28, mitigada con una ventana de 72 h). ¿Hay más casos
   así?

**Estado:** abierta. La Fase 3 avanzó una parte: 5 solicitudes por hora por IP, y la regla anti-spam
por RUT cuenta solo las solicitudes nuevas, no los pedidos de otra hora.

### [Q17 — Manejo de datos de salud](../PREGUNTAS-ABIERTAS.md#q17--manejo-de-datos-de-salud)

**Qué se pregunta:** el sistema guarda RUT, nombre, contacto y motivo de consulta, y con la vía
pública también guarda datos de **personas cuya solicitud fue rechazada**, que nunca llegaron a ser
pacientes. ¿Qué exige la normativa chilena para datos de salud y qué plazo de retención corresponde?
Además, el RUT es un identificador nacional y no debería aparecer en URLs ni en logs: hay que
verificar que efectivamente no aparece.

**Por qué importa:** bloquea la política de borrado (DT-26) y se cruza con la revisión del
consentimiento (DT-16), que tiene fecha: antes de que entre en vigor la Ley 21.719, prevista para el
1 de diciembre de 2026.

**Estado:** abierta. Como dato, los logs de la Fase 2 ya tapan el campo `rut` (DT-19), pero la
verificación completa que pide la pregunta no está registrada.

---

## Decisiones pendientes de la Fase 2 (Q12 a Q15)

Salieron al construir los recordatorios. **Ninguna bloqueó el merge**: el código tiene un
comportamiento por defecto razonable para cada una, así que son ajustes, no bloqueos.

### [Q12 — ¿Ocultar `/recordatorios` al rol recepción?](../PREGUNTAS-ABIERTAS.md#q12--ocultar-recordatorios-al-rol-recepcion)

La configuración de recordatorios es **por usuario** y se aplica a las citas de ese usuario. Una
cuenta de recepción vería la pantalla y, si guarda, crearía una configuración que no afecta a ninguna
cita. Hoy no hay cuentas de recepción (DT-07) y el rol no se revisa en ninguna ruta (DT-02).
Opciones: ocultarla solo en el frontend (A), además rechazarla en el backend, lo que estrenaría la
verificación de roles (B), o dejarlo hasta que exista el segundo usuario (C). **Decide** I+D;
**estado:** abierta.

### [Q13 — Textos y colores de los estados de recordatorio](../PREGUNTAS-ABIERTAS.md#q13--textos-y-colores-de-los-estados-de-recordatorio)

Hoy el voucher muestra *Programado* (azul), *Enviado* y *Entregado* (verde), *Falló* (rojo),
*Cancelado* (gris) y *Omitido* (ámbar), con una frase por motivo. Las dudas concretas: ¿*Falló* o
*No enviado*? ¿Se distingue *Enviado* de *Entregado* para el profesional o se muestran igual?
**Decide** I+D (es UX); **estado:** abierta.

### [Q14 — ¿Se mantiene la vista *Contacto* del voucher?](../PREGUNTAS-ABIERTAS.md#q14--se-mantiene-la-vista-contacto-del-voucher)

El frontend agregó al voucher una vista para completar o corregir el teléfono y el correo del
paciente, con botones *"Agregar correo"* o *"Revisar correo"* cuando un recordatorio no salió por eso.
ADR-13 pedía la ruta, pero no decía dónde ponerla. La alternativa sería una ficha de paciente, que es
de la Fase 6 y todavía no existe. **Decide** I+D; **estado:** abierta. Mientras tanto, es la forma
documentada de corregir un correo mal escrito (DT-35, DT-42).

### [Q15 — ¿Cuándo reinicia Resend la cuota mensual del plan gratis?](../PREGUNTAS-ABIERTAS.md#q15--cuándo-reinicia-resend-la-cuota-mensual-del-plan-gratis)

Resend confirma que la cuota **diaria** se cuenta por día UTC, pero no dice si la **mensual** reinicia
el día 1 o en la fecha de alta de la cuenta. El contador de Citia asume el mes calendario UTC. Si no
fuera así, podría dejar de enviar unos días antes o después de lo debido (igual manda lo que responda
Resend). Es un dato que hay que pedirle al proveedor. **Decide:** desarrolladores; **estado:**
abierta (afina DT-36).

---

## Las tres decisiones conjuntas

El documento lo dice de frente: aquí **los roles van a estar en desacuerdo, y está bien**; por eso
son decisiones y no tareas. Nadie tiene razón solo.

### 1. El prepago (Q2): abierta

- **I+D** dirá que es la palanca que el mercado ya usa, y que sin ella competimos en desventaja.
- **El arquitecto**, mirando la seguridad, dirá que manejar dinero multiplica la regulación que hay
  que cumplir y lo que un atacante podría buscar.
- **Desarrollo** dirá que es un subsistema completo, no una funcionalidad más.

La decisión es si la ventaja comercial paga ese costo combinado. Sin la evidencia de Q10, sigue
siendo opinión.

### 2. El registro abierto (Q5): abierta

Tensión directa: **I+D** quiere la menor fricción posible para crecer, y **la seguridad** pide
fricción, porque es lo único que frena el abuso. El punto medio que propone el documento es la
**invitación**: si los primeros clientes llegan por recomendación, no se pierde nada y el problema
desaparece de raíz, sin construir defensas.

### 3. Los recordatorios en el MVP (Q1): decidida

**I+D** decía que los criterios de éxito los exigían. **Desarrollo**, que arrastraban una cola con
reintentos, un canal de mensajería y observabilidad. **La seguridad**, que además exigían verificar
el contacto y un consentimiento efectivo. Era alcance contra costo, y la regla fue **ponerle número
al costo antes de decidir**.

Se decidió el 2026-09-30 que **entran**, con el costo acotado: la cola en Postgres
([ADR-12](../Decisions/ADR-12.md)), un solo canal (correo) y observabilidad en un plan gratis
([ADR-13](../Decisions/ADR-13.md)). El consentimiento efectivo se aceptó como riesgo con fecha de
revisión (DT-16). Es la decisión que dio forma al MVP que hoy está en producción.

---

## El orden sugerido (y qué quedó de él)

El documento proponía dos semanas:

- **Semana 1, en paralelo:** I+D sale a conversar (Q10); un desarrollador ataca el planificador (Q6)
  y el otro el tenant en la URL (Q8); el arquitecto fija el requisito de sesión (Q7) y las defensas
  mínimas del registro (Q5).
- **Semana 2:** con la evidencia de I+D, decidir en conjunto Q1, Q2 y Q5; construir la vía pública
  con el modelo de amenazas (Q16) en la mano; implementar Q7.

Lo que pasó, según los propios documentos: Q1 se decidió, el planificador se resolvió en ADR-12 y se
construyó con la Fase 2, y la vía pública se construyó en la Fase 1. Q10, Q2, Q5, Q7 y Q16 siguen
abiertas, y Q8 quedó a medias. Q4 y Q9 se marcaron desde el principio como baratas y sin bloqueo.

## Ojo con el texto viejo

Si alguna parte de [`PREGUNTAS-ABIERTAS.md`](../PREGUNTAS-ABIERTAS.md) no coincide con el
[ROADMAP](../ROADMAP.md), manda el ROADMAP en cuanto a estado.

*(2026-10-18.)* Las cuatro diferencias que se anotaron aquí el 2026-10-15 ya se corrigieron en el
documento: el encabezado habla de las diecisiete preguntas y su estado está al día; Q6 aclara que los
botones de asistencia llegaron el 2026-10-05; la tabla de Q8 dice que solo falta el login; y el párrafo
del problema de Q11 lleva una nota que lo ubica en su fecha.

## Para profundizar

- [`PREGUNTAS-ABIERTAS.md`](../PREGUNTAS-ABIERTAS.md): el documento original, con el reparto rápido y
  la tabla por fase.
- [ROADMAP](../ROADMAP.md), sección "Decisiones previas": qué decisiones ya se tomaron y cuándo.
- [Etapa 1 — Validación](../Descripcion/fase-1-validacion.md): el contexto de Q10.
- [ADR-10](../Decisions/ADR-10.md) (Q11), [ADR-11](../Decisions/ADR-11.md) (Q4),
  [ADR-12](../Decisions/ADR-12.md) (Q6), [ADR-13](../Decisions/ADR-13.md) (Q1) y
  [ADR-08](../Decisions/ADR-08.md) (Q8).
- [07 — Deudas técnicas](07-deudas-tecnicas.md): las deudas que cada pregunta destraba.
- [03 — Decisiones (ADR)](03-decisiones-adr.md) y [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md).
