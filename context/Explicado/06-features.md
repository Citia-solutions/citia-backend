# Las features: lo que quedó construido

> **Qué vas a entender acá:** en qué se diferencia una historia de usuario (el plan) de una feature (lo
> construido), y qué hace cada una de las ocho features documentadas en `context/Features/`: qué ve el
> usuario, cómo viaja una petición por dentro (endpoint → módulo → tabla), sus reglas importantes y lo que
> quedó pendiente. Rutas y comportamiento revisados contra los controllers de `src/` el 2026-10-15; estados
> puestos al día el 2026-10-18.
>
> **Antes conviene leer:** [05-historias-de-usuario.md](05-historias-de-usuario.md) (los planes) y
> [02-como-esta-armado.md](02-como-esta-armado.md) (arquitectura hexagonal, módulos, multi-organización).
> Términos: [11-glosario.md](11-glosario.md).

---

## Historia de usuario vs. feature

La **historia** (y su plan) es la intención: lo que se quiere lograr y el contrato antes de programar. La
**feature** es la descripción de lo que **existe en el código** después: los endpoints reales, las tablas,
los tests, lo que salió distinto del plan y lo que quedó pendiente. Es como la diferencia entre la receta y
el plato servido: el plato puede llevar un ajuste que la receta no decía, y la feature es donde se anota.

La relación no es uno a uno:

- **Una historia puede dar dos features:** US-00 se documentó como `us00a` (registro) y `us00b` (login).
- **Una feature puede cubrir varias historias:** `us02` cubre US-02 y sus subtareas; `us04` cubre US-04 y la
  absorbida US-02.07.
- **Hay features que no son de negocio:** `infra-contenedores` documenta Docker y la infraestructura común.
- **Una fase puede modificar features anteriores sin reescribirlas:** lo que la Fase 3 cambió en el login,
  el registro y la gestión de citas está en `us04`, no en `us00a`, `us00b` ni `us02`.

Igual que los planes, las features se actualizan con **notas fechadas** en lugar de reescribirse. Por eso
algunas secciones viejas todavía dicen "sin implementar" o "pendiente de correr": cuando haya duda, manda la
nota más reciente y, sobre todo, el [ROADMAP](../ROADMAP.md).

### Dos convenciones que valen para todas

- **Todas las rutas llevan el prefijo `/api`** (lo fija `main.ts`).
- **En las rutas autenticadas, la organización y el usuario salen del token, nunca del cuerpo.** Si alguien
  manda `tenantId` en el JSON, el `ValidationPipe` (el filtro que valida los datos de entrada) lo descarta.
  Y "no existe" y "es de otra organización" responden **el mismo 404**, para no filtrar información ajena.

### Resumen

