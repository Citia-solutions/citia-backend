# Las decisiones de arquitectura (ADR), explicadas

> **Qué vas a entender acá:** qué es un ADR, cómo leer su estado y, uno por uno, los catorce ADR del
> backend (ADR-00 a ADR-13): qué problema tenía el equipo, qué se eligió, qué se descartó y qué se ve
> hoy en el código.
>
> **Antes conviene leer:** [01 — El producto](01-el-producto.md) y [02 — Cómo está armado](02-como-esta-armado.md).
> Los términos raros (tenant, slug, outbox, ghosting…) están en el [glosario](11-glosario.md).

**Estado de referencia:** 2026-10-18.

---

## Qué es un ADR y por qué los usamos

Un ADR (*Architecture Decision Record*, registro de decisión de arquitectura) es una ficha corta que
guarda **una** decisión importante: qué problema había, qué opciones se miraron, cuál se eligió y qué
consecuencias trae. Es como el acta de una reunión, pero de una sola decisión y escrita para alguien que
llega meses después y se pregunta "¿por qué esto está hecho así?". En Citia se usan porque quien decide
(el arquitecto) y quien implementa no siempre son la misma persona —parte del trabajo lo hacen agentes de
IA que leen estos documentos para saber qué está decidido—, y porque muchas cosas del código parecen raras
si no conoces el problema que resolvían: el ADR evita que alguien "arregle" algo que estaba así a
propósito. Viven en [`context/Decisions/`](../Decisions/README.md), y no se borran cuando el equipo cambia
de opinión: se les agrega una nota fechada o los reemplaza otro ADR, así queda la historia.

## Cómo leer los estados

| Estado | Qué significa | Ejemplo |
|---|---|---|
| **Propuesto** | Está escrito y razonado, pero nadie con autoridad lo aprobó. No es ley todavía. | ADR-08 |
| **Aceptado** | Aprobado: es la regla vigente. Ojo: aceptado **no** significa construido. | ADR-10 entre el 14 y el 15 de octubre |
| **Implementado** | Además existe en el código. A veces se precisa dónde: en una rama, en `develop`, en producción. | ADR-12, ADR-13 |
| **Aplazado** | Se decidió no hacerlo *por ahora*; el diseño se guarda para retomarlo. | ADR-10 entre el 2026-09-25 y el 2026-10-14 |
| **Reemplazado** (*superseded*) | Otro ADR lo deja sin efecto, total o **parcialmente**. Lo parcial es lo más común acá: cae una regla y el resto sigue vigente. | la regla 4 de ADR-03 (por ADR-08); la mención a BullMQ de ADR-04 (por ADR-12) |

También vas a ver verbos que describen relaciones: **extiende** (agrega algo sin cambiar lo anterior),
**matiza** (afina una regla para un caso puntual sin derogarla) y **notas de implementación** (una sección
al final donde se anota en qué se apartó el código del diseño, sin cambiar la decisión).

Dos consejos prácticos:

- Lee la línea **Estado** y también las **notas fechadas** que vienen justo debajo. Los ADR se actualizan
  con notas, y a veces la cabecera queda atrasada respecto de una nota (pasó con ADR-08, ADR-09 y ADR-11
  hasta que se pusieron al día, el 2026-10-18).
- Si dos documentos dicen cosas distintas sobre el estado, manda el [ROADMAP](../ROADMAP.md).

---

## El mapa: de qué trata cada ADR

| ADR | En una línea | Estado hoy | Fase |
|---|---|---|---|
| [00](../Decisions/ADR-00.md) | TypeORM como ORM, sin `synchronize`, solo migraciones | Aceptado | Fundaciones |
| [01](../Decisions/ADR-01.md) | Login con Passport + JWT; el tenant viaja dentro del token | Aceptado · implementado | Fundaciones |
| [02](../Decisions/ADR-02.md) | Código en español y arquitectura hexagonal | Aceptado · lo vigila un test | Fundaciones (transversal) |
| [03](../Decisions/ADR-03.md) | El login pide el `tenantSlug` para saber a qué organización entras | Aceptado · su regla 4 la reemplazaría ADR-08 | Fundaciones |
| [04](../Decisions/ADR-04.md) | La cita es una máquina de estados que vive en el dominio | Aceptado · extendido por ADR-09 · §4 reemplazado por ADR-12 | Fase 0 |
| [05](../Decisions/ADR-05.md) | Docker multi-stage y migraciones al arrancar el contenedor | Aceptado · implementado | Fundaciones |
| [06](../Decisions/ADR-06.md) | Transacciones sin que el caso de uso conozca TypeORM (`TransactionRunner`) | Aceptado · implementado | Fundaciones |
| [07](../Decisions/ADR-07.md) | "Hoy" y "la hora" se calculan en la zona de la clínica | Aceptado · implementado | Fase 0 |
| [08](../Decisions/ADR-08.md) | Sacar el tenant del body del login y ponerlo en la URL | **Propuesto** · el login no lo implementa | Fundaciones / Fase 1 |
| [09](../Decisions/ADR-09.md) | La solicitud del paciente va aparte, el RUT es la identidad, reagendar deja bitácora | Aceptado · implementado | Fase 1 |
| [10](../Decisions/ADR-10.md) | Enlace por cita para que el paciente confirme, cancele o pida otra hora | Aceptado (2026-10-14) · en producción (2026-10-17) | Fase 3 |
| [11](../Decisions/ADR-11.md) | Si dos citas se cruzan: avisar y permitir | Aceptado · implementado | Fase 1 |
| [12](../Decisions/ADR-12.md) | Outbox en Postgres y planificador dentro del proceso | Aceptado · en producción | Fase 2 |
| [13](../Decisions/ADR-13.md) | Recordatorios al paciente por correo con Resend | Aceptado · en producción | Fase 2 |

## Cómo se conectan

Los ADR no son islas. Hay cuatro "hilos" que conviene tener en la cabeza:

```
Hilo 1  vida de la cita     ADR-04 ──► ADR-09 ──► ADR-11
                                          └─────► ADR-10
Hilo 2  hablarle al paciente   ADR-09 §7 ──► ADR-12 ──► ADR-13 ──► ADR-10
Hilo 3  ¿de qué organización?  ADR-01 ◄── ADR-03 ──► ADR-08 ┄┄► ADR-09 (solo la ruta pública)
Hilo 4  reglas de la casa      ADR-02 ──► ADR-06 ┄┄► (lo copian 08, 09 y 12)
                               ADR-07 ┄┄► (lo usan 11, 13 y 10)
                               ADR-00 ◄── tensión ──► ADR-05
```

**Hilo 1 — la vida de una cita.** ADR-04 dibuja el grafo de estados. ADR-09 le agrega la transición
`reagendar()` y una bitácora, y crea la solicitud del paciente como algo aparte. ADR-11 usa el mismo
modelo para avisar choques de horario. ADR-10 deja que el paciente use las transiciones que ya existían
(confirmar, cancelar) **sin tocar el grafo**, y manda "pedir otra hora" a la bandeja de ADR-09.

