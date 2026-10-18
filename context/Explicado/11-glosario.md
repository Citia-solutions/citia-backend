# Glosario

**Qué vas a entender acá.** Los términos que se repiten en el proyecto, cada uno en pocas líneas y con
un enlace a dónde se usa. Está en orden alfabético; los que tienen sinónimo (por ejemplo, "organización"
y "tenant") aparecen una vez y el otro apunta al principal.

**Antes conviene leer.** Nada: este archivo se consulta cuando otro te deja con una duda. Si recién
llegas, parte por [01 — El producto](01-el-producto.md) y [02 — Cómo está armado](02-como-esta-armado.md).

> Estado de referencia: 2026-10-18. Las rutas de la API llevan siempre el prefijo `/api`.

---

## A

**`accionesPermitidas`.** Lista que devuelve el detalle de una cita con lo que se puede hacer con ella
ahora (`confirmar`, `cancelar`, `reagendar`, `asistencia`, `inasistencia`, `editar`). La calcula la
propia entidad `Cita`, así el frontend no repite las reglas. El portal del paciente tiene su versión
reducida (`confirmar`, `cancelar`, `pedirOtraHora`).
→ [06 — us02](06-features.md#us02--gestión-de-citas) · [US-02.08](05-historias-de-usuario.md#us-0208--el-voucher-de-la-cita)

**Actor.** Quién hizo un cambio en una cita: `profesional` (se guarda el id del usuario), `paciente` (se
guarda el id del enlace que usó) o `sistema` (sin id, por ejemplo un proceso automático). Queda en la
bitácora y viaja en los hechos del outbox.
→ [04b — Quién hizo qué](04b-fase-3-a-fondo.md#quién-hizo-qué) · [`cita/CLAUDE.md`](../../src/modules/cita/CLAUDE.md)

**Adaptador.** Ver *Hexagonal*.

**ADR** (*Architecture Decision Record*). Documento con **una** decisión de arquitectura: el contexto,
las opciones evaluadas, lo que se eligió y sus consecuencias. Hay 14 (ADR-00 a ADR-13) en
`context/Decisions/`, cada uno con su estado (propuesto, aceptado, implementado…).
→ [03 — Decisiones (ADR)](03-decisiones-adr.md) · [índice original](../Decisions/README.md)

**Agenda.** La vista semanal (y en lista) de las citas del profesional, en `/agenda` del frontend. Se
alimenta de `GET /api/citas?desde&hasta` (máximo 42 días).
→ [06 — us02](06-features.md#us02--gestión-de-citas)

**Agregado.** Término de diseño de dominio: un grupo de datos que se cambia como una unidad y tiene sus
propias reglas. Por ejemplo, `SolicitudCita` es un agregado aparte de `Cita` ([ADR-09](../Decisions/ADR-09.md)).

**`APP_TZ` (zona de la clínica).** Variable con la zona horaria de la clínica (por defecto
`America/Santiago`). Con ella se calcula qué es "hoy", las horas sin envío y la hora que muestra el
correo. Es una sola para toda la instalación ([DT-17](../Deudas/DT-17.md)).
→ [02 — Configuración](02-como-esta-armado.md#configuración-las-variables-que-importan) · [ADR-07](../Decisions/ADR-07.md)

**App Sleeping.** Opción de Railway que apaga el contenedor cuando no recibe tráfico. En Citia **debe
estar apagada**: si el contenedor duerme, el planificador no corre y no sale ningún recordatorio.
→ [02 — El planificador](02-como-esta-armado.md#el-planificador-tareas-que-corren-solas)

**Asistió / No asistió.** Ver *Estados de la cita*.

**Ausentismo.** Ver *No-show*.

## B

**Bandeja (de solicitudes).** La pantalla `/solicitudes` donde el profesional ve los pedidos de hora y
los acepta o rechaza (`GET /api/solicitudes`, `POST …/:id/aceptar`, `…/:id/rechazar`). Es de toda la
organización, no de un profesional.
→ [06 — us02](06-features.md#us02--gestión-de-citas) · [`solicitud/CLAUDE.md`](../../src/modules/solicitud/CLAUDE.md)

**Barrido global.** Consulta que recorre **todas** las organizaciones, sin filtro de tenant. Solo la
usan los procesos programados y el webhook, nunca una ruta con login, y va marcada con el comentario
`// BARRIDO GLOBAL (ADR-12 §6)`.
→ [02 — Multi-organización](02-como-esta-armado.md#multi-organización-cada-cliente-en-su-propia-caja)

**Better Stack.** Servicio de observabilidad (plan gratis): vigila que `GET /api/health` responda,
recibe los latidos de los procesos y manda alertas por correo. Falta conectarle los logs
([DT-19](../Deudas/DT-19.md)).
→ [02 — Infraestructura](02-como-esta-armado.md#infraestructura-y-entornos) · [07 — Observabilidad](07-deudas-tecnicas.md#observabilidad)

**Bitácora (`cambios_cita`).** Tabla donde queda anotado cada cambio de una cita (creada, reagendada,
confirmada, cancelada…), con su actor y su fecha. Solo se agregan filas, nunca se editan. Se consulta con
`GET /api/citas/:id/historial`.
→ [06 — us02](06-features.md#us02--gestión-de-citas) · [ADR-09](../Decisions/ADR-09.md)

**Bloqueo de fila (`FOR UPDATE`, `FOR NO KEY UPDATE`, `SKIP LOCKED`).** Formas de decirle a Postgres
"esta fila es mía hasta que termine mi transacción", para que dos peticiones no pisen el mismo dato.
`FOR UPDATE` bloquea del todo (lo usan las solicitudes); `FOR NO KEY UPDATE` es una variante más suave
que usan las citas desde la Fase 3; `SKIP LOCKED` significa "si otro ya la tiene, sáltala" (lo usan las
colas de trabajo).
→ [04b — Dos personas tocando la misma cita](04b-fase-3-a-fondo.md#el-detalle-fino-dos-personas-tocando-la-misma-cita) · [02 — El planificador](02-como-esta-armado.md#el-planificador-tareas-que-corren-solas)

## C

**Candado consultivo.** Un candado de Postgres con nombre (`pg_try_advisory_xact_lock`) que no está
atado a una fila. Se usa para tareas que debe hacer un solo proceso a la vez, como la purga diaria del
outbox.
→ [ADR-12](../Decisions/ADR-12.md)

**Carta muerta.** Un hecho del outbox que falló 10 veces seguidas: queda en estado `fallido`, no se
borra y genera una alerta en los logs. Hoy se revisa a mano con SQL ([DT-34](../Deudas/DT-34.md)).
→ [07 — El outbox](07-deudas-tecnicas.md#los-hechos-del-sistema-y-el-outbox)

**Cita.** Una hora reservada de un paciente con un profesional: tiene `inicio` (fecha y hora en un solo
campo), duración, tipo de consulta y estado. Es el centro del sistema y vive en el módulo `cita`.
→ [Estados de la cita](#e) · [02 — Los módulos](02-como-esta-armado.md#los-módulos-de-srcmodules)

**`CLAUDE.md` (por módulo).** Archivo de contexto que documenta la estructura, las rutas y las reglas
locales de un módulo. Lo leen los agentes de Claude Code al trabajar en esa carpeta y es la mejor puerta
de entrada para una persona.
→ [02 — Los `CLAUDE.md` por módulo](02-como-esta-armado.md#los-claudemd-por-módulo)

**Cloudflare.** Maneja el DNS del dominio `citiahealth.cl`: los registros que apuntan a Netlify y los que
autentican el correo de Resend.
→ [02 — Infraestructura](02-como-esta-armado.md#infraestructura-y-entornos)

**Consentimiento.** Si el paciente aceptó recibir mensajes. Se guarda en su ficha (hoy lo marca el
profesional por él), pero **nadie lo revisa** antes de enviar: es un riesgo aceptado hasta la Ley 21.719
([DT-16](../Deudas/DT-16.md)).
→ [01 — Requisitos no funcionales](01-el-producto.md#los-requisitos-no-funcionales-explicados) · [07 — Datos personales](07-deudas-tecnicas.md#datos-personales-y-retención)

**Conventional Commits.** Formato de los mensajes de commit: `tipo(alcance): descripción`, por ejemplo
`feat(cita): enlace por cita con HMAC`. Los tipos son `feat`, `fix`, `refactor`, `test`, `docs` y `chore`.
→ [02 — Ramas y commits](02-como-esta-armado.md#ramas-y-commits)

**CORS.** Regla del navegador que impide que una página llame a una API de otro dominio, salvo que la
API lo autorice. El backend autoriza a `FRONTEND_URL` (y a `CORS_ORIGENES_EXTRA`). Antes de mandar una
cabecera especial como `X-Enlace-Cita`, el navegador "pregunta" con una petición previa (*preflight*).
→ [02 — Configuración](02-como-esta-armado.md#configuración-las-variables-que-importan)

**Cuota de correo y fusible.** El plan gratis de Resend permite 100 correos al día y 3.000 al mes para
toda la plataforma; el sistema avisa al llegar al 80 %. El **fusible** es un tope propio de 40 envíos al
día por organización, para que una sola no se coma la cuota de todas ([DT-36](../Deudas/DT-36.md)).
→ [01 — Modo prueba](01-el-producto.md#la-restricción-del-modo-prueba) · [07 — Recordatorios y correo](07-deudas-tecnicas.md#recordatorios-y-correo)

## D

**Dashboard.** La pantalla inicial del profesional: las citas de hoy (`GET /api/citas/hoy`), la próxima
cita, los próximos 7 días, las solicitudes por responder y el estado de los recordatorios.
→ [06 — us06](06-features.md#us06--dashboard-de-citas-del-día) · [05 — US-06](05-historias-de-usuario.md#us-06--dashboard-de-citas-del-día)

**Definición de Terminado.** La lista de chequeo de un plan de US: cada punto dice qué test lo prueba o
si se verifica a mano. La historia no está lista hasta que todos los puntos tienen evidencia.
→ [05 — La Definición de Terminado](05-historias-de-usuario.md#la-definición-de-terminado)

**Despachador.** Ver *Outbox*.

**DMARC, SPF y DKIM.** Registros DNS que demuestran que un correo de verdad lo envió quien dice
enviarlo, para que no caiga en spam. Los registros de Resend (entre ellos el DKIM) ya están en
Cloudflare; falta el DMARC del subdominio de envío ([DT-41](../Deudas/DT-41.md)).
→ [07 — Recordatorios y correo](07-deudas-tecnicas.md#recordatorios-y-correo)

**Dominio / aplicación / infraestructura / presentación.** Las cuatro carpetas de cada módulo. Ver
*Hexagonal*.

**DST** (horario de verano). El cambio de hora de invierno a verano. Los cálculos de "qué día es" y "qué
hora es" usan `Intl` para no equivocarse ese día ([ADR-07](../Decisions/ADR-07.md)).

**DT** (deuda técnica). Algo que el sistema no hace y debería, o hace de forma provisoria, escrito con su
severidad, su estado y cómo se cierra. Hay 46 (DT-01 a DT-46) en `context/Deudas/`.
→ [07 — Qué es una deuda técnica](07-deudas-tecnicas.md#qué-es-una-deuda-técnica)

## E

**e2e, integración y unitarios.** Los tres tipos de test. **Unitarios** (`npm test`): una pieza sola, con
dobles en memoria en vez de base de datos. **e2e** (`npm run test:e2e`): la API completa por HTTP.
**Integración** (`npm run test:integration`): contra un Postgres real, para transacciones y carreras.
→ [02 — Los tests](02-como-esta-armado.md#los-tests)

**Enlace por cita.** El enlace personal que recibe el paciente en cada recordatorio
(`app.citiahealth.cl/cita#<token>`), para ver su hora y responder sin crear cuenta. Hay uno activo por
cita, nace con el primer recordatorio enviado y sirve hasta la hora de la cita (Fase 3,
[ADR-10](../Decisions/ADR-10.md)).
→ [04b — Un "ticket" por cita](04b-fase-3-a-fondo.md#la-idea-central-un-ticket-por-cita) · [06 — us04](06-features.md#us04--el-paciente-responde-desde-el-enlace)

**Enlace público de agenda.** El enlace de una organización (`/agendar-cita/<slug>`) que el profesional
comparte para que **cualquier** paciente pida hora. No confundir con el enlace por cita, que es de un
paciente y una cita.
→ [09 — La vía pública](09-decisiones-del-frontend.md#primero-un-poco-de-contexto-la-vía-pública) · [ADR-09](../Decisions/ADR-09.md)

**`ENLACE_CITA_CLAVE`.** La clave secreta con que el servidor fabrica los tokens del enlace por cita.
Obligatoria en producción, distinta de `JWT_SECRET` y distinta en cada entorno. Si cambia, los enlaces
de correos ya enviados dejan de servir ([DT-45](../Deudas/DT-45.md)).
→ [04b — Qué pasa si falta la clave](04b-fase-3-a-fondo.md#qué-pasa-si-falta-la-clave) · [02 — Configuración](02-como-esta-armado.md#configuración-las-variables-que-importan)

**Entornos (staging y production).** Las dos copias del sistema en internet. **Staging** sale de la rama
`develop` y sirve para probar (no envía correos reales); **production** sale de `main` y es la que usan
los clientes (`app.citiahealth.cl`).
→ [02 — Infraestructura y entornos](02-como-esta-armado.md#infraestructura-y-entornos)

**Enumeración.** Ver *Respuesta uniforme*.

**Estado materializado.** El estado de una cita se **guarda** en la base, no se calcula cada vez que se
lee. Así el historial no cambia según el momento en que se consulta ([ADR-04](../Decisions/ADR-04.md)).

**Estados de la cita.** Los seis de [ADR-04](../Decisions/ADR-04.md):

| Estado | Significa |
|---|---|
| `pendiente` | Agendada, nadie la ha confirmado. Toda cita nace así, y vuelve aquí al reagendarse |
| `confirmada` | El paciente (desde su enlace) o el profesional confirmaron que va |
| `cancelada` | Se anuló. No se reabre: si hace falta, se crea otra cita |
| `asistio` | Confirmada y el profesional marcó que llegó |
| `no_asistio` | Confirmada y el profesional marcó que no llegó |
| `ghosting` | Nunca confirmó y no apareció (lo marcaría un proceso automático que aún no existe) |

→ [01 — El ghosting](01-el-producto.md#el-ghosting) · [06 — us02](06-features.md#us02--gestión-de-citas)

**Etapa del producto.** Las cuatro etapas de **descubrimiento** de `context/Descripcion/` (problema,
validación, requisitos, MVP). Sus archivos se llaman `fase-*.md`, pero no son fases del roadmap.
→ [01 — Las cuatro etapas](01-el-producto.md#cómo-se-llegó-al-alcance-las-cuatro-etapas-del-producto)

## F

**Fase del roadmap.** Cada etapa de **construcción**: Fundaciones, Fase 0 a Fase 7 y US-09. Su estado lo
manda el [ROADMAP](../ROADMAP.md). La etapa 3 del producto (MVP) equivale a las fases 0, 1 y 2.
→ [04 — "Fase" significa tres cosas](04-roadmap-y-fases.md#ojo-fase-significa-tres-cosas-distintas-en-este-repo)

**Fecha de corte.** El día desde el cual el futuro proceso de `ghosting` puede marcar citas: el despliegue
de la Fase 3 en producción, el **2026-10-17**. Antes de esa fecha el paciente no tenía cómo confirmar, así que marcarlo
sería injusto ([DT-11](../Deudas/DT-11.md)).
→ [07 — El historial de comportamiento](07-deudas-tecnicas.md#el-historial-de-comportamiento-camino-al-scoring)

**FD** (*Frontend Decision*). Decisión de producto o diseño tomada del lado del frontend que obliga al
backend a algo. Hay seis (FD-01 a FD-06).
→ [09 — Qué es una FD](09-decisiones-del-frontend.md#qué-es-una-fd)

**Feature.** Documento de una funcionalidad **ya construida**: qué hace, rutas, tablas, tests y
pendientes. Viven en `context/Features/`.
→ [06 — Historia de usuario vs. feature](06-features.md#historia-de-usuario-vs-feature)

**Fragmento (`#`).** La parte de una URL que va después del `#`. El navegador **no la manda al
servidor** ni la incluye cuando enlaza a otro sitio; por eso el token del enlace por cita viaja ahí.
→ [04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md) (sección "¿Por qué va después del `#`?")

## G

**Ghosting.** Cuando el paciente nunca confirmó y tampoco llegó. La **regla G1** (2026-10-14) dice que
una cita pasa a `ghosting` si sigue `pendiente` pasado el fin del día de la clínica, se le envió al menos
un recordatorio con enlace y no tiene una petición de otra hora abierta. El proceso que la aplica está
aplazado ([DT-11](../Deudas/DT-11.md)).
→ [01 — El ghosting](01-el-producto.md#el-ghosting)

**Git Flow.** La forma de usar las ramas: `main` es producción, `develop` es integración (y staging), y
cada cambio se hace en una `feature/…` que sale de `develop` y vuelve por PR. Un **release** es un PR de
`develop` a `main`.
→ [02 — Ramas y commits](02-como-esta-armado.md#ramas-y-commits)

## H

**Hash.** Una "huella" de un texto calculada en un solo sentido: del texto sale la huella, pero de la
huella no se puede volver al texto. Del token del enlace solo se guarda su hash (SHA-256), igual que con
las contraseñas (bcrypt).
→ [04b — Un "ticket" por cita](04b-fase-3-a-fondo.md#la-idea-central-un-ticket-por-cita)

**Hecho (de dominio).** Un aviso de que algo pasó, con nombre en pasado: `CitaCreada`, `CitaReagendada`,
`CitaCancelada`, `ReagendamientoSolicitado`… Lleva solo ids, nunca datos del paciente. Viaja por el
outbox.
→ [02 — El outbox](02-como-esta-armado.md#el-outbox-un-libro-de-pedidos-en-la-base)

**Hexagonal (arquitectura), puerto y adaptador.** Forma de ordenar el código para que la lógica de
negocio no dependa de la base de datos ni del framework. El **puerto** es lo que la lógica necesita ("algo
que guarde citas", una `abstract class`); el **adaptador** es la pieza concreta que lo cumple (con TypeORM,
con Resend…). Se reparte en `domain/`, `application/`, `infrastructure/` y `presentation/`.
→ [02 — La arquitectura hexagonal](02-como-esta-armado.md#la-arquitectura-hexagonal) · [ADR-02](../Decisions/ADR-02.md)

**HMAC.** Una "firma" calculada con una clave secreta. Con la misma clave y los mismos datos siempre sale
lo mismo, y sin la clave no se puede imitar. El token del enlace es el HMAC-SHA256 de la cita y su
versión, con `ENLACE_CITA_CLAVE`: 43 caracteres.
→ [04b — ¿Cómo se fabrica el token?](04b-fase-3-a-fondo.md#cómo-se-fabrica-el-token)

**Horas sin envío y recordatorio tardío.** No se envían recordatorios entre las 21:00 y las 08:00 hora
de la clínica: si uno cae ahí, se adelanta a las 20:59. Si la cita se agenda tan tarde que ya pasaron
todos sus recordatorios, sale **uno tardío**, solo si faltan al menos 60 minutos.
→ [06 — us03](06-features.md#us03--recordatorios-por-correo) · [ADR-13](../Decisions/ADR-13.md)

## I

**I+D.** El rol de investigación y desarrollo de producto del equipo: responde las preguntas de negocio
(validación, prepago, alcance).
→ [08 — Preguntas abiertas](08-preguntas-abiertas.md)

**Idempotencia e `Idempotency-Key`.** Una operación es idempotente si hacerla dos veces deja todo igual
que hacerla una. Los suscriptores del outbox deben serlo (un hecho puede llegar dos veces). Al llamar a
Resend se manda la cabecera `Idempotency-Key: recordatorio/<id>`, para que un reintento no envíe el
correo dos veces.
→ [02 — El outbox](02-como-esta-armado.md#el-outbox-un-libro-de-pedidos-en-la-base) · [06 — us03](06-features.md#us03--recordatorios-por-correo)

**Invalidar el enlace.** Botón del voucher (`POST /api/citas/:id/enlace/invalidar`) para cuando el enlace
llegó a quien no debía: lo revoca, y el siguiente recordatorio trae uno nuevo (la "versión" siguiente).
→ [04b — Las reglas de seguridad](04b-fase-3-a-fondo.md#las-reglas-de-seguridad-explicadas) · [07 — El enlace del paciente](07-deudas-tecnicas.md#el-enlace-del-paciente-fase-3)

## J

**JWT** (*JSON Web Token*). El token de sesión que entrega el login. Lleva el id del usuario, su correo,
su rol y el `tenantId`, firmados con `JWT_SECRET`, y dura 1 día por defecto. Se manda en cada petición en
la cabecera `Authorization: Bearer …`. No se puede renovar ni revocar ([DT-01](../Deudas/DT-01.md)).
→ [02 — Multi-organización](02-como-esta-armado.md#multi-organización-cada-cliente-en-su-propia-caja) · [ADR-01](../Decisions/ADR-01.md)

## L

**Latido (heartbeat) y `/api/health`.** Cada proceso programado avisa "sigo vivo" a Better Stack; si el
aviso deja de llegar, salta una alerta. `GET /api/health` es la ruta que Better Stack consulta para saber
si la API responde.
→ [02 — El planificador](02-como-esta-armado.md#el-planificador-tareas-que-corren-solas)

**Ley 21.719.** Ley chilena de protección de datos personales; su entrada en vigor está prevista para el
2026-12-01. Es la fecha límite para revisar el consentimiento ([DT-16](../Deudas/DT-16.md)).
→ [01 — Lo que sigue abierto](01-el-producto.md#lo-que-sigue-abierto-a-nivel-de-producto)

**Límite de tasa.** Tope de peticiones por IP (o por enlace) en una ventana de tiempo; al pasarse, la API
responde **429**. Login: 5 por minuto. Registro y solicitud pública: 5 por hora. Portal del paciente: 30
por minuto por IP y 5 acciones por hora por enlace. Entró con la Fase 3 y está en producción desde el
2026-10-17 ([DT-18](../Deudas/DT-18.md)).
→ [07 — Límite de tasa](07-deudas-tecnicas.md#límite-de-tasa) · [04b](04b-fase-3-a-fondo.md)

## M

**`MENSAJERIA_ADAPTADOR`.** Elige cómo salen los correos: `resend` los envía de verdad; `registro` solo
deja constancia en el log (staging y tests). Trampa conocida: con `registro`, los recordatorios quedan
"Enviado" sin haberse enviado ([DT-40](../Deudas/DT-40.md)).
→ [02 — Configuración](02-como-esta-armado.md#configuración-las-variables-que-importan)

**Migración.** Un archivo versionado que cambia el esquema de la base (crear una tabla, agregar una
columna), con su `up` y su `down` para deshacerlo. Hay 15 en `src/database/migrations/` y se aplican solas
al arrancar el contenedor. TypeORM nunca cambia el esquema por su cuenta (`synchronize: false`).
→ [02 — Los tests](02-como-esta-armado.md#los-tests) · [ADR-00](../Decisions/ADR-00.md) · [ADR-05](../Decisions/ADR-05.md)

**Modo prueba.** El piloto con planes gratis de todos los proveedores. El límite que manda es el de
Resend: unas 50 citas al día en toda la plataforma.
→ [01 — La restricción del modo prueba](01-el-producto.md#la-restricción-del-modo-prueba)

**MVP, v1 y v2.** El MVP (*producto mínimo viable*) es lo mínimo que entrega valor: dashboard, gestión de
citas y recordatorios (fases 0, 1 y 2). "v1" es esa primera versión; "v2" es donde quedó lo aplazado,
como el scoring.
→ [01 — Etapa 3: el MVP](01-el-producto.md#etapa-3-el-mvp)

**Multi-organización.** Ver *Tenant*.

## N

**Netlify.** Publica el frontend Vue, un sitio por entorno: `app.citiahealth.cl` (production) y
`citia-staging.netlify.app` (staging).
→ [02 — Infraestructura](02-como-esta-armado.md#infraestructura-y-entornos) · [10 — El frontend](10-el-frontend.md)

**No-show (ausentismo).** El paciente que reserva y no llega. Es el problema que ataca Citia.
→ [01 — El problema de fondo](01-el-producto.md#el-problema-de-fondo)

**`no-store` / `no-referrer`.** Cabeceras de las respuestas del portal del paciente: la primera le dice
al navegador que no guarde la respuesta en caché; la segunda, que no cuente de qué página viene al
saltar a otro sitio.
→ [04b — Las reglas de seguridad](04b-fase-3-a-fondo.md#las-reglas-de-seguridad-explicadas)

## O

**Organización.** Ver *Tenant*.

**Orquestador y sub-agentes.** La forma de trabajar con Claude Code en este repo: un orquestador analiza
la tarea y se la delega a sub-agentes especializados (`architecture`, `backend`, `database`, `api`,
`testing`), definidos en `.claude/agents/`.
→ [02 — El orquestador y los sub-agentes](02-como-esta-armado.md#el-orquestador-y-los-sub-agentes)

**Outbox (`eventos_salida`), despachador y suscriptor.** El outbox es una tabla donde los hechos se
anotan **en la misma transacción** que el cambio, para que no se pierdan ni se inventen. El
**despachador** la revisa cada 5 segundos y entrega cada hecho a sus **suscriptores** (hoy, el de
recordatorios y el de solicitudes), que reaccionan.
→ [02 — El outbox](02-como-esta-armado.md#el-outbox-un-libro-de-pedidos-en-la-base) · [ADR-12](../Decisions/ADR-12.md)

## P

**Pedir otra hora.** Ver *Reagendar*.

**Plan de US.** Documento en `context/US/` que dice cómo se va a construir una historia **antes** de
escribir código: decisiones, orden de construcción por agente y Definición de Terminado.
→ [05 — Qué es un plan de US](05-historias-de-usuario.md#qué-es-un-plan-de-us-en-este-proyecto)

**Planificador.** Las tareas que el backend corre solo, sin que nadie haga una petición: despachar el
outbox (5 s), enviar recordatorios (60 s), el respaldo (cada hora), medir fallos (15 min) y la purga
(diaria). Corren dentro del mismo proceso con `@nestjs/schedule`.
→ [02 — El planificador](02-como-esta-armado.md#el-planificador-tareas-que-corren-solas) · [ADR-12](../Decisions/ADR-12.md)

**Portal del paciente.** La página `/cita` del frontend y las rutas `/api/publico/cita` del backend
(módulo `portal-paciente`): ver la cita, confirmar, cancelar o pedir otra hora, con el token del enlace
y sin cuenta.
→ [04b — Qué puede hacer el paciente](04b-fase-3-a-fondo.md#qué-puede-hacer-el-paciente) · [`portal-paciente/CLAUDE.md`](../../src/modules/portal-paciente/CLAUDE.md)

**Pregunta abierta (Q).** Una decisión pendiente, numerada (Q1 a Q17) y asignada a quien puede
responderla: I+D, los desarrolladores o el arquitecto (las de seguridad). Están en
[`PREGUNTAS-ABIERTAS.md`](../PREGUNTAS-ABIERTAS.md).
→ [08 — Preguntas abiertas](08-preguntas-abiertas.md)

**Puerto.** Ver *Hexagonal*.

## R

**Railway.** La plataforma donde corre el backend (como contenedor Docker) con un Postgres por entorno:
staging ← `develop` y production ← `main`.
→ [02 — Infraestructura](02-como-esta-armado.md#infraestructura-y-entornos)

**Reagendar y pedir otra hora (reagendamiento).** **Reagendar** es cuando el profesional mueve la cita a
otra hora: es la misma cita (mismo id) y vuelve a `pendiente`. **Pedir otra hora** es lo que puede hacer
el paciente desde su enlace: no mueve nada, crea una solicitud de tipo `reagendamiento` que el profesional
atiende en la bandeja.
→ [04b — Qué puede hacer el paciente](04b-fase-3-a-fondo.md#qué-puede-hacer-el-paciente) · [06 — us04](06-features.md#us04--el-paciente-responde-desde-el-enlace)

**Reconciliar.** Lo que hace un suscriptor del outbox: en vez de aplicar el cambio que dice el hecho,
**relee el estado actual** y calcula qué debería existir. Así no importa si los hechos llegan repetidos o
desordenados.
→ [02 — El outbox](02-como-esta-armado.md#el-outbox-un-libro-de-pedidos-en-la-base)

**Recordatorio y sus estados.** El correo automático que recibe el paciente antes de su cita (por
defecto 24 h y 2 h antes). Sus estados: `programado` (esperando su hora), `enviado` (Resend lo aceptó),
`entregado` (llegó a la bandeja de entrada), `fallido` (se intentó y no llegó), `cancelado` (dejó de tener
sentido: la cita se canceló o se movió) y `omitido` (una regla decidió no enviarlo, por ejemplo un
paciente sin correo). El profesional los ve en el voucher.
→ [06 — us03](06-features.md#us03--recordatorios-por-correo) · [`recordatorio/CLAUDE.md`](../../src/modules/recordatorio/CLAUDE.md)

**Redacción (en logs).** Los logs tachan automáticamente lo sensible (contraseñas, la cabecera
`Authorization`, el token del enlace, datos del paciente) antes de escribirse.
→ [04b — Las reglas de seguridad](04b-fase-3-a-fondo.md#las-reglas-de-seguridad-explicadas)

**Release.** Pasar lo que está en `develop` a `main` (producción) con un PR. "Pendiente de release"
significa que está construido y en `develop`, pero todavía no en producción (así estuvo la Fase 3 entre el
2026-10-15 y el 2026-10-17).
→ [04 — El estado al 2026-10-18](04-roadmap-y-fases.md#el-estado-al-2026-10-18)

**Resend.** El proveedor de correo de los recordatorios. Envía desde
`recordatorios@notificaciones.citiahealth.cl` y avisa por webhook si el correo se entregó o rebotó.
→ [02 — Infraestructura](02-como-esta-armado.md#infraestructura-y-entornos) · [ADR-13](../Decisions/ADR-13.md)

**Respuesta uniforme (anti-enumeración).** Responder **exactamente igual** ante cualquier fallo, para
que un curioso no aprenda nada probando ("enumerar" es ir probando valores para descubrir cuáles
existen). Ejemplos: el login siempre da el mismo 401; la solicitud pública siempre da 202; un enlace que
no sirve siempre da el mismo 404 "Enlace no válido o vencido".
→ [04b — Las reglas de seguridad](04b-fase-3-a-fondo.md#las-reglas-de-seguridad-explicadas) · [ADR-03](../Decisions/ADR-03.md)

**RF / RNF.** Requisitos funcionales (qué hace el sistema, RF-00 a RF-08) y no funcionales (con qué
calidad, RNF-01 a RNF-09). Fuentes: [`rf.md`](../rf.md) y [`rnf.md`](../rnf.md).
→ [01 — Requisitos funcionales](01-el-producto.md#los-requisitos-funcionales-explicados)

**RUT** (Rol Único Tributario). El número de identificación chileno, con un dígito verificador al final.
Es la identidad del paciente: se guarda sin puntos ni guion y **nunca** viaja en una URL ni en un log
([ADR-09](../Decisions/ADR-09.md)). Que alguien escriba un RUT no prueba que sea suyo
([DT-23](../Deudas/DT-23.md)).
→ [07 — La vía pública](07-deudas-tecnicas.md#la-vía-pública-y-las-solicitudes-de-hora)

## S

**S1, S2 y S3.** Los requisitos de seguridad que el arquitecto fijó para el enlace por cita: S1 poder
invalidarlo desde el voucher; S2 que la página muestre lo mínimo (sin nombre ni RUT del paciente); S3 el
token en el fragmento, cabeceras `no-store`/`no-referrer` y que **abrir la página nunca ejecute una
acción**.
→ [04b — Las reglas de seguridad](04b-fase-3-a-fondo.md#las-reglas-de-seguridad-explicadas) · [ADR-10](../Decisions/ADR-10.md)

**Scoring.** La calificación de asistencia de cada paciente (porcentaje y etiqueta "nuevo", "confiable"
o "riesgo"), RF-08. Salió del MVP el 2026-09-30 y es la Fase 5, en la v2.
→ [01 — Lo que quedó fuera](01-el-producto.md#lo-que-quedó-fuera) · [04 — Fase 5](04-roadmap-y-fases.md)

**Slug.** El identificador legible de una organización, sacado de su nombre: "Clínica Sonrisa" →
`clinica-sonrisa` (si ya existe, `-2`, `-3`…). Se usa en el login y en el enlace público de agenda.
→ [02 — Multi-organización](02-como-esta-armado.md#multi-organización-cada-cliente-en-su-propia-caja) · [ADR-03](../Decisions/ADR-03.md)

**Solapamiento.** Dos citas del mismo profesional que se cruzan en el horario. La regla es **avisar y
permitir**: la respuesta trae `avisos.solapamientos`, pero la cita se guarda igual
([ADR-11](../Decisions/ADR-11.md)).
→ [06 — us02](06-features.md#us02--gestión-de-citas)

**Solicitud de cita.** Un pedido de hora que el profesional resuelve en la bandeja. Puede ser de tipo
`nueva` (desde el enlace público de agenda) o `reagendamiento` (desde el enlace por cita). Sus estados:
`recibida`, `aceptada`, `rechazada` y `descartada` (la pone el sistema, por ejemplo si la cita se canceló).
→ [06 — us02](06-features.md#us02--gestión-de-citas) · [`solicitud/CLAUDE.md`](../../src/modules/solicitud/CLAUDE.md)

**Staging.** Ver *Entornos*.

**Supresión (de correo).** Lista de direcciones a las que ya no se envía, porque rebotaron de forma
permanente, el destinatario lo marcó como spam o el proveedor ya la tenía bloqueada. Se guarda solo el
hash del correo. No hay herramienta para
sacar una dirección ([DT-39](../Deudas/DT-39.md)).
→ [07 — Recordatorios y correo](07-deudas-tecnicas.md#recordatorios-y-correo)

**Suscriptor.** Ver *Outbox*.

## T

**Tenant (organización).** Cada cliente de Citia: una clínica o un profesional independiente. Todos
comparten la misma base, pero cada dato lleva su `tenantId` y toda consulta filtra por él. El `tenantId`
sale siempre del token de sesión, nunca de lo que manda el cliente.
→ [02 — Multi-organización](02-como-esta-armado.md#multi-organización-cada-cliente-en-su-propia-caja) · [ADR-01](../Decisions/ADR-01.md)

**Token.** En este proyecto hay dos: el **JWT** (la sesión del profesional) y el **token del enlace**
(los 43 caracteres del enlace por cita, que identifican una cita para el paciente). No se mezclan: cada
uno viaja en su propia cabecera.
→ [04b — Un "ticket" por cita](04b-fase-3-a-fondo.md#la-idea-central-un-ticket-por-cita)

**Transacción y `TransactionRunner`.** Una transacción agrupa varios cambios en la base para que se
guarden todos o ninguno. `TransactionRunner` es el puerto que permite abrir una desde la capa de
aplicación sin conocer TypeORM ([ADR-06](../Decisions/ADR-06.md)).
→ [02 — Un ejemplo real](02-como-esta-armado.md#un-ejemplo-real-registrar-una-organización)

**`trust proxy`.** Configuración de Express que le dice al backend que confíe en **un** proxy delante (el
de Railway) para leer la IP real del cliente. Sin ella, el límite de tasa vería a todos los clientes como
uno solo.
→ [02 — Configuración](02-como-esta-armado.md#configuración-las-variables-que-importan) · [07 — Límite de tasa](07-deudas-tecnicas.md#límite-de-tasa)

## U

**US** (historia de usuario). Una necesidad contada desde quien la tiene: "como profesional quiero…,
para…". Van de US-00 a US-10 (US-01 no existe; US-09 sin definir). Los archivos `02.NN-*` son
**subtareas** de US-02, no historias propias.
→ [05 — Qué es una historia de usuario](05-historias-de-usuario.md#qué-es-una-historia-de-usuario) · [05 — La numeración](05-historias-de-usuario.md#la-numeración)

## V

**Vía pública.** Las rutas que funcionan sin login: la solicitud de hora por el enlace de agenda
(`POST /api/publico/:tenantSlug/solicitudes`) y el portal del paciente (`/api/publico/cita`). Son las
más expuestas, por eso llevan respuesta uniforme y límite de tasa.
→ [09 — La vía pública](09-decisiones-del-frontend.md#primero-un-poco-de-contexto-la-vía-pública) · [07 — La vía pública](07-deudas-tecnicas.md#la-vía-pública-y-las-solicitudes-de-hora)

**Vigente / terminal.** Una cita **vigente** (`pendiente` o `confirmada`) sigue siendo un compromiso y
ocupa la agenda. Una **terminal** (`cancelada`, `asistio`, `no_asistio`, `ghosting`) ya terminó: de ahí no
se sale.
→ [ADR-04](../Decisions/ADR-04.md)

**Voucher.** La tarjeta de detalle de una cita en el frontend (`GET /api/citas/:id`): datos, acciones
(confirmar, cancelar, reagendar, asistió, no asistió), estado de los recordatorios, quién confirmó o
canceló, el aviso "El paciente pidió otra hora" y el botón para invalidar el enlace.
→ [05 — US-02.08](05-historias-de-usuario.md#us-0208--el-voucher-de-la-cita) · [06 — us02](06-features.md#us02--gestión-de-citas)

## W

**Webhook.** Una llamada que **otro servicio** le hace a nuestra API para avisar algo. Resend llama a
`POST /api/webhooks/resend` cuando un correo se entrega, rebota o recibe una queja. La firma se verifica
(con `svix`) para que nadie pueda hacerse pasar por Resend.
→ [06 — us03](06-features.md#us03--recordatorios-por-correo) · [ADR-13](../Decisions/ADR-13.md)

## X

**`X-Enlace-Cita`.** La cabecera HTTP en que el frontend manda el token del enlace al backend, en vez de
ponerlo en la URL (las URL quedan en logs e historiales).
→ [04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md) · [`portal-paciente/CLAUDE.md`](../../src/modules/portal-paciente/CLAUDE.md)

---

## Para profundizar

- [`context/README.md`](../README.md) — el glosario de **tipos de documento** (fase, etapa, US, ADR,
  feature, DT, FD, Q).
- [ADR-04](../Decisions/ADR-04.md) — estados de la cita · [ADR-10](../Decisions/ADR-10.md) — enlace por cita
  · [ADR-12](../Decisions/ADR-12.md) — outbox y planificador · [ADR-13](../Decisions/ADR-13.md) — recordatorios.
- [DT-11](../Deudas/DT-11.md) — la regla G1 del ghosting y la fecha de corte.
- [`stack-tecnologico.md`](../stack-tecnologico.md) — proveedores y entornos.
- Los `CLAUDE.md` de los módulos: [cita](../../src/modules/cita/CLAUDE.md), [solicitud](../../src/modules/solicitud/CLAUDE.md),
  [recordatorio](../../src/modules/recordatorio/CLAUDE.md), [portal-paciente](../../src/modules/portal-paciente/CLAUDE.md).
