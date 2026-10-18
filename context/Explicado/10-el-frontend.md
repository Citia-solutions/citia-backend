# El frontend (`citia-frontend`)

> **Qué vas a entender acá:** cómo está hecho el repo del frontend, para que puedas abrirlo sin
> perderte: con qué está construido, cómo se ordenan sus carpetas, qué rutas tiene, cómo maneja la
> sesión y la hora, cómo habla con el backend, cómo se despliega y qué documentos tiene.
>
> **Antes conviene leer:** [02-como-esta-armado.md](02-como-esta-armado.md) (el backend y los entornos)
> y [09-decisiones-del-frontend.md](09-decisiones-del-frontend.md). Para la página del paciente,
> [04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md). Los términos (tenant, slug, JWT, token…) están en
> [11-glosario.md](11-glosario.md).

---

## En una frase

`citia-frontend` es una **SPA** (*Single Page Application*: el navegador descarga la app una vez y
después cambia de pantalla sin recargar) que tiene dos públicos:

- **El profesional**, con sesión: su panel (resumen del día, agenda, bandeja de solicitudes,
  configuración de recordatorios).
- **El paciente**, sin cuenta: dos páginas públicas, una para **pedir hora** y otra para **responder a
  su cita** desde el correo.

Todo lo que muestra lo pide al backend por HTTP (JSON). El front no guarda datos de negocio por su
cuenta: el backend es la autoridad.

El repo vive al lado de este: `../../../citia-frontend/` (desde esta carpeta). Su punto de entrada para
humanos y agentes es su [`CLAUDE.md`](../../../citia-frontend/CLAUDE.md).

---

## El stack

| Pieza | Qué es | Para qué se usa acá |
|---|---|---|
| **Vue 3.5** | framework de interfaz | Componentes con Composition API y `<script setup>` |
| **TypeScript ~6.0** | JavaScript con tipos | Todo el código; `vue-tsc` revisa los tipos, incluso dentro de los `.vue` |
| **Vite 8** | servidor de desarrollo y empaquetador | `npm run dev` (puerto **3002**) y el build de producción |
| **Pinia 3** | estado global de Vue | Los *stores*: la sesión, las citas del día, las solicitudes |
| **Vue Router 4** | rutas de la SPA | Las URL, el *guard* que protege el panel |
| **CSS con variables** | estilos propios | `src/app/styles/main.css`; **sin** Tailwind, PrimeVue ni Vuetify |
| **`fetch` nativo** | HTTP | A través de un solo archivo, `httpClient.ts` (sin axios) |
| **`Intl`** | fechas del navegador | Fechas y horas sin librerías (nada de moment ni date-fns) |

Node `^22.18.0 || >=24.12.0`.

> El documento [`stack-tecnologico.md`](../../../citia-frontend/context/stack-tecnologico.md) del front
> todavía menciona "prime vue o vuetify" como idea inicial de estilos. No se usó ninguno: el
> `package.json` solo tiene `vue`, `vue-router` y `pinia` como dependencias.

### Comandos

| Acción | Comando |
|---|---|
| Desarrollo | `npm run dev` |
| Revisar tipos + build | `npm run build` |
| Solo revisar tipos | `npm run type-check` |
| Solo build | `npm run build-only` |

### Lo que no tiene (y conviene saber de entrada)

**No hay tests ni ESLint/Prettier.** A diferencia del backend (Jest, miles de tests), acá "verificar" es:

1. `npm run build`, que corre el revisor de tipos y el build. Si compila, los tipos calzan.
2. Probar en el navegador. Cuando no hay backend a mano, se **simulan las respuestas** reemplazando
   `fetch` en la página, para ver cómo se comporta con un 200, un 400, un 401, un 404, un 409 o la red
   caída.

---

## Cómo se ordenan las carpetas: Feature-Sliced Design

El código de `src/` sigue **FSD** (*Feature-Sliced Design*). La idea es como un edificio de cinco pisos:
**cada piso solo puede usar lo que está en los pisos de abajo**, nunca lo de arriba.

```
app       ← arranque: router, guard, providers, layouts, estilos globales
  ↓
pages     ← pantallas: solo arman features, sin lógica de negocio
  ↓
features  ← casos de uso: "crear una cita", "responder mi hora", "aceptar una solicitud"
  ↓
entities  ← cosas del negocio: la sesión, la cita, la solicitud, el recordatorio
  ↓
shared    ← herramientas genéricas: cliente HTTP, fechas, RUT, botones base
```

### Cada piso, con ejemplos reales