| Feature | Qué es | Fase | Estado al 2026-10-18 |
|---|---|---|---|
| [infra-contenedores](#infra-contenedores--docker-y-la-infraestructura-común) | Docker, migraciones al arrancar, configuración, logs, límite de tasa | Fundaciones (+ Fases 2 y 3) | ✅ en producción (lo de la Fase 3, desde el 2026-10-17) |
| [registrar-usuario](#registrar-usuario--en-desuso) | diseño viejo del registro | — | ⛔ en desuso |
| [us00a-registro-inicial](#us00a--registro-inicial) | crear organización + primer usuario | Fundaciones | ✅ en producción |
| [us00b-login](#us00b--login) | login con JWT por organización | Fundaciones | ✅ en producción |
| [us06-dashboard-citas](#us06--dashboard-de-citas-del-día) | las citas de hoy del profesional | Fase 0 | ✅ en producción |
| [us02-gestion-citas](#us02--gestión-de-citas) | agenda, voucher, bandeja, enlace público | Fase 1 | ✅ en producción |
| [us03-recordatorios](#us03--recordatorios-por-correo) | recordatorios por correo + outbox + observabilidad | Fase 2 | ✅ en producción |
| [us04-respuesta-paciente](#us04--el-paciente-responde-desde-el-enlace) | el paciente confirma, cancela o pide otra hora | Fase 3 | ✅ en producción (2026-10-17) |

---

## infra-contenedores — Docker y la infraestructura común

Documento: [`Features/infra-contenedores.md`](../Features/infra-contenedores.md) ·
[ADR-05](../Decisions/ADR-05.md)

### Qué hace

No es algo que vea el profesional; es lo que ve quien desarrolla u opera. Empaqueta el backend en una imagen
Docker liviana, levanta un Postgres local con `docker compose` y **aplica las migraciones de la base antes de
arrancar la app**, para que nunca corra un código nuevo contra un esquema viejo.

### Cómo funciona

- **Dockerfile en tres etapas:** una instala dependencias, otra compila, y la imagen final (`node:22-alpine`)
  lleva solo lo necesario, corre con un usuario sin privilegios y usa `tini` como proceso inicial, para que
  las señales de apagado lleguen bien.
- **`entrypoint.sh`** corre las migraciones (JavaScript compilado en producción, `ts-node` en desarrollo) y
  después arranca la app.
- **`docker-compose`:** `db` (Postgres 16) y `app`. El *override* de desarrollo suma recarga en caliente y
  pgAdmin, en el puerto 15050 porque Windows reserva el rango donde caía el 5050 original.
- **Datos de prueba (`npm run seed`):** una organización `clinica-demo` con el usuario
  `admin@clinicademo.cl` / `Demo1234`, tres pacientes y seis citas de hoy en distintos estados. Usa los
  servicios reales en vez de `INSERT` directos, así respeta la máquina de estados; se puede correr muchas
  veces; y genera las horas relativas a "ahora" para que siempre caigan en el día actual.

**Lo que sumó la Fase 2:** la app **valida la configuración al arrancar** y no levanta si falta algo (en
producción exige, por ejemplo, un `JWT_SECRET` de 32 caracteres o más); logs en JSON con `pino` que tapan
datos personales; `GET /api/health`; latidos hacia Better Stack; CORS con lista de orígenes; el planificador
de tareas; apagado ordenado; y el cuerpo crudo de las peticiones, que necesita el webhook de Resend.

**Lo que sumó la Fase 3 (en producción desde el 2026-10-17):** la clave `ENLACE_CITA_CLAVE` (obligatoria en producción y distinta
de `JWT_SECRET`), el **límite de tasa** con `@nestjs/throttler`, `trust proxy` para ver la IP real del cliente
detrás del proxy de Railway, CORS con una lista explícita de cabeceras permitidas, y la redacción en los logs
de la cabecera del enlace del paciente.

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/health` | monitor de uptime: 200 si Postgres responde en menos de 2 s, 503 si no |

### Detalles importantes

- **Migraciones al arrancar** funciona con una sola réplica. Con dos, las dos intentarían migrar a la vez;
  antes de escalar hay que moverlas a un paso aparte ([ADR-05](../Decisions/ADR-05.md)).
- Si la app no arranca porque falta la clave, **las migraciones ya quedaron aplicadas**: el entrypoint las
  corre antes.
- `context/` no puede tener archivos `.ts` compilables: uno suelto rompió el build una vez.

### Pendientes

Mover las migraciones fuera del arranque antes de tener más de una réplica; la fuente de logs de Better Stack
([DT-19](../Deudas/DT-19.md)); y comprobar en production que el límite de tasa ve la IP real del cliente, con
lo que se cierra [DT-18](../Deudas/DT-18.md).

---

## registrar-usuario — en desuso

Documento: [`Features/registrar-usuario.md`](../Features/registrar-usuario.md)

Describe un **diseño antiguo del registro que ya no existe en el código**: una tabla `users`, campos en
inglés (`fullName`, `role`) y otra forma de inyectar el repositorio. Se reemplazó por
[us00a](#us00a--registro-inicial), con código en español, organizaciones y transacción. Se conserva solo
como puntero histórico. **No lo uses como referencia.**

---

## us00a — Registro inicial

Documento: [`Features/us00a-registro-inicial.md`](../Features/us00a-registro-inicial.md) · plan
[US-00](../US/00-auth.md)

### Qué hace

Un profesional o una clínica se registra y nace su **organización** con un primer usuario administrador.
Desde ahí puede iniciar sesión.

### Cómo funciona por dentro

`POST /api/usuarios` → `UsuariosController` → `UsuariosService.registrar()`, todo dentro de una transacción
(`TransactionRunner`):

1. genera un **slug** único a partir del nombre de la organización (`Clínica Sur` → `clinica-sur`, y
   `clinica-sur-2` si ya existe);
2. guarda la organización en la tabla **`tenants`**;
3. revisa que el correo no esté repetido en esa organización;
4. guarda la contraseña con **bcrypt** (un hash lento a propósito, para que robar la base no regale las
   contraseñas);
5. guarda el usuario en **`usuarios`**, con rol `ADMINISTRADOR`.

Si cualquier paso falla, se deshace todo: no queda una organización huérfana
([ADR-06](../Decisions/ADR-06.md)). El servicio no sabe que debajo hay TypeORM: la transacción viaja como un
objeto opaco, para no ensuciar la capa de aplicación ([ADR-02](../Decisions/ADR-02.md)).

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `POST` | `/api/usuarios` | `nombreTenant`, `tipoTenant?` (`CLINICA` o `INDEPENDIENTE`, por defecto este), `email`, `password`, `nombreCompleto` | 201 con el usuario, `tenantId`, `nombreTenant` y `tenantSlug` · 400 · 409 · 429 (desde la Fase 3) |

### Detalles importantes

- El id de la organización lo genera el servidor; el rol no se elige; el hash de la contraseña nunca sale en
  una respuesta.
- La unicidad es `(organización, correo)`: el mismo correo puede estar en dos organizaciones.
- Desde la Fase 3, como máximo **5 registros por hora por IP**.

### Pendientes

Sin verificación de correo ni recuperación de contraseña ([DT-03](../Deudas/DT-03.md)); un mismo correo puede
fundar organizaciones sin límite, con solo el freno por IP ([DT-06](../Deudas/DT-06.md)); no hay forma de
sumar un segundo usuario, así que una "clínica" con varios profesionales todavía no es posible
([DT-07](../Deudas/DT-07.md)); y el chequeo de correo repetido es código muerto, porque busca dentro de una
organización recién creada que no puede tener a nadie ([DT-09](../Deudas/DT-09.md)).

---

## us00b — Login

Documento: [`Features/us00b-login.md`](../Features/us00b-login.md) · plan [US-00](../US/00-auth.md) ·
[ADR-01](../Decisions/ADR-01.md), [ADR-03](../Decisions/ADR-03.md)

### Qué hace

El usuario entra con el slug de su organización, su correo y su contraseña, y recibe un **JWT**: un token
firmado que el frontend adjunta en cada petición para demostrar quién es.

### Cómo funciona por dentro

`POST /api/auth/login` → `AuthService`:

1. busca la organización por slug (tabla `tenants`);
2. busca el usuario por correo **dentro** de esa organización (tabla `usuarios`);
3. compara la contraseña con `bcrypt.compare`;
4. firma el JWT con `sub` (id del usuario), `email`, `tenantId` y `rol`, algoritmo HS256 y la clave
   `JWT_SECRET`.

Cualquier paso que falle termina en el mismo `401 "Credenciales inválidas"`. En las peticiones siguientes, el
`JwtAuthGuard` valida el token y deja en la petición `{ userId, email, tenantId, rol }`; de ahí sale todo
filtro por organización.

| Método | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| `POST` | `/api/auth/login` | `tenantSlug`, `email`, `password` | 200 `{ accessToken, usuario }` · 400 · 401 · 429 (desde la Fase 3) |

### Detalles importantes

- **¿Por qué pide el slug?** Porque el correo no es único entre organizaciones: sin el slug, "ana@mail.cl"
  podría ser dos personas distintas ([ADR-03](../Decisions/ADR-03.md)).
- `usuario` trae además `tenantSlug` (desde la Fase 1, para armar el enlace público de la agenda) y
  `tenantNombre` (desde el 2026-10-05, para el menú lateral). **No van dentro del JWT**: no autorizan nada, y
  meterlos obligaría a re-emitir tokens si la organización cambia de nombre.
- El token dura `1d` por defecto. El objetivo es 15 minutos, pero eso exige *refresh tokens*, que no existen
  todavía ([DT-01](../Deudas/DT-01.md)).
- Desde la Fase 3, como máximo **5 intentos por minuto por IP**.
- El documento muestra CORS como un solo origen; eso quedó viejo: hoy lo arma `origenes-cors.ts` con una lista
  de orígenes (Fase 2) y de cabeceras (Fase 3).

### Pendientes

*Refresh tokens* y bajar a 15 minutos; poder revocar un token (cerrar sesión de verdad); el rol viaja en el
token pero ninguna ruta lo revisa ([DT-02](../Deudas/DT-02.md)); sin recuperación de contraseña
([DT-03](../Deudas/DT-03.md)); el límite es por IP, no por cuenta ([DT-04](../Deudas/DT-04.md)); y el 401
tarda distinto según qué falló, lo que en teoría permite adivinar ([DT-05](../Deudas/DT-05.md)).

---

## us06 — Dashboard de citas del día

Documento: [`Features/us06-dashboard-citas.md`](../Features/us06-dashboard-citas.md) · plan
[US-06](../US/06-epic.md) · [ADR-04](../Decisions/ADR-04.md), [ADR-07](../Decisions/ADR-07.md)

### Qué hace

El profesional abre la app y ve **sus citas de hoy**, en orden, con paciente, hora, duración, tipo de
consulta y estado. Para que eso existiera hubo que construir antes los módulos **Paciente** y **Cita** y la
creación de citas.

### Cómo funciona por dentro

`GET /api/citas/hoy` → `JwtAuthGuard` → `CitasController` → `CitasService`, con la organización y el
profesional **del token** → el repositorio calcula "hoy" en la zona de la clínica como el rango
`[00:00, 00:00 del día siguiente)` → consulta la tabla **`citas`** (el índice
`idx_cita_tenant_usuario_inicio` cubre justo ese filtro y ese orden) → resuelve los nombres de los pacientes
de una vez, sin una consulta por cita → devuelve la lista.

Cada elemento (`CitaDashboardDto`) trae `id`, `pacienteNombre`, `fecha`, `hora`, `inicio`, `duracionMin`,
`tipoConsulta` y `estado`. Tachar las citas pasadas lo hace el frontend con `inicio` y `estado`.

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/citas/hoy` | citas de hoy del profesional logueado |
| `POST` | `/api/citas` | crear una cita (nace `pendiente`); hoy es parte de [us02](#us02--gestión-de-citas) |
| `POST` | `/api/pacientes` | alta de un paciente |

### Detalles importantes

- **La máquina de estados vive en la entidad `Cita`.** El estado es privado y solo cambia por métodos que
  validan la transición; una ilegal (confirmar una cita cancelada) responde 409 ([ADR-04](../Decisions/ADR-04.md)).
- **La zona horaria.** El servidor corre en UTC, y la primera versión calculaba "hoy" y "la hora" en UTC:
  en Chile las horas salían corridas 3 o 4 horas. La corrección ([ADR-07](../Decisions/ADR-07.md)) calcula el
  día y la hora en la zona de la clínica (`APP_TZ`, por defecto `America/Santiago`) con la API `Intl`, sin
  librerías, y resistente a los cambios de horario.
- **Sin campos de dinero**, por decisión de producto.

### Pendientes

El proceso que marcaría `ghosting` está aplazado con el scoring ([DT-11](../Deudas/DT-11.md)); se aceptan
citas en el pasado ([DT-13](../Deudas/DT-13.md)); la hora de inicio se acepta sin zona en algunas rutas
([DT-14](../Deudas/DT-14.md)); la zona es una sola para todas las organizaciones ([DT-17](../Deudas/DT-17.md)).

> **Partes viejas del documento.** Su cabecera todavía dice que el e2e no se corrió y que las migraciones no
> se aplicaron (las dos cosas se hicieron el 2026-09-28), y muestra el alta de paciente con un campo
> `contacto`. Hoy el paciente tiene `rut` (opcional), `nombre`, `telefono`, `correo` (obligatorio desde la
> Fase 2) y `consentimiento`, y `POST /api/citas` acepta un `pacienteId` o el paciente completo en línea.
> Las notas del 2026-09-30 al final del documento lo aclaran en parte.

---

## us02 — Gestión de citas

Documento: [`Features/us02-gestion-citas.md`](../Features/us02-gestion-citas.md) · subtareas
[US-02.07](../US/02.07-paciente-reagenda-cancela.md) y [US-02.08](../US/02.08-voucher-cita.md) ·
[ADR-09](../Decisions/ADR-09.md), [ADR-11](../Decisions/ADR-11.md)

### Qué hace

El profesional crea, edita, confirma, reagenda y cancela citas, marca si el paciente asistió, ve su agenda
semanal, abre el **voucher** de cada cita con su historial de cambios y atiende una **bandeja** de
solicitudes. El paciente, sin cuenta, puede **pedir** una hora por un enlace público de la organización.

La idea que sostiene todo: **separar quién teclea de quién decide**.

| Vía | Quién | Qué produce |
|---|---|---|
| Botón "Nueva cita" | profesional autenticado | una **cita** en la agenda |
| Enlace público `/agendar-cita/<slug>` | paciente, sin cuenta | una **solicitud** que no toca la agenda |

El paciente pide, el profesional decide ([ADR-09](../Decisions/ADR-09.md)). Si el enlace público creara
citas directo, cualquiera podría llenar la agenda de un profesional.

### Cómo funciona por dentro

**Crear una cita:** `POST /api/citas` → `CitasService`, en una transacción → `PacientesService.resolverOCrear`
busca al paciente **por RUT** y, si existe, lo reutiliza en vez de duplicarlo (si le faltaba el correo, se lo
completa) → la entidad `Cita` nace `pendiente` → se guarda en **`citas`**, se anota en la bitácora
**`cambios_cita`** y se publica el hecho `CitaCreada` en **`eventos_salida`**, las tres cosas en la misma
transacción → la respuesta incluye `avisos.solapamientos`.

**Pedir hora (paciente):** `POST /api/publico/:tenantSlug/solicitudes` → se guarda en **`solicitudes_cita`**
y responde **siempre el mismo 202**. El profesional la ve en `GET /api/solicitudes`; al **aceptarla**, se
bloquea la fila (`FOR UPDATE`) y se crea paciente y cita con el mismo flujo que el botón, en una sola
transacción; al **rechazarla**, no se crea nada.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/citas` | crea la cita; resuelve o crea el paciente por RUT |
| `GET` | `/api/citas?desde=&hasta=` | agenda por rango de fechas (máximo 42 días) |
| `GET` | `/api/citas/:id` | detalle para el voucher, con `accionesPermitidas` |
| `GET` | `/api/citas/:id/historial` | bitácora de cambios |
| `PATCH` | `/api/citas/:id/confirmar` · `/cancelar` · `/asistencia` · `/inasistencia` · `/reagendar` | transiciones de estado |
| `PATCH` | `/api/citas/:id` | edita duración o tipo de consulta |
| `PATCH` | `/api/pacientes/:id` | corrige teléfono o correo (desde la Fase 2) |
| `GET` | `/api/solicitudes?estado=` | la bandeja (por defecto, las `recibida`) |
| `POST` | `/api/solicitudes/:id/aceptar` · `/rechazar` | resolver una solicitud |
| `POST` | `/api/publico/:tenantSlug/solicitudes` | el paciente pide hora (sin cuenta) |

### Detalles importantes

- **El RUT como identidad.** Se valida con el dígito verificador (módulo 11), se guarda sin puntos ni guion y
  se muestra formateado. Ojo: valida que el RUT **esté bien escrito**, no que sea de quien lo escribe
  ([DT-23](../Deudas/DT-23.md)).
- **Reagendar mueve la misma cita y la devuelve a `pendiente`**: si el paciente había confirmado, confirmó
  otra hora. La bitácora `cambios_cita` es de solo agregar y se escribe en la misma transacción que el
  cambio: si el cambio no queda anotado, no ocurre. Así se puede responder "¿cuántas veces se movió esta
  cita y quién la movió?".
- **Solapamiento: avisar y permitir** ([ADR-11](../Decisions/ADR-11.md)). Si la cita choca con otra del mismo
  profesional, la respuesta lo avisa pero nunca bloquea; las citas pegadas (una termina 10:00, la otra empieza
  10:00) no chocan.
- **Agenda por rango:** el cliente manda fechas (`2026-09-21`), no instantes; el servidor calcula las
  medianoches en la zona de la clínica. Máximo 42 días, seis semanas, lo que ocupa la grilla de un mes.
- **La bandeja es de la organización:** cualquier profesional del tenant la ve; quien acepta queda como dueño
  de la cita. Aceptar dos veces da 409; en la prueba manual, cinco aceptaciones simultáneas dejaron una sola
  cita.
- **La ruta pública responde siempre igual**, exista o no la organización y haya o no una solicitud abierta.
  Si variara, alguien podría averiguar qué RUT es paciente de qué profesional. Además, una sola solicitud
  abierta por RUT en una ventana de 72 h (anti-spam).
- **Fase 2:** el correo del paciente es obligatorio al crearlo, y los hechos pasaron a guardarse en el outbox
  (ver [us03](#us03--recordatorios-por-correo)).
- **Fase 3:** los hechos llevan quién hizo el cambio, el voucher muestra quién confirmó o canceló, la bandeja
  recibe peticiones de otra hora y la ruta pública tiene límite de tasa. Todo eso se documenta en
  [us04](#us04--el-paciente-responde-desde-el-enlace).

### Pendientes

Los campos definitivos del formulario público; citas en el pasado ([DT-13](../Deudas/DT-13.md)); solo aceptar
una solicitud exige la zona horaria en la fecha ([DT-14](../Deudas/DT-14.md)); tests automáticos de la
concurrencia en la bandeja, hoy verificada a mano ([DT-20](../Deudas/DT-20.md)); y decidir si la agenda es del
profesional o de la organización ([Q3](../PREGUNTAS-ABIERTAS.md)), porque hoy cualquier usuario de la
organización puede operar la cita de un colega si conoce su id. Partes del documento conservan el estado del
2026-09-25 ("sin implementar"); la nota de su cabecera aclara que todo eso está hecho.

---

## us03 — Recordatorios por correo

Documento: [`Features/us03-recordatorios.md`](../Features/us03-recordatorios.md) · plan
[US-03](../US/03-recordatorios.md) · [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md)

### Qué hace

- El **profesional** configura cuándo se avisa (por defecto 24 h y 2 h antes; de 1 a 3 momentos, entre 30
  minutos y 7 días), un teléfono de contacto y un correo donde recibir respuestas.
- El **paciente** recibe un correo con fecha, hora, profesional, organización y cómo contactar. Nada más: ni
  su nombre ni el tipo de consulta, y un asunto neutro, porque se lee con el teléfono bloqueado.
- En el **voucher** se ve el estado de cada recordatorio: programado, enviado, entregado, fallido, cancelado u
  omitido, con su motivo.
- Reagendar los reprograma y cancelar los anula **solos**: nadie tiene que acordarse.

### Cómo funciona por dentro

Piensa en una oficina de correos con varios empleados que no se hablan, cada uno con su turno:

1. **El caso de uso de la cita** deja el hecho (`CitaCreada`, `CitaReagendada`…) en **`eventos_salida`**, en la
   misma transacción que el cambio. Esto es el **outbox**.
2. **El despachador** (cada 5 s) toma los hechos pendientes con `FOR UPDATE SKIP LOCKED` (si otro proceso ya
   tomó una fila, la salta en vez de esperar) y se los pasa al suscriptor de recordatorios.
3. **La reconciliación** bloquea la cita, la relee **como está ahora**, lee la configuración de su **dueño**,
   calcula qué recordatorios deberían existir y anula o crea los que falten en **`recordatorios`**.
4. **Un respaldo** cada hora revisa las citas de los próximos 8 días que no tengan ningún recordatorio, por si
   algo se perdió.
5. **El envío** (cada 60 s, de a 20) toma los que ya tocan, **vuelve a revisar todo** (¿la cita sigue vigente?,
   ¿el paciente tiene correo?…), arma el correo en ese momento y se lo pasa a Resend con una
   `Idempotency-Key`, para que un reintento nunca mande dos correos.
6. **Resend avisa** si el correo se entregó o rebotó llamando a un **webhook** firmado. Un rebote o una queja
   agregan la dirección a **`supresiones_correo`** (guardada como hash, no en claro).

| Método | Ruta | Para qué |
|---|---|---|
| `GET` · `PUT` | `/api/recordatorios/configuracion` | leer o reemplazar la configuración del profesional |
| `GET` | `/api/citas/:citaId/recordatorios` | estado de los recordatorios de una cita (voucher) |
| `POST` | `/api/webhooks/resend` | avisos de entrega de Resend (público, autenticado por la firma) |
| `GET` | `/api/health` | monitor de uptime |
| `PATCH` | `/api/pacientes/:id` | completar el correo de un paciente antiguo |

### Detalles importantes

- **Horas sin envío:** de 21:00 a 08:00 no sale nada; un recordatorio que caería ahí se adelanta a las 20:59.
  Dos recordatorios a menos de 30 minutos se fusionan. Si la cita se crea tarde y ya pasaron los momentos, sale
  uno solo, siempre que falte al menos una hora.
- **Nueve revisiones antes de enviar**, en orden: la cita sigue igual, no venció, la configuración está
  activa, no es hora de silencio, hay correo, no está suprimido, consentimiento (apagado), tope de 40 por
  organización al día y cuota del plan gratis de Resend (100 al día, 3.000 al mes).
- **Solo `fallido` cuenta como falla del servicio.** `cancelado` (la cita cambió) y `omitido` (una regla decidió
  no enviar) no.
- **No se guarda el destinatario ni el contenido:** el correo se lee del paciente al momento de enviar.
- **El módulo de recordatorios solo lee** las tablas de cita, paciente, usuario y organización; nunca las
  escribe. Las tareas que recorren todas las organizaciones a la vez están marcadas con el comentario
  `BARRIDO GLOBAL`.
- **Alertas:** si fallan más del 5 % (con al menos 20 envíos), si se cruza el 80 % de la cuota, si se agota, si
  Resend rechaza la configuración o si un hecho del outbox agota sus reintentos.
- **En producción:** staging corre con el adaptador `registro`, que **no envía**; production usa Resend desde
  `recordatorios@notificaciones.citiahealth.cl`. El 2026-10-07 tres correos reales llegaron a la bandeja de
  entrada y el voucher los mostró *Entregado*. En esa prueba apareció un problema: production arrancó con
  `registro` copiado de staging y varios recordatorios quedaron "Enviado" sin haberse enviado
  ([DT-40](../Deudas/DT-40.md)).

### Pendientes

Que `registro` no pueda marcar "Enviado" en producción ([DT-40](../Deudas/DT-40.md)); el registro DMARC del
dominio de envío ([DT-41](../Deudas/DT-41.md)); la fuente de logs de Better Stack y una alerta de prueba
([DT-19](../Deudas/DT-19.md)); Resend en staging; y las preguntas del usuario
[Q12–Q15](../PREGUNTAS-ABIERTAS.md#fase-2--decisiones-pendientes-tras-implementar-2026-10-04).

---

## us04 — El paciente responde desde el enlace

Documento: [`Features/us04-respuesta-paciente.md`](../Features/us04-respuesta-paciente.md) · plan
[US-04](../US/04-respuesta-paciente.md) · [ADR-10](../Decisions/ADR-10.md) · **la explicación completa, con
el porqué de cada regla, está en [04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md)**; acá va el resumen.

### Qué hace

- Cada recordatorio trae un botón, *Ver o responder mi hora*, que abre la página `/cita` del frontend. Todos
  los correos de una cita llevan el mismo enlace.
- El paciente ve fecha, hora, duración, profesional, organización y estado, y puede **confirmar**,
  **cancelar** o **pedir otra hora**. Abrir la página no cambia nada: cada acción es un botón.
- Pedir otra hora no mueve la cita: llega a la bandeja como *"Pide otra hora"* y, si el profesional la acepta,
  se mueve **la misma** cita y los recordatorios se reprograman.
- En el voucher, el profesional ve quién confirmó o canceló, la nota *"El paciente pidió otra hora"* y un
  botón para **invalidar** el enlace si llegó a quien no era.
- Nace el **límite de tasa** en el enlace del paciente, el login, el registro y la solicitud pública.

### Cómo funciona por dentro, en corto

El módulo nuevo **`portal-paciente`** solo compone piezas de `cita` y `solicitud`. El token del enlace se
calcula con una clave secreta (`ENLACE_CITA_CLAVE`) y en la tabla **`enlaces_cita`** solo queda su hash. Cada
acción del paciente es **una transacción**: resuelve el token, bloquea la cita, revisa que siga válida y que la
acción esté permitida, la ejecuta y anota al paciente como autor en `cambios_cita`. La petición de otra hora
es una fila de **`solicitudes_cita`** de tipo `reagendamiento`.

| Método | Ruta | Respuestas |
|---|---|---|
| `GET` | `/api/publico/cita` (token en la cabecera `X-Enlace-Cita`) | 200 · 404 · 429 |
| `POST` | `/api/publico/cita/confirmar` · `/cancelar` · `/otra-hora` | 200 (201 en `otra-hora`) · 400 · 404 · 409 · 429 |
| `POST` | `/api/citas/:id/enlace/invalidar` (JWT) | 204 · 404 |
| `GET` | `/api/citas/:id` | suma `confirmadaPor` y `canceladaPor` |
| `GET` | `/api/solicitudes?estado=&citaOrigenId=` | suma peticiones de otra hora y el estado `descartada` |
| `POST` | `/api/solicitudes/:id/aceptar` | si es de otra hora, mueve la cita de origen |

| Superficie | Límite |
|---|---|
| todo `/api/publico/cita*` | 30 por minuto por IP |
| cada acción del paciente | 5 por hora por enlace |
| login | 5 por minuto por IP |
| registro y solicitud pública | 5 por hora por IP |

### Lo que el código hizo distinto del plan

La feature lista veinte desviaciones; ninguna rediseña. Las tres que más pesan: la cita se bloquea con
`FOR NO KEY UPDATE` en vez de `FOR UPDATE`, para no chocar con el envío de un recordatorio en curso; si cambia
la clave del enlace, el sistema **reemite** el enlace solo en vez de mandar uno que no sirve
([DT-45](../Deudas/DT-45.md)); y si el profesional reagenda desde el voucher, la petición de otra hora queda
atendida sola ([DT-44](../Deudas/DT-44.md), parte 2).

### Pendientes

La feature está en producción desde el 2026-10-17. Queda: comprobar en production que Railway entrega la IP
real del cliente (con eso se cierra [DT-18](../Deudas/DT-18.md)); los dos puntos manuales (un correo real con
el botón y que los escáneres de Gmail y Outlook no confirmen la cita); corregir dos comentarios del código que
todavía dicen `FOR UPDATE`; y [DT-46](../Deudas/DT-46.md) (columnas de fecha sin zona en algunas entidades,
solo afecta a tests). Lo demás del release ya se hizo: la fecha de corte del `ghosting` quedó escrita en
[DT-11](../Deudas/DT-11.md) (2026-10-17) y [DT-42](../Deudas/DT-42.md) a [DT-45](../Deudas/DT-45.md) pasaron
a "abierta".

---

## Para profundizar

- Índice de features: [`Features/README.md`](../Features/README.md)
- Cada feature: [infra-contenedores](../Features/infra-contenedores.md) ·
  [registrar-usuario](../Features/registrar-usuario.md) ·
  [us00a](../Features/us00a-registro-inicial.md) · [us00b](../Features/us00b-login.md) ·
  [us06](../Features/us06-dashboard-citas.md) · [us02](../Features/us02-gestion-citas.md) ·
  [us03](../Features/us03-recordatorios.md) · [us04](../Features/us04-respuesta-paciente.md)
- Los planes que las originaron: [05-historias-de-usuario.md](05-historias-de-usuario.md)
- El porqué de las decisiones: [03-decisiones-adr.md](03-decisiones-adr.md)
- Las deudas que se mencionan: [07-deudas-tecnicas.md](07-deudas-tecnicas.md) y
  [Deudas/README.md](../Deudas/README.md)
- Las reglas locales de cada módulo, en el código: `src/modules/<módulo>/CLAUDE.md` (hay en `cita`,
  `solicitud`, `recordatorio`, `portal-paciente` y `usuario`)
