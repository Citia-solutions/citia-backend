# Cómo está armado Citia

**Qué vas a entender acá.** Con qué está hecho el backend, cómo se ordena el código (la arquitectura
hexagonal), qué hace cada módulo, cómo se separan los datos de cada cliente, cómo se avisan cosas los
módulos entre sí, dónde corre todo (staging y production) y cómo trabaja el equipo día a día.

**Antes conviene leer.** [01 — El producto](01-el-producto.md), para saber qué problema resuelve todo
esto. Los términos técnicos están en el [glosario](11-glosario.md).

---

## El mapa general

```
  Paciente / profesional
          │  (navegador)
          ▼
  Frontend Vue (Netlify)  ── app.citiahealth.cl
          │  HTTPS, /api/...
          ▼
  Backend NestJS (Railway) ──── Postgres (Railway, uno por entorno)
          │        ▲
          │        └── webhooks de entrega
          ▼
  Resend (envía los correos)

  Better Stack vigila que el backend esté vivo · Cloudflare maneja el DNS de citiahealth.cl
```

Son **dos repositorios**: este (`citia-backend`, la API) y `citia-frontend` (la aplicación web en
Vue). Este documento es del backend; el frontend se explica en [10 — El frontend](10-el-frontend.md).

## El stack, pieza por pieza

| Pieza | Qué es | Para qué se usa acá |
|---|---|---|
| **Node 22** | El entorno que ejecuta JavaScript en el servidor | La imagen Docker parte de `node:22-alpine` |
| **TypeScript** | JavaScript con tipos | Todo el código. Versión 5.9 (el rango de `package.json` es `^5.7.3`) |
| **NestJS 11** | Framework para APIs en Node, con módulos e inyección de dependencias | Rutas HTTP, guards, validación y el armado de piezas |
| **PostgreSQL** | Base de datos relacional | Todo se guarda acá, incluida la cola de trabajos (no hay Redis) |
| **TypeORM** | El ORM: traduce entre clases de TypeScript y tablas | Entidades y migraciones. Siempre con `synchronize: false` ([ADR-00](../Decisions/ADR-00.md)) |
| **Passport + JWT** | Autenticación con tokens firmados | El login entrega un token que se manda en cada petición ([ADR-01](../Decisions/ADR-01.md)) |
| **class-validator** | Validación por decoradores | Revisa el cuerpo de cada petición antes de llegar a la lógica |
| **@nestjs/schedule** | Tareas programadas dentro del proceso | El "planificador" ([ADR-12](../Decisions/ADR-12.md)) |
| **@nestjs/throttler** | Límite de tasa | Frena a quien hace demasiadas peticiones (Fase 3) |
| **pino** | Logs en formato JSON | Con redacción de datos sensibles |
| **resend** + **svix** | SDK del proveedor de correo y verificación de firmas | Enviar recordatorios y validar sus webhooks ([ADR-13](../Decisions/ADR-13.md)) |
| **Jest** + **Supertest** | Tests | Unitarios, e2e (por HTTP) y de integración (contra Postgres) |

Igual de importante es **lo que no está**: no hay Redis, ni BullMQ, ni Sentry, ni OpenTelemetry. Fue
una decisión: con Postgres alcanza para la cola de trabajos a este volumen, y cada servicio extra es algo
más que pagar y operar ([stack](../stack-tecnologico.md)).

## La arquitectura hexagonal

### La idea, con una analogía

Piensa en un secador de pelo que llevas de viaje. El secador (tu lógica de negocio) no cambia según el
país; lo que cambia es el **adaptador** del enchufe. El secador solo exige un **enchufe estándar** (el
"puerto"), y en cada país pones el adaptador que corresponda.

En Citia pasa lo mismo:

- La **lógica de negocio** (qué es una cita, cuándo se puede cancelar) no sabe nada de Postgres, de
  NestJS ni de Resend.
- Esa lógica declara lo que necesita con **puertos**: "necesito algo que guarde citas", "necesito algo
  que envíe un correo".