| Capa | Qué contiene | Ejemplos de carpetas |
|---|---|---|
| `app/` | Lo global: crear la app, el router, qué pasa ante un 401, el layout del panel | `app/router/index.ts`, `app/router/cerrarSesion.ts`, `app/providers/index.ts`, `app/layouts/PanelLayout.vue`, `app/layouts/PanelSidebar.vue` |
| `pages/` | Una carpeta por pantalla. **Solo componen**, no deciden nada | `login`, `dashboard`, `agenda`, `solicitudes`, `recordatorios`, `agendar-cita`, `cita-paciente`, `no-encontrada` |
| `features/` | Un caso de uso completo: su interfaz, su lógica y su llamada a la API | `auth`, `dashboard`, `agenda`, `crear-cita`, `gestionar-cita`, `bandeja-solicitudes`, `compartir-enlace-agenda`, `configurar-recordatorios`, `responder-cita` |
| `entities/` | Los tipos y el estado de las cosas del negocio | `session`, `appointment`, `recordatorio`, `solicitud` |
| `shared/` | Lo que no sabe nada del negocio | `api/httpClient.ts`, `config/zonaHoraria.ts`, `config/bloquesHorarios.ts`, `lib/fecha.ts`, `lib/rut.ts`, `lib/authToken.ts`, `ui/BaseButton.vue` |

### Por dentro de un slice

Cada carpeta de una capa (un *slice*) se divide igual. Por ejemplo, la página del paciente:

```
features/responder-cita/
├── api/respuestaCitaApi.ts     ← las 4 llamadas HTTP
├── model/                      ← lógica sin interfaz
│   ├── useRespuestaCita.ts     ← el "cerebro" de la pantalla
│   ├── tokenEnlace.ts          ← leer y validar el token del fragmento
│   ├── mensajeDeError.ts       ← traducir 404/409/429 a texto para el paciente
│   └── types.ts, presentacion.ts, formularios.ts
├── ui/                         ← componentes .vue
│   ├── RespuestaCita.vue, ResumenHora.vue
│   └── CancelarHoraForm.vue, PedirOtraHoraForm.vue
└── index.ts                    ← lo único que se puede importar desde afuera
```

### Las reglas

- **Solo hacia abajo:** `app → pages → features → entities → shared`. Si `shared` importara algo de
  `features`, se rompería todo el sentido.
- **Un slice no importa de su vecino:** un feature no importa de otro feature, ni una entidad de otra.
  Si dos features necesitan lo mismo, ese algo baja a `entities` o a `shared`.
- **Desde afuera, se importa por el `index.ts`** del slice (su "API pública"), no por sus archivos
  internos. Hoy hay **una** excepción documentada: `pages/agendar-cita` importa
  `@/features/crear-cita/model/flujoCitaModel` directo.
- **Alias `@/`** para cruzar capas (`@/entities/appointment`); imports relativos dentro del mismo slice.

Revisado contra el código al 2026-10-15: esa excepción es la única; no hay otros imports que suban de
capa ni que crucen entre slices hermanos.

> **¿Te suena?** Es la misma intención que la arquitectura hexagonal del backend
> ([02-como-esta-armado.md](02-como-esta-armado.md)): que las dependencias vayan **en una sola
> dirección**, para poder cambiar una parte sin que se caiga otra.

### Nombres e idioma

- Componentes Vue en `PascalCase` (`RespuestaCita.vue`), archivos `.ts` en `camelCase`
  (`httpClient.ts`), carpetas de slices y rutas en `kebab-case` (`gestionar-cita`, `/agendar-cita`).
- **Lo nuevo se nombra en español**, como el backend (`recordatorio`, `solicitud`, los features). Las
  entidades `session` y `appointment` quedaron en inglés porque son anteriores a esa regla.

---

## Las rutas

Todas están en [`src/app/router/index.ts`](../../../citia-frontend/src/app/router/index.ts).

| Ruta | Qué es | ¿Sesión? |
|---|---|---|
| `/login` | Login: clínica (el `slug`), correo, contraseña y "Mantener sesión iniciada". Sin Google ni "¿olvidaste tu clave?" | No (si ya tienes sesión, te manda a `/`) |
| `/` | **Resumen** (dashboard): cuatro tarjetas (citas hoy, próxima cita, próximos 7 días, solicitudes por responder), "Citas de hoy", "Citas por semana" y resumen de recordatorios | **Sí** |
| `/agenda` | Agenda del profesional: vista semanal y lista, "Nueva cita" y el voucher de cada cita | **Sí** |
| `/solicitudes` | Bandeja: aceptar o rechazar solicitudes (las nuevas del enlace y, desde la Fase 3, los pedidos de otra hora); pestaña Descartadas; botón "Copiar enlace de agenda" | **Sí** |
| `/recordatorios` | Configuración de los recordatorios por correo (Fase 2) | **Sí** |
| `/agendar-cita/:tenantSlug` | Página pública donde el paciente **pide** hora | No |
| `/cita#<token>` | Página pública donde el paciente **responde** a su cita (Fase 3) | No |
| cualquier otra | "No encontrada": ofrece ir al Resumen o al login según haya sesión | No |

