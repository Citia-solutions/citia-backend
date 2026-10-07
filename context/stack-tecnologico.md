1. Base de datos: Utilizaremos postgresql Integridad relacional + ACID + **Row-Level Security** para el aislamiento multi-tenant (RNF-02).
2. Frontend: 
	1. Vue: Familiaridad y curva de aprendizaje mas suave
	2. Gestion de estado: Pinia ya que es el mas popular y recomendado por vue
	3. Estilos y ui: prime vue o vuetify
	4. Conexión a api: Fetch
3. Backend: 
	1. NestJs: encajamos con una arquitectura limpia basada en hexagonal architecture 
		2. ORM: TypeORM (definitivo, ADR-00). `synchronize: false` en dev/prod. Migraciones versionadas siempre.
4. Worker/cola (actualizado 2026-09-30, ADR-12): **cola sobre Postgres, sin Redis ni BullMQ por ahora.**
	1. Hechos de dominio: tabla de salida (`eventos_salida`, outbox) escrita en la misma transacción que el cambio.
	2. Planificador dentro del proceso con `@nestjs/schedule`; exclusión entre instancias con `FOR UPDATE SKIP LOCKED` (y candado consultivo para las tareas de un solo ejecutor).
	3. Requisito: el contenedor del backend **siempre encendido** (en Railway, "App Sleeping" desactivado). Una plataforma que apague el contenedor sin tráfico rompe este diseño.
	4. Evolución prevista: BullMQ + Redis (alimentado desde el outbox) o pg-boss, cuando crezcan el volumen o los tipos de trabajo. RNF-03 se cumple hoy con la cola en Postgres.