- La **infraestructura** pone los **adaptadores**: uno que guarda con TypeORM, otro que envía con
  Resend, otro que "envía" escribiendo en el log (para staging y tests).

Así puedes cambiar Resend por WhatsApp, o Postgres por una base en memoria para los tests, sin tocar la
lógica. Esta decisión es el [ADR-02](../Decisions/ADR-02.md) (vigente desde el 2026-06-22).

### Las cuatro carpetas de cada módulo

```
src/modules/<modulo>/
├── domain/          ← las reglas del negocio y los puertos. TypeScript puro.
├── application/     ← los casos de uso: orquestan el dominio a través de los puertos.
├── infrastructure/  ← los adaptadores: TypeORM, Resend, criptografía…
├── presentation/    ← controllers HTTP y DTOs (lo que entra y sale por la API).
└── <modulo>.module.ts  ← el "tablero" de NestJS que conecta cada puerto con su adaptador.
```

> El dibujo de ADR-02 muestra solo tres carpetas y pone los controllers dentro de `infrastructure/`. En
> el código, los controllers y DTOs viven en una cuarta carpeta, `presentation/`; el ADR lo aclara en una
> nota de implementación (2026-10-18). La regla de fondo es la misma: lo que sabe de HTTP o de la base
> queda afuera del dominio.

La regla de oro es **hacia dónde apuntan los `import`**:

| Capa | Puede importar | Nunca importa |
|---|---|---|
| `domain/` | solo TypeScript | `@nestjs/*`, `typeorm`, `class-validator`, `infrastructure/` |
| `application/` | `domain/` | `@nestjs/*`, `typeorm`, `infrastructure/` |
| `infrastructure/` y `presentation/` | todo lo anterior + NestJS y TypeORM | — |

**Los puertos son `abstract class`, no `interface`.** Parece un detalle, pero tiene razón: las
interfaces de TypeScript desaparecen al compilar, y NestJS necesita algo que exista en tiempo de
ejecución para saber qué inyectar. Una clase abstracta sí existe, así que sirve de "llave" para la
inyección sin inventar tokens de texto.

### Un ejemplo real: registrar una organización

Sigamos `POST /api/usuarios`, que da de alta una organización con su primer usuario (módulos `usuario`
y `tenant`):

1. **`presentation/`** — `UsuariosController` recibe el cuerpo, que NestJS valida contra
   `RegistroUsuarioDto` (correo válido, contraseña de 8 caracteres o más…). Si el correo ya existe,
   traduce el error de dominio `EmailYaRegistradoError` a un **409**.
2. **`application/`** — `UsuariosService.registrar()` es una clase **sin decoradores de NestJS**. Abre
   una transacción, genera el slug de la organización, guarda el tenant, revisa que el correo no exista,
   cifra la contraseña con bcrypt y guarda el usuario como `ADMINISTRADOR`.
3. **`domain/`** — los puertos `IUsuarioRepository` e `ITenantRepository` (clases abstractas) y la
   función pura `slugify()`, que convierte "Clínica Sonrisa" en `clinica-sonrisa`.
4. **`infrastructure/`** — `TypeOrmUsuarioRepository` y `TypeOrmTenantRepository` implementan esos puertos
   con TypeORM.
5. **`usuarios.module.ts`** — conecta todo: "cuando alguien pida `IUsuarioRepository`, entrega un
   `TypeOrmUsuarioRepository`", y arma el servicio a mano con `useFactory`.

¿Y la transacción, si `application/` no puede conocer TypeORM? Ese fue el problema del
[ADR-06](../Decisions/ADR-06.md): si fallaba algo después de guardar el tenant, quedaba una organización
huérfana sin usuarios. La solución es un puerto `TransactionRunner` cuyo "contexto" es de tipo `unknown`:
el caso de uso lo recibe y lo pasa a los repositorios **sin saber qué hay adentro**. Solo el adaptador de
infraestructura sabe que en realidad es un `EntityManager` de TypeORM. Es como pasar un sobre cerrado.