Además, el **voucher de la cita** (una ventana modal, no una ruta) se abre desde el Resumen y desde la
agenda: reagendar, cancelar, confirmar, marcar asistencia o inasistencia, ver los recordatorios de la
cita y editar el contacto. Qué botones aparecen **no lo decide el front**: lo dice el campo
`accionesPermitidas` que manda el backend.

### Cómo se protege el panel

- Solo hay **una marca**: `meta: { requiresAuth: true }` en la ruta padre `/`. Las cuatro rutas del
  panel son sus hijas y la heredan. Todo lo demás es público por omisión.
- Las hijas se pintan dentro de `PanelLayout.vue`, que pone el **sidebar** (Resumen, Agenda,
  Solicitudes con su contador, Recordatorios, y abajo la clínica, el usuario, su rol y "Cerrar sesión").
- Si entras a una ruta protegida sin sesión, el *guard* te manda a `/login?redirect=/agenda`, y después
  del login vuelves a donde ibas. El login solo acepta un `redirect` que sea una ruta interna real (para
  que nadie arme un enlace que te mande a otro sitio).

### Roles

El backend emite dos roles, `ADMINISTRADOR` y `PROFESIONAL`, que el front traduce a `admin` y
`profesional`. Hoy el front **no muestra nada distinto según el rol**: solo pone la etiqueta en el
sidebar.

---

## Cómo funciona la sesión

### El punto de partida: no hay `GET /me`

Muchas apps, al recargar la página, le preguntan al servidor "¿quién soy?". El backend de Citia no
tiene ese endpoint. Entonces el front guarda lo necesario **en el navegador** al iniciar sesión y lo
vuelve a leer después. Analogía: en vez de preguntar en la recepción del hotel cada vez quién eres,
llevas la tarjeta de la pieza en el bolsillo.

### 1. Iniciar sesión

`POST /auth/login` con `{ tenantSlug, email, password }`. El backend responde con el **JWT** (el token
firmado que prueba quién eres) y los datos del usuario. El front guarda dos cosas:

| Clave | Qué guarda | Lo maneja |
|---|---|---|
| `citia.token` | el JWT | `shared/lib/authToken.ts` |
| `citia.user` | el usuario (id, nombre, rol, clínica) | `entities/session/model/storedUser.ts` |

¿Dónde? Depende de **"Mantener sesión iniciada"**:

- marcado → `localStorage`: sobrevive a cerrar el navegador y lo ven las otras pestañas;
- sin marcar → `sessionStorage`: solo esa pestaña, y se borra al cerrarla.

¿Por qué el token está en `shared` y el usuario en `entities`? Por las reglas de FSD: el cliente HTTP
(que está en `shared`) necesita leer el token, y `shared` no puede importar de `entities`. El token es
"infraestructura"; los datos del usuario son "negocio".

### 2. Restaurar la sesión

Antes de **cada** navegación, el guard llama a `restoreSession()`. Solo acepta la sesión si:

- hay token **y** usuario guardados;
- el JWT se puede leer y **no venció** (se lee su `exp`);
- el `sub` del token (el id del usuario) es el mismo id del usuario guardado;
- el rol es uno conocido.

Si algo falla, borra todo y una ruta protegida te manda al login.

Un detalle: el front lee el JWT **sin verificar la firma**. No puede (la clave la tiene solo el
servidor) y no lo necesita: el backend verifica la firma en cada petición. El front lo lee solo para no
restaurar una sesión que el servidor igual va a rechazar. El token dura **1 día** por defecto
(`JWT_EXPIRES_IN` del backend).

### 3. El 401 global

Si una petición **con sesión** recibe un `401` (el backend ya no acepta el token: venció, o cerraste
sesión en otra pestaña), `httpClient` avisa a un manejador que registra `app/providers/index.ts`. Ese
manejador cierra la sesión y te lleva al login recordando dónde estabas. Si fallan varias peticiones a
la vez, solo la primera actúa.