**Hilo 2 — hablarle al paciente.** ADR-09 dejó "el enchufe puesto": la cita publica hechos
(`CitaCreada`, `CitaReagendada`…) aunque nadie los escuche. ADR-12 convierte esa publicación en un outbox
confiable y trae un planificador. ADR-13 es el primer suscriptor: los recordatorios por correo. ADR-10 mete
el enlace del paciente dentro de ese mismo correo.

**Hilo 3 — ¿de qué organización eres?** ADR-01 sella el `tenantId` dentro del JWT. Para llegar a firmarlo,
ADR-03 pide el slug en el login. ADR-08 propone mover el slug a la URL; el login todavía no lo hace, pero la
ruta pública de ADR-09 ya usa ese mecanismo. ADR-10 **no** depende de ADR-08: el token del enlace ya dice
de qué cita (y por lo tanto de qué organización) se trata.

**Hilo 4 — las reglas de la casa.** ADR-02 (hexagonal) es la regla madre. ADR-06 inventa el truco del
"contexto opaco" para respetarla con transacciones, y ese patrón se copia en ADR-08, ADR-09 y ADR-12.
ADR-07 pone la utilidad de zona horaria que después reutilizan ADR-11, ADR-13 y ADR-10. ADR-05 vive en
tensión con ADR-00 sobre cuándo se corren las migraciones.

---

## ADR-00 · TypeORM como ORM, y nunca `synchronize`

**Estado:** Aceptado (2026-06-22). · [Original](../Decisions/ADR-00.md)

**El problema.** Había que elegir cómo hablarle a Postgres desde NestJS. Un ORM (el traductor entre
objetos de TypeScript y tablas SQL) es de esas decisiones caras de cambiar después. Los candidatos eran
TypeORM y Prisma.

**Qué se decidió.** TypeORM: se integra de forma nativa con Nest (`@nestjs/typeorm`), define las entidades
con decoradores (el mismo estilo del resto del código), no necesita un paso de "generar el cliente" cada
vez que cambias el esquema y, además, ya estaba instalado. Pero lo que más importa son sus reglas:

- **`synchronize: false` siempre.** `synchronize` hace que TypeORM modifique las tablas solo para que
  calcen con las entidades: cómodo, pero puede botar una columna con datos sin preguntarte. Solo se
  permite en bases desechables de tests.
- **El esquema cambia solo con migraciones versionadas**, y una migración generada automáticamente se lee
  línea por línea antes de correrla (puede traer un `DROP COLUMN` escondido).
- **En producción, las migraciones son un paso explícito**, no un efecto del arranque (esto choca con
  ADR-05; ver ahí).

**Qué se descartó.** Prisma: moderno y bueno, pero en ese momento se integraba con Nest vía un wrapper
comunitario y exige `prisma generate` en cada cambio.

**El costo aceptado.** Los decoradores de TypeORM amarran la clase al ORM. Para no contaminar el dominio,
cada cosa tiene **dos clases**: la de dominio (TypeScript puro, en `domain/`) y la de persistencia (con
decoradores, en `infrastructure/persistence/`, archivos `*.orm-entity.ts`), más el código que traduce
entre ambas. Es más código a cambio de un dominio limpio (ver ADR-02).

**Hoy en el código.** `synchronize: false` en `src/app.module.ts` y en `src/database/data-source.ts`;
quince migraciones en `src/database/migrations/`, desde `1750000000000-CreateTenantsAndUsuarios` hasta
`1750000014000-AddReagendamientoASolicitudesCita`.

---

## ADR-01 · Login con Passport + JWT

**Estado:** Aceptado e implementado (2026-06-22). · [Original](../Decisions/ADR-01.md)

**El problema.** Los profesionales tienen que iniciar sesión, y cada uno debe ver **solo** los datos de su
organización (RNF-02). Además se quería un backend que no guardara sesiones en memoria, fácil de escalar y
cómodo para un frontend separado.

**Qué se decidió.** Passport + JWT. Un JWT es como la pulsera de un evento: te la ponen al entrar (el
login), va firmada para que no la puedas falsificar y en cada petición siguiente solo la muestras; el
servidor no necesita recordar nada. La pulsera lleva tu id (`sub`) y tu `tenantId`. La regla de oro:
**en una ruta protegida, el `tenantId` nunca viene del cliente**: sale del token. El guard `JwtAuthGuard`
deja `req.user = { userId, email, tenantId, rol }` y de ahí lo toman los servicios.

**Qué se descartó.** Sesiones en el servidor con `express-session` (hay que guardarlas en algún lugar
compartido, típicamente Redis) y un servicio externo tipo Auth0 (costo, dependencia y menos control sobre
lo que lleva el token).

**Cómo quedó.** No se usó la estrategia "local" de Passport: la comparación de la contraseña
(`bcrypt.compare`) vive en `AuthService`, en la capa `application`. Para firmar el token sin que esa capa
importe `@nestjs/jwt`, se creó el puerto `ITokenSigner` (`auth/domain/token-signer.ts`) con su adaptador
`JwtTokenSigner`. Cualquier fallo de login responde el mismo 401 "Credenciales inválidas".

**Una desviación consciente.** El ADR pedía tokens de 15 minutos, pero sin *refresh token* (un segundo
token para renovar la sesión) eso te echaría de la app cada cuarto de hora. Por eso `JWT_EXPIRES_IN` vale
`1d` por defecto (en `auth.module.ts`). Es temporal: vuelve a 15 min cuando exista la renovación.

**Lo que quedó pendiente.** No hay renovación ni revocación de sesión: cerrar sesión no invalida el token
hasta que vence ([DT-01](../Deudas/DT-01.md)). Y el `rol` va en el token, pero ningún guard lo revisa
([DT-02](../Deudas/DT-02.md)).

---

## ADR-02 · Código en español y arquitectura hexagonal

**Estado:** Aceptado (2026-06-22); el control automático se rehízo el 2026-10-04. ·
[Original](../Decisions/ADR-02.md)

**El problema.** Dos cosas. Una: el equipo y el negocio hablan en español (citas, pacientes,
recordatorios), pero todo el stack está en inglés. Dos: la arquitectura hexagonal se erosiona sola si nadie
la vigila; basta un import "por comodidad" para que el dominio quede amarrado al framework.

**Qué se decidió.**

- **Idioma.** Español para clases, métodos, variables y archivos de `domain/` y `application/` (`Cita`,
  `reagendar`, `obtenerCitasPorFecha`). Inglés solo para términos técnicos sin traducción natural
  (`token`, `tenant`, `hash`, `guard`, `dto`…) y para los nombres que impone Nest (`*.module.ts`,
  `*.controller.ts`). Prohibido mezclar dentro de un mismo nombre (`crearUserRecord`, no).