El módulo grande, `cita`, sigue el mismo patrón pero con más piezas: la entidad `Cita` decide qué cambios
de estado son legales (pendiente → confirmada, etc., [ADR-04](../Decisions/ADR-04.md)) y el servicio
tiene **un solo esqueleto** para toda modificación: cargar la cita bloqueada → aplicar la regla → guardar
→ anotar en la bitácora → publicar el hecho. Profesional y paciente usan el mismo.

### Por qué hexagonal, y qué cuesta

**Lo que gana:** el dominio se prueba sin levantar NestJS ni una base de datos (hay dobles en memoria en
`test/support/`), y cambiar de proveedor es escribir otro adaptador. Además el código habla el idioma del
negocio.

**Lo que cuesta:** hay que traducir entre la entidad de dominio y la entidad de TypeORM en cada
adaptador (código repetitivo), y el patrón exige disciplina.

### El código está en español

También es parte del ADR-02: nombres de clases, métodos, variables y carpetas del dominio y la
aplicación en **español** (`CrearCita`, `buscarPorId`). Inglés solo para términos técnicos sin buena
traducción (`token`, `tenant`, `hash`, `guard`, `dto`) y donde NestJS impone el nombre (`*.module.ts`,
`*.controller.ts`). Lo que no se permite es mezclar dentro de un mismo nombre (`crearUserRecord`).

### Cómo se vigila que nadie rompa las capas

El ADR-02 proponía un `grep` en cada PR. Al cerrar la Fase 2 se descubrió que **nunca detectó nada**: su
patrón buscaba `from '@nestjs'` con la comilla pegada, y los imports reales son `from '@nestjs/common'`.
Lo reemplazó un test, `src/arquitectura.spec.ts`, que corre con `npm test` y lee los imports de verdad.

Lo que ese test no ve está anotado como [DT-31](../Deudas/DT-31.md): por ejemplo, varios servicios de
`application/` importan DTOs de `presentation/` (el mismo `UsuariosService` del ejemplo lo hace). Las
deudas se explican en [07 — Deudas técnicas](07-deudas-tecnicas.md).

## Los módulos de `src/modules/`

| Módulo | Qué hace | Rutas principales (prefijo `/api`) | `CLAUDE.md` propio |
|---|---|---|---|
| `tenant` | La organización: entidad, slug y su repositorio. No tiene rutas | — | no |
| `usuario` | Alta pública de organización + primer usuario administrador | `POST /usuarios` | [sí](../../src/modules/usuario/CLAUDE.md) |
| `auth` | Login y verificación del JWT (`JwtAuthGuard`, `@CurrentUser`) | `POST /auth/login` | no |
| `paciente` | Ficha del paciente (RUT, nombre, contacto, consentimiento) | `POST /pacientes`, `PATCH /pacientes/:id` | no |
| `cita` | Las citas, su máquina de estados, la bitácora y el enlace del paciente | `/citas`, `/citas/hoy`, `/citas/:id/confirmar`…, `/citas/:id/historial`, `/citas/:id/enlace/invalidar` | [sí](../../src/modules/cita/CLAUDE.md) |
| `solicitud` | Pedidos de hora del paciente y la bandeja donde el profesional los acepta o rechaza | `POST /publico/:tenantSlug/solicitudes`, `/solicitudes`… | [sí](../../src/modules/solicitud/CLAUDE.md) |
| `recordatorio` | Programar, enviar y seguir los recordatorios por correo | `/recordatorios/configuracion`, `/citas/:citaId/recordatorios`, `POST /webhooks/resend` | [sí](../../src/modules/recordatorio/CLAUDE.md) |
| `portal-paciente` | Lo que el paciente ve y hace desde el enlace de su cita (Fase 3) | `/publico/cita`, `…/confirmar`, `…/cancelar`, `…/otra-hora` | [sí](../../src/modules/portal-paciente/CLAUDE.md) |

