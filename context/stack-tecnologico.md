1. Base de datos: Utilizaremos postgresql Integridad relacional + ACID + **Row-Level Security** para el aislamiento multi-tenant (RNF-02).
2. Frontend: 
	1. Vue: Familiaridad y curva de aprendizaje mas suave
	2. Gestion de estado: Pinia ya que es el mas popular y recomendado por vue
	3. Estilos y ui: prime vue o vuetify
	4. Conexión a api: Fetch
3. Backend: 
	1. NestJs: encajamos con una arquitectura limpia basada en hexagonal architecture 
		2. ORM: TypeORM (definitivo, ADR-00). `synchronize: false` en dev/prod. Migraciones versionadas siempre.
4. Worker/cola: redis RNF-03, necesitaremos Bullmq
5. Observabilidad: logs estructurados + una alerta cuando la tasa de fallo de recordatorios cruce un umbral, y **Sentry** (hosted) para errores. 
6. Despliegue:
	1. Lado del cliente: netlify
	2. Lado del servidor: por el momento ocuparemos un paas -> railway gracias a su despliegue con docker, pero mas adelante seria bueno un vps como digital ocean. Imagen Docker multi-stage + migraciones en el arranque del contenedor (ADR-05).
7. Arquitectura: Monolito + clean architecture (hexagonal, ADR-02)
8. TLS: Cloudflare
9. Autenticacion: JWT + passport (ADR-01)
10. Zona horaria: `APP_TZ` (default America/Santiago); día/hora del dashboard calculados en la zona de la clínica, DST-safe con `Intl` (ADR-07)

---

## Decisiones relacionadas (ADRs)

Índice completo en [`Decisions/README.md`](./Decisions/README.md); trazabilidad commit ↔ doc en
[`TRAZABILIDAD.md`](./TRAZABILIDAD.md).

- ADR-00 TypeORM · ADR-01 Auth JWT · ADR-02 Español+hexagonal · ADR-03 Login por slug
- ADR-04 Máquina de estados de Cita · **ADR-05 Docker** · **ADR-06 Atomicidad transaccional** · **ADR-07 Zona horaria**