- **Capas.** Es la idea del secador de pelo y sus adaptadores que se cuenta en
  [02 — Cómo está armado](02-como-esta-armado.md#la-arquitectura-hexagonal): `domain/` y `application/`
  **nunca** importan `@nestjs/*`, `typeorm` ni `class-validator`; solo `infrastructure/` conoce el
  framework.
- **Puerto = `abstract class`, no `interface`.** Las interfaces de TypeScript desaparecen al compilar, y
  Nest necesita algo que exista en ejecución para saber qué inyectar. Con una clase abstracta, el propio
  puerto sirve de llave de inyección.

**Un control que nunca falló (y por eso no servía).** El ADR proponía un `grep` en CI para detectar
imports prohibidos. Al cerrar la Fase 2 se descubrió que su patrón exigía la comilla justo después de
`@nestjs` (`from '@nestjs'`), y los imports reales son `from '@nestjs/common'`: devolvía cero líneas aunque
hubiera violaciones. Además el proyecto no tiene pipeline de CI ([DT-20](../Deudas/DT-20.md)). Desde el
2026-10-04 lo reemplaza **`src/arquitectura.spec.ts`**, que corre con `npm test`, lee los imports con el
preprocesador de TypeScript e incluye un test que demuestra que el `grep` antiguo no detectaba un import
real de Nest.

**Hoy en el código.** En la práctica, controllers y DTOs viven en una carpeta propia, `presentation/` (el
texto del ADR los ponía dentro de `infrastructure/`; desde el 2026-10-18 una nota de implementación del ADR
lo aclara). Lo que el test no ve quedó en
[DT-31](../Deudas/DT-31.md): algunos servicios de `application/` importan DTOs de `presentation/` (que traen
`class-validator` por debajo) y los puertos de `domain/` importan `TransactionContext` de
`shared/application`. También vas a ver nombres en inglés en el código más antiguo
(`ITenantRepository.findBySlug`, `ITokenSigner.sign`); no hay deuda fichada sobre eso.

---

## ADR-03 · Login multi-organización por `tenantSlug`

**Estado:** Aceptado (2026-06-22). Su regla 4 (el slug viaja en el body) es la que ADR-08 propone
reemplazar; mientras ADR-08 siga propuesto, rige entera. · [Original](../Decisions/ADR-03.md)

**El problema.** En Citia el mismo correo puede existir en dos organizaciones: la unicidad es
`(tenant_id, email)`, no el correo solo. Entonces, si dos clínicas tienen `admin@clinica.com`, con correo y
contraseña el servidor no sabe a cuál de las dos estás entrando.

**Qué se decidió.** Que el login pida además el **slug** de la organización (un identificador legible y
apto para URL, tipo `clinica-sur`): `POST /api/auth/login { tenantSlug, email, password }`. El servidor
busca la organización por slug, luego el usuario dentro de ella, compara la contraseña y firma el JWT. El
slug **se genera solo** al registrarse, a partir del nombre (`slugify` en `tenant/domain/slug.ts`: quita
tildes, pasa a minúsculas, cambia lo raro por `-` y, si choca, agrega `-2`, `-3`…). La respuesta del
registro devuelve el slug para que el usuario lo conozca.

**La regla que más importa: 401 genérico.** Organización inexistente, correo inexistente o contraseña
mala responden lo mismo: "Credenciales inválidas". Si respondieras distinto, un curioso podría ir probando
slugs y descubrir qué clínicas usan Citia (eso se llama **enumeración**). Esta regla reaparece en ADR-08,
ADR-09 y ADR-10.

**Qué se descartó.** Hacer el correo único en toda la plataforma (rompe el modelo multi-organización: no
podrías usar tu correo en dos clínicas) y buscar el correo en todas las organizaciones (permite enumerar y
es ambiguo). Llevar el slug en el subdominio (`clinica-sur.citia.app`) quedó **aplazado**: es lo elegante
en un SaaS, pero exige DNS y certificados comodín que el proyecto no tenía.

**Hoy en el código.** `LoginDto` sigue pidiendo `tenantSlug` en el body; la columna `tenants.slug` nació en
la migración `1750000001000-AddSlugToTenants`. Deudas: el 401 es igual en contenido pero no en tiempo de
respuesta ([DT-05](../Deudas/DT-05.md)), y dos registros simultáneos con el mismo nombre podrían chocar en
el slug ([DT-08](../Deudas/DT-08.md)).

---

## ADR-04 · La cita como máquina de estados

**Estado:** Aceptado (2026-06-30) · extendido por ADR-09 · el mecanismo de su §4 lo reemplazó ADR-12. ·
[Original](../Decisions/ADR-04.md)

**El problema.** Una cita pasa por varios estados (pendiente, confirmada, asistió…), algunos finales, y hay
saltos prohibidos (no puedes confirmar una cita cancelada). Esas reglas son el corazón del negocio, sobre
todo porque el diferenciador futuro de Citia es medir el comportamiento de cada paciente (RF-08, el
*scoring*).

**Qué se decidió (cuatro cosas).**

1. **Las reglas viven en la entidad `Cita`, no en el servicio.** El `estado` es privado y solo cambia con
   métodos que validan antes (`confirmar()`, `cancelar()`, `marcarAsistencia()`…). Un salto ilegal lanza
   `TransicionEstadoInvalidaError`, que el controller traduce a HTTP 409. Es como un tablero con flechas
   pintadas: solo te mueves por donde hay flecha. Se descartó poner los `if` en el servicio: cada caso de
   uso nuevo tendría que acordarse de copiarlos.
2. **Un grafo cerrado** con seis estados. Cuatro son **terminales**: de ahí no se sale. La distinción
   fina: `ghosting` = nunca confirmó y no llegó; `no_asistio` = confirmó y no llegó. Se guardan separados
   porque para el scoring no son lo mismo.
3. **`inicio` es un único `timestamptz`** (un instante, con zona), no fecha y hora por separado. Ordenar,
   filtrar "las citas de hoy" e indexar es más simple.
4. **El `ghosting` se guarda, no se calcula al leer.** Un proceso programado marcará `ghosting` las citas
   pendientes vencidas. Calcularlo "al vuelo" haría que el historial dependiera del momento en que lo
   miras.

```
pendiente ──confirmar──► confirmada ──asistencia────► asistio
    │                        ├──────inasistencia──► no_asistio
    │                        └──────cancelar──────► cancelada
    ├──cancelar──► cancelada
    └──vence sin confirmar──► ghosting        (el proceso que lo hace está aplazado)

+ reagendar (ADR-09): desde pendiente o confirmada, la cita vuelve a pendiente
```

**Cómo cambió después.**

- **ADR-09 agregó `reagendar()`** sin tocar lo demás, y resolvió un problema que este ADR dejó abierto:
  como "lo cancelado no se reabre", mover una cita tres veces dejaba cuatro filas sin relación entre sí.
- **El §4 nombraba BullMQ** (una cola sobre Redis). ADR-12 eligió otro mecanismo (planificador sobre
  Postgres). La idea de fondo —guardar el estado— sigue en pie, pero **el proceso no existe**: quedó
  aplazado cuando el scoring salió del MVP ([DT-11](../Deudas/DT-11.md)).
- **El 2026-10-14 se fijó cuándo una cita es `ghosting`** (regla G1, con el diseño de la Fase 3): sigue
  `pendiente` pasado el fin del día de la clínica, al paciente se le envió al menos un recordatorio con
  enlace, y no tiene una petición de otra hora abierta. Si falta algo, la cita queda sin cerrar.

**Hoy en el código.** `src/modules/cita/domain/cita.entity.ts`. Tiene todos los métodos, incluido
`marcarGhosting()`, que hoy nadie llama. Las citas que vencen sin confirmar quedan `pendiente`.

---

## ADR-05 · Docker multi-stage y migraciones al arrancar

**Estado:** Aceptado e implementado (2026-06-22). · [Original](../Decisions/ADR-05.md)

**El problema.** El backend se despliega en Railway, una plataforma que corre contenedores Docker. Hacía
falta una imagen liviana, sin dependencias de desarrollo ni código fuente TypeScript, que no corriera como
root y que dejara la base migrada antes de recibir tráfico.

**Qué se decidió.**

- **Un Dockerfile en tres etapas** sobre `node:22-alpine`: `deps` (instala todo), `builder` (compila a
  `dist/` y poda las dependencias de desarrollo) y `runner` (la imagen final, con usuario `node` sin
  privilegios y `tini` como proceso 1 para manejar bien las señales de apagado). Es cocinar en una cocina
  grande y servir solo el plato: la imagen final no lleva las ollas.
- **`entrypoint.sh` corre las migraciones antes de arrancar la app**: con `dist/` compilado usa
  `migration:run:prod`; en desarrollo, la versión con `ts-node`. Si una migración falla, la app no arranca.
- **`docker-compose` en dos archivos**: el base (Postgres con *healthcheck* y la app) y un override para
  desarrollo (código montado con recarga en caliente y pgAdmin).

**La tensión con ADR-00.** ADR-00 dice que en producción las migraciones son un paso del pipeline, "nunca
al arrancar". El entrypoint las corre al arrancar. Se reconcilió así: se respeta el espíritu (nada de
`synchronize`, solo migraciones revisadas), es un paso explícito y visible en los logs, y con **una sola
réplica** no hay problema. El riesgo quedó escrito: con varias réplicas, todas intentarían migrar a la vez,
así que antes de escalar hay que mover las migraciones a un paso único.