Las llamadas públicas (con `{ auth: false }`, ver más abajo) **no** disparan esto. En el login, por
ejemplo, un 401 significa "correo o contraseña incorrectos", no "se te venció la sesión".

### 4. Cerrar sesión

`cerrarSesion()` (`app/router/cerrarSesion.ts`) borra la sesión y navega al login con una **recarga
completa** de la página (`window.location.assign`), no con el router. ¿Por qué? Porque los *stores* de
Pinia guardan en memoria citas, solicitudes y configuración del usuario anterior. Si otra persona
iniciara sesión en la misma pestaña, podría alcanzar a verlos. Recargar es como, en vez de borrar la
pizarra, cambiarse de sala.

> **Ojo:** cerrar sesión en el front **no invalida el JWT en el servidor**: sigue sirviendo hasta que
> vence. Es una limitación conocida del backend, abierta en la pregunta **Q7** (renovación y revocación
> de sesión) — ver [08-preguntas-abiertas.md](08-preguntas-abiertas.md).

---

## La hora siempre es la de Chile

### La regla

Todas las horas se **muestran** y se **arman** en la zona fija de Chile, nunca en la del navegador:

```ts
// src/shared/config/zonaHoraria.ts
export const ZONA_HORARIA = 'America/Santiago'
export const LOCALE_FECHAS = 'es-CL'
```

Es el **espejo** de `APP_TZ` del backend ([ADR-07](../Decisions/ADR-07.md)), con la que el backend
calcula "hoy" y las horas sin envío de los recordatorios. Si un entorno cambia `APP_TZ`, hay que cambiar
esto también.

### Por qué

Antes el front usaba la zona del navegador ([DTF-07](../../../citia-frontend/context/Deudas/DTF-07.md),
cerrada el 2026-10-06). El problema: si el profesional abre el panel desde otro país, o tiene el
computador mal configurado, una cita de las 10:00 en Chile se le mostraba a otra hora, y al crear una
cita "a las 10:00" se guardaba otro instante. Como el MVP opera **solo en Chile**, se fijó la zona.

Si algún día hay clínicas fuera de Chile, la zona tendría que venir del backend (por ejemplo, en la
respuesta del login). Es un solo punto a cambiar, porque todo pasa por `fecha.ts`.

### Cómo se cumple

- **Todo** lo de fechas pasa por `src/shared/lib/fecha.ts`. Fuera de ahí está prohibido usar
  `getHours()`, `getDate()`, `new Date(año, mes, día)` o `Intl.DateTimeFormat` sueltos, porque usan la
  zona del navegador o se olvidan de ella.
- Se distinguen **dos tipos de dato** que no se mezclan:
  - **instantes** (un `Date` o el ISO que manda el backend, en UTC): se muestran en hora de Chile;
  - **días** (`'2026-09-18'`): se cuentan y formatean sin convertir zonas.

Dos ejemplos que muestran por qué importa:

- `aInicioISO('2026-08-25', '10:00')` → `'2026-08-25T14:00:00.000Z'`: las 10:00 de Chile en agosto
  son las 14:00 UTC (Chile está en UTC−4 en invierno). La función es **segura ante el cambio de
  horario** (Chile pasa de −04 a −03 y vuelta).
- La trampa clásica: `new Date('2026-09-18')` se interpreta como **medianoche UTC**, que en Chile todavía
  es el **17**. Por eso existe `fechaCalendario()`, que usa el mediodía UTC de ese día.

---

## Cómo habla con el backend

### Un solo cliente HTTP

Todas las llamadas pasan por [`src/shared/api/httpClient.ts`](../../../citia-frontend/src/shared/api/httpClient.ts),
que expone `http.get/post/put/patch/delete`. Ese archivo:

- arma la URL con `VITE_API_URL` + la ruta;
- manda y recibe JSON;
- **agrega el `Authorization: Bearer <token>` solo** si hay sesión;
- si la respuesta no es OK, lanza un `HttpError` con el `status` y el cuerpo;
- ante un 401 de una petición con sesión, avisa al manejador global (ver arriba).

Es **solo transporte**: no tiene lógica de negocio. Cada feature tiene su propio `api/` que lo usa
(`crearCitaApi.ts`, `bandejaApi.ts`, `respuestaCitaApi.ts`…).

### `VITE_API_URL`

Es la dirección del backend **incluido el prefijo `/api`**. Por eso en el código las rutas van sin
`/api` (`http.post('/citas', …)`).

- **En local:** va en `.env` (copiado de `.env.example`): `http://localhost:3000/api`.
- **En Netlify:** va como variable de entorno **de cada sitio**, apuntando al backend de Railway de ese
  entorno.