5. Correo transaccional (2026-09-30, ADR-13): **Resend**, detrás del puerto `CanalMensajeria`. Un solo remitente para toda la plataforma ("Citia <recordatorios@notificaciones.<dominio>>", desde un subdominio de envío). Webhooks de entrega firmados. Descartados: Brevo, SendGrid. WhatsApp y SMS, después, como otro adaptador. *(2026-10-04: implementado con el SDK `resend` 6.32 y `svix` 1.x; el dominio es **`citiahealth.cl`**, ya delegado a Cloudflare; falta verificar el subdominio de envío.)* *(2026-10-07: **en producción**: `notificaciones.citiahealth.cl` verificado en Resend, región São Paulo; production envía con `MENSAJERIA_ADAPTADOR=resend` y recibe el webhook; staging sigue con `registro`. Ver [Infraestructura en producción](#infraestructura-en-producción-2026-10-07).)*
6. Observabilidad (actualizado 2026-09-30): **Better Stack** (plan gratis) para uptime, latido (heartbeat) de los jobs, logs y alertas. Logs JSON con `pino` (`nestjs-pino`) con redacción de credenciales y datos personales; OpenTelemetry opcional. Estándares abiertos para poder sumar Grafana sin tocar código. Alerta cuando la tasa de fallo de recordatorios cruce un umbral (RNF-08). **Sentry, descartado.** *(2026-10-04: implementado en la rama de la Fase 2 —pino, `GET /api/health`, latidos, alertas por log—; falta crear la cuenta de Better Stack.)* *(2026-10-07: cuenta creada; monitor de `/api/health` y los dos heartbeats en Up, alertas por correo; **falta la fuente de logs**, sin la cual las alertas por log no salen de Railway ([DT-19](Deudas/DT-19.md)).)*
7. Despliegue:
	1. Lado del cliente: **Netlify** — la SPA Vue completa, incluido `/agendar-cita`, con *fallback* de SPA a `index.html` (`public/_redirects`). *(Historia: el 2026-09-30 se eligió Cloudflare Workers Static Assets y se descartó Netlify; el **2026-10-04 el usuario lo revirtió**: el frontend se queda en Netlify y Cloudflare queda solo como DNS. Un sitio por entorno —`develop` → staging, `main` → producción—, con `VITE_API_URL` como variable del sitio porque Vite la incrusta al compilar. Ver [Despliegue del frontend](#despliegue-del-frontend-netlify).)* *(2026-10-07: publicado: `app.citiahealth.cl` ← `main` y `citia-staging.netlify.app` ← `develop`.)*
	2. Lado del servidor: backend + Postgres en **Railway** (Docker, ADR-05), siempre encendido. Más adelante, un VPS (DigitalOcean). Imagen Docker multi-stage + migraciones en el arranque del contenedor (ADR-05). *(2026-10-07: un entorno por rama —staging ← `develop`, production ← `main`— del repo `Citia-solutions/citia-backend`, cada uno con su Postgres. Ver [Mapa de entornos](#mapa-de-entornos).)*
	3. CORS: lista de orígenes, no un solo `FRONTEND_URL`. *(2026-10-04: implementado: `FRONTEND_URL` canónico + `CORS_ORIGENES_EXTRA` con orígenes exactos y un único comodín `https://*.<proyecto>.pages.dev`, pensado para Cloudflare Pages. Con el frontend en **Netlify**, cada sitio va en el `FRONTEND_URL` de su entorno y las *deploy previews* (`deploy-preview-N--<sitio>.netlify.app`), si se usan, como orígenes exactos.)* *(2026-10-07: las vistas previas están apagadas, así que `CORS_ORIGENES_EXTRA` no se usa.)*
8. Arquitectura: Monolito + clean architecture (hexagonal, ADR-02)
9. TLS y DNS: Cloudflare (también el DNS del subdominio de envío: SPF, DKIM y DMARC para Resend). *(2026-10-07: registros de Resend y de Netlify cargados; **falta DMARC** ([DT-41](Deudas/DT-41.md)). Lista en [Infraestructura en producción](#infraestructura-en-producción-2026-10-07).)*
10. Autenticacion: JWT + passport (ADR-01)
11. Zona horaria: `APP_TZ` (default America/Santiago); día/hora del dashboard calculados en la zona de la clínica, DST-safe con `Intl` (ADR-07). Los recordatorios usan la misma zona para las horas sin envío y el texto del correo.

---

## Modo prueba

El piloto arranca con planes gratis (decisión del 2026-09-30). Los límites están tomados de las
páginas de precios de cada proveedor a esa fecha; **verificarlos al crear cada cuenta**.

| Servicio | Plan | Límite que importa | Costo |
|---|---|---|---|
| Railway (backend + Postgres) | Hobby | recursos del plan; servicio siempre encendido | ~CLP 6.000–8.000 al mes (estimado) |
| Resend (correo) | Free | **3.000 correos al mes y 100 al día**, un dominio | CLP 0 |
| Better Stack (observabilidad) | Free | monitores, heartbeats y retención de logs acotados | CLP 0 |
| Netlify (SPA) | Free | ~300 créditos/mes (~15 deploys); **al agotarse, el sitio se pausa**. Los créditos se comparten con los demás sitios del equipo; por eso las *deploy previews* y los *branch deploys* están apagados | CLP 0 (Personal US$9/mes si hace falta) |
| Cloudflare (DNS, TLS) | Free | — | CLP 0 |
| Dominio `.cl` (NIC Chile) | — | `citiahealth.cl`, comprado en Hostinger; **vence el 2027-10-01** | ~CLP 11.829 al año |

**Lo que eso alcanza.** Con dos recordatorios por cita, el tope de 100 correos al día da **unas 50
citas al día en toda la plataforma**: unos 9 profesionales con 5–6 citas diarias. El tope mensual
(3.000) cubre ~68 citas por día hábil, así que **el diario muerde primero**. Configurar un solo
recordatorio por cita duplica la capacidad ([ADR-13 §11](Decisions/ADR-13.md)).

**Cuándo pasar a pago:**

| Señal | Paso | Costo |
|---|---|---|
| El aviso del 80 % de la cuota diaria salta tres días de una misma semana, o hay más de ~9 profesionales activos | Resend Pro | US$20 al mes |
| Hace falta más de una réplica del backend, más recursos o separar el planificador en un segundo servicio | Railway Pro | US$20 al mes |
| La retención de logs o las alertas del plan gratis no alcanzan para investigar un incidente | Better Stack de pago | según plan |

**Antes de enviar el primer correo a un paciente real:** dominio comprado y verificado en Resend,
seguimiento de aperturas y clics desactivado, "App Sleeping" apagado en Railway, y un latido y una
alerta de prueba recibidos en Better Stack. *(2026-10-04: el dominio `citiahealth.cl` ya está comprado y
delegado; el resto, en el
[checklist de salida a producción](Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción).)*
*(2026-10-07: hecho; el primer correo real llegó a la bandeja de entrada. Quedan sin confirmar el
seguimiento apagado ([DT-41](Deudas/DT-41.md)), "App Sleeping" en el panel y la alerta de prueba
([DT-19](Deudas/DT-19.md)).)*

> **Datos de Resend confirmados al implementar (2026-10-03):** la cuota diaria se cuenta por **día UTC**;
> la clave de idempotencia dura **24 h**; el límite es de **10 peticiones por segundo** (el envío hace una
> pausa de 500 ms, así que va a 2 por segundo). **Sin confirmar:** cuándo reinicia la cuota **mensual**
> del plan gratis ([Q15](PREGUNTAS-ABIERTAS.md#q15--cuándo-reinicia-resend-la-cuota-mensual-del-plan-gratis)).

---

## Dependencias instaladas (2026-10-04)

Versiones resueltas en `package-lock.json` de la rama `feature/fase2-recordatorios` (hoy en `develop` y en
`main`). En negrita, las que trajo la Fase 2.

| Paquete | Versión | Para qué | Nota |
|---|---|---|---|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | 11.1.27 | framework | |
| `@nestjs/config` | 4.0.4 | variables de entorno | desde la Fase 2 con `validate` propio (`entorno.ts`), sin Joi |
| `@nestjs/typeorm` · `typeorm` · `pg` | 11.0.2 · 1.0.0 · 8.22.0 | persistencia (ADR-00) | |
| `@nestjs/jwt` · `@nestjs/passport` · `passport-jwt` · `bcrypt` | 11.0.2 · 11.0.5 · 4.0.1 · 6.0.0 | autenticación (ADR-01) | |
| `class-validator` · `class-transformer` | 0.15.1 · 0.5.1 | DTOs | |
| **`@nestjs/schedule`** | 6.1.3 | planificador en proceso (ADR-12) | |
| **`cron`** | **4.4.0 (fijado)** | jobs con `CronJob.from` y zona `APP_TZ` | sin `^`: es la versión exacta que pide `@nestjs/schedule` 6.1.3 |
| **`nestjs-pino`** · **`pino`** · **`pino-http`** | 5.2.1 · 10.3.1 · 11.0.0 | logs JSON con redacción (ADR-13 §16) | |
| **`@logtail/pino`** | 0.5.11 | copia de los logs a Better Stack | solo si hay `BETTERSTACK_SOURCE_TOKEN` |
| **`resend`** | 6.32.0 | SDK del proveedor de correo (ADR-13 §8) | |
| **`svix`** | **1.99.1 (1.x)** | firma de los webhooks de Resend | la 2.x es solo ESM y Jest (CommonJS) no la carga |
| **`pino-pretty`** (dev) | 13.1.3 | logs legibles en desarrollo | no está en la imagen de producción: allí cae a JSON |
| `jest` · `ts-jest` · `supertest` (dev) | 30.4.2 · 29.4.11 · 7.2.2 | tests | e2e con `maxWorkers: 1`; integración con `--runInBand` |
| `typescript` (dev) | 5.9.3 | | el CLAUDE.md raíz dice 5.7: es el mínimo del rango `^5.7.3` |

**No** se instalaron Redis, BullMQ, OpenTelemetry, Joi ni Sentry.

---

## Despliegue del frontend: Netlify

*(2026-10-04, decisión del usuario; reemplaza la configuración de Cloudflare Workers de `citia-frontend`
`f98f760`.)* La SPA se publica en **Netlify**; Cloudflare queda solo como DNS de `citiahealth.cl`.

| Pieza | Valor |
|---|---|
| Rutas de la SPA | `public/_redirects` con `/*  /index.html  200`: `/agenda`, `/recordatorios`, `/agendar-cita/<slug>` devuelven `index.html` y las resuelve vue-router |
| Sitios | uno por entorno: **staging** ← `develop` y **producción** ← `main`. *(2026-10-07, lo real: producción es el sitio `app.citiahealth.cl` —el `citia` original— con dominio propio por CNAME en Cloudflare, modo *DNS only*; staging es el sitio `citia-staging`, **sin dominio propio**, en `citia-staging.netlify.app`. El `staging.citiahealth.cl` previsto no se creó.)* |
| URL de la API | `VITE_API_URL` como variable del sitio (Vite la incrusta al compilar), apuntando al backend de Railway del mismo entorno |
| CORS en el backend | el dominio de cada sitio en el `FRONTEND_URL` de su entorno (sin ruta) |
| Plan | Free (~15 deploys al mes; al agotarse el sitio se pausa) |

Detalle en `citia-frontend/context/stack-tecnologico.md`.

---

## Mapa de entornos

*(2026-10-07.)* Git Flow: `develop` se despliega en **staging** y `main` en **production**, en los dos repos.
Una feature llega a producción solo con un release `develop` → `main`. Sin secretos: donde dice "secreto",
el valor vive solo en el panel del proveedor.

| Servicio | staging | production |
|---|---|---|
| Rama de Git (backend y frontend) | `develop` | `main` |
| Backend — Railway | entorno `staging`, servicio `citia-backend`, repo `Citia-solutions/citia-backend` | entorno `production`, mismo servicio y repo |
| URL del backend | dominio que asigna Railway | dominio que asigna Railway (no hay registro `api` en Cloudflare) |
| Base de datos — Railway | Postgres propio | Postgres propio; base nueva desde el 2026-10-04 |
| Variables `DB_*` | referencias al Postgres del entorno (`${{Postgres.PGHOST}}`, …) | ídem |
| `NODE_ENV` | `production` (lo fija la imagen) | `production` |
| `JWT_SECRET` | propio (secreto) | propio, 32 caracteres o más (secreto) |
| Frontend — Netlify | sitio `citia-staging` | sitio `app.citiahealth.cl` (el `citia` original) |
| URL del frontend | `https://citia-staging.netlify.app` | `https://app.citiahealth.cl` |
| `VITE_API_URL` (Netlify) | backend de staging | backend de production |
| `FRONTEND_URL` (backend) | origen del sitio de staging *(a confirmar en Railway)* | `https://app.citiahealth.cl` |
| `MENSAJERIA_ADAPTADOR` | `registro` (no envía; marca *Enviado*, [DT-40](Deudas/DT-40.md)) | `resend` |
| Resend | — | dominio `notificaciones.citiahealth.cl`; clave y secreto del webhook (secretos); `CORREO_DOMINIO=notificaciones.citiahealth.cl` |
| Webhook de Resend | — | hacia `/api/webhooks/resend` del backend de production |
| Better Stack | — | monitor de `/api/health`; heartbeats `citia-prod-recordatorios` y `citia-prod-eventos` (URL secretas) |
| Logs | Railway | Railway; fuente de Better Stack **pendiente** ([DT-19](Deudas/DT-19.md)) |
| *Deploy previews* y *branch deploys* (Netlify) | apagados | apagados |

---

## Infraestructura en producción (2026-10-07)

Estado real tras el release de la Fase 2 y la prueba de punta a punta
([cierre de la Fase 2](Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07)).

**Railway.** Un proyecto con el servicio `citia-backend` y un `Postgres` por entorno: **staging** ←
`develop` y **production** ← `main`, los dos del repo de la organización `Citia-solutions/citia-backend`.
Hasta el 2026-10-04 el servicio estaba conectado al repo personal `BasthianAlejandr0/citia-backend`,
congelado en agosto; se corrigió al crear los entornos. Las `DB_*` son referencias al Postgres de cada
entorno; production arrancó con una base nueva y el `entrypoint.sh` aplica las migraciones al arrancar.
"App Sleeping" debe estar apagado ([ADR-12 §7](Decisions/ADR-12.md)): falta confirmarlo en el panel.

**Netlify.** Dos sitios. `app.citiahealth.cl` (el sitio `citia` original) ← `main`, con el dominio
`app.citiahealth.cl` y `VITE_API_URL` apuntando al backend de production. `citia-staging` ← `develop`, en
`citia-staging.netlify.app`, con `VITE_API_URL` apuntando al backend de staging. Los dos con
`public/_redirects`. *Deploy previews* y *branch deploys* apagados para no gastar créditos. El 2026-10-07 se
corrigió una configuración cruzada (staging compilaba contra production y production desplegaba
`develop`).

**Cloudflare** (DNS de `citiahealth.cl`):

| Registro | Tipo | Para qué | Estado |
|---|---|---|---|
| `app` | CNAME → Netlify, **solo DNS** | frontend de production | ✅ |
| `send`, `rsend` | CNAME | Resend, subdominio de envío `notificaciones.citiahealth.cl` | ✅ |
| DKIM de Resend | TXT | firma del correo | ✅ |
| verificación de Netlify | TXT | propiedad del dominio para Netlify | ✅ |
| `_dmarc.notificaciones` | TXT `v=DMARC1; p=none;` | política DMARC del subdominio de envío | ⬜ **falta** ([DT-41](Deudas/DT-41.md)) |
| raíz y `www` | — | hoy muestran la página estacionada de Hostinger | ⬜ opcional: redirigir a `app.citiahealth.cl` |

**Resend.** Dominio `notificaciones.citiahealth.cl` **verificado**, región São Paulo, plan Free. Production
con `MENSAJERIA_ADAPTADOR=resend`, su clave de API, el secreto del webhook y `CORREO_DOMINIO`; el webhook
apunta a production con los eventos `email.*`. Remitente: `Citia <recordatorios@notificaciones.citiahealth.cl>`.
Staging no usa Resend (sigue con `registro`). Sin confirmar: el seguimiento de aperturas y clics apagado
([DT-41](Deudas/DT-41.md)).

**Better Stack.** Plan Free. Monitor de uptime sobre `GET /api/health` de production; heartbeats
`citia-prod-recordatorios` (job de envío, cada minuto) y `citia-prod-eventos` (despachador del outbox,
`salida` en el código), los dos en **Up**. Alertas por correo: las llamadas a teléfonos de Chile no están
habilitadas en la cuenta. **Pendiente:** la fuente de logs ([DT-19](Deudas/DT-19.md)).

**Dominio.** `citiahealth.cl`, comprado en **Hostinger** y registrado en **NIC Chile**; **vence el
2027-10-01**. Su DNS está delegado a Cloudflare. Si vence, se caen a la vez el frontend
(`app.citiahealth.cl`) y el remitente de los recordatorios: conviene renovarlo con margen.

---

## Decisiones relacionadas (ADRs)

Índice completo en [`Decisions/README.md`](./Decisions/README.md); trazabilidad commit ↔ doc en
[`TRAZABILIDAD.md`](./TRAZABILIDAD.md). Por fase: los puntos 1–3, 8 y 10 vienen de
[Fundaciones](./Fases/fase-base-fundaciones.md), el 11 de la [Fase 0](./Fases/fase-0-us06-dashboard.md),
y los puntos 4–7, 9 y el *Modo prueba* los actualizó la [Fase 2](./Fases/fase-2-us03-recordatorios.md)
el 2026-09-30; el 2026-10-04 se sumaron las dependencias instaladas, el despliegue del frontend y las
notas de implementación; el 2026-10-07, el mapa de entornos y la infraestructura en producción.

- ADR-00 TypeORM · ADR-01 Auth JWT · ADR-02 Español+hexagonal · ADR-03 Login por slug
- ADR-04 Máquina de estados de Cita · **ADR-05 Docker** · **ADR-06 Atomicidad transaccional** · **ADR-07 Zona horaria**
- **ADR-12 Outbox + planificador en Postgres** · **ADR-13 Recordatorios por correo (Resend)**