**Hoy en el código.** `Dockerfile`, `entrypoint.sh`, `docker-compose.yml` y `docker-compose.override.yml`
en la raíz. Sigue habiendo una sola réplica en Railway, y otras decisiones se apoyan en eso (ADR-12 y el
límite de tasa en memoria de ADR-10).

---

## ADR-06 · Transacciones con un "sobre sellado" (`TransactionRunner`)

**Estado:** Aceptado e implementado (2026-06-23). · [Original](../Decisions/ADR-06.md)

**El problema.** Registrarse crea dos filas: la organización (`tenants`) y su primer usuario. Al principio
se hacía sin transacción: si fallaba el usuario (correo repetido, error al hashear), la organización
quedaba guardada **huérfana**, sin nadie que pudiera usarla y ocupando su slug. La solución obvia es una
transacción, pero en TypeORM eso se maneja con un `EntityManager`, y ADR-02 prohíbe que `application`
conozca TypeORM.

**Qué se decidió.** Un puerto `TransactionRunner` en `shared/application/` con un método `run(trabajo)`.
El truco está en el tipo del contexto: `TransactionContext = unknown`. El caso de uso recibe un `tx` y lo
pasa hacia abajo a los repositorios **sin abrirlo**, como un sobre sellado que va de mano en mano; solo el
adaptador de TypeORM sabe que adentro hay un `EntityManager`. El adaptador (`TypeOrmTransactionRunner`) usa
`dataSource.transaction()`: si todo sale bien, *commit*; si algo lanza, *rollback* de todo.

**Qué se descartó.** Inyectar el `DataSource` de TypeORM directo en el servicio: más simple, pero rompe
ADR-02 y obliga a levantar el ORM para testear el caso de uso.

**El costo aceptado.** Con `unknown` el compilador no te ayuda en esa frontera: si alguien pasa otra cosa
como `tx`, el error aparece recién en ejecución.

**Hoy en el código.** `src/shared/application/transaction-runner.ts` y
`src/shared/infrastructure/typeorm-transaction-runner.ts`. Es de los patrones más reutilizados del
proyecto: cada cambio de una cita junto con su fila de bitácora (ADR-09), aceptar una solicitud, publicar
un hecho en el outbox (ADR-12 exige el `tx`) y todo el módulo de recordatorios (ADR-13) corren dentro de
`run()`. Y la idea del "puerto con contexto opaco" se copió en ADR-08, ADR-09 y ADR-12.

---

## ADR-07 · El día y la hora en la zona de la clínica

**Estado:** Aceptado e implementado (2026-07-06). · [Original](../Decisions/ADR-07.md)

**El problema.** Un bug real. El dashboard muestra "las citas de hoy" con su hora, pero "hoy" depende de
dónde estés. La base guarda instantes en UTC (eso está bien), y el código calculaba el día y la hora con la
zona **del servidor**, que en el contenedor es UTC. En Chile (UTC−3 o UTC−4) eso corría la medianoche
varias horas: citas de la noche caían en el día equivocado y las horas salían con 3–4 horas de desfase.

**Qué se decidió.**

- Una utilidad pura, `src/shared/domain/timezone.ts`, que usa `Intl` (la API de fechas que ya trae Node)
  para calcular el rango del día en una zona y formatear la hora, respetando el horario de verano (días de
  23 o 25 horas).
- La zona es configuración: **`APP_TZ`**, por defecto `America/Santiago`. El servicio la recibe por
  constructor, así `application` no depende de Nest.

**Qué se descartó.** Una librería (Luxon, date-fns-tz): `Intl` alcanza para esto y es una dependencia
menos. Y una zona por organización: por ahora es una sola para toda la instalación
([DT-17](../Deudas/DT-17.md)); como la utilidad recibe la zona por parámetro, el cambio futuro será acotado.

**Hoy en el código.** `timezone.ts` creció: además de `rangoDelDiaEnZona` y `formatearHoraEnZona` tiene,
entre otras, `formatearFechaLargaEnZona` (el texto del recordatorio, ADR-13). La reutilizan el aviso de
solapamiento (ADR-11), las horas sin envío de los recordatorios (ADR-13) y la página del paciente (ADR-10).
**Deuda abierta:** la corrección se hizo en la salida, no en la entrada; si el cliente manda `inicio` sin
zona, se interpreta en UTC ([DT-14](../Deudas/DT-14.md)). Hoy solo aceptar una solicitud desde la bandeja
exige que el instante traiga zona (decorador `IsInstanteConZona`).

---

## ADR-08 · El tenant sale del body del login y pasa a la URL