- **Ojo:** Vite la **incrusta al compilar**. Cambiarla en Netlify no sirve hasta el siguiente build. Y si
  falta, el front usa `/api` del mismo dominio, que en Netlify no existe.

### `{ auth: false }` para lo público

Toda llamada a una ruta pública pasa `{ auth: false }`, y entonces el cliente **no adjunta el token**
aunque haya sesión guardada. Hoy son tres:

| Llamada | Feature |
|---|---|
| `POST /auth/login` | `auth` |
| `POST /publico/:tenantSlug/solicitudes` | `crear-cita` (flujo público) |
| `GET /publico/cita` y los `POST /publico/cita/…` | `responder-cita` |

¿Por qué importa? Si el profesional abre su propio enlace público en el mismo navegador donde tiene
sesión, su token no debe viajar a una ruta anónima. Y un 401 en una ruta pública no debe cerrarle la
sesión del panel.

### El contrato y las copias

- El **contrato** de cada endpoint (qué se manda y qué vuelve) se documenta del lado del backend, en
  `context/Features/` (ver [06-features.md](06-features.md)). Varias features del front se construyeron
  **en paralelo** con el backend, contra ese contrato, y por eso toleran que un campo nuevo venga
  ausente.
- El front **no decide reglas de negocio**: qué botones mostrar en una cita lo dice `accionesPermitidas`.
- Hay dos copias **aceptadas a conciencia**: el algoritmo del RUT ([DTF-05](../../../citia-frontend/context/Deudas/DTF-05.md))
  y los largos máximos de los formularios ([DTF-06](../../../citia-frontend/context/Deudas/DTF-06.md)).
  Existen para avisar al usuario mientras escribe; **el backend valida siempre**.

### CORS

El navegador solo deja que el front llame al backend si el dominio del front está en la lista del
backend: `FRONTEND_URL` + `CORS_ORIGENES_EXTRA`. Cada sitio de Netlify tiene que estar en el backend de
su entorno.

> **Detalle en local:** el `FRONTEND_URL` por defecto del backend es `http://localhost:5173`, pero el
> front corre en el **3002**. Revisa el `.env` del backend: `http://localhost:3002` tiene que estar en
> `FRONTEND_URL` o en `CORS_ORIGENES_EXTRA` (el `.env.example` del backend trae un ejemplo comentado).
> Desde la Fase 3, `FRONTEND_URL` además es la base del enlace del paciente
> (`${FRONTEND_URL}/cita#<token>`), así que en local conviene que apunte al 3002.

---

## Las páginas públicas

Las dos se ven sin el sidebar y sin sesión, con el fondo azul de la marca y pensadas primero para el
celular.

### `/agendar-cita/:tenantSlug` — pedir hora

El paciente llena cuatro pasos: **identificación** (RUT, nombre, apellidos) → **contacto** (teléfono,
correo) → **horario** (día y hora que le acomodan) → **motivo** (y el consentimiento). El slug de la
organización va en la URL porque es lo que dice a quién se le está pidiendo hora.

Lo que no hay que romper: **el paciente pide, no reserva** ([ADR-09](../Decisions/ADR-09.md)). El día y
la hora viajan como texto (`preferenciaHoraria`) y el backend responde siempre `202` con el mismo
mensaje. Esta historia (y por qué no se reserva) está en
[09-decisiones-del-frontend.md](09-decisiones-del-frontend.md), FD-01 y FD-03.

El profesional copia su enlace desde `/solicitudes`. Por ahora el botón muestra una advertencia
(`ENLACE_PUBLICO_LISTO = false`) porque la ruta no tenía límite de peticiones
([DT-18](../Deudas/DT-18.md)); la Fase 3 lo implementó y está en producción desde el 2026-10-17, así que la
advertencia ya se puede quitar (falta cambiar la constante a `true`).

### `/cita#<token>` — responder a la cita

Es la página a la que lleva el botón *"Ver o responder mi hora"* del recordatorio. La historia completa
(el token HMAC, las reglas de seguridad, el porqué de cada decisión) está en
[04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md). Lo que conviene saber del lado del front:

- **El token va en el fragmento** (lo que va después del `#`): el navegador no lo manda al servidor que
  sirve el front ni lo pone en el `Referer`.
- **La página lo lee y lo borra de la URL** al abrir (con `router.replace`), y lo guarda **solo en
  memoria**: nada en `localStorage`, `sessionStorage` ni Pinia. Consecuencia buscada: **si recargas la
  página, sale "enlace no válido"**, y la pantalla te dice que lo abras de nuevo desde el correo.