Y fuera de `modules/` está **`src/shared/`**, lo que usan todos: el `TransactionRunner`, el **outbox** y su
despachador, el planificador, la validación de variables de entorno, el límite de tasa, los logs, el
`GET /api/health`, y utilidades de dominio puras (validar un RUT, normalizar un correo, calcular el día en
la zona de la clínica). Las migraciones viven en `src/database/migrations/` (15 al 2026-10-18).

## Multi-organización: cada cliente en su propia caja

Una sola instalación atiende a muchas organizaciones (cada una es un **tenant**). La gracia es que una
clínica jamás vea los datos de otra, aunque compartan la misma base de datos. Así se logra:

**1. Cada organización tiene un slug.** Al registrarse, el nombre se convierte en un identificador legible
(`clinica-sonrisa`). Si ya existe, se agrega `-2`, `-3`… ([ADR-03](../Decisions/ADR-03.md)).

**2. El login pide el slug.** El correo es único **dentro** de cada organización, no en todo el sistema:
la misma persona puede trabajar en dos clínicas con el mismo correo. Por eso el login pide
`{ tenantSlug, email, password }`. Si algo falla, la respuesta es siempre el mismo 401 "Credenciales
inválidas", para que nadie pueda averiguar qué organizaciones o correos existen. (Hay una propuesta para
sacar el slug del cuerpo y ponerlo en la URL, [ADR-08](../Decisions/ADR-08.md): sigue en estado
**propuesto**.)

**3. El token lleva la organización sellada.** El JWT que entrega el login contiene `tenantId`, el id del
usuario y su rol. Es como la pulsera de un hotel todo incluido: no te preguntan en cada barra a qué
hotel perteneces, lo dice la pulsera, y no la puedes falsificar porque va firmada con `JWT_SECRET`. La
regla de [ADR-01 §2](../Decisions/ADR-01.md) es tajante: **en una ruta autenticada, el `tenantId` nunca se
lee del cuerpo ni de la URL**, solo del token.

**4. Toda consulta filtra por tenant.** Los repositorios reciben el `tenantId` y lo ponen en el `WHERE`.
Pedir una cita de otra organización da el mismo **404** que pedir una que no existe: no se distingue.
Las citas además se filtran por profesional (cada uno ve su agenda), mientras que la bandeja de
solicitudes es de toda la organización.

**Las excepciones, a la vista.** Hay tres lugares que no parten de un token de sesión, y están hechos
así a propósito:

- **Los procesos programados** recorren todas las organizaciones (por ejemplo, el que envía
  recordatorios). Esos métodos tienen nombre propio y el comentario `// BARRIDO GLOBAL (ADR-12 §6)` para
  que se puedan buscar; una vez que toman una fila, trabajan con **su** `tenantId`.
- **La solicitud pública de hora** lleva el slug en la URL (`/publico/:tenantSlug/solicitudes`).
- **El portal del paciente** no recibe ningún id: el camino es siempre token → enlace → cita →
  organización.

**Límites conocidos:** una sola zona horaria para toda la instalación ([DT-17](../Deudas/DT-17.md)), no
hay forma de agregar un segundo usuario a una organización ([DT-07](../Deudas/DT-07.md)) y el rol va en el
token pero nadie lo verifica ([DT-02](../Deudas/DT-02.md)).

> En el código no hay *Row-Level Security* de Postgres: el aislamiento es el filtro por `tenantId` que sale
> del token, como se describe arriba. ([`stack-tecnologico.md`](../stack-tecnologico.md) proponía RLS en su
> primera versión; desde el 2026-10-18 lo aclara.)

## Cómo se comunican los módulos

### Quién puede importar a quién

```
auth ──► usuario ──► tenant
  └────────────────► tenant
cita ──► paciente
solicitud ──► cita, paciente, tenant
recordatorio ──► cita            (solo para obtener el enlace del paciente)
portal-paciente ──► cita, solicitud
```

