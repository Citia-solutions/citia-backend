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
5. Correo transaccional (2026-09-30, ADR-13): **Resend**, detrás del puerto `CanalMensajeria`. Un solo remitente para toda la plataforma ("Citia <recordatorios@notificaciones.<dominio>>", desde un subdominio de envío). Webhooks de entrega firmados. Descartados: Brevo, SendGrid. WhatsApp y SMS, después, como otro adaptador. *(2026-10-04: implementado con el SDK `resend` 6.32 y `svix` 1.x; el dominio es **`citiahealth.cl`**, ya delegado a Cloudflare; falta verificar el subdominio de envío.)*
6. Observabilidad (actualizado 2026-09-30): **Better Stack** (plan gratis) para uptime, latido (heartbeat) de los jobs, logs y alertas. Logs JSON con `pino` (`nestjs-pino`) con redacción de credenciales y datos personales; OpenTelemetry opcional. Estándares abiertos para poder sumar Grafana sin tocar código. Alerta cuando la tasa de fallo de recordatorios cruce un umbral (RNF-08). **Sentry, descartado.** *(2026-10-04: implementado en la rama de la Fase 2 —pino, `GET /api/health`, latidos, alertas por log—; falta crear la cuenta de Better Stack.)*
7. Despliegue:
	1. Lado del cliente: **Netlify** — la SPA Vue completa, incluido `/agendar-cita`, con *fallback* de SPA a `index.html` (`public/_redirects`). *(Historia: el 2026-09-30 se eligió Cloudflare Workers Static Assets y se descartó Netlify; el **2026-10-04 el usuario lo revirtió**: el frontend se queda en Netlify y Cloudflare queda solo como DNS. Un sitio por entorno —`develop` → staging, `main` → producción—, con `VITE_API_URL` como variable del sitio porque Vite la incrusta al compilar. Ver [Despliegue del frontend](#despliegue-del-frontend-netlify).)*
	2. Lado del servidor: backend + Postgres en **Railway** (Docker, ADR-05), siempre encendido. Más adelante, un VPS (DigitalOcean). Imagen Docker multi-stage + migraciones en el arranque del contenedor (ADR-05).
	3. CORS: lista de orígenes, no un solo `FRONTEND_URL`. *(2026-10-04: implementado: `FRONTEND_URL` canónico + `CORS_ORIGENES_EXTRA` con orígenes exactos y un único comodín `https://*.<proyecto>.pages.dev`, pensado para Cloudflare Pages. Con el frontend en **Netlify**, cada sitio va en el `FRONTEND_URL` de su entorno y las *deploy previews* (`deploy-preview-N--<sitio>.netlify.app`), si se usan, como orígenes exactos.)*
8. Arquitectura: Monolito + clean architecture (hexagonal, ADR-02)
9. TLS y DNS: Cloudflare (también el DNS del subdominio de envío: SPF, DKIM y DMARC para Resend).
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
| Netlify (SPA) | Free | ~300 créditos/mes (~15 deploys); **al agotarse, el sitio se pausa** | CLP 0 (Personal US$9/mes si hace falta) |
| Cloudflare (DNS, TLS) | Free | — | CLP 0 |
| Dominio `.cl` (NIC Chile) | — | necesario para verificar el remitente en Resend | ~CLP 11.829 al año |

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

> **Datos de Resend confirmados al implementar (2026-10-03):** la cuota diaria se cuenta por **día UTC**;
> la clave de idempotencia dura **24 h**; el límite es de **10 peticiones por segundo** (el envío hace una
> pausa de 500 ms, así que va a 2 por segundo). **Sin confirmar:** cuándo reinicia la cuota **mensual**
> del plan gratis ([Q15](PREGUNTAS-ABIERTAS.md#q15--cuándo-reinicia-resend-la-cuota-mensual-del-plan-gratis)).

---

## Dependencias instaladas (2026-10-04)

Versiones resueltas en `package-lock.json` de la rama `feature/fase2-recordatorios`. En negrita, las que
trajo la Fase 2.

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
| Sitios | uno por entorno: **staging** ← `develop` (`staging.citiahealth.cl`) y **producción** ← `main` (`app.citiahealth.cl`), con CNAME en Cloudflare en modo *DNS only* |
| URL de la API | `VITE_API_URL` como variable del sitio (Vite la incrusta al compilar), apuntando al backend de Railway del mismo entorno |
| CORS en el backend | el dominio de cada sitio en el `FRONTEND_URL` de su entorno (sin ruta) |
| Plan | Free (~15 deploys al mes; al agotarse el sitio se pausa) |

Detalle en `citia-frontend/context/stack-tecnologico.md`.

---

## Decisiones relacionadas (ADRs)

Índice completo en [`Decisions/README.md`](./Decisions/README.md); trazabilidad commit ↔ doc en
[`TRAZABILIDAD.md`](./TRAZABILIDAD.md). Por fase: los puntos 1–3, 8 y 10 vienen de
[Fundaciones](./Fases/fase-base-fundaciones.md), el 11 de la [Fase 0](./Fases/fase-0-us06-dashboard.md),
y los puntos 4–7, 9 y el *Modo prueba* los actualizó la [Fase 2](./Fases/fase-2-us03-recordatorios.md)
el 2026-09-30; el 2026-10-04 se sumaron las dependencias instaladas, el despliegue del frontend y las
notas de implementación.

- ADR-00 TypeORM · ADR-01 Auth JWT · ADR-02 Español+hexagonal · ADR-03 Login por slug
- ADR-04 Máquina de estados de Cita · **ADR-05 Docker** · **ADR-06 Atomicidad transaccional** · **ADR-07 Zona horaria**
- **ADR-12 Outbox + planificador en Postgres** · **ADR-13 Recordatorios por correo (Resend)**