- **Hacia la API viaja en la cabecera `X-Enlace-Cita`**, nunca en la URL de la API. Todas las llamadas
  van con `auth: false`, sin caché y sin *referrer*.
- **Abrir solo lee** (`GET /publico/cita`). Confirmar, cancelar y pedir otra hora son `POST` que se
  disparan después de un clic. Así los antivirus del correo, que abren los enlaces, no confirman nada.
- **Un solo error para todo:** si el enlace no sirve (inválido, invalidado, cita terminada o ya pasada),
  el backend responde el mismo 404 y el paciente ve la misma pantalla. Hay mensajes propios para el 409
  ("esta acción ya no está disponible") y el 429 ("demasiados intentos").
- **Muestra lo mínimo:** fecha, hora, profesional, organización y estado. Nunca el nombre del paciente,
  su RUT, su contacto ni el tipo de consulta (un enlace se puede reenviar).
- **Sin recursos de terceros:** ni fuentes externas, ni analítica, ni imágenes de otro dominio.
- Si el paciente toca el enlace de otro correo y el navegador reutiliza la pestaña, la página vigila el
  fragmento y se vuelve a montar desde cero con el token nuevo (bug encontrado y corregido el
  2026-10-15).

---

## El despliegue: Netlify

| Pieza | Valor |
|---|---|
| Sitios | Uno por entorno: **producción** `app.citiahealth.cl` ← rama `main`; **staging** `citia-staging.netlify.app` ← rama `develop` |
| Build | `npm run build` → carpeta `dist/` |
| Backend | `VITE_API_URL` de cada sitio apunta al backend de Railway de **ese** entorno |
| DNS | Cloudflare, con un CNAME hacia Netlify en modo *DNS only* |
| Plan | Gratuito: ~300 créditos al mes (~15 deploys); al agotarse, **el sitio se pausa** |

Es el mismo Git Flow que el backend: `main` es producción, `develop` es integración (staging), y las
ramas `feature/*` salen de `develop` y vuelven por PR.

### `public/_redirects`: el truco de la SPA

```
/*    /index.html   200
```

En una SPA, `/agenda` no es un archivo en el servidor: es una ruta que resuelve Vue Router **dentro** de
`index.html`. Sin esta línea, entrar directo a `app.citiahealth.cl/agenda` o recargar ahí daría un 404 de
Netlify. Con ella, cualquier ruta devuelve `index.html` y el router decide qué mostrar. Efecto colateral:
una ruta que no existe muestra la página "No encontrada", pero el código HTTP es 200 (es un 404 solo de
la interfaz).

### `public/_headers`: cabeceras para `/cita`

```
/cita
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
```

- `no-referrer`: si la página enlazara a otro sitio, no le cuenta de dónde venía.
- `noindex, nofollow`: le pide a Google y compañía no indexarla.

Que Netlify aplicara estas cabeceras a una ruta que en realidad se sirve reescrita a `index.html` estaba
pendiente de verificar; se comprobó con `curl -I …/cita` el 2026-10-17, en staging y en production: las
aplica.

---

## Sus agentes (`.claude/`)

El front usa el mismo patrón que el backend: un **orquestador** (el agente principal) que no escribe
código, analiza la tarea y la reparte entre sub-agentes, cada uno dueño de una parte de `src/`.

| Agente | Es dueño de |
|---|---|
| `auth-agent` | `src/features/auth/` (el login) |
| `ui-agent` | `src/pages/`, `src/shared/ui/` y los features del panel y del flujo público |
| `shared-agent` | `src/shared/` (menos `ui/`), `src/entities/`, `src/app/`, `public/_redirects` y `.env.example` |

Si un cambio cruza dominios (por ejemplo, un campo nuevo en una entidad que después muestra el voucher),
se reparte **en orden FSD**: primero `shared-agent`, después `ui-agent` o `auth-agent`.

Además hay dos comandos, `/orchestrate` y `/review` (revisión cruzada entre capas), y tres *skills*:
`git-workflow`, `testing` y `linting`. Como no hay tests ni ESLint, las dos últimas se reducen a
`npm run type-check` y a probar en el navegador.

**Contexto por capa:** hay un `CLAUDE.md` en `src/shared/`, `src/entities/`, `src/pages/` y
`src/features/auth/`. Los demás features no tienen el suyo: su contrato y sus decisiones están en
`context/Features/<feature>.md`.