La regla clave: **`cita` no importa a `solicitud`, ni a `recordatorio`, ni a `portal-paciente`.** Si lo
hiciera habría ciclos y cada módulo tendría que conocer a todos los demás. Entonces, ¿cómo se entera
`recordatorio` de que una cita se reagendó? Por el **outbox**.

### El outbox: un libro de pedidos en la base

**El problema** ([DT-27](../Deudas/DT-27.md), cerrada). Cuando cambia una cita hay que avisar a otros
(por ejemplo, reprogramar sus recordatorios). Si el aviso se manda aparte del cambio, pueden pasar dos
desastres: el cambio se deshace pero el aviso ya salió (un hecho "fantasma"), o el cambio se guarda y el
proceso muere antes de avisar (un hecho perdido).

**La solución** ([ADR-12](../Decisions/ADR-12.md)). Piensa en la cocina de un restaurante: el mesero no
le grita el pedido al cocinero; lo anota en un libro de comandas. El cocinero revisa el libro cada tanto.
Si el mesero no alcanzó a anotarlo, el pedido no existe; si lo anotó, nadie lo pierde.

1. El caso de uso escribe el **hecho** (`CitaReagendada`, `CitaCancelada`…) en la tabla `eventos_salida`,
   **en la misma transacción** que el cambio. O se guardan los dos o ninguno.
2. Un **despachador** revisa la tabla cada 5 segundos, toma un hecho pendiente y se lo entrega a sus
   **suscriptores**.
3. Hoy hay dos suscriptores: el de **recordatorios** (programa, reprograma o anula) y el de
   **solicitudes** (descarta una petición de otra hora si la cita se canceló, o la da por atendida si el
   profesional la reagendó).

Los suscriptores siguen cuatro reglas: pueden recibir un hecho **dos veces** (así que deben ser
idempotentes), los hechos **pueden llegar desordenados** (así que releen el estado actual en vez de
aplicar el cambio a ciegas), **solo escriben en la base** dentro de la transacción que reciben, y
**nunca** hacen efectos externos como enviar un correo: dejan una fila y otro proceso la ejecuta.

**El costo:** segundos de demora entre el cambio y la reacción. Para recordatorios sobra; para alertas en
menos de 3 s (Fase 4) habrá que despertar al despachador al instante ([DT-33](../Deudas/DT-33.md)).

### El planificador: tareas que corren solas

Antes de la Fase 2, nada pasaba en el backend sin una petición HTTP. Ahora hay tareas que corren solas
dentro del mismo proceso, con `@nestjs/schedule`:

| Tarea | Cada cuánto |
|---|---|
| Despachar hechos del outbox | 5 s |
| Enviar los recordatorios que tocan | 60 s |
| Respaldo: revisar citas próximas sin recordatorios | cada hora |
| Medir la tasa de fallo de los recordatorios | 15 min |
| Purgar hechos ya entregados de más de 14 días | diario, 04:00 hora de Chile |

**¿Y si corren dos copias a la vez?** Railway, al desplegar, deja vivo el contenedor viejo unos segundos
junto al nuevo. Para que no hagan el mismo trabajo dos veces, cada fila se toma con
`FOR UPDATE SKIP LOCKED`: "bloquea esta fila para mí, y si otro ya la tiene, sáltala". Las tareas que no
se reparten por filas (la purga) usan un **candado consultivo** de Postgres.

**Requisito duro:** el contenedor tiene que estar **siempre encendido**. Si la plataforma lo duerme por
falta de tráfico (en Railway, la opción "App Sleeping"), no sale ningún recordatorio y el primero en
enterarse es el paciente. Para detectarlo, cada tarea manda un **latido** a Better Stack: si deja de
llegar, salta una alerta.

Con `PLANIFICADOR_ACTIVO=false` (lo normal en tests) no se programa nada. Y el job que marcaría
`ghosting` las citas vencidas **no existe todavía**: el mecanismo está listo, pero se aplazó con el
scoring ([DT-11](../Deudas/DT-11.md)).

