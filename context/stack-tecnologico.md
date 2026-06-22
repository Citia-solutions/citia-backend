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
	2. Lado del servidor: por el momento ocuparemos un paas -> railway gracias a su despliegue con docker, pero mas adelante seria bueno un vps como digital ocean
7. Arquitectura: Monolito + clean architecture
8. TLS: Cloudflare
9. Autenticacion: JWT + passport