> **Ojo (2026-10-15):** el feature `responder-cita`, la página `cita-paciente` y `public/_headers`, que
> llegaron con la Fase 3, **no aparecen** en las listas de `ui-agent`, `shared-agent` ni del comando
> `/orchestrate`. El `CLAUDE.md` raíz sí los menciona en el árbol, pero ningún agente los tiene asignados.

---

## Sus documentos (`context/` del front)

El `context/` del front es **más delgado a propósito**: las decisiones de arquitectura y de dominio
viven una sola vez, en el backend (los ADR y las FD). En el front solo queda lo propio de la interfaz:
rutas, contrato de integración y los textos que cargan significado.

Índice: [`context/README.md`](../../../citia-frontend/context/README.md).

### `Features/` — lo que está construido

Una por funcionalidad, con qué hace, su contrato con el backend y sus decisiones.

| Documento | De qué trata |
|---|---|
| [login-sesion](../../../citia-frontend/context/Features/login-sesion.md) | Login, sesión persistente, 401 global, cerrar sesión, página "No encontrada" |
| [dashboard-citas-del-dia](../../../citia-frontend/context/Features/dashboard-citas-del-dia.md) | El Resumen: tarjetas, citas de hoy, citas por semana, recordatorios. Sin datos inventados |
| [crear-cita](../../../citia-frontend/context/Features/crear-cita.md) | El modal "+ Nueva cita" del profesional (correo obligatorio desde la Fase 2, bloques 07:00–21:00) |
| [agendar-cita-paciente](../../../citia-frontend/context/Features/agendar-cita-paciente.md) | La página pública para pedir hora |
| [agenda-profesional](../../../citia-frontend/context/Features/agenda-profesional.md) | La agenda semanal y en lista, con aviso de solapamiento ([ADR-11](../Decisions/ADR-11.md)) |
| [bandeja-solicitudes](../../../citia-frontend/context/Features/bandeja-solicitudes.md) | Aceptar y rechazar solicitudes, y copiar el enlace de agenda |
| [gestionar-cita](../../../citia-frontend/context/Features/gestionar-cita.md) | El voucher: reagendar, cancelar, confirmar, asistencia, contacto, y lo de la Fase 3 |
| [recordatorios](../../../citia-frontend/context/Features/recordatorios.md) | Configuración `/recordatorios` y estado de los recordatorios en el voucher |
| [responder-cita-paciente](../../../citia-frontend/context/Features/responder-cita-paciente.md) | La página `/cita` y su reflejo en el voucher y la bandeja (Fase 3) |

### `Deudas/` — lo que falta o está provisional (DTF)

Mismo formato que las DT del backend ([07-deudas-tecnicas.md](07-deudas-tecnicas.md)), con el prefijo
**`DTF-`** para no confundirlas al hablar ("la DT-05" y "la DTF-05" son cosas distintas).

| DTF | Qué era | Estado |
|---|---|---|
| [DTF-01](../../../citia-frontend/context/Deudas/DTF-01.md) | `isAuthenticated` aceptaba una sesión a medias (un `undefined` contaba como sesión) | Cerrada (2026-10-05) |
| [DTF-02](../../../citia-frontend/context/Deudas/DTF-02.md) | Se llamaba a un `GET /me` que el backend no tiene | Cerrada: se borró y la sesión se rehidrata desde el navegador |
| [DTF-03](../../../citia-frontend/context/Deudas/DTF-03.md) | El dashboard mostraba datos de prueba (ausentismo, ingresos, "actividad del motor") | Cerrada: hoy no hay ningún dato inventado |
| [DTF-04](../../../citia-frontend/context/Deudas/DTF-04.md) | El front tenía un rol `recepcion` que el backend no emite | Cerrada: solo `admin` y `profesional` |
| [DTF-05](../../../citia-frontend/context/Deudas/DTF-05.md) | El algoritmo del RUT está duplicado en los dos repos | 🔵 Aceptada: el backend valida siempre; un paquete compartido no se justifica por 40 líneas |
| [DTF-06](../../../citia-frontend/context/Deudas/DTF-06.md) | Los largos máximos y topes (300, 42 días, 1440 min, 100…) copian los del backend | 🔵 Aceptada: si cambian allá, hay que cambiarlos acá |
| [DTF-07](../../../citia-frontend/context/Deudas/DTF-07.md) | Se asumía que la zona del navegador era la de la clínica | Cerrada (2026-10-06): zona fija de Chile |

Hoy no hay ninguna DTF **abierta**: cuatro se cerraron con la limpieza previa al release y la zona
horaria, y dos se aceptaron a conciencia.

### `us/` — planes antes de implementar