### Un recorrido completo

Para ver todo junto: el profesional reagenda una cita desde el voucher.

1. `PATCH /api/citas/:id/reagendar` → la entidad `Cita` valida que se pueda, se guarda, se anota en la
   bitácora y se escribe `CitaReagendada` en el outbox. Una sola transacción.
2. A los pocos segundos el despachador entrega el hecho al suscriptor de recordatorios, que relee la cita
   y reprograma sus recordatorios para la hora nueva.
3. Cuando llega el momento, el job de envío toma el recordatorio, asegura el enlace del paciente y llama a
   Resend.
4. Resend avisa por webhook si el correo se entregó o rebotó, y el estado queda visible en el voucher.

## Infraestructura y entornos

Se usa **Git Flow** (más abajo): cada rama principal se despliega sola en su entorno.

| | staging | production |
|---|---|---|
| Rama | `develop` | `main` |
| Backend + Postgres | Railway, entorno `staging` | Railway, entorno `production` (base propia desde el 2026-10-04) |
| Frontend | Netlify, `citia-staging.netlify.app` | Netlify, `app.citiahealth.cl` |
| Correo | `MENSAJERIA_ADAPTADOR=registro` (no envía nada real) | Resend, desde `notificaciones.citiahealth.cl` |
| Monitoreo | — | Better Stack: monitor de `/api/health` y dos latidos |

Las piezas de afuera:

- **Railway** corre el backend como un contenedor Docker y le da a cada entorno su propio Postgres.
- **Netlify** publica la aplicación Vue (un sitio por entorno).
- **Resend** envía los correos y avisa por webhook firmado qué pasó con cada uno.
- **Better Stack** vigila que la API responda y que los latidos lleguen. Falta conectar la fuente de
  logs ([DT-19](../Deudas/DT-19.md)).
- **Cloudflare** maneja el DNS de `citiahealth.cl` (el dominio se compró en Hostinger y vence el
  2027-10-01). Ahí están los registros de Netlify y de Resend; falta el DMARC
  ([DT-41](../Deudas/DT-41.md)).

**El contenedor** ([ADR-05](../Decisions/ADR-05.md)): imagen Docker en tres etapas (dependencias →
compilación → ejecución), con `tini` como primer proceso para que las señales de apagado lleguen bien.
Al arrancar, `entrypoint.sh` **aplica las migraciones pendientes** y después levanta la app. En local,
`docker-compose` levanta un Postgres 16.