**Estado:** **Propuesto** (2026-08-16), sin implementar en el login. · [Original](../Decisions/ADR-08.md) ·
Pregunta asociada: [Q8](../PREGUNTAS-ABIERTAS.md#q8--adr-08-el-tenant-en-la-url-dev-b--prioridad-2)

**El problema.** Con ADR-03, el usuario tiene que recordar y escribir el slug de su organización al
iniciar sesión. El propio ADR-03 lo anotó como deuda y dejó aplazado el subdominio.

**Qué propone.**

- Un puerto `TenantResolver` que sabe "sacar la organización de la petición", con adaptadores
  intercambiables por configuración (`TENANT_TRANSPORT`): por segmento de URL (`/api/t/:slug/auth/login`),
  por cabecera, o por subdominio (`clinica-demo.citia.cl`) cuando haya DNS comodín. Es el mismo truco del
  contexto opaco de ADR-06.
- Hacerlo en dos pasos —primero la URL, después el subdominio—, que el ADR llama "fase 1" y "fase 2" (son
  **sus** fases, no las del roadmap).
- `LoginDto` pierde `tenantSlug`.
- **La regla crítica:** un slug inexistente tiene que responder exactamente igual que una contraseña mala
  (401). Si respondiera 404, volvería la enumeración que ADR-03 evitó. El ADR la marca como lo más fácil de
  romper en la migración.

**Qué se descartó.** Una cabecera como solución final (el frontend igual tendría que conocer el slug) y,
otra vez, el correo único global y la búsqueda en todas las organizaciones.

**Por qué el cambio es más chico de lo que parece.** El slug solo interviene en el login. Después, el
`tenantId` viaja en el JWT y todo lo demás (la base, el token, las rutas protegidas) queda igual. El riesgo
menos obvio es CORS: con subdominios, el origen permitido deja de ser uno fijo.

**Hoy en el código.** `LoginDto` sigue con `tenantSlug` en el body y no existe ningún `TenantResolver`.
Pero su **idea** ya se usa en otra parte: la ruta pública de ADR-09, `POST /api/publico/:tenantSlug/solicitudes`,
lleva el slug en la URL. Durante un tiempo ADR-08 se consideró prerrequisito de esa vía pública; al final
solo hacía falta su mecanismo, aplicado a una ruta nueva. El ROADMAP lo deja como pendiente del login que
ya no bloquea ninguna fase.

---

## ADR-09 · Gestión de citas: la solicitud del paciente va aparte

**Estado:** Aceptado (2026-08-23) e implementado en la Fase 1 (release 1, vía pública y bandeja). El límite
de tasa que pedía se aplazó y llegó con la Fase 3. · [Original](../Decisions/ADR-09.md)

**El problema.** La US-02 pedía que el profesional pudiera crear, editar, reagendar y cancelar citas. El
equipo propuso además un **enlace público** que el profesional comparte por WhatsApp o Instagram para que
el paciente deje sus datos y "eso entre directo al dashboard". Esa frase escondía la decisión grande: si el
formulario público escribe directo en la tabla `citas`, **cualquiera con el enlace controla la agenda** del
profesional (puede llenarle el día de citas falsas), y ese ruido termina ensuciando el historial de
comportamiento de los pacientes, que es el diferenciador del producto.

**La observación clave.** Las dos vías no son la misma operación con otra persona tecleando. El profesional
**ejerce autoridad** sobre su agenda; el paciente anónimo **pide**, y nada existe hasta que alguien acepta.
Separar *quién teclea* de *quién decide* ordena todo lo demás.

**Qué se decidió (lo principal).**

1. **`SolicitudCita` es una cosa aparte**, en su propio módulo (`src/modules/solicitud/`), con estados
   `recibida`, `aceptada` y `rechazada`. Se descartó escribir directo en `citas` y también agregar un estado
   `solicitada` a `Cita` (habría metido spam y rechazos en la tabla de compromisos reales). El vocabulario
   es distinto a propósito: en una cita, `pendiente` significa "existe y espera confirmación"; en una
   solicitud, `recibida` significa "todavía no existe nada".
2. **El paciente pide, el profesional fija la hora.** El formulario recoge una preferencia en texto
   ("jueves en la tarde") y el profesional pone la hora real al aceptar. Que el paciente **reserve** un
   hueco real quedó para cuando exista un modelo de disponibilidad (un ADR propio, aún no escrito). Por eso
   se descartó la [FD-01](../Frontend-Decisions/FD-01.md), que proponía reservar al instante (ver
   [09 — Decisiones del frontend](09-decisiones-del-frontend.md)).
3. **El RUT es la identidad del paciente.** El teléfono cambia y se escribe de mil formas; el RUT es estable
   y se valida con aritmética pura (el dígito verificador, módulo 11), sin base de datos. Utilidad en
   `src/shared/domain/rut.ts` (`normalizarRut`, `esRutValido`). Es obligatorio en la vía pública (que asume
   personas chilenas), opcional en el alta manual (quien no tiene RUT entra por ahí), único por organización
   y nunca va en URLs ni logs. La solicitud **no** crea un `Paciente`: eso pasa solo al aceptar, dentro de
   una transacción (ADR-06), para que el spam no cree pacientes.
4. **Editar ≠ reagendar ≠ cancelar.** Editar cambia duración o tipo de consulta y no avisa a nadie.
   Reagendar cambia la hora: reprograma el recordatorio y cuenta para el scoring. Cancelar es terminal y
   anula el recordatorio.
5. **`Cita.reagendar()` mueve la cita en su sitio** (mismo id) y la devuelve a `pendiente`: si el paciente
   había confirmado, confirmó **otra** hora. Se descartó "cancelar y crear otra" (tres movimientos = cuatro
   filas sin relación).
6. **Bitácora `CambioCita`**, que solo se escribe —nunca se edita ni se borra— en la misma transacción que
   el cambio: si el cambio no queda registrado, no ocurre. Así "¿cuántas veces se movió esta cita y quién la
   movió?" es una consulta directa.
7. **Publicar los hechos aunque nadie escuche.** El puerto `PublicadorEventos` emite `CitaCreada`,
   `CitaReagendada`, `CitaCancelada`… Recordatorios y alertas no existían, pero así se podrían enchufar
   después sin volver a operar la US-02. Fue la semilla de ADR-12.
8. **Reglas de la ruta pública:** solo escribe en `solicitudes_cita`; RUT válido obligatorio; una
   solicitud abierta por RUT y profesional; **respuesta siempre igual**, exista o no el profesional, para
   que nadie pueda sondear qué RUT es paciente de quién (una filtración bastante peor que enumerar
   clínicas); y límite de tasa.
9. **Formulario propio de Citia**, no Google Forms (dejaría datos de salud en un tercero), con siete campos
   obligatorios: RUT, nombre, teléfono, correo, consentimiento, preferencia horaria y un motivo corto, con
   una etiqueta que pide no escribir detalle médico.

**Ajustes al implementarlo.** El enlace resultó ser **de la organización**, no del profesional (los
usuarios no tienen identificador público): el profesional que acepta pasa a ser el dueño de la cita. La
ruta pública tomó el mecanismo de ADR-08 antes que el login: `POST /api/publico/:tenantSlug/solicitudes`. Y
"una solicitud abierta" se limitó a una ventana de 72 h (`SOLICITUD_VENTANA_HORAS`), para que una bandeja
abandonada no bloquee a un paciente para siempre.

**El límite de tasa, la parte que se demoró.** Se aplazó mientras todo era local (2026-08-24), se aceptó
desplegar sin límite (2026-09-29, [DT-18](../Deudas/DT-18.md)) y se construyó en la Fase 3: hoy la ruta
pública admite 5 solicitudes por hora por IP. Rige en producción desde el 2026-10-17, con el release de la
Fase 3.

**Hoy en el código.** `src/modules/solicitud/` (ruta pública y bandeja: listar, aceptar, rechazar),
`src/modules/cita/domain/cambio-cita.entity.ts` y las rutas
`PATCH /api/citas/:id/confirmar|cancelar|reagendar|asistencia|inasistencia` y
`GET /api/citas/:id/historial`. Matices posteriores: ADR-13 hizo que al vincular un paciente por RUT se
complete su correo si estaba vacío, y ADR-10 le agregó a `SolicitudCita` un `tipo` (`nueva` o
`reagendamiento`) y el estado `descartada`.

**Lo que dejó abierto a propósito.** El modelo de disponibilidad; el solapamiento (lo resolvió ADR-11); la
fusión de pacientes duplicados; la verificación del contacto (hoy alguien puede mandar una solicitud con el
RUT de otra persona, [DT-23](../Deudas/DT-23.md)); y si un colega puede ver la agenda ajena.

---

## ADR-10 · El paciente responde con un enlace por cita

**Estado:** Aceptado el 2026-10-14; implementado y mergeado a `develop` el 2026-10-15 (backend PR #6,
frontend PR #7); **en producción desde el 2026-10-17** (backend PR #7, frontend PR #8). ·
[Original](../Decisions/ADR-10.md) · **Contado a fondo en [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md)**:
acá va solo el resumen.

**El problema.** RF-07: el paciente debería poder confirmar, cancelar o pedir otra hora desde el
recordatorio. Faltaban dos cosas: un canal hacia el paciente (lo trajo ADR-13) y una forma de saber que
quien aprieta el botón es el paciente de **esa** cita. Y era delicado: sería la primera superficie sin login
que modifica una cita real, justo lo que ADR-09 había prohibido para la vía pública.

**Una historia con vueltas.** Se propuso el 2026-09-23; se **aplazó** el 2026-09-25 porque no había cómo
hacerle llegar el enlace al paciente ([Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita)
→ C); quedó reabrible el 2026-09-30, cuando los recordatorios entraron al MVP; y se **aceptó con cambios**
el 2026-10-14 (Q11 → B: el enlace va en cada recordatorio). Es un buen ejemplo de que aplazar no es tirar:
el diseño se guardó y se retomó.

**Qué se decidió, en una línea cada cosa.**

- Un enlace por cita, con un token calculado con **HMAC** (clave del servidor + id de la cita + versión);
  en la base solo su hash. Nace al enviar el primer recordatorio y sirve hasta el `inicio` de la cita.
- El token va después del `#` y viaja a la API en la cabecera `X-Enlace-Cita`. Cualquier enlace que no
  sirva recibe el mismo 404. Abrir la página no hace nada: toda acción es un clic.
- Confirmar y cancelar usan las transiciones que ya existían: el grafo de ADR-04 **no se toca**. La
  bitácora anota que fue el **paciente** y con qué enlace.
- Pedir otra hora **no mueve la cita**: crea una `SolicitudCita` de tipo `reagendamiento` en la bandeja de
  ADR-09; aceptarla mueve la misma cita.
- Nada después del `inicio`: así nadie limpia su historial cancelando a posteriori. Y se fijó la regla G1
  del `ghosting` (ver ADR-04).
- Un módulo nuevo, `portal-paciente`, que compone `cita` y `solicitud` sin crear un ciclo entre ellos.
- Límite de tasa (`@nestjs/throttler`, en memoria) para las cuatro superficies públicas: la página del
  paciente, el login, el registro y la solicitud pública.

**Qué se descartó (lo más instructivo).**

- Identificar al paciente con RUT + código: más fricción, y una pantalla "escribe tu RUT" mal hecha permite
  sondear quién es paciente de quién.
- El token en la URL de la API o en `Authorization: Bearer`: las URL terminan en logs, y una misma cabecera
  con dos significados invita a que un guard acepte lo que no debe.
- Un token aleatorio irrecuperable (la propuesta original): como cada cita recibe 2 o 3 correos y los
  reintentos a Resend deben ser idénticos, obligaba a guardarlo en claro o a rotarlo en cada envío.
- Un agregado `SolicitudReagendamiento` con una marca en el dashboard (también de la propuesta): habría
  sido una segunda bandeja escondida en la pantalla principal del profesional.

**Hoy en el código.** `src/modules/portal-paciente/` (`GET /api/publico/cita` y
`POST …/confirmar`, `…/cancelar`, `…/otra-hora`), `src/modules/cita/domain/enlace-cita.entity.ts`, el
adaptador HMAC en `cita/infrastructure/seguridad/`, `POST /api/citas/:id/enlace/invalidar`,
`solicitud/application/suscriptor-solicitudes.ts` y `src/shared/presentation/limitar-tasa.decorator.ts`.
Dos ajustes al implementar: el bloqueo de la fila de la cita usa `FOR NO KEY UPDATE` en vez de
`FOR UPDATE` (se trababa con el envío de correos), y si cambia la clave del servidor, el enlace se revoca y
se regenera solo ([DT-45](../Deudas/DT-45.md)).

---

## ADR-11 · Solapamiento de citas: avisar y permitir

**Estado:** Aceptado (2026-09-25) e implementado (en `develop` desde el 2026-09-28; es parte de la Fase 1,
que está en producción desde el 2026-10-04). · [Original](../Decisions/ADR-11.md)

**El problema.** Nada impedía agendar dos citas del mismo profesional que se cruzan. `duracionMin` se
guardaba, pero nadie calculaba cuándo terminaba la cita. Y reagendar, que es donde más fácil te chocas,
tampoco miraba. ADR-09 había dejado la decisión abierta, con una recomendación.

**Las opciones.** Ignorarlo (descartado: una agenda que acepta imposibles en silencio). Rechazar con 409
(descartado por ahora: obliga a decidir reglas finas —¿citas pegadas?, ¿colchón entre pacientes?,
¿sobrecupo a propósito?— que en realidad son el modelo de disponibilidad, y le quita la decisión a quien
sabe si el choque es un error o algo intencional). **Avisar y permitir** (elegido, respondiendo
[Q4](../PREGUNTAS-ABIERTAS.md#q4--solapamiento-avisar-o-rechazar)).

**Qué se decidió.**

- Dos citas chocan si son del mismo profesional (el **dueño** de la cita, no quien hace la petición), la
  otra está vigente (`pendiente` o `confirmada`) y los intervalos se cruzan:
  `a.inicio < b.fin && b.inicio < a.fin`. Los intervalos son *semiabiertos* (incluyen el inicio, no el
  fin), así que 10:00–10:50 y 10:50–11:40 **no** chocan, sin tener que inventar un colchón.
- **La regla vive en la entidad**: `get fin()` y `chocaCon(otra)` en `Cita`. El repositorio solo trae
  candidatos con una consulta que aprovecha el índice; la decisión fina la toma `chocaCon`, para no
  duplicar la regla en SQL. Para que esa consulta tenga un tope, `duracionMin` ahora tiene un máximo de 1440
  minutos (un día, `DURACION_MAXIMA_MIN`).
- Se calcula al crear, reagendar, editar y aceptar una solicitud. La respuesta gana un campo
  `avisos.solapamientos` con las citas que chocan. **Nunca** cambia el código HTTP: es información, no
  validación.

**Lo que el aviso no es.** No es una garantía: dos altas simultáneas pueden no verse entre sí. Para un
aviso da lo mismo; para un rechazo no, y es otra razón para dejar el rechazo al modelo de disponibilidad.

**Hoy en el código.** `src/modules/cita/domain/cita.entity.ts` (`DURACION_MAXIMA_MIN = 1440`, `fin`,
`chocaCon`). Cierra [DT-12](../Deudas/DT-12.md), que figura como cerrada desde el 2026-10-18.

---

## ADR-12 · Outbox transaccional y planificador sobre Postgres

**Estado:** Aceptado (2026-09-30), implementado y en producción desde el release del 2026-10-06. ·
[Original](../Decisions/ADR-12.md)

**El problema.** La Fase 2 traía el primer "oyente" de los hechos de la cita: los recordatorios (crear una
cita programa un correo; reagendarla lo reprograma; cancelarla lo anula). Y RNF-03 exigía entregar al
menos el 99 % de los recordatorios. Había dos hoyos:

1. **Los hechos podían perderse o inventarse** ([DT-27](../Deudas/DT-27.md)). Si el aviso sale antes del
   *commit* y después algo falla, el aviso ya salió por algo que no pasó (un hecho fantasma). Si sale
   después del *commit* y el proceso muere justo entre medio, se pierde.
2. **No había planificador**: nada corría si no llegaba una petición HTTP.

Encima, Railway, al desplegar, deja corriendo un rato el contenedor viejo y el nuevo a la vez: aunque haya
una sola réplica, **dos procesos pueden hacer el mismo trabajo**.

**Qué se decidió.**

- **Outbox transaccional.** Es el libro de comandas que se cuenta en
  [02 — Cómo está armado](02-como-esta-armado.md#el-outbox-un-libro-de-pedidos-en-la-base): el hecho se
  escribe como fila en `eventos_salida` **dentro de la misma transacción** que el cambio; o existen los
  dos, o ninguno. Un **despachador** revisa la tabla cada 5 segundos y entrega cada hecho a sus
  suscriptores, con reintentos (10 s, 20 s, 40 s… hasta 1 h); tras 10 fallos lo deja `fallido` (la "carta
  muerta") y alerta.
- **El puerto exige la transacción:** `publicar(evento, tx)`. Como `tx` es `unknown` (ADR-06), el
  compilador no atrapa un `undefined`; por eso el adaptador lanza un error si no lo recibe.
- **Cuatro reglas para los suscriptores.** (1) Un hecho puede llegar dos veces: el suscriptor tiene que ser
  **idempotente** (hacerlo dos veces da lo mismo que una). (2) No hay orden garantizado, así que el
  suscriptor **no aplica deltas**: relee el estado actual y lo reconcilia. (3) Solo escribe en la base, con
  el mismo `tx`. (4) Nada de efectos externos (como mandar un correo) dentro del suscriptor: deja una fila
  de trabajo y otro proceso la ejecuta.
- **Planificador dentro del mismo proceso** con `@nestjs/schedule`, apagable con `PLANIFICADOR_ACTIVO`,
  con apagado ordenado y latidos (*heartbeats*) a Better Stack: si el latido deja de llegar, alguien se
  entera.
- **`FOR UPDATE SKIP LOCKED`** para que dos procesos no tomen la misma fila. Es como varias cajas de
  supermercado atendiendo una sola fila: cada cajera llama al siguiente cliente que **nadie** está
  atendiendo, sin esperar a las demás. Para tareas que no se reparten por filas (la purga diaria), un
  candado consultivo de Postgres.
- **Barrer todas las organizaciones, a propósito.** Todo el sistema filtra por tenant; los jobs no. Para
  que no sea un accidente, esos métodos tienen nombre propio y el comentario `// BARRIDO GLOBAL (ADR-12 §6)`,
  nunca se exponen por HTTP, y una vez tomada la fila todo lo demás usa su `tenant_id`.
- **El contenedor tiene que estar siempre encendido.** Las plataformas que lo duermen cuando no hay tráfico
  (App Sleeping de Railway, el plan gratis de Render…) rompen este diseño. Plan B: un cron externo que
  llame a los mismos casos de uso.
- **El proceso de cierre (el que marcaría `ghosting`) queda aplazado**, con el mecanismo listo. Esto
  reemplaza la mención a BullMQ de ADR-04.

**Qué se descartó.** Entregar en el proceso después del *commit* (si el proceso muere, se pierde el
hecho); un broker externo como Redis/BullMQ o SQS (vuelve la doble escritura y suma un servicio que pagar;
queda como evolución futura, alimentado desde el outbox); colas de terceros sobre Postgres como pg-boss
(traen sus propias migraciones fuera de TypeORM, chocando con ADR-00); un `setInterval` a mano (descartado
por poco); y elegir un "líder" entre procesos (el solapamiento de despliegues lo rompe sin avisar).

**Hoy en el código.** `src/shared/infrastructure/salida/` (despachador, publicador, registro de
suscriptores, purga), `src/shared/infrastructure/planificacion/`, `src/shared/planificacion.module.ts`
(con `ScheduleModule.forRoot()`), la migración `1750000008000-CreateEventosSalida` y
`app.enableShutdownHooks()` en `main.ts`. Hoy hay dos suscriptores: el de recordatorios (ADR-13) y el de
solicitudes (ADR-10). Deudas contraídas a sabiendas: sin orden entre hechos ([DT-32](../Deudas/DT-32.md)),
latencia de segundos que no sirve para alertas "en menos de 3 s" ([DT-33](../Deudas/DT-33.md)) y la carta
muerta se revisa con SQL a mano ([DT-34](../Deudas/DT-34.md)).

---

## ADR-13 · Recordatorios al paciente por correo

**Estado:** Aceptado (2026-09-30), en producción desde el 2026-10-06 y verificado con un correo real el
2026-10-07. · [Original](../Decisions/ADR-13.md)

**El problema.** El 2026-09-30 se decidió que los recordatorios automáticos (RF-06) entraban al MVP y el
scoring salía a la v2. Con eso venían decisiones de producto ya tomadas: correo vía **Resend**, un solo
remitente "Citia", contenido solo informativo, correo del paciente obligatorio, no revisar el
consentimiento por ahora y arrancar con planes gratuitos (Resend Free: 100 correos al día, 3.000 al mes).
El ADR las convierte en diseño.

**Qué se decidió (lo esencial).**

- **El recordatorio es una entidad con estado**, no una columna en `citas`: una cita tiene varios (por
  defecto 24 h y 2 h antes). Estados: `programado`, `enviado`, `entregado`, `fallido`, `cancelado` y
  `omitido`. La diferencia entre los tres finales malos importa: `cancelado` = dejó de tener sentido (la
  cita cambió); `omitido` = una regla decidió no mandarlo (por ejemplo, paciente sin correo); `fallido` =
  se intentó y no llegó. **Solo `fallido` cuenta contra el 99 %.**
- **Tabla propia y barrido cada minuto**, en vez de pedirle a Resend que programe el envío. Así, justo antes
  de mandar, se revisa que la cita siga en pie, y anular es cambiar una fila, no llamar a una API.
- **La planificación es una función pura** (`planificar`, en `recordatorio/domain/planificacion.ts`): sin
  reloj ni base, fácil de testear. Respeta horas sin envío (21:00–08:00 en la zona de la clínica, ADR-07):
  si un recordatorio cae ahí, se **adelanta**.
- **Reconciliar, no aplicar deltas** (la regla 2 de ADR-12): ante cualquier hecho de la cita, el
  suscriptor recalcula qué recordatorios deberían existir y ajusta. Un respaldo cada hora repasa las citas
  de los próximos 8 días por si algo se escapó.
- **Antes de enviar, nueve políticas en orden** (¿la cita sigue vigente?, ¿venció?, ¿hay correo?, ¿está
  suprimido?, ¿queda cuota?…).
- **Resend detrás de un puerto `CanalMensajeria`**: WhatsApp o SMS serían otro adaptador. En desarrollo se
  usa un adaptador `registro` que no envía nada.
- **Idempotencia en cuatro capas**, para no mandar dos veces el mismo correo: clave única en la tabla,
  `SKIP LOCKED`, la cabecera `Idempotency-Key` ante Resend (el id del recordatorio) y webhooks que nunca
  hacen retroceder un estado.
- **Webhooks firmados** (`POST /api/webhooks/resend`, firma Svix): Resend avisa si el correo se entregó,
  rebotó o lo marcaron como spam. Los rebotes permanentes y las quejas van a una lista de supresión
  **global** (se guarda el hash del correo, no el correo), porque la reputación del remitente es de toda la
  plataforma.
- **Privacidad del contenido:** asunto neutro (se ve en la pantalla bloqueada), sin nombre del paciente ni
  tipo de consulta, y el seguimiento de clics desactivado (si no, el enlace de la Fase 3 pasaría por
  servidores de Resend). La plantilla traía un hueco `accion?` que la Fase 3 llenó con el botón *Ver o
  responder mi hora*.
- **Respuestas del paciente:** `Reply-To` = un correo que el profesional elige en su configuración.
- **Cuota del modo prueba:** con 2 recordatorios por cita, 100 correos al día alcanzan para unas 50 citas
  diarias en **toda** la plataforma. Por eso hay un fusible de 40 envíos diarios por organización y un
  aviso al 80 %.
- **Correo obligatorio** en el alta del paciente, más `PATCH /api/pacientes/:id` para completar a los
  antiguos que no lo tienen.
- **Consentimiento:** la política existe, se prueba y está **apagada**
  (`RECORDATORIO_EXIGIR_CONSENTIMIENTO=false`). Es un riesgo aceptado ([DT-16](../Deudas/DT-16.md)), a
  revisar con la Ley 21.719 (vigencia prevista: 1 de diciembre de 2026).
- **Observabilidad** con `pino` (logs JSON que ocultan cabeceras y datos sensibles), `GET /api/health` y
  latidos a Better Stack.

**Qué se descartó.** WhatsApp y SMS (costo, plantillas aprobadas por Meta, *opt-in* explícito; fuera del
MVP), Brevo y SendGrid (descartados por el usuario), SMTP genérico (sin webhooks de entrega), programar el
envío en Resend (no permite revalidar la cita), calcular al vuelo sin tabla (un tick perdido = un
recordatorio perdido), un "no responder" (la respuesta del paciente se perdería) y que Citia reciba las
respuestas (guardaría texto libre con posibles datos de salud).

**Hoy en el código.** `src/modules/recordatorio/` (con su propio `CLAUDE.md`), los adaptadores en
`infrastructure/mensajeria/` (`resend-canal-mensajeria.ts`, `registro-canal-mensajeria.ts`) y
`presentation/webhooks-resend.controller.ts`. El módulo **solo lee** las tablas de cita, paciente, usuario
y tenant (a través del puerto `LectorCitas`); la única excepción la puso ADR-10: ahora importa `CitaModule`
para pedir el enlace del paciente, pero la fila del enlace la escribe el módulo `cita`. Deudas que dejó:
[DT-35](../Deudas/DT-35.md) a [DT-39](../Deudas/DT-39.md), y al salir a producción
[DT-40](../Deudas/DT-40.md) (con el adaptador `registro`, un recordatorio queda "Enviado" sin haberse
enviado) y [DT-41](../Deudas/DT-41.md) (el subdominio de envío no tiene DMARC).

---

## Patrones que se repiten

Si lees los catorce seguidos, aparecen las mismas ideas una y otra vez. Vale la pena llevárselas:

- **Escribir lo descartado.** La mitad del valor de un ADR está en el "por qué no". Sin eso, alguien vuelve
  a proponer BullMQ o un token aleatorio sin saber que ya se evaluó.
- **Las reglas viven en el dominio**, no en servicios ni en SQL: el grafo de la cita (ADR-04), el choque
  de horarios (ADR-11), la validez del enlace (ADR-10).
- **Puerto + contexto opaco** para respetar la hexagonal sin pelearse con el framework (ADR-06, copiado en
  08, 09 y 12).
- **La misma respuesta para todo error** en lo que es público, para no dar pistas (ADR-03, 08, 09 y 10).
- **Dejar el enchufe puesto sin pagar el costo hoy**: los hechos publicados sin oyentes (ADR-09 → ADR-12)
  y el hueco `accion?` del correo (ADR-13 → ADR-10).
- **Aplazar no es descartar**: ADR-10 y el proceso de `ghosting` se guardaron con fecha y motivo.
- **Un control que nunca falla no prueba nada**: el `grep` de ADR-02 estuvo meses "en verde" sin detectar
  nada.

## Para profundizar

- [Índice de ADRs](../Decisions/README.md): la tabla oficial con estados, fechas, commits y la sección
  *Relaciones entre ADRs*.
- [TRAZABILIDAD](../TRAZABILIDAD.md): qué commit implementa qué documento.
- [ROADMAP](../ROADMAP.md): el estado que manda cuando hay dudas.
- Los originales: [ADR-00](../Decisions/ADR-00.md) · [ADR-01](../Decisions/ADR-01.md) ·
  [ADR-02](../Decisions/ADR-02.md) · [ADR-03](../Decisions/ADR-03.md) · [ADR-04](../Decisions/ADR-04.md) ·
  [ADR-05](../Decisions/ADR-05.md) · [ADR-06](../Decisions/ADR-06.md) · [ADR-07](../Decisions/ADR-07.md) ·
  [ADR-08](../Decisions/ADR-08.md) · [ADR-09](../Decisions/ADR-09.md) · [ADR-10](../Decisions/ADR-10.md) ·
  [ADR-11](../Decisions/ADR-11.md) · [ADR-12](../Decisions/ADR-12.md) · [ADR-13](../Decisions/ADR-13.md)
- En esta carpeta: [04 — Roadmap y fases](04-roadmap-y-fases.md) (en qué fase nació cada ADR),
  [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md) (ADR-10 contado en detalle),
  [07 — Deudas técnicas](07-deudas-tecnicas.md) (las DT que nombran estos ADR),
  [08 — Preguntas abiertas](08-preguntas-abiertas.md) (Q4, Q6, Q8, Q11) y
  [09 — Decisiones del frontend](09-decisiones-del-frontend.md) (las FD, el equivalente en el frontend).