Los planes de historias de usuario del lado del front. Cuando una se implementa, su contrato real pasa a
`Features/`.

| Plan | Qué es | Estado |
|---|---|---|
| [06-epic](../../../citia-frontend/context/us/06-epic.md) | US-06: el dashboard de citas del día (criterios de aceptación) | Implementada |
| [02.07](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md) | El paciente confirma, cancela o pide otra hora desde su enlace | Implementada en su v1 (Fase 3) |
| [02.08](../../../citia-frontend/context/us/02.08-voucher-cita.md) | El voucher de la cita para el profesional | Implementada |
| [02.09](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) | Que el dashboard refleje los cambios de una cita | Implementada |

Las `02.NN` son **subtareas** de US-02 (gestión de citas), no historias propias. Ver
[05-historias-de-usuario.md](05-historias-de-usuario.md) para el lado del backend.

### Los otros dos

- [`rf.md`](../../../citia-frontend/context/rf.md): la lista de requisitos funcionales (RF-00 a RF-08),
  la misma idea de producto que en [01-el-producto.md](01-el-producto.md).
- [`stack-tecnologico.md`](../../../citia-frontend/context/stack-tecnologico.md): las elecciones iniciales
  del stack y la sección de despliegue en Netlify.

### Ojo con los estados que dicen los documentos del front

Muchos documentos del front tienen marcas como *"sin commit"* o *"⚠️ verificado solo con respuestas
simuladas"*. Son **fotos del momento en que se escribieron**. Según el [ROADMAP](../ROADMAP.md) del
backend, que es el que manda:

- las Fases 0, 1 y 2 están **en producción**, y lo de la Fase 2 se probó contra el backend real el
  2026-10-07;
- la Fase 3 (la página `/cita`) se verificó **en local de punta a punta**, se mergeó a `develop` el
  2026-10-15 (PR #7 del front) y salió a producción el 2026-10-17 (PR #8).

---

## Lecciones para llevarse

- **Las capas se respetan.** FSD funciona solo si nadie importa "hacia arriba". Antes de crear un
  archivo, pregúntate en qué piso va.
- **La hora es un dato con zona.** Toda fecha pasa por `fecha.ts`; nada de `new Date(año, mes, día)`.
- **Lo público va con `{ auth: false }`.** Siempre.
- **El backend manda.** El front muestra lo que `accionesPermitidas` permite y valida para ayudar al
  usuario, no para proteger el sistema.
- **Sin tests, el build y el navegador son tu red.** `npm run build` antes de cerrar cualquier cambio, y
  probar a mano los casos de error con respuestas simuladas.

---

## Para profundizar

- Entrada del repo: [`citia-frontend/CLAUDE.md`](../../../citia-frontend/CLAUDE.md)
- Contexto por capa: [`src/shared/CLAUDE.md`](../../../citia-frontend/src/shared/CLAUDE.md) ·
  [`src/entities/CLAUDE.md`](../../../citia-frontend/src/entities/CLAUDE.md) ·
  [`src/pages/CLAUDE.md`](../../../citia-frontend/src/pages/CLAUDE.md) ·
  [`src/features/auth/CLAUDE.md`](../../../citia-frontend/src/features/auth/CLAUDE.md)
- Código clave: [router](../../../citia-frontend/src/app/router/index.ts) ·
  [httpClient](../../../citia-frontend/src/shared/api/httpClient.ts) ·
  [zonaHoraria](../../../citia-frontend/src/shared/config/zonaHoraria.ts) ·
  [`_redirects`](../../../citia-frontend/public/_redirects) · [`_headers`](../../../citia-frontend/public/_headers)
- Documentos del front: [context/README](../../../citia-frontend/context/README.md) ·
  [Features](../../../citia-frontend/context/Features/README.md) ·
  [Deudas](../../../citia-frontend/context/Deudas/README.md) ·
  [stack-tecnologico](../../../citia-frontend/context/stack-tecnologico.md)
- Agentes: [`.claude/agents/`](../../../citia-frontend/.claude/agents/)
- Del lado del backend: [ADR-07](../Decisions/ADR-07.md) (zona horaria) ·
  [ADR-09](../Decisions/ADR-09.md) (vía pública) · [ADR-10](../Decisions/ADR-10.md) (enlace por cita) ·
  [stack-tecnologico](../stack-tecnologico.md) (entornos)
- En esta carpeta: [04b-fase-3-a-fondo.md](04b-fase-3-a-fondo.md) ·
  [09-decisiones-del-frontend.md](09-decisiones-del-frontend.md) · [11-glosario.md](11-glosario.md)
