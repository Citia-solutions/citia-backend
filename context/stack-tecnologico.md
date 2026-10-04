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
5. Correo transaccional (2026-09-30, ADR-13): **Resend**, detrás del puerto `CanalMensajeria`. Un solo remitente para toda la plataforma ("Citia <recordatorios@notificaciones.<dominio>>", desde un subdominio de envío). Webhooks de entrega firmados. Descartados: Brevo, SendGrid. WhatsApp y SMS, después, como otro adaptador.
6. Observabilidad (actualizado 2026-09-30): **Better Stack** (plan gratis) para uptime, latido (heartbeat) de los jobs, logs y alertas. Logs JSON con `pino` (`nestjs-pino`) con redacción de credenciales y datos personales; OpenTelemetry opcional. Estándares abiertos para poder sumar Grafana sin tocar código. Alerta cuando la tasa de fallo de recordatorios cruce un umbral (RNF-08). **Sentry, descartado.**
7. Despliegue:
	1. Lado del cliente: **Cloudflare** (Workers Static Assets o Pages) — la SPA Vue completa, incluido `/agendar-cita`, con *fallback* de SPA a `index.html`. **Netlify, descartado** (2026-09-30).
	2. Lado del servidor: backend + Postgres en **Railway** (Docker, ADR-05), siempre encendido. Más adelante, un VPS (DigitalOcean). Imagen Docker multi-stage + migraciones en el arranque del contenedor (ADR-05).
	3. CORS: lista de orígenes (producción + vistas previas de Cloudflare), no un solo `FRONTEND_URL`.
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
| Cloudflare (SPA, DNS, TLS) | Free | — | CLP 0 |
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
alerta de prueba recibidos en Better Stack.

---

## Decisiones relacionadas (ADRs)

Índice completo en [`Decisions/README.md`](./Decisions/README.md); trazabilidad commit ↔ doc en
[`TRAZABILIDAD.md`](./TRAZABILIDAD.md). Por fase: los puntos 1–3, 8 y 10 vienen de
[Fundaciones](./Fases/fase-base-fundaciones.md), el 11 de la [Fase 0](./Fases/fase-0-us06-dashboard.md),
y los puntos 4–7, 9 y el *Modo prueba* los actualizó la [Fase 2](./Fases/fase-2-us03-recordatorios.md)
el 2026-09-30.

- ADR-00 TypeORM · ADR-01 Auth JWT · ADR-02 Español+hexagonal · ADR-03 Login por slug
- ADR-04 Máquina de estados de Cita · **ADR-05 Docker** · **ADR-06 Atomicidad transaccional** · **ADR-07 Zona horaria**
- **ADR-12 Outbox + planificador en Postgres** · **ADR-13 Recordatorios por correo (Resend)**