Todo el detalle está en [`stack-tecnologico.md` § Mapa de entornos](../stack-tecnologico.md#mapa-de-entornos).

## Configuración: las variables que importan

Toda la configuración pasa por un solo archivo, `src/shared/infrastructure/config/entorno.ts`. Si al
arrancar falta una variable o tiene un valor inválido, **la app no arranca** y muestra todos los errores
juntos, sin mostrar el valor de ningún secreto. Fuera de producción casi todo tiene un valor por defecto;
en producción (`NODE_ENV=production`) es estricto.

| Variable | Para qué | Ojo con |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Conexión a Postgres | En Railway son referencias al Postgres del entorno |
| `JWT_SECRET` · `JWT_EXPIRES_IN` | Firmar el token de sesión · su duración (por defecto `1d`) | En producción, 32 caracteres o más |
| `ENLACE_CITA_CLAVE` | Clave para fabricar los tokens del enlace del paciente (Fase 3) | Obligatoria en producción, distinta de `JWT_SECRET` y **distinta en cada entorno**; cambiarla deja sin servir los enlaces ya enviados ([DT-45](../Deudas/DT-45.md)) |
| `FRONTEND_URL` · `CORS_ORIGENES_EXTRA` | Qué sitios web pueden llamar a la API (CORS) y la base del enlace del correo | Obligatoria en producción |
| `APP_TZ` | Zona horaria de la clínica (por defecto `America/Santiago`) | Una sola para todos ([ADR-07](../Decisions/ADR-07.md)) |
| `MENSAJERIA_ADAPTADOR` | `resend` envía de verdad; `registro` solo deja constancia | Con `registro`, los recordatorios quedan "Enviado" sin haberse enviado ([DT-40](../Deudas/DT-40.md)). Ya pasó en producción por copiar variables de staging |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CORREO_DOMINIO` | Credenciales y dominio de Resend | Solo se exigen con `resend` |
| `PLANIFICADOR_ACTIVO` · `LIMITE_TASA_ACTIVO` | Prender o apagar las tareas programadas y el límite de tasa | Los dos vienen apagados en tests |
| `BETTERSTACK_*` | Latidos y envío de logs | Las URL de latido llevan un token: son secretas |

Y `src/main.ts` arma lo global: prefijo `/api` para todas las rutas, CORS con la lista de orígenes,
validación estricta de los DTOs (descarta campos que no estén declarados), logs con pino, `trust proxy`
para ver la IP real detrás del proxy de Railway, guardar el cuerpo crudo de la petición (lo necesita la
firma del webhook de Resend) y apagado ordenado para que las tareas en curso terminen antes de cerrar.

## Cómo se trabaja

### Ramas y commits

**Git Flow**, en los dos repos:

- `main` = **producción**. Nunca se le hace commit directo; solo recibe releases desde `develop`.
- `develop` = **integración**, y se despliega en staging.
- `feature/<scope>-<descripcion>` = se crea desde `develop` y vuelve a `develop` por PR (por ejemplo,
  `feature/fase3-respuesta-paciente`). Para documentación se usan ramas `docs/…`.
- Un **release** es un PR de `develop` a `main`. "En producción" significa "llegó a `main`".

Los commits siguen **Conventional Commits**: `tipo(alcance): descripción`, con tipos `feat`, `fix`,
`refactor`, `test`, `docs` y `chore`. Ejemplos reales: `feat(portal-paciente): portal público del paciente
por el enlace de su cita`, `test(e2e): Definición de Terminado de la Fase 3`. Un PR se cierra con lint y
tests en verde.

### El equipo y la documentación viva

Según [PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md), el equipo es una persona de I+D, dos
desarrolladores y el **arquitecto**, que decide el diseño y los requisitos de seguridad.

La regla de la carpeta `context/` es: **toda decisión de diseño vive en un ADR, toda funcionalidad en una
feature, toda limitación conocida en una deuda, y ningún commit sustantivo queda sin documentar**. Antes
de construir una historia se escribe su plan en `context/US/`, y
[`TRAZABILIDAD.md`](../TRAZABILIDAD.md) une cada commit con el documento que lo explica.

### El orquestador y los sub-agentes

Gran parte del código se construye con Claude Code. El `CLAUDE.md` raíz define un **orquestador** que
no implementa features grandes él mismo: analiza la tarea, la parte por capas y se la delega a
**sub-agentes** especializados (definidos en `.claude/agents/`):

| Sub-agente | Se encarga de |
|---|---|
| `architecture-agent` | Diseñar antes de construir: fronteras entre módulos, ADRs, planes |
| `backend-agent` | La plataforma común: `main.ts`, configuración, guards, CORS, límite de tasa, logs |
| `database-agent` | Entidades, repositorios, migraciones y consultas |
| `api-agent` | Controllers, servicios, DTOs y rutas de un módulo concreto |
| `testing-agent` | Tests unitarios, e2e y cobertura |

La secuencia típica es `architecture → backend → database → api → testing`. Hay comandos que la
disparan (`/orchestrate`, `/review`, `/deploy`, en `.claude/commands/`) y "skills" reutilizables para Git,
tests y lint (`.claude/skills/`). Un buen ejemplo es el plan de construcción de la
[Fase 2 en el ROADMAP](../ROADMAP.md#fase-2--us-03-recordatorios-al-paciente): cada pieza dice qué agente
la hizo.

> Las definiciones de los agentes describen la estructura real desde el 2026-10-18: TypeORM con dos
> entidades por concepto (`database-agent`), servicios como clases planas armadas con `useFactory`
> (`api-agent`) y los ADR en `context/Decisions/` (`architecture-agent`). Si alguna vuelve a quedar atrás,
> mandan ADR-02 y los `CLAUDE.md` de cada módulo.

### Los `CLAUDE.md` por módulo

Cuando un módulo tiene reglas propias, lleva su propio `CLAUDE.md` con su estructura, sus rutas y sus
reglas locales (por ejemplo, "la cita siempre se bloquea primero" o "el portal nunca registra el token").
Claude lo carga solo al trabajar en esa carpeta, y para una persona es la mejor puerta de entrada al
módulo. Hoy lo tienen `cita`, `solicitud`, `recordatorio`, `portal-paciente` y `usuario`.

### Los tests

| Tipo | Dónde | Comando | Qué prueba |
|---|---|---|---|
| Unitarios | `*.spec.ts`, junto a cada archivo | `npm test` | Dominio y casos de uso con dobles en memoria (`test/support/`), sin base de datos. Incluye `arquitectura.spec.ts` |
| e2e | `test/*.e2e-spec.ts` | `npm run test:e2e` | La API por HTTP con Supertest. Algunas usan Postgres, otras no; corren de a una |
| Integración | carpetas `integration/` | `npm run test:integration` | Contra Postgres real: transacciones, bloqueos, carreras entre peticiones concurrentes |

Al cerrar la Fase 3 había 1709 unitarios, 287 e2e y 139 de integración en verde. **No hay un pipeline de
CI** que los corra solos: se corren a mano antes de cada PR ([DT-20](../Deudas/DT-20.md)).

Las **migraciones** se escriben a mano con TypeORM (siempre con `up` y `down`), nunca se deja que TypeORM
cambie el esquema por su cuenta, y se aplican al arrancar el contenedor.

## Ideas para llevarse

- **La lógica de negocio no debe saber dónde se guarda ni por dónde se envía.** Eso es lo que compra la
  arquitectura hexagonal, y se paga con algo de código de traducción.
- **El aislamiento entre clientes sale del token, nunca de lo que manda el cliente.**
- **Si un cambio y su aviso tienen que ir juntos, guárdalos en la misma transacción.** Eso es el outbox.
- **Una regla que no se verifica sola, se rompe.** El `grep` que nunca detectó nada es el recordatorio.

---

## Para profundizar

- [`CLAUDE.md` raíz](../../CLAUDE.md) — rol del orquestador, sub-agentes y convenciones.
- [ADR-02](../Decisions/ADR-02.md) — español + hexagonal, y la nota del test de arquitectura.
- [ADR-01](../Decisions/ADR-01.md), [ADR-03](../Decisions/ADR-03.md), [ADR-08](../Decisions/ADR-08.md) — JWT, slug y la propuesta del tenant en la URL.
- [ADR-05](../Decisions/ADR-05.md), [ADR-06](../Decisions/ADR-06.md) — Docker y transacciones.
- [ADR-12](../Decisions/ADR-12.md) — outbox y planificador.
- Los ADR explicados uno por uno: [03 — Decisiones (ADR)](03-decisiones-adr.md).
- [`stack-tecnologico.md`](../stack-tecnologico.md) — stack, entornos, infraestructura y modo prueba.
- [`rules.md`](../rules.md) — las reglas transversales (aplicar hexagonal y las reglas de negocio).
- `CLAUDE.md` de los módulos: [cita](../../src/modules/cita/CLAUDE.md), [solicitud](../../src/modules/solicitud/CLAUDE.md),
  [recordatorio](../../src/modules/recordatorio/CLAUDE.md), [portal-paciente](../../src/modules/portal-paciente/CLAUDE.md).
- Las definiciones de los sub-agentes en [`.claude/agents/`](../../.claude/agents/).
- `src/main.ts`, `src/app.module.ts` y `src/shared/infrastructure/config/entorno.ts` en el código